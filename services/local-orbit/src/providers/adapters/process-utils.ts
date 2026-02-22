/**
 * Process Management Utilities
 *
 * Cross-platform utilities for spawning, monitoring, and managing child processes.
 * Used by provider adapters that need to spawn external CLI tools.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { join, delimiter } from "node:path";

/**
 * Find an executable in the system PATH.
 * Returns the full path if found, null otherwise.
 *
 * @param name - Executable name (e.g., "copilot", "gh")
 * @returns Full path to executable or null if not found
 */
export async function findExecutable(name: string): Promise<string | null> {
  const pathEnv = process.env.PATH || "";
  const systemPaths = pathEnv.split(delimiter).filter(Boolean);

  // Augment with common user-local bin directories that may not be in the
  // server process's PATH (e.g. ~/.local/bin where tools like `claude` install).
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const extraPaths = home
    ? [
        join(home, ".local", "bin"),
        join(home, "bin"),
        join(home, ".npm-global", "bin"),
        join(home, ".yarn", "bin"),
        "/opt/homebrew/bin",
        "/usr/local/bin",
      ]
    : [];

  // Deduplicate: system paths first (respect user's ordering), then extras
  const seen = new Set(systemPaths);
  const paths = [
    ...systemPaths,
    ...extraPaths.filter((p) => !seen.has(p)),
  ];

  // On Windows, check with .exe extension
  const isWindows = process.platform === "win32";
  const candidates = isWindows ? [name, `${name}.exe`] : [name];

  for (const dir of paths) {
    for (const candidate of candidates) {
      const fullPath = join(dir, candidate);
      try {
        await access(fullPath, constants.X_OK);
        return fullPath;
      } catch {
        // Not found or not executable, continue
      }
    }
  }

  return null;
}

/**
 * Spawn a child process with stdio pipes.
 *
 * @param command - Command to execute
 * @param args - Command arguments
 * @param options - Additional spawn options
 * @returns Spawned child process
 * @throws Error if spawn fails
 */
export function spawnProcess(
  command: string,
  args: string[] = [],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): ChildProcess {
  const child = spawn(command, args, {
    stdio: ["pipe", "pipe", "pipe"],
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
  });

  // Handle spawn errors
  child.on("error", (err) => {
    console.error(`[process-utils] Failed to spawn ${command}:`, err);
  });

  return child;
}

/**
 * Kill a process gracefully with timeout fallback to SIGKILL.
 *
 * @param pid - Process ID to kill
 * @param timeoutMs - Timeout before forcing SIGKILL (default: 5000ms)
 */
export async function killProcess(
  pid: number,
  timeoutMs: number = 5000,
): Promise<void> {
  try {
    // Send SIGTERM first for graceful shutdown
    process.kill(pid, "SIGTERM");

    // Wait for process to exit or timeout
    const start = Date.now();
    while (processHealth(pid)) {
      if (Date.now() - start > timeoutMs) {
        // Force kill with SIGKILL
        process.kill(pid, "SIGKILL");
        break;
      }
      // Wait a bit before checking again
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } catch (err) {
    // Process may already be dead
    if ((err as NodeJS.ErrnoException).code !== "ESRCH") {
      console.warn(`[process-utils] Error killing process ${pid}:`, err);
    }
  }
}

/**
 * Check if a process is alive.
 *
 * @param pid - Process ID to check
 * @returns true if process exists, false otherwise
 */
export function processHealth(pid: number): boolean {
  try {
    // Signal 0 checks if process exists without actually sending a signal
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

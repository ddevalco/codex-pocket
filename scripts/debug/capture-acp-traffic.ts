#!/usr/bin/env bun
// @ts-nocheck
/*
  ACP JSON-RPC traffic capture helper.

  Usage (example):
    bun scripts/debug/capture-acp-traffic.ts --log ./acp-traffic.log --pattern "approval|user_action|permission|confirm" -- gh copilot acp

  Notes:
  - This script acts as a passthrough for stdin/stdout.
  - It logs all JSON-RPC messages to the log file.
  - It highlights matches to stderr for quick scanning.
*/

import { createWriteStream } from "fs";
import { argv, stdin, stdout, stderr, exit } from "process";

const DEFAULT_PATTERN = "approval|user_action|permission|confirm";

function getArgValue(flag: string): string | null {
  const idx = argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= argv.length) {
    return null;
  }
  return argv[idx + 1];
}

function getCommandStartIndex(): number {
  const sepIndex = argv.indexOf("--");
  if (sepIndex === -1) {
    return -1;
  }
  return sepIndex + 1;
}

const logPath = getArgValue("--log") ?? "./acp-traffic.log";
const patternRaw = getArgValue("--pattern") ?? DEFAULT_PATTERN;
const cmdStart = getCommandStartIndex();

if (cmdStart === -1) {
  stderr.write("Missing command. Usage: bun capture-acp-traffic.ts -- <command>\n");
  exit(2);
}

const command = argv[cmdStart];
const commandArgs = argv.slice(cmdStart + 1);
const highlight = new RegExp(patternRaw, "i");
const logStream = createWriteStream(logPath, { flags: "a" });

function timestamp(): string {
  return new Date().toISOString();
}

function logLine(prefix: string, line: string): void {
  logStream.write(`${timestamp()} ${prefix} ${line}\n`);
  if (highlight.test(line)) {
    stderr.write(`[HIGHLIGHT] ${prefix} ${line}\n`);
  }
}

const child = Bun.spawn({
  cmd: [command, ...commandArgs],
  stdin: "pipe",
  stdout: "pipe",
  stderr: "pipe",
});

if (!child.stdin || !child.stdout || !child.stderr) {
  stderr.write("Failed to attach to child process IO.\n");
  exit(1);
}

// Forward user input to the child process and log it as outbound.
stdin.setEncoding("utf8");
stdin.on("data", (chunk: string | Buffer) => {
  const text = chunk.toString();
  text.split(/\r?\n/).forEach((line: string) => {
    if (line.length > 0) {
      logLine("CLIENT>", line);
    }
  });
  child.stdin.write(text);
});

// Log server responses and forward to stdout.
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk: string | Buffer) => {
  const text = chunk.toString();
  text.split(/\r?\n/).forEach((line: string) => {
    if (line.length > 0) {
      logLine("SERVER<", line);
    }
  });
  stdout.write(text);
});

// Log stderr but do not forward to stdout.
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk: string | Buffer) => {
  const text = chunk.toString();
  text.split(/\r?\n/).forEach((line: string) => {
    if (line.length > 0) {
      logLine("SERVER_ERR<", line);
    }
  });
  stderr.write(text);
});

child.exited.then((code: number | null) => {
  logStream.end();
  exit(code ?? 0);
});

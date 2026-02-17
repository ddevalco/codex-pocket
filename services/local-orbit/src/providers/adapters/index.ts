/**
 * Provider Adapters
 *
 * This module exports all provider adapter implementations and utilities.
 */

export { CopilotAcpAdapter, type CopilotAcpConfig } from "./copilot-acp-adapter.js";
export { AcpClient } from "./acp-client.js";
export { findExecutable, spawnProcess, killProcess, processHealth } from "./process-utils.js";

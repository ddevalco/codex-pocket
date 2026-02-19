#!/usr/bin/env bun
// @ts-nocheck
/**
 * Test script to check if ACP protocol emits approval events
 * when tool execution is requested.
 */

import { writeFileSync } from "node:fs";

interface JsonRpcMessage {
  jsonrpc: string;
  id?: number;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}

const LOG_FILE = "./acp-approval-test-log.json";
const capturedMessages: JsonRpcMessage[] = [];

function sendMessage(writer: WritableStreamDefaultWriter, msg: JsonRpcMessage) {
  const json = JSON.stringify(msg);
  console.log(`>>> SENDING: ${json}`);
  writer.write(new TextEncoder().encode(json + "\n"));
}

async function runTest() {
  console.log("Starting ACP approval event test...\n");

  // Start ACP mode
  const proc = Bun.spawn(["gh", "copilot", "--", "--acp"], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  if (!proc.stdin || !proc.stdout) {
    console.error("Failed to get process streams");
    return;
  }

  const writer = proc.stdin.getWriter();
  let messageBuffer = "";

  // Read stdout in background
  const readStdout = async () => {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        messageBuffer += decoder.decode(value, { stream: true });
        const lines = messageBuffer.split("\n");
        
        // Process complete lines
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (line) {
            try {
              const msg = JSON.parse(line);
              console.log(`<<< RECEIVED: ${JSON.stringify(msg)}`);
              capturedMessages.push(msg);
              
              // Check for approval-related content
              const msgStr = JSON.stringify(msg).toLowerCase();
              if (msgStr.includes("approval") || 
                  msgStr.includes("user_action") || 
                  msgStr.includes("permission") || 
                  msgStr.includes("confirm") ||
                  msgStr.includes("authorize")) {
                console.log("⚠️  APPROVAL-RELATED MESSAGE DETECTED!");
              }
            } catch {
              console.error(`Failed to parse: ${line}`);
            }
          }
        }
        messageBuffer = lines[lines.length - 1];
      }
    } catch (e) {
      console.error("Error reading stdout:", e);
    }
  };

  // Start reading in background
  readStdout();

  // Wait a bit for process to start
  await new Promise(resolve => setTimeout(resolve, 500));

  // Test 1: Initialize
  console.log("\n=== TEST 1: Initialize ===");
  sendMessage(writer, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: 1,
      clientInfo: {
        name: "approval-test-client",
        version: "1.0.0"
      }
    }
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 2: Send a prompt that requires shell execution
  console.log("\n=== TEST 2: Request shell command execution ===");
  sendMessage(writer, {
    jsonrpc: "2.0",
    id: 2,
    method: "agent/chat",
    params: {
      prompt: "Run the command 'ls -la' to list files in the current directory"
    }
  });

  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test 3: Request file write
  console.log("\n=== TEST 3: Request file write ===");
  sendMessage(writer, {
    jsonrpc: "2.0",
    id: 3,
    method: "agent/chat",
    params: {
      prompt: "Create a file called test-approval.txt with the content 'Hello World'"
    }
  });

  await new Promise(resolve => setTimeout(resolve, 3000));

  // Cleanup
  writer.close();
  proc.kill();
  
  // Save log
  writeFileSync(LOG_FILE, JSON.stringify(capturedMessages, null, 2));
  console.log(`\n\n=== Test Complete ===`);
  console.log(`Captured ${capturedMessages.length} messages`);
  console.log(`Log saved to: ${LOG_FILE}`);
  
  // Analyze
  console.log("\n=== Analysis ===");
  const approvalMsgs = capturedMessages.filter(msg => {
    const str = JSON.stringify(msg).toLowerCase();
    return str.includes("approval") || 
           str.includes("user_action") || 
           str.includes("permission") ||
           str.includes("confirm") ||
           str.includes("authorize");
  });
  
  console.log(`Approval-related messages found: ${approvalMsgs.length}`);
  if (approvalMsgs.length > 0) {
    console.log("Approval messages:");
    approvalMsgs.forEach(msg => {
      console.log(JSON.stringify(msg, null, 2));
    });
  }
  
  // Check for specific notification methods
  const notifications = capturedMessages.filter(msg => msg.method && !msg.id);
  console.log(`\nNotifications received: ${notifications.length}`);
  if (notifications.length > 0) {
    const methods = [...new Set(notifications.map(n => n.method))];
    console.log("Notification methods seen:", methods);
  }
}

runTest().catch(console.error);

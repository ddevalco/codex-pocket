#!/usr/bin/env node
/**
 * Probe script to discover GitHub Copilot ACP JSON-RPC methods
 * 
 * Usage: node scripts/probe-acp.js
 */

import { spawn } from 'node:child_process';
import readline from 'node:readline';

let requestId = 1;

function sendRequest(proc, method, params = {}) {
  const request = {
    jsonrpc: '2.0',
    id: requestId++,
    method,
    params
  };
  
  console.log(`\n>>> SENDING: ${method}`);
  console.log(JSON.stringify(request, null, 2));
  
  proc.stdin.write(JSON.stringify(request) + '\n');
}

async function probeACP() {
  console.log('Starting Copilot ACP probe...\n');
  
  // Try spawning gh copilot -- --acp
  const proc = spawn('gh', ['copilot', '--', '--acp'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const rl = readline.createInterface({
    input: proc.stdout,
    crlfDelay: Infinity
  });

  // Listen for responses
  rl.on('line', (line) => {
    try {
      const parsed = JSON.parse(line);
      console.log('\n<<< RECEIVED:');
      console.log(JSON.stringify(parsed, null, 2));
    } catch (err) {
      console.log('\n<<< RAW:', line);
    }
  });

  // Listen for errors
  proc.stderr.on('data', (data) => {
    console.log('\n!!! STDERR:', data.toString());
  });

  proc.on('error', (err) => {
    console.error('\n!!! PROCESS ERROR:', err);
  });

  proc.on('exit', (code) => {
    console.log(`\n!!! Process exited with code ${code}`);
    process.exit(code || 0);
  });

  // Wait a bit for process to start
  await new Promise(resolve => setTimeout(resolve, 500));

  // Try common JSON-RPC discovery methods
  const methodsToProbe = [
    // Standard JSON-RPC methods    'rpc.discover',
    'initialize',
    'initialized',
    
    // ACP-specific guesses based on common patterns
    'session/list',
    'session/start',
    'session/get',
    'prompt/send',
    'prompt/stream',
    'message/send',
    'chat/send',
    'completion/request',
    
    // LSP-style capabilities
    'capabilities',
    'getCapabilities',
  ];

  for (const method of methodsToProbe) {
    sendRequest(proc, method);
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // Wait for responses
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log('\n\nProbe complete. Terminating process...');
  proc.kill('SIGTERM');
  
  setTimeout(() => {
    proc.kill('SIGKILL');
  }, 1000);
}

probeACP().catch(err => {
  console.error('Probe failed:', err);
  process.exit(1);
});

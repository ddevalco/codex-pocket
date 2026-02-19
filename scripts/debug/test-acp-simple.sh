#!/bin/bash

# Test ACP approval protocol
LOG_FILE="./acp-approval-test.log"

echo "Starting ACP approval protocol test..." | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Initialize
echo "=== TEST 1: Initialize ===" | tee -a "$LOG_FILE"
INIT_MSG='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientInfo":{"name":"test-client","version":"1.0.0"}}}'
echo ">>> SENDING: $INIT_MSG" | tee -a "$LOG_FILE"
echo "$INIT_MSG" | gh copilot -- --acp 2>&1 | tee -a "$LOG_FILE" &
PID=$!
sleep 2

# Request shell command
echo "" | tee -a "$LOG_FILE"
echo "=== TEST 2: Request shell command ===" | tee -a "$LOG_FILE"
CHAT_MSG='{"jsonrpc":"2.0","id":2,"method":"agent/chat","params":{"prompt":"Run the command ls -la"}}'
echo ">>> SENDING: $CHAT_MSG" | tee -a "$LOG_FILE"
echo "$CHAT_MSG" >> /dev/stdin
sleep 3

kill $PID 2>/dev/null

echo "" | tee -a "$LOG_FILE"
echo "=== Analysis ===" | tee -a "$LOG_FILE"
echo "Searching for approval-related messages..." | tee -a "$LOG_FILE"
grep -iE "approval|user_action|permission|confirm|authorize" "$LOG_FILE" | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
echo "Test complete. Log saved to: $LOG_FILE" | tee -a "$LOG_FILE"

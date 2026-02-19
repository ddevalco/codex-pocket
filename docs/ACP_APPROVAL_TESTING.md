# ACP Approval Event Testing Plan

Purpose: determine whether GitHub Copilot CLI in ACP mode emits approval or user-action events when tool execution needs confirmation.

## Preconditions

- You can run `gh` and you are logged in (`gh auth status`).
- You have access to GitHub Copilot CLI with ACP support.
- You can run Bun or Node locally.

## Step-by-Step Instructions

### 1) Verify Copilot CLI installation

Run:

```sh
gh copilot --version
```

Record the version in the findings template.

### 2) Start ACP mode via the capture script

Run the capture wrapper so it logs all JSON-RPC traffic to a file and highlights any approval-like terms:

```sh
bun scripts/debug/capture-acp-traffic.ts --log ./acp-traffic.log --pattern "approval|user_action|permission|confirm" -- gh copilot acp
```

Notes:

- The capture script is a pass-through. It logs every JSON-RPC line from stdin/stdout.
- Highlighted lines are printed to stderr.
- Keep this terminal open for the remainder of the test.

### 3) Confirm JSON-RPC handshake works

In the ACP session, issue a simple prompt or system check that triggers no approvals (baseline). Record the output in the findings file.

Example (send via ACP client input):

- Ask for a quick summary of the current directory or a no-op question.

### 4) Trigger approvals by requesting tool actions

Use the ACP client to ask for actions that typically require confirmation. Run each scenario separately and capture traffic:

- Shell command (safe): `ls -la`
- Shell command (medium risk): `cat ./README.md`
- Shell command (high risk): `rm -rf ./tmp-test-file` (create a dummy file first)
- File write: request creation or modification of a file under a test directory
- Network request: request `curl https://example.com`
- System command: request `uname -a` or `whoami`

Make sure each request is explicit enough to cause the tool to ask for confirmation.

### 5) Save raw traffic

After the run, the log file should be present:

- `./acp-traffic.log`

Copy any relevant JSON-RPC messages into the findings template.

### 6) Inspect for approval events

Search the log for approval-related strings:

```sh
grep -niE "approval|user_action|permission|confirm|authorize" ./acp-traffic.log
```

If possible, identify:

- Message `method` that indicates an approval requirement
- Any payload fields like `approval_status`, `user_action_required`, or `requires_confirmation`

## What to Capture

- Raw JSON-RPC messages for any approval or user-action event
- Whether the message is a notification (no `id`) or a request (has `id`)
- How the client is expected to respond (if at all)

## Expected Deliverables

- Filled findings template in [docs/ACP_APPROVAL_FINDINGS.md](ACP_APPROVAL_FINDINGS.md)
- A log file (local): `./acp-traffic.log`

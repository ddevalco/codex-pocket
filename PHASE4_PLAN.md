# PHASE4_PLAN.md for codex-pocket

## P4-03 (ACP Attachments)

- **Goals**: Enable ACP to handle file and image attachments in prompts.
- **Acceptance Criteria**:
  - `sendPrompt` supports `attachments` field.
  - Image attachments are correctly encoded for ACP.
  - Large file attachments are handled via ACP's attachment protocol.
  - Integration tests verify attachment delivery.

## Other Phase 4 Tasks

- P4-01: Session Recovery
- P4-02: Advanced Context Management

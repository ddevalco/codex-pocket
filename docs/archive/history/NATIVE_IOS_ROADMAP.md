# Native iOS Roadmap

This roadmap defines a phased path for a native iOS client while keeping current web reliability first.

Status:

- Web reliability/docs/CI are currently green.
- Native iOS work remains optional (`P4`) and should stay incremental.

## Goals

- Replicate core CodeRelay behavior in a native SwiftUI client.
- Keep tailnet-only networking assumptions.
- Preserve existing backend/API model (`local-orbit`) and pairing flow.
- Add native-only value where web cannot match well (notifications/background UX).

## Non-Goals (for first milestones)

- App Store production release.
- Cloud relay/public-internet support.
- Major backend protocol redesign.

## Constraints

- Security model stays tailnet-only + token-session auth.
- Pairing remains short-lived, QR-based, one-time consumable.
- Existing web client remains supported in parallel.

## Milestones

### M0: Discovery + Contract Freeze (Docs/Test Only)

- Confirm API contract used by iOS:
  - `/pair/consume`
  - `/admin/status` (device/server health)
  - `/threads/:id/events`
  - `/ws` message flow (read + write paths)
- Define iOS parity checklist against current web behavior:
  - thread list
  - thread open/history replay
  - send message
  - attachment upload/send
- Deliverable:
  - frozen API checklist + smoke test matrix for iOS parity.

### M1: Pairing + Session Bootstrap (SwiftUI Skeleton)

- Build initial app shell with:
  - QR scanner for pair URL/code
  - pair consume call
  - secure token storage in Keychain
  - basic connection status surface
- Acceptance:
  - fresh install can pair with existing `/admin` QR flow
  - app can fetch authenticated `/admin/status`.

### M2: Read Path Parity

- Implement:
  - thread list
  - thread history view backed by events replay
  - websocket read updates
- Acceptance:
  - old thread history loads
  - live updates display without manual refresh
  - read-only token mode behavior is explicit in UI.

### M3: Write Path Parity

- Implement:
  - composer send flow
  - write actions through websocket/API path
  - attachment selection/upload path
- Acceptance:
  - send message and receive streamed/turn-complete updates
  - image attachment can be uploaded and rendered in thread
  - errors are surfaced with actionable retry messaging.

### M4: Native Value Additions

- Implement iOS-specific improvements:
  - notifications for:
    - approval required
    - turn complete
    - turn failure
  - better background/resume behavior than mobile Safari
- Acceptance:
  - notifications arrive for above event classes
  - app resumes cleanly to current thread state after background.

## Ask-Me-First Decision Gates

Pause and confirm before implementing any of the following:

- changes to auth/token model or approval gating behavior
- backend API changes that break existing web clients
- new external integrations/services for notifications or relay
- large dependency/toolchain shifts.

## Testing Strategy

- Keep existing web CI/self-tests mandatory.
- Add iOS parity smoke tests milestone-by-milestone:
  - pair success/failure
  - thread list fetch
  - history replay
  - send + streamed update
  - attachment upload round-trip.

## Delivery Strategy

- One small PR per milestone slice.
- Keep PRs reviewable and avoid mixed refactors.
- Update this roadmap and `BACKLOG.md` after each milestone lands.

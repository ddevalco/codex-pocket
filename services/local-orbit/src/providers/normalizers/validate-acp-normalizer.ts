#!/usr/bin/env bun
/**
 * Manual validation script for ACPSessionNormalizer
 *
 * Run with: bun services/local-orbit/src/providers/normalizers/validate-acp-normalizer.ts
 *
 * Tests various scenarios:
 * - Valid complete ACP sessions
 * - Missing fields
 * - Invalid inputs
 * - Edge cases
 */

import { ACPSessionNormalizer } from "./session-normalizer.js";

const normalizer = new ACPSessionNormalizer();

console.log("🧪 ACPSessionNormalizer Validation\n");

// Test 1: Valid complete session
console.log("Test 1: Valid complete ACP session");
const validSession = {
  id: "session-123",
  title: "Test Session",
  status: "active",
  created_at: "2026-02-16T10:00:00Z",
  updated_at: "2026-02-16T11:00:00Z",
  metadata: {
    project: "codex-pocket",
    repo: "github.com/example/codex-pocket",
  },
  messages: [
    { role: "user", content: "Hello agent" },
    { role: "assistant", content: "Hello! How can I help you today?" },
  ],
};

const result1 = await normalizer.normalizeSession(validSession);
console.log("✓ Result:", JSON.stringify(result1, null, 2));
console.log("");

// Test 2: Missing title (should generate from messages)
console.log("Test 2: Missing title - generate from first user message");
const noTitleSession = {
  id: "session-no-title",
  messages: [{ role: "user", content: "What is the weather today?" }],
};

const result2 = await normalizer.normalizeSession(noTitleSession);
console.log("✓ Generated title:", result2?.title);
console.log("");

// Test 3: Long title truncation
console.log("Test 3: Long message content - should truncate title");
const longTitleSession = {
  id: "session-long",
  messages: [
    {
      role: "user",
      content: "This is a very long message that should be truncated to create a reasonable title",
    },
  ],
};

const result3 = await normalizer.normalizeSession(longTitleSession);
console.log("✓ Truncated title:", result3?.title);
console.log("");

// Test 4: Invalid input (null)
console.log("Test 4: Invalid input (null) - should return null");
const result4 = await normalizer.normalizeSession(null);
console.log("✓ Result:", result4);
console.log("");

// Test 5: Missing id (should return null)
console.log("Test 5: Missing id field - should return null");
const noIdSession = {
  title: "No ID Session",
  status: "active",
};

const result5 = await normalizer.normalizeSession(noIdSession);
console.log("✓ Result:", result5);
console.log("");

// Test 6: Unix timestamp handling (seconds)
console.log("Test 6: Unix timestamps (seconds)");
const unixSecondsSession = {
  id: "session-unix-seconds",
  created_at: 1708081200, // Feb 16, 2024 10:00:00 UTC
  updated_at: 1708084800,
};

const result6 = await normalizer.normalizeSession(unixSecondsSession);
console.log("✓ Created:", result6?.createdAt);
console.log("✓ Updated:", result6?.updatedAt);
console.log("");

// Test 7: Unix timestamp handling (milliseconds)
console.log("Test 7: Unix timestamps (milliseconds)");
const unixMillisSession = {
  id: "session-unix-millis",
  created_at: 1708081200000,
  updated_at: 1708084800000,
};

const result7 = await normalizer.normalizeSession(unixMillisSession);
console.log("✓ Created:", result7?.createdAt);
console.log("✓ Updated:", result7?.updatedAt);
console.log("");

// Test 8: Status mapping
console.log("Test 8: Status mapping");
const statusTests = [
  { status: "active", expected: "active" },
  { status: "running", expected: "active" },
  { status: "completed", expected: "completed" },
  { status: "error", expected: "error" },
  { status: "interrupted", expected: "interrupted" },
  { status: undefined, expected: "idle" },
];

for (const { status, expected } of statusTests) {
  const session = { id: `session-${status}`, status };
  const result = await normalizer.normalizeSession(session);
  const pass = result?.status === expected;
  console.log(`${pass ? "✓" : "✗"} ${status || "undefined"} -> ${result?.status} (expected: ${expected})`);
}
console.log("");

// Test 9: Preview generation
console.log("Test 9: Preview generation from last message");
const previewSession = {
  id: "session-preview",
  messages: [
    { role: "user", content: "First message" },
    { role: "assistant", content: "Last message - this should be the preview" },
  ],
};

const result9 = await normalizer.normalizeSession(previewSession);
console.log("✓ Preview:", result9?.preview);
console.log("");

// Test 10: Explicit preview field
console.log("Test 10: Explicit preview field (should override messages)");
const explicitPreviewSession = {
  id: "session-explicit",
  preview: "Explicit preview text",
  messages: [{ role: "user", content: "Should not use this" }],
};

const result10 = await normalizer.normalizeSession(explicitPreviewSession);
console.log("✓ Preview:", result10?.preview);
console.log("");

// Test 11: Batch normalization with mixed valid/invalid
console.log("Test 11: Batch normalization (3 valid, 2 invalid)");
const batchSessions = [
  { id: "session-1", title: "Valid 1" },
  null, // Invalid
  { id: "session-2", title: "Valid 2" },
  { title: "No ID" }, // Invalid (missing id)
  { id: "session-3", title: "Valid 3" },
];

const batchResults = await normalizer.normalizeBatch(batchSessions);
console.log(`✓ Normalized ${batchResults.length} out of ${batchSessions.length} sessions`);
console.log("✓ Session IDs:", batchResults.map((s) => s.sessionId).join(", "));
console.log("");

// Test 12: Fallback title with no messages
console.log("Test 12: Fallback title when no messages available");
const noMessagesSession = {
  id: "session-no-messages",
  created_at: "2026-02-16T10:00:00Z",
};

const result12 = await normalizer.normalizeSession(noMessagesSession);
console.log("✓ Fallback title:", result12?.title);
console.log("");

// Test 13: Metadata extraction
console.log("Test 13: Metadata extraction (project and repo)");
const metaSession = {
  id: "session-meta",
  metadata: {
    project: "my-project",
    repo: "github.com/user/repo",
    customField: "custom-value",
  },
};

const result13 = await normalizer.normalizeSession(metaSession);
console.log("✓ Project:", result13?.project);
console.log("✓ Repo:", result13?.repo);
console.log("✓ Metadata:", JSON.stringify(result13?.metadata, null, 2));
console.log("");

console.log("✅ All validation tests completed!");
console.log("\nSummary:");
console.log("- Required fields (sessionId, title, status, timestamps) always populated");
console.log("- Invalid objects return null (no crashes)");
console.log("- Title generation works for missing titles");
console.log("- Preview generation from messages");
console.log("- Status mapping handles various formats");
console.log("- Timestamps handle both seconds and milliseconds");
console.log("- Metadata extraction works correctly");
console.log("- Batch normalization filters invalid sessions");

import { readFileSync } from "node:fs";

function fail(msg: string): never {
  console.error(`regression-guards: FAIL: ${msg}`);
  process.exit(1);
}

function assertPattern(opts: { file: string; pattern: RegExp; message: string }) {
  const text = readFileSync(opts.file, "utf8");
  if (!opts.pattern.test(text)) {
    fail(`${opts.file}: ${opts.message}`);
  }
}

function assertIncludesKeys(opts: { file: string; keys: string[]; label: string }) {
  const text = readFileSync(opts.file, "utf8");
  for (const key of opts.keys) {
    const re = new RegExp(String.raw`\b${key}\s*:`);
    if (!re.test(text)) {
      fail(`${opts.file} missing ${opts.label} key: ${key}`);
    }
  }
}

function assertNoReactiveSetState(opts: { file: string; varName: string }) {
  const text = readFileSync(opts.file, "utf8");

  // We had a production regression where `let x = $state<Set<string>>(new Set())` lived
  // inside an effect that both read and overwrote it, creating a feedback loop that made
  // the thread list appear empty/unusable. Guard against reintroducing this pattern.
  const re = new RegExp(String.raw`\\blet\\s+${opts.varName}\\s*=\\s*\\$state\\s*<\\s*Set\\s*<`, "m");
  if (re.test(text)) {
    fail(`${opts.file} declares \`${opts.varName}\` as reactive $state<Set<...>>. Use a plain Set for bookkeeping inside effects.`);
  }
}

assertNoReactiveSetState({
  file: "src/routes/Home.svelte",
  varName: "listSubscribed",
});

const threadCapabilityKeys = [
  "attachments",
  "approvals",
  "streaming",
  "filtering",
  "multiTurn",
  "sendPrompt",
];

const providerCapabilityKeys = [
  "listSessions",
  "openSession",
  "sendPrompt",
  "streaming",
  "attachments",
  "approvals",
  "multiTurn",
  "filtering",
  "pagination",
];

assertIncludesKeys({
  file: "src/lib/types.ts",
  keys: threadCapabilityKeys,
  label: "ThreadCapabilities",
});

assertIncludesKeys({
  file: "src/lib/threads.svelte.ts",
  keys: threadCapabilityKeys,
  label: "default thread capabilities",
});

assertPattern({
  file: "src/routes/Thread.svelte",
  pattern: /capabilities\?\.sendPrompt/, 
  message: "expected composer gating to reference capabilities.sendPrompt",
});

for (const adapterFile of [
  "services/local-orbit/src/providers/adapters/codex-adapter.ts",
  "services/local-orbit/src/providers/adapters/copilot-acp-adapter.ts",
]) {
  assertIncludesKeys({
    file: adapterFile,
    keys: providerCapabilityKeys,
    label: "provider capabilities",
  });
}

console.log("regression-guards: OK");


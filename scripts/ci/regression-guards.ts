import { readFileSync } from "node:fs";

function fail(msg: string): never {
  console.error(`regression-guards: FAIL: ${msg}`);
  process.exit(1);
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

console.log("regression-guards: OK");


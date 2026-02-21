<script lang="ts">
  import { auth } from "../lib/auth.svelte";
  import { theme } from "../lib/theme.svelte";
  import { pwa } from "../lib/pwa.svelte";

  const themeIcons = { system: "◐", light: "○", dark: "●" } as const;

  let showAuthModal = $state(false);
  let authMode = $state<"login" | "register">("login");
  let loginInput = $state("");

  const needsSetup = $derived(auth.status === "needs_setup");
  const isSignedIn = $derived(auth.status === "signed_in");

  $effect(() => {
    if (needsSetup) {
      authMode = "login";
      showAuthModal = true;
    }
  });

  function openModal(mode: "login" | "register") {
    authMode = mode;
    auth.error = null;
    showAuthModal = true;
  }

  function closeModal() {
    showAuthModal = false;
  }
</script>

<svelte:head>
  <title>CodeRelay</title>
</svelte:head>

<div class="landing stack">
  <header class="landing-header">
    <div class="brand">coderelay</div>
    <div class="header-actions">
      {#if pwa.canInstall && !pwa.isStandalone}
        <button class="ghost-btn" type="button" onclick={() => pwa.install()}>Install app</button>
      {/if}
      {#if isSignedIn}
        <a class="primary-btn" href="/app">Go to app</a>
      {/if}
      <button type="button" class="icon-btn" onclick={() => theme.cycle()} title="Theme: {theme.current}">
        <span class="icon-glyph">{themeIcons[theme.current]}</span>
      </button>
    </div>
  </header>

  <main class="hero stack">
    <div class="hero-copy stack">
      <h1>Remote control for your local Codex.</h1>
      <p>
        Control Codex sessions running on your Mac from your iPhone over Tailscale.
      </p>
      {#if !isSignedIn}
        <div class="hero-actions row">
          <button class="primary-btn" type="button" onclick={() => openModal("login")}>Use access token</button>
        </div>
      {/if}
    </div>
  </main>

  <section class="features">
    <div class="feature">
      <span class="feature-label">Anchor</span>
      <p>A lightweight daemon on your Mac that spawns and manages Codex CLI sessions. Your code never leaves the machine.</p>
    </div>
    <div class="feature">
      <span class="feature-label">Tailnet</span>
      <p>Runs entirely on your tailnet (Tailscale). No Cloudflare, no public exposure required.</p>
    </div>
    <div class="feature">
      <span class="feature-label">Handheld</span>
      <p>Approve file writes, review diffs, and steer tasks from your phone or any browser — wherever you are.</p>
    </div>
  </section>

  <footer class="landing-footer">
    <a class="footer-link" href="https://github.com/ddevalco/coderelay" target="_blank" rel="noopener">GitHub</a>
  </footer>

  {#if showAuthModal}
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div class="modal-overlay" role="presentation" onclick={closeModal}></div>
    <div class="auth-modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <span>{authMode === "login" ? "Enter access token" : "Need an access token"}</span>
        <button class="modal-close" type="button" onclick={closeModal}>×</button>
      </div>
      <div class="modal-body stack">
        {#if auth.error}
          <div class="auth-error">{auth.error}</div>
        {/if}

        {#if authMode === "login"}
          <input
            type="text"
            class="auth-input"
            placeholder="Access token"
            bind:value={loginInput}
            onkeydown={(e) => {
              if (e.key === "Enter" && loginInput.trim()) auth.signIn(loginInput.trim());
            }}
          />
          <button
            class="primary-btn"
            type="button"
            onclick={() => auth.signIn(loginInput.trim())}
            disabled={auth.busy || !loginInput.trim()}
          >
            {auth.busy ? "Working..." : "Sign in with token"}
          </button>
          <button
            class="link-btn"
            type="button"
            onclick={() => {
              authMode = "register";
              auth.error = null;
            }}
          >
            I need a token
          </button>
        {:else}
          <p class="auth-help">Use <code>coderelay token</code> on your Mac, or pair from <code>/admin</code> by scanning the QR on your mobile device.</p>
          <button
            class="link-btn"
            type="button"
            onclick={() => {
              authMode = "login";
              auth.error = null;
            }}
          >
            Back to sign in
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .landing {
    min-height: 100vh;
    background: var(--cli-bg);
    color: var(--cli-text);
    font-family: var(--font-mono);
    padding: var(--space-lg) var(--space-md);
  }

  .landing-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .brand {
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--cli-prefix-agent);
  }

  .icon-btn {
    background: transparent;
    border: 1px solid var(--cli-border);
    color: var(--cli-text);
    border-radius: var(--radius-sm);
    padding: var(--space-xs) var(--space-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .icon-glyph {
    display: block;
    font-size: var(--text-sm);
    line-height: 1;
    font-family: var(--font-mono);
  }

  .hero {
    align-items: center;
    text-align: center;
    padding-top: clamp(2rem, 8vh, 5rem);
  }

  .hero-copy {
    max-width: 720px;
    --stack-gap: var(--space-lg);
  }

  .hero h1 {
    margin: 0;
    font-size: clamp(2rem, 4vw, 3.5rem);
  }

  .hero p {
    margin: 0;
    color: var(--cli-text-dim);
    line-height: 1.6;
  }

  .hero-actions {
    justify-content: center;
    flex-wrap: wrap;
  }

  .primary-btn,
  .ghost-btn {
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    line-height: 1;
    cursor: pointer;
  }

  .primary-btn {
    border: 1px solid var(--cli-border);
    background: var(--color-btn-primary-bg, var(--cli-prefix-agent));
    color: var(--color-btn-primary-text, var(--cli-bg));
    text-decoration: none;
  }

  .ghost-btn {
    background: transparent;
    border: 1px solid var(--cli-border);
    color: var(--cli-text-dim);
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: var(--modal-overlay-bg);
    z-index: 40;
  }

  .auth-modal {
    position: fixed;
    top: 18vh;
    left: 50%;
    transform: translateX(-50%);
    width: min(420px, calc(100vw - 2rem));
    background: var(--cli-bg-elevated);
    border: 1px solid var(--cli-border);
    border-radius: var(--radius-md);
    z-index: 50;
    box-shadow: var(--shadow-modal);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--cli-border);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--cli-text-muted);
  }

  .modal-close {
    background: transparent;
    border: none;
    color: var(--cli-text-muted);
    font-size: var(--text-lg);
    cursor: pointer;
  }

  .modal-body {
    padding: var(--space-md);
    --stack-gap: var(--space-md);
  }

  .auth-input {
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-sm);
    border: 1px solid var(--cli-border);
    background: var(--cli-bg);
    color: var(--cli-text);
    font-family: var(--font-mono);
    outline: none;
  }

  .auth-error {
    padding: var(--space-sm);
    border-radius: var(--radius-sm);
    background: var(--cli-error-bg);
    color: var(--cli-error);
    font-size: var(--text-sm);
  }

  .auth-help {
    margin: 0;
    color: var(--cli-text-dim);
    line-height: 1.5;
  }

  .link-btn {
    align-self: flex-start;
    padding: 0;
    border: none;
    background: none;
    color: var(--cli-text-dim);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    cursor: pointer;
    text-decoration: underline;
  }

  .link-btn:hover {
    color: var(--cli-text);
  }

  .primary-btn:hover {
    opacity: 0.9;
  }

  .ghost-btn:hover {
    background: var(--cli-selection);
    color: var(--cli-text);
    border-color: var(--cli-text-muted);
  }

  .primary-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Features */
  .features {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-lg);
    max-width: 720px;
    margin: 0 auto;
    padding-top: clamp(2rem, 6vh, 4rem);
  }

  @media (min-width: 640px) {
    .features {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  .feature {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .feature-label {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--cli-prefix-agent);
    font-weight: 600;
  }

  .feature p {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--cli-text-dim);
    line-height: 1.5;
  }

  /* Footer */
  .landing-footer {
    margin-top: auto;
    padding-top: clamp(2rem, 6vh, 4rem);
    padding-bottom: var(--space-lg);
    text-align: center;
  }

  .footer-link {
    font-size: var(--text-xs);
    color: var(--cli-text-muted);
    text-decoration: none;
    letter-spacing: 0.04em;
  }

  .footer-link:hover {
    color: var(--cli-text-dim);
  }

</style>

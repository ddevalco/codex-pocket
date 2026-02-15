<script lang="ts">
</script>

<div class="device-shell stack">
  <div class="device-card stack">
    <div class="title">Device code login removed</div>
    <div class="subtitle">Codex Pocket now uses access tokens + Admin QR pairing only.</div>
    <a href="/admin" class="primary-link">Open Admin pairing</a>
  </div>
</div>

<style>
  .device-shell {
    min-height: 100vh;
    background: var(--cli-bg);
    color: var(--cli-text);
    font-family: var(--font-mono);
    align-items: center;
    justify-content: center;
    padding: var(--space-xl) var(--space-md);
    --stack-gap: 0;
  }

  .device-card {
    width: 100%;
    max-width: 400px;
    padding: var(--space-lg);
    --stack-gap: var(--space-md);
    text-align: center;
  }

  .title {
    font-size: var(--text-lg);
    font-weight: 600;
  }

  .subtitle {
    color: var(--cli-text-dim);
    font-size: var(--text-sm);
  }

  .primary-link {
    display: inline-block;
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-sm);
    border: 1px solid var(--cli-border);
    background: var(--cli-prefix-agent);
    color: var(--cli-bg);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    text-decoration: none;
    cursor: pointer;
  }
</style>

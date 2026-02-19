const browser = typeof window !== "undefined";

const OLD_POLICY_STORE_KEY = "codex_pocket_acp_approval_policies";
const POLICY_STORE_KEY = "coderelay_acp_approval_policies";

if (browser && !localStorage.getItem(POLICY_STORE_KEY)) {
  const old = localStorage.getItem(OLD_POLICY_STORE_KEY);
  if (old) localStorage.setItem(POLICY_STORE_KEY, old);
}

export interface AcpApprovalPolicy {
  id: string;
  toolKind?: string;
  toolTitle?: string;
  decision: "allow" | "reject";
  createdAt: number;
  provider: "copilot-acp";
}

function normalizePolicies(raw: unknown): AcpApprovalPolicy[] {
  if (!Array.isArray(raw)) return [];
  const normalized: AcpApprovalPolicy[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    const decision = record.decision === "allow" || record.decision === "reject" ? record.decision : null;
    const createdAt = typeof record.createdAt === "number" ? record.createdAt : null;
    if (!id || !decision || createdAt === null) continue;

    const toolKind = typeof record.toolKind === "string" && record.toolKind.trim() ? record.toolKind.trim() : undefined;
    const toolTitle = typeof record.toolTitle === "string" && record.toolTitle.trim() ? record.toolTitle.trim() : undefined;

    normalized.push({
      id,
      toolKind,
      toolTitle,
      decision,
      createdAt,
      provider: "copilot-acp",
    });
  }
  return normalized;
}

function loadPolicies(): AcpApprovalPolicy[] {
  if (!browser) return [];
  try {
    const raw = localStorage.getItem(POLICY_STORE_KEY);
    if (!raw) return [];
    return normalizePolicies(JSON.parse(raw));
  } catch {
    return [];
  }
}

function savePolicies(policies: AcpApprovalPolicy[]) {
  if (!browser) return;
  try {
    localStorage.setItem(POLICY_STORE_KEY, JSON.stringify(policies));
  } catch {
    // ignore localStorage failures
  }
}

function createApprovalPolicyStore() {
  const policies = $state<AcpApprovalPolicy[]>(loadPolicies());

  $effect.root(() => {
    $effect(() => savePolicies(policies));
  });

  function findMatchingPolicy(toolKind?: string, toolTitle?: string): AcpApprovalPolicy | null {
    const normalizedToolKind = toolKind?.trim() || undefined;
    const normalizedToolTitle = toolTitle?.trim() || undefined;
    let best: AcpApprovalPolicy | null = null;
    let bestSpecificity = -1;

    for (const policy of policies) {
      if (policy.toolKind && policy.toolKind !== normalizedToolKind) continue;
      if (policy.toolTitle && policy.toolTitle !== normalizedToolTitle) continue;
      const specificity = (policy.toolKind ? 1 : 0) + (policy.toolTitle ? 1 : 0);
      if (specificity > bestSpecificity) {
        best = policy;
        bestSpecificity = specificity;
        continue;
      }
      if (specificity === bestSpecificity && best && policy.createdAt > best.createdAt) {
        best = policy;
      }
    }

    return best;
  }

  function addPolicy(decision: "allow" | "reject", toolKind?: string, toolTitle?: string): void {
    const normalizedToolKind = toolKind?.trim() || undefined;
    const normalizedToolTitle = toolTitle?.trim() || undefined;
    const existing = policies.findIndex(
      (policy) => policy.toolKind === normalizedToolKind && policy.toolTitle === normalizedToolTitle
    );
    if (existing >= 0) policies.splice(existing, 1);

    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    policies.push({
      id,
      toolKind: normalizedToolKind,
      toolTitle: normalizedToolTitle,
      decision,
      createdAt: Date.now(),
      provider: "copilot-acp",
    });
  }

  function revokePolicy(id: string): void {
    const idx = policies.findIndex((policy) => policy.id === id);
    if (idx >= 0) policies.splice(idx, 1);
  }

  return { get policies() { return policies; }, findMatchingPolicy, addPolicy, revokePolicy };
}

export const approvalPolicyStore = createApprovalPolicyStore();

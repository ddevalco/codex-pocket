export interface ProviderConfig {
  enabled?: boolean;
  apiKey?: string;
  model?: string;
  executablePath?: string;
  baseUrl?: string;
  timeout?: number;
  maxTokens?: number;
  promptTimeout?: number;
  debug?: boolean;
  /** HTTP Basic auth username (used by opencode provider) */
  username?: string;
  /** HTTP Basic auth password (used by opencode provider) */
  password?: string;
}

export interface ProvidersConfigResponse {
  providers: Record<string, ProviderConfig>;
}

export async function getProviderConfig(token: string): Promise<ProvidersConfigResponse> {
  const res = await fetch("/api/config/providers", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch provider config");
  return res.json();
}

export async function updateProviderConfig(
  token: string,
  providers: Record<string, Partial<ProviderConfig>>
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch("/api/config/providers", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ providers }),
  });
  return res.json();
}

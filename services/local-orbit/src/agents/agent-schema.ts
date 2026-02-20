export interface CustomAgent {
  id: string;
  name: string;
  description: string;
  instructions?: string;
  model?: string;
  provider?: 'codex' | 'copilot-acp' | 'claude';
  capabilities?: {
    tools?: boolean;
    files?: boolean;
    web?: boolean;
  };
  metadata?: {
    author?: string;
    version?: string;
    tags?: string[];
  };
}

export function sanitizeFilename(name: string): string {
  // Strip control chars, CR/LF, quotes, slashes
  let safe = name
    .replace(/[\/\r\n\t\0"'<>|:*?\\]/g, '')
    .replace(/\.{2,}/g, '.') // Collapse consecutive dots
    .replace(/^\.*/, '') // Remove leading dots
    .replace(/\s+/g, ' ')
    .trim();
  
  // Limit length
  if (safe.length > 200) {
    safe = safe.substring(0, 200);
  }
  
  // Ensure .json suffix
  if (!safe.endsWith('.json')) {
    safe += '.json';
  }
  
  // Fallback if empty
  if (safe === '.json') {
    safe = 'agent.json';
  }
  
  return safe;
}

export function sanitizeAgentTextField(text: string, maxLength: number = 10000): string {
  return text
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control chars
    .trim()
    .substring(0, maxLength);
}

export function validateAgentCapabilities(capabilities: unknown): boolean {
  if (typeof capabilities !== 'object' || capabilities === null || Array.isArray(capabilities)) {
    return false;
  }
  
  const allowedKeys = ['tools', 'files', 'web'];
  const caps = capabilities as Record<string, unknown>;
  
  for (const key of Object.keys(caps)) {
    if (!allowedKeys.includes(key)) return false;
    if (typeof caps[key] !== 'boolean') return false;
  }
  
  return true;
}

export function validateAgentMetadata(metadata: unknown): boolean {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    return false;
  }
  
  const meta = metadata as Record<string, unknown>;
  
  if (meta.tags) {
    if (!Array.isArray(meta.tags)) return false;
    if (meta.tags.length > 50) return false;
    if (!meta.tags.every(t => typeof t === 'string' && t.length <= 100)) return false;
  }
  
  return true;
}

export function validateAgentSchema(data: unknown): CustomAgent | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }

  const agent = data as Partial<CustomAgent>;

  if (typeof agent.id !== 'string' || !agent.id) {
    console.warn('Agent validation failed: id is missing or invalid');
    return null;
  }
  if (typeof agent.name !== 'string' || !agent.name) {
    console.warn('Agent validation failed: name is missing or invalid');
    return null;
  }
  if (typeof agent.description !== 'string' || !agent.description) {
    console.warn('Agent validation failed: description is missing or invalid');
    return null;
  }

  // Optional fields validation
  if (agent.instructions !== undefined && typeof agent.instructions !== 'string') {
    return null;
  }
  if (agent.model !== undefined && typeof agent.model !== 'string') {
    return null;
  }
  if (agent.provider !== undefined && 
      !['codex', 'copilot-acp', 'claude'].includes(agent.provider)) {
    return null;
  }
  
  if (agent.capabilities !== undefined) {
    if (!validateAgentCapabilities(agent.capabilities)) {
      console.warn('Agent validation failed: invalid capabilities structure');
      return null;
    }
  }

  if (agent.metadata !== undefined) {
    if (!validateAgentMetadata(agent.metadata)) {
      console.warn('Agent validation failed: invalid metadata structure');
      return null;
    }
  }

  // Sanitize text fields
  const sanitizedAgent: CustomAgent = {
    id: agent.id,
    name: sanitizeAgentTextField(agent.name, 200),
    description: sanitizeAgentTextField(agent.description, 1000),
    instructions: agent.instructions ? sanitizeAgentTextField(agent.instructions, 10000) : undefined,
    model: agent.model,
    provider: agent.provider,
    capabilities: agent.capabilities,
    metadata: agent.metadata,
  };

  return sanitizedAgent;
}

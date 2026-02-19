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
    if (typeof agent.capabilities !== 'object' || agent.capabilities === null) {
      return null;
    }
  }

  if (agent.metadata !== undefined) {
    if (typeof agent.metadata !== 'object' || agent.metadata === null) {
      return null;
    }
  }

  return agent as CustomAgent;
}

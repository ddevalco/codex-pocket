import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { validateAgentSchema, type CustomAgent } from './agent-schema';

export class AgentStore {
  private agents: Map<string, CustomAgent> = new Map();
  private storagePath: string;

  constructor(storageDir?: string) {
    // Default to a folder in user home or relative to execution
    this.storagePath = storageDir 
      ? join(storageDir, 'custom-agents.json') 
      : join(process.cwd(), 'data', 'custom-agents.json');
    
    this.ensureStorageExists();
    this.loadAgents();
  }

  private ensureStorageExists() {
    const dir = this.storagePath.split('/').slice(0, -1).join('/');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  public loadAgents(): void {
    if (!existsSync(this.storagePath)) {
      return;
    }

    try {
      const data = readFileSync(this.storagePath, 'utf-8');
      const agents = JSON.parse(data);
      if (Array.isArray(agents)) {
        this.agents.clear();
        for (const agentData of agents) {
          const validAgent = validateAgentSchema(agentData);
          if (validAgent) {
            this.agents.set(validAgent.id, validAgent);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load agents:', error);
    }
  }

  public saveAgents(): void {
    try {
      const agents = Array.from(this.agents.values());
      writeFileSync(this.storagePath, JSON.stringify(agents, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save agents:', error);
    }
  }

  public importAgent(agentData: unknown): CustomAgent | null {
    const validAgent = validateAgentSchema(agentData);
    if (validAgent) {
      this.agents.set(validAgent.id, validAgent);
      this.saveAgents();
      return validAgent;
    }
    return null;
  }

  public exportAgent(id: string): CustomAgent | null {
    return this.agents.get(id) || null;
  }

  public listAgents(): CustomAgent[] {
    return Array.from(this.agents.values());
  }

  public getAgent(id: string): CustomAgent | null {
    return this.agents.get(id) || null;
  }

  public updateAgent(agent: CustomAgent): void {
    if (this.agents.has(agent.id)) {
      this.agents.set(agent.id, agent);
      this.saveAgents();
    }
  }

  public deleteAgent(id: string): boolean {
    const deleted = this.agents.delete(id);
    if (deleted) {
      this.saveAgents();
    }
    return deleted;
  }
}

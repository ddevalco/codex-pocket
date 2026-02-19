# Custom Agents

CodeRelay allows importing custom agent definitions to standardize model selection, instructions, and capabilities.

## Agent Schema

Agents are defined in JSON format. The schema is as follows:

```typescript
interface CustomAgent {
  id: string;          // Unique identifier
  name: string;        // Display name
  description: string; // Short description
  instructions?: string; // System prompt / Developer instructions
  model?: string;      // Model ID (e.g., "claude-3-opus", "gpt-4")
  provider?: 'codex' | 'copilot-acp' | 'claude'; // Preferred provider
  capabilities?: {
    tools?: boolean;   // Enable tools?
    files?: boolean;   // Enable file access?
    web?: boolean;     // Enable web access?
  };
  metadata?: {
    author?: string;
    version?: string;
    tags?: string[];
  };
}
```

## Example Agent JSON

```json
{
  "id": "senior-engineer",
  "name": "Senior Software Engineer",
  "description": "Expert in system design and clean code practices.",
  "instructions": "You are a senior staff engineer provided by the company. Focus on maintainability, scalability, and design patterns. Always critique architecture before implementation.",
  "model": "claude-3-opus",
  "provider": "claude",
  "capabilities": {
    "tools": true,
    "files": true
  },
  "metadata": {
    "author": "Engineering Team",
    "version": "1.0.0",
    "tags": ["engineering", "architecture"]
  }
}
```

## Usage

1. **Importing**:
   - Go to **Settings** > **Custom Agents**.
   - Click **Import Agent JSON**.
   - Select your `.json` agent file.

2. **Using**:
   - Go to **Home**.
   - Click **New Task**.
   - Select your agent from the **Agent** dropdown.
   - The model and instructions will be automatically applied.

3. **Exporting**:
   - Go to **Settings** > **Custom Agents**.
   - Click **Export** next to the agent you wish to share.

4. **Deleting**:
   - Go to **Settings** > **Custom Agents**.
   - Click **Delete** to remove the agent.

## VS Code Sync

Currently, syncing with VS Code's local agent storage is not automatically supported due to sandboxing restrictions. However, you can manually export agents from VS Code (if supported) as JSON and import them here.

If you have access to the VS Code extension storage, you may be able to locate agent definitions, but format compatibility is not guaranteed.

import { describe, expect, test } from 'bun:test';
import { 
  sanitizeFilename, 
  sanitizeAgentTextField,
  validateAgentCapabilities,
  validateAgentMetadata,
  validateAgentSchema
} from '../agent-schema';

describe('sanitizeFilename', () => {
  test('removes CRLF and control characters', () => {
    const malicious = 'agent\r\nContent-Type: text/html\r\n\r\n<script>alert(1)</script>';
    const result = sanitizeFilename(malicious);
    expect(result).not.toContain('\r');
    expect(result).not.toContain('\n');
    expect(result).toBe('agentContent-Type texthtmlscriptalert(1)script.json');
  });

  test('removes quotes and path traversal characters', () => {
    const malicious = '../../../etc/passwd"\'';
    const result = sanitizeFilename(malicious);
    expect(result).not.toContain('..');
    expect(result).not.toContain('/');
    expect(result).not.toContain('"');
    expect(result).not.toContain("'");
    expect(result).toBe('etcpasswd.json');
  });

  test('limits filename length to 200 chars', () => {
    const longName = 'a'.repeat(300);
    const result = sanitizeFilename(longName);
    expect(result.length).toBeLessThanOrEqual(205); // 200 + '.json'
  });

  test('ensures .json suffix', () => {
    expect(sanitizeFilename('myagent')).toBe('myagent.json');
    expect(sanitizeFilename('myagent.json')).toBe('myagent.json');
    expect(sanitizeFilename('myagent.txt')).toBe('myagent.txt.json');
  });

  test('provides fallback for empty names', () => {
    expect(sanitizeFilename('')).toBe('agent.json');
    expect(sanitizeFilename('   ')).toBe('agent.json');
    expect(sanitizeFilename('\r\n\t')).toBe('agent.json');
  });

  test('normalizes whitespace', () => {
    expect(sanitizeFilename('my   agent   name')).toBe('my agent name.json');
  });
});

describe('sanitizeAgentTextField', () => {
  test('removes control characters', () => {
    const text = 'Hello\x00World\x1FTest\x7F';
    const result = sanitizeAgentTextField(text);
    expect(result).toBe('HelloWorldTest');
  });

  test('truncates to max length', () => {
    const longText = 'a'.repeat(15000);
    const result = sanitizeAgentTextField(longText, 10000);
    expect(result.length).toBe(10000);
  });

  test('trims whitespace', () => {
    const text = '  test content  ';
    const result = sanitizeAgentTextField(text);
    expect(result).toBe('test content');
  });

  test('removes control characters including newlines and tabs', () => {
    const text = 'line1\nline2\ttab';
    const result = sanitizeAgentTextField(text);
    // Control characters (including \n and \t) are removed for security
    expect(result).toBe('line1line2tab');
  });
});

describe('validateAgentCapabilities', () => {
  test('accepts valid capabilities object', () => {
    expect(validateAgentCapabilities({ tools: true, files: false })).toBe(true);
    expect(validateAgentCapabilities({ web: true })).toBe(true);
    expect(validateAgentCapabilities({})).toBe(true);
  });

  test('rejects array instead of object', () => {
    expect(validateAgentCapabilities(['tools', 'files'])).toBe(false);
  });

  test('rejects null or non-object', () => {
    expect(validateAgentCapabilities(null)).toBe(false);
    expect(validateAgentCapabilities('string')).toBe(false);
    expect(validateAgentCapabilities(123)).toBe(false);
  });

  test('rejects unknown capability keys', () => {
    expect(validateAgentCapabilities({ tools: true, unknown: true })).toBe(false);
    expect(validateAgentCapabilities({ malicious: true })).toBe(false);
  });

  test('rejects non-boolean values', () => {
    expect(validateAgentCapabilities({ tools: 'yes' })).toBe(false);
    expect(validateAgentCapabilities({ files: 1 })).toBe(false);
    expect(validateAgentCapabilities({ web: null })).toBe(false);
  });
});

describe('validateAgentMetadata', () => {
  test('accepts valid metadata', () => {
    expect(validateAgentMetadata({ author: 'test' })).toBe(true);
    expect(validateAgentMetadata({ tags: ['tag1', 'tag2'] })).toBe(true);
    expect(validateAgentMetadata({})).toBe(true);
  });

  test('rejects array or null', () => {
    expect(validateAgentMetadata([])).toBe(false);
    expect(validateAgentMetadata(null)).toBe(false);
  });

  test('rejects non-array tags', () => {
    expect(validateAgentMetadata({ tags: 'tag1,tag2' })).toBe(false);
    expect(validateAgentMetadata({ tags: { tag: 'value' } })).toBe(false);
  });

  test('rejects too many tags', () => {
    const tooManyTags = Array(51).fill('tag');
    expect(validateAgentMetadata({ tags: tooManyTags })).toBe(false);
  });

  test('rejects oversized tag strings', () => {
    const longTag = 'a'.repeat(101);
    expect(validateAgentMetadata({ tags: [longTag] })).toBe(false);
  });

  test('rejects non-string tags', () => {
    expect(validateAgentMetadata({ tags: [123, 456] })).toBe(false);
    expect(validateAgentMetadata({ tags: [null] })).toBe(false);
  });
});

describe('validateAgentSchema', () => {
  test('validates and sanitizes valid agent', () => {
    const agent = {
      id: 'test-123',
      name: 'Test Agent',
      description: 'A test agent',
      instructions: 'Do the thing',
      model: 'gpt-4',
      provider: 'codex' as const,
      capabilities: { tools: true },
      metadata: { tags: ['test'] }
    };
    const result = validateAgentSchema(agent);
    expect(result).not.toBeNull();
    expect(result?.id).toBe('test-123');
  });

  test('sanitizes text fields with control chars', () => {
    const agent = {
      id: 'test-123',
      name: 'Agent\x00Name',
      description: 'Desc\x1Fription',
      instructions: 'Instructions\x7F'
    };
    const result = validateAgentSchema(agent);
    expect(result).not.toBeNull();
    expect(result?.name).toBe('AgentName');
    expect(result?.description).toBe('Description');
    expect(result?.instructions).toBe('Instructions');
  });

  test('truncates oversized instructions', () => {
    const longInstructions = 'a'.repeat(15000);
    const agent = {
      id: 'test-123',
      name: 'Test',
      description: 'Test',
      instructions: longInstructions
    };
    const result = validateAgentSchema(agent);
    expect(result).not.toBeNull();
    expect(result?.instructions?.length).toBe(10000);
  });

  test('rejects agent with invalid capabilities', () => {
    const agent = {
      id: 'test-123',
      name: 'Test',
      description: 'Test',
      capabilities: ['tools', 'files'] // Array instead of object
    };
    const result = validateAgentSchema(agent);
    expect(result).toBeNull();
  });

  test('rejects agent with invalid metadata', () => {
    const agent = {
      id: 'test-123',
      name: 'Test',
      description: 'Test',
      metadata: { tags: Array(51).fill('tag') } // Too many tags
    };
    const result = validateAgentSchema(agent);
    expect(result).toBeNull();
  });

  test('rejects agent without required fields', () => {
    expect(validateAgentSchema({ name: 'Test' })).toBeNull();
    expect(validateAgentSchema({ id: '123' })).toBeNull();
    expect(validateAgentSchema({ id: '123', name: 'Test' })).toBeNull();
  });

  test('rejects non-object input', () => {
    expect(validateAgentSchema(null)).toBeNull();
    expect(validateAgentSchema('string')).toBeNull();
    expect(validateAgentSchema([])).toBeNull();
  });

  test('rejects invalid provider', () => {
    const agent = {
      id: 'test-123',
      name: 'Test',
      description: 'Test',
      provider: 'malicious-provider'
    };
    const result = validateAgentSchema(agent);
    expect(result).toBeNull();
  });
});

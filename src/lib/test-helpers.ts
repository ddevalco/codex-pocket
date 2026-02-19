import type { Message } from './types';

export function createMockHelperOutcome(): Message {
    return {
        id: 'mock-' + Date.now(),
        role: 'assistant',
        kind: 'helper-agent-outcome',
        text: '',
        threadId: 'current',
        helperOutcome: {
            agentName: 'Code Analyzer',
            status: 'success',
            summary: 'Analyzed 3 files and found no critical issues. Added type annotations to improve type safety.',
            touchedFiles: [
                'src/lib/api.ts',
                'src/lib/utils.ts',
                'src/routes/Home.svelte'
            ],
            suggestedNextStep: 'Run type-check to verify all types are correct',
            helperRunId: 'run-123',
            timestamp: Date.now()
        }
    };
}

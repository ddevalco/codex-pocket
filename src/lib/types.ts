export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

export type ProviderFilter = "all" | "codex" | "copilot-acp" | "claude" | "opencode";
export type StatusFilter = "all" | "active" | "archived";

export interface ThreadFilterState {
  provider: ProviderFilter;
  status: StatusFilter;
}

export interface ThreadInfo {
  id: string;
  preview?: string;
  title?: string;
  name?: string;
  cwd?: string;
  path?: string;
  project?: string;
  repo?: string;
  gitBranch?: string;
  gitOriginUrl?: string;
  createdAt?: number;
  updatedAt?: number;
  lastActivity?: number;
  lastActiveAt?: number;
  modelProvider?: string;
  provider: "codex" | "copilot-acp" | "claude" | "claude-mcp" | "opencode";
  status?: string;
  archived: boolean;
  capabilities?: ProviderCapabilities & Partial<ThreadCapabilities>;
}

export interface ProviderCapabilities {
  CAN_ATTACH_FILES: boolean;
  CAN_FILTER_HISTORY: boolean;
  SUPPORTS_APPROVALS: boolean;
  SUPPORTS_STREAMING: boolean;
}

// Legacy interface - kept for backward compatibility
export interface ThreadCapabilities {
  attachments: boolean;
  approvals: boolean;
  streaming: boolean;
  filtering: boolean;
  multiTurn: boolean;
  sendPrompt: boolean;
}

export type ApprovalPolicy = "on-request" | "never";

export interface ModelOption {
  value: string;
  label: string;
}

export type ReasoningEffort = "low" | "medium" | "high";
export type SandboxMode = "read-only" | "workspace-write" | "danger-full-access";

export interface ThreadSettings {
  model: string;
  reasoningEffort: ReasoningEffort;
  sandbox: SandboxMode;
  mode: ModeKind;
  developerInstructions: string;
}

export interface ImageAttachment {
  kind: "image";
  filename: string;
  mime: string;
  localPath: string;
  viewUrl: string;
}

export interface AgentPreset {
  id: string;
  name: string;
  mode: ModeKind;
  model: string;
  reasoningEffort: ReasoningEffort;
  developerInstructions: string;
  starterPrompt: string;
}

export type MessageRole = "user" | "assistant" | "tool" | "approval";
export type MessageKind =
  | "reasoning"
  | "command"
  | "file"
  | "mcp"
  | "web"
  | "review"
  | "image"
  | "terminal"
  | "wait"
  | "approval-request"
  | "user-input-request"
  | "plan"
  | "collab"
  | "compaction"
  | "helper-agent-outcome";

export interface HelperAgentOutcome {
  agentName: string;
  status: 'success' | 'failure' | 'partial';
  summary: string;
  touchedFiles: string[];
  suggestedNextStep?: string;
  helperRunId: string;
  timestamp: number;
}

export interface MessageMetadata {
  filePath?: string;
  exitCode?: number;
  linesAdded?: number;
  linesRemoved?: number;
}

export interface ApprovalRequest {
  id: string;
  rpcId: number; // The JSON-RPC request ID to respond to
  type: "command" | "file" | "mcp" | "other";
  description: string;
  command?: string;
  filePath?: string;
  toolName?: string;
  reason?: string;
  status: "pending" | "approved" | "declined" | "cancelled";
}

export interface AcpApprovalOption {
  optionId: string;
  name: string;
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always";
}

export interface AcpApprovalRequest {
  rpcId: string | number;
  threadId: string;
  toolCallId: string;
  toolTitle?: string;
  toolKind?: string;
  options: AcpApprovalOption[];
  resolvedAt?: number;
  resolution?: { optionId: string | null };
}

export interface UserInputOption {
  label: string;
  description: string;
}

export interface UserInputQuestion {
  id: string;
  header: string;
  question: string;
  isOther?: boolean;
  isSecret?: boolean;
  options?: UserInputOption[];
}

export interface UserInputRequest {
  rpcId: number;
  questions: UserInputQuestion[];
  status: "pending" | "answered";
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost?: number;
}

export type MessageStatus = "sending" | "sent" | "error";

export interface Message {
  id: string;
  role: MessageRole;
  kind?: MessageKind;
  text: string;
  threadId: string;
  language?: string;
  metadata?: MessageMetadata;
  tokenUsage?: TokenUsage;
  approval?: ApprovalRequest;
  userInputRequest?: UserInputRequest;
  helperOutcome?: HelperAgentOutcome;
  planStatus?: "pending" | "approved";
  status?: MessageStatus;
  clientRequestId?: string;
}

// JSON-RPC style message envelope
export interface RpcMessage {
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: unknown;
  clientRequestId?: string;
}

// Turn status
export type TurnStatus = "InProgress" | "Completed" | "Interrupted" | "Failed";

// Plan step
export type PlanStepStatus = "Pending" | "InProgress" | "Completed";

export interface PlanStep {
  step: string;
  status: PlanStepStatus;
}

// Planning questions
export type PlanningQuestionType = "choice" | "multi" | "text" | "scale" | "confirm";

export interface PlanningQuestionOption {
  id: string;
  label: string;
  description?: string;
}

export interface PlanningQuestion {
  id: string;
  type: PlanningQuestionType;
  question: string;
  options?: PlanningQuestionOption[];
  min?: number;
  max?: number;
  labels?: [string, string];
  placeholder?: string;
}

export interface PlanningAnswer {
  questionId: string;
  value: string | string[] | number | boolean;
}

export type PlanningPhase = "design" | "review" | "final";

export type ModeKind = "plan" | "code";

export interface CollaborationMode {
  mode: ModeKind;
  settings: {
    model: string;
    reasoning_effort?: ReasoningEffort;
    developer_instructions?: string;
  };
}

export interface CollaborationModeMask {
  name: string;
  mode?: ModeKind;
  model?: string;
  reasoning_effort?: ReasoningEffort | null;
  developer_instructions?: string | null;
}

export interface CustomAgent {
  id: string;
  name: string;
  description: string;
  instructions?: string;
  model?: string;
  lastSyncedAt?: number;
  provider?: 'codex' | 'copilot-acp' | 'claude' | 'claude-mcp' | 'opencode';
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

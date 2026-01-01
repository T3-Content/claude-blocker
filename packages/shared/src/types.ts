// Hook event payload (from Claude Code)
export interface HookPayload {
  session_id: string;
  hook_event_name:
    | "UserPromptSubmit"
    | "PreToolUse"
    | "Stop"
    | "SessionStart"
    | "SessionEnd";
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  cwd?: string;
  transcript_path?: string;
}

// Session state tracked by server
export interface Session {
  id: string;
  status: "idle" | "working";
  lastActivity: Date;
  cwd?: string;
}

// WebSocket messages from server to extension
export type ServerMessage =
  | { type: "state"; blocked: boolean; sessions: number; working: number }
  | { type: "pong" };

// WebSocket messages from extension to server
export type ClientMessage = { type: "ping" } | { type: "subscribe" };

// Extension storage schema
export interface ExtensionState {
  blockedDomains: string[];
  lastBypassDate: string | null; // ISO date string, e.g. "2025-01-15"
  bypassUntil: number | null; // timestamp when current bypass expires
}

// Default blocked domains
export const DEFAULT_BLOCKED_DOMAINS = ["x.com", "twitter.com"];

// Server configuration
export const DEFAULT_PORT = 8765;
export const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
export const KEEPALIVE_INTERVAL_MS = 20 * 1000; // 20 seconds

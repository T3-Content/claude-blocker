import type { Session, HookPayload, ServerMessage } from "@claude-blocker/shared";
import { SESSION_TIMEOUT_MS } from "@claude-blocker/shared";

type StateChangeCallback = (message: ServerMessage) => void;

class SessionState {
  private sessions: Map<string, Session> = new Map();
  private listeners: Set<StateChangeCallback> = new Set();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup interval for stale sessions
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleSessions();
    }, 30_000); // Check every 30 seconds
  }

  subscribe(callback: StateChangeCallback): () => void {
    this.listeners.add(callback);
    // Immediately send current state to new subscriber
    callback(this.getStateMessage());
    return () => this.listeners.delete(callback);
  }

  private broadcast(): void {
    const message = this.getStateMessage();
    for (const listener of this.listeners) {
      listener(message);
    }
  }

  private getStateMessage(): ServerMessage {
    const sessions = Array.from(this.sessions.values());
    const working = sessions.filter((s) => s.status === "working").length;
    return {
      type: "state",
      blocked: working === 0,
      sessions: sessions.length,
      working,
    };
  }

  handleHook(payload: HookPayload): void {
    const { session_id, hook_event_name } = payload;

    switch (hook_event_name) {
      case "SessionStart":
        this.sessions.set(session_id, {
          id: session_id,
          status: "idle",
          lastActivity: new Date(),
          cwd: payload.cwd,
        });
        console.log(`[State] Session started: ${session_id}`);
        break;

      case "SessionEnd":
        this.sessions.delete(session_id);
        console.log(`[State] Session ended: ${session_id}`);
        break;

      case "UserPromptSubmit":
      case "PreToolUse":
        this.ensureSession(session_id, payload.cwd);
        const workingSession = this.sessions.get(session_id)!;
        workingSession.status = "working";
        workingSession.lastActivity = new Date();
        console.log(
          `[State] Session working: ${session_id} (${hook_event_name})`
        );
        break;

      case "Stop":
        this.ensureSession(session_id, payload.cwd);
        const idleSession = this.sessions.get(session_id)!;
        idleSession.status = "idle";
        idleSession.lastActivity = new Date();
        console.log(`[State] Session idle: ${session_id}`);
        break;
    }

    this.broadcast();
  }

  private ensureSession(sessionId: string, cwd?: string): void {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        id: sessionId,
        status: "idle",
        lastActivity: new Date(),
        cwd,
      });
      console.log(`[State] Session auto-registered: ${sessionId}`);
    }
  }

  private cleanupStaleSessions(): void {
    const now = Date.now();
    let removed = 0;

    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity.getTime() > SESSION_TIMEOUT_MS) {
        this.sessions.delete(id);
        removed++;
        console.log(`[State] Session timed out: ${id}`);
      }
    }

    if (removed > 0) {
      this.broadcast();
    }
  }

  getStatus(): { blocked: boolean; sessions: Session[] } {
    const sessions = Array.from(this.sessions.values());
    const working = sessions.filter((s) => s.status === "working").length;
    return {
      blocked: working === 0,
      sessions,
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.sessions.clear();
    this.listeners.clear();
  }
}

export const state = new SessionState();

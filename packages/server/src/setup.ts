import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { DEFAULT_PORT } from "@claude-blocker/shared";

interface ClaudeSettings {
  hooks?: Record<string, unknown[]>;
  [key: string]: unknown;
}

const HOOK_COMMAND = `curl -s -X POST http://localhost:${DEFAULT_PORT}/hook -H 'Content-Type: application/json' -d "$(cat)" > /dev/null 2>&1 &`;

const HOOKS_CONFIG = {
  UserPromptSubmit: [
    {
      hooks: [
        {
          type: "command",
          command: HOOK_COMMAND,
        },
      ],
    },
  ],
  PreToolUse: [
    {
      matcher: "*",
      hooks: [
        {
          type: "command",
          command: HOOK_COMMAND,
        },
      ],
    },
  ],
  Stop: [
    {
      hooks: [
        {
          type: "command",
          command: HOOK_COMMAND,
        },
      ],
    },
  ],
  SessionStart: [
    {
      hooks: [
        {
          type: "command",
          command: HOOK_COMMAND,
        },
      ],
    },
  ],
  SessionEnd: [
    {
      hooks: [
        {
          type: "command",
          command: HOOK_COMMAND,
        },
      ],
    },
  ],
};

export function setupHooks(): void {
  const claudeDir = join(homedir(), ".claude");
  const settingsPath = join(claudeDir, "settings.json");

  // Ensure .claude directory exists
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
    console.log(`Created ${claudeDir}`);
  }

  // Load existing settings or create empty object
  let settings: ClaudeSettings = {};
  if (existsSync(settingsPath)) {
    try {
      const content = readFileSync(settingsPath, "utf-8");
      settings = JSON.parse(content);
      console.log("Loaded existing settings.json");
    } catch (error) {
      console.error("Error reading settings.json:", error);
      console.log("Creating new settings.json");
    }
  }

  // Merge hooks (don't overwrite existing hooks for other events)
  settings.hooks = {
    ...settings.hooks,
    ...HOOKS_CONFIG,
  };

  // Write settings
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

  console.log(`
┌─────────────────────────────────────────────────┐
│                                                 │
│   Claude Blocker Setup Complete!                │
│                                                 │
│   Hooks configured in:                          │
│   ${settingsPath}
│                                                 │
│   Configured hooks:                             │
│   - UserPromptSubmit (work starting)            │
│   - PreToolUse (tool executing)                 │
│   - Stop (work finished)                        │
│   - SessionStart (session began)                │
│   - SessionEnd (session ended)                  │
│                                                 │
│   Next: Run 'npx claude-blocker' to start       │
│                                                 │
└─────────────────────────────────────────────────┘
`);
}

export function removeHooks(): void {
  const settingsPath = join(homedir(), ".claude", "settings.json");

  if (!existsSync(settingsPath)) {
    console.log("No settings.json found, nothing to remove.");
    return;
  }

  try {
    const content = readFileSync(settingsPath, "utf-8");
    const settings: ClaudeSettings = JSON.parse(content);

    if (settings.hooks) {
      // Remove our hooks
      for (const hookName of Object.keys(HOOKS_CONFIG)) {
        delete settings.hooks[hookName];
      }

      // If hooks object is empty, remove it entirely
      if (Object.keys(settings.hooks).length === 0) {
        delete settings.hooks;
      }

      writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      console.log("Claude Blocker hooks removed from settings.json");
    } else {
      console.log("No hooks found in settings.json");
    }
  } catch (error) {
    console.error("Error removing hooks:", error);
  }
}

#!/usr/bin/env node

import { startServer } from "./server.js";
import { setupHooks, removeHooks } from "./setup.js";
import { DEFAULT_PORT } from "@claude-blocker/shared";

const args = process.argv.slice(2);

function printHelp(): void {
  console.log(`
Claude Blocker - Block distracting sites when Claude Code isn't working

Usage:
  npx claude-blocker [options]

Options:
  --setup     Configure Claude Code hooks (run once)
  --remove    Remove Claude Code hooks
  --port      Server port (default: ${DEFAULT_PORT})
  --help      Show this help message

Examples:
  npx claude-blocker --setup    # Configure hooks (first time)
  npx claude-blocker            # Start the server
  npx claude-blocker --port 9000
`);
}

function main(): void {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  if (args.includes("--setup")) {
    setupHooks();
    process.exit(0);
  }

  if (args.includes("--remove")) {
    removeHooks();
    process.exit(0);
  }

  // Parse port
  let port = DEFAULT_PORT;
  const portIndex = args.indexOf("--port");
  if (portIndex !== -1 && args[portIndex + 1]) {
    const parsed = parseInt(args[portIndex + 1], 10);
    if (!isNaN(parsed) && parsed > 0 && parsed < 65536) {
      port = parsed;
    } else {
      console.error("Invalid port number");
      process.exit(1);
    }
  }

  startServer(port);
}

main();

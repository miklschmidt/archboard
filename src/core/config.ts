import dotenv from 'dotenv';

// Load environment variables once for every entry point (MCP server, CLI, canvas server)
dotenv.config();

// Express server configuration
export const EXPRESS_SERVER_URL = process.env.EXPRESS_SERVER_URL || 'http://127.0.0.1:3000';
export const ENABLE_CANVAS_SYNC = process.env.ENABLE_CANVAS_SYNC !== 'false'; // Default to true

// Opt-out for auto-starting the canvas server from the CLI / MCP server
export const EXCALIDRAW_NO_AUTOSTART = process.env.EXCALIDRAW_NO_AUTOSTART === '1';

// Safe file path validation base directory (see sanitizeFilePath)
export const ALLOWED_EXPORT_DIR = process.env.EXCALIDRAW_EXPORT_DIR || process.cwd();

// The Obsidian vault every board is persisted into (ADR 0004). Deliberately
// has no default: the vault spans repositories, so guessing at the current
// working directory would scatter boards across checkouts and quietly create a
// different "vault" per cwd.
//
// Unset, the canvas does not start (ADR 0015). The vault is the only place a
// board may live, so a canvas without one has nowhere to put anything, and a
// canvas somebody can draw on before discovering the drawing was never
// anywhere is the worst of the three ways out.
export const ARCHBOARD_VAULT = process.env.ARCHBOARD_VAULT || undefined;

/**
 * What a canvas with no vault says, in one place because three surfaces say it:
 * the server before it binds, the CLI before it spawns a server, and
 * requireVaultRoot() for anything that gets past both.
 *
 * It points at the install step rather than teaching what a vault is.
 * `install-skill` is what chooses a vault, creates it and writes the path into
 * the repo's own agent doc (TASK-036), and on the ordinary path it has run
 * long before anybody starts a canvas. This is the backstop for the run where
 * it has not.
 */
export function noVaultMessage(): string {
  return [
    'archboard has no vault, so there is nowhere to put a board and the canvas will not start.',
    '',
    'Boards are notes in an Obsidian vault, and choosing one is part of installing',
    'archboard into a repository:',
    '',
    '  archboard install-skill',
    '',
    "That creates the vault and writes its path into the repo's CLAUDE.md or AGENTS.md.",
    'Then start the canvas with it set:',
    '',
    '  export ARCHBOARD_VAULT=/path/to/vault',
    '  archboard start'
  ].join('\n');
}

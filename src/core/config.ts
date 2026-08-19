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
// different "vault" per cwd. Unset means the board commands refuse to run and
// say so — see requireVaultRoot() in core/board.ts.
export const ARCHBOARD_VAULT = process.env.ARCHBOARD_VAULT || undefined;

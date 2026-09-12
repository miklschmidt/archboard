import dotenv from "dotenv";

// Load environment variables once for every entry point (CLI and canvas server)
dotenv.config({ quiet: true });

// Express server configuration
const EXPRESS_SERVER_URL = process.env["EXPRESS_SERVER_URL"] || "http://127.0.0.1:3000";
const ENABLE_CANVAS_SYNC = process.env["ENABLE_CANVAS_SYNC"] !== "false"; // Default to true

// Opt out of auto-starting the canvas server from the CLI.
const EXCALIDRAW_NO_AUTOSTART = process.env["EXCALIDRAW_NO_AUTOSTART"] === "1";

// The Obsidian vault every board is persisted into (ADR 0004). Deliberately
// has no default: the vault spans repositories, so guessing at the current
// working directory would scatter boards across checkouts and quietly create a
// different "vault" per cwd.
//
// Unset, the canvas does not start (ADR 0015). The vault is the only place a
// board may live, so a canvas without one has nowhere to put anything, and a
// canvas somebody can draw on before discovering the drawing was never
// anywhere is the worst of the three ways out.
const ARCHBOARD_VAULT = process.env["ARCHBOARD_VAULT"] || undefined;

// The pane this invocation is writing for, when it is running for one.
//
// A workhorse bound to a pane writes on that pane's behalf, and whoever is
// listening to that pane's thread has to be able to tell somebody else's change
// from its own echo — after ADR 0023 every semantic write is an agent's, so the
// kind of writer says nothing and the identity the board was held under says
// custody rather than authorship.
//
// From the environment rather than a flag on the command line, for the same
// reason the vault is: a person has no pane id to type, and it is the agent's
// own identity rather than something a caller chooses per board.
//
// Per invocation, and never on a long-lived process. One private app-server
// child serves every thread, and both panes can be bound at once (DESIGN.md
// §2), so a value set once on that child would stamp every thread's writes with
// one pane — one thread deaf to the other's changes and one told about its own.
// A wrong pane is worse than no pane, because no pane is honest: unset means
// unattributable, and unattributable means the change is delivered to everybody
// rather than quietly to nobody.
const ARCHBOARD_PANE = process.env["ARCHBOARD_PANE"]?.trim() || undefined;

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
 * @returns The refusal text, ready to print.
 */
function noVaultMessage(): string {
	return [
		"archboard has no vault, so there is nowhere to put a board and the canvas will not start.",
		"",
		"Boards are notes in an Obsidian vault, and choosing one is part of installing",
		"archboard into a repository:",
		"",
		"  archboard install-skill",
		"",
		"That creates the vault and writes its path into the repo's CLAUDE.md or AGENTS.md.",
		"Then start the canvas with it set:",
		"",
		"  export ARCHBOARD_VAULT=/path/to/vault",
		"  archboard start",
	].join("\n");
}

export {
	EXPRESS_SERVER_URL,
	ENABLE_CANVAS_SYNC,
	EXCALIDRAW_NO_AUTOSTART,
	ARCHBOARD_VAULT,
	ARCHBOARD_PANE,
	noVaultMessage,
};

import dotenv from "dotenv";

// Load environment variables once for every entry point (CLI and Archboard server)
dotenv.config({ quiet: true });

// The Archboard server the CLI talks to, and where an auto-started one listens.
const ARCHBOARD_URL = process.env["ARCHBOARD_URL"] || "http://127.0.0.1:3000";

// Opt out of auto-starting the Archboard server from the CLI.
const ARCHBOARD_NO_AUTOSTART = process.env["ARCHBOARD_NO_AUTOSTART"] === "1";

// The vault directory every board is persisted into (ADR 0004). Deliberately
// has no default: the vault spans repositories, so guessing at the current
// working directory would scatter boards across checkouts and quietly create a
// different "vault" per cwd.
//
// Unset, the server does not start (ADR 0015). The vault is the only place a
// board may live, so a server without one has nowhere to put anything, and a
// server somebody can draw on before discovering the drawing was never
// anywhere is the worst of the three ways out.
const ARCHBOARD_VAULT = process.env["ARCHBOARD_VAULT"] || undefined;

/**
 * What an Archboard server with no vault says, in one place because two surfaces say it:
 * the CLI before it spawns a server, and the server's own vault (`serverVault()`), which it
 * asks before it binds and for anything that gets past that.
 *
 * It points at the install step rather than teaching what a vault is.
 * `install-skill` is what chooses a vault, creates it and writes the path into
 * the repo's own agent doc (TASK-036), and on the ordinary path it has run
 * long before anybody starts a server. This is the backstop for the run where
 * it has not.
 * @returns The refusal text, ready to print.
 */
function noVaultMessage(): string {
	return [
		"archboard has no vault, so there is nowhere to put a board and the Archboard server will not start.",
		"",
		"Boards are files in a vault directory, and choosing one is part of installing",
		"archboard into a repository:",
		"",
		"  archboard install-skill",
		"",
		"That creates the vault and writes its path into the repo's CLAUDE.md or AGENTS.md.",
		"Then start the Archboard server with it set:",
		"",
		"  export ARCHBOARD_VAULT=/path/to/vault",
		"  archboard start",
	].join("\n");
}

/**
 * The refusal for the server URL's old name, before archboard named its own environment
 * (TASK-310). A shell or `.envrc` that still sets it would otherwise have its server ignored and
 * another started on the default port, over the same vault.
 * @returns The refusal text, or null when the old name is not set.
 */
function renamedUrlMessage(): string | null {
	return process.env["EXPRESS_SERVER_URL"] === undefined
		? null
		: "EXPRESS_SERVER_URL is now ARCHBOARD_URL. Rename it where it is set (a shell profile, an .envrc or a .env file), then run the command again.";
}

export {
	ARCHBOARD_URL,
	renamedUrlMessage,
	ARCHBOARD_NO_AUTOSTART,
	ARCHBOARD_VAULT,
	noVaultMessage,
};

import dotenv from "dotenv";
import { DEFAULT_ARCHBOARD_URL } from "@/runtime/engine/source-checkout";

// Load environment variables once for every entry point (CLI and Archboard server)
dotenv.config({ quiet: true });

// The Archboard server the CLI talks to, and where an auto-started one listens:
// this checkout's own port unless a set ARCHBOARD_URL or --url names another.
const ARCHBOARD_URL = process.env["ARCHBOARD_URL"] || DEFAULT_ARCHBOARD_URL;

// Opt out of auto-starting the Archboard server from the CLI.
const ARCHBOARD_NO_AUTOSTART = process.env["ARCHBOARD_NO_AUTOSTART"] === "1";

// The vault a set ARCHBOARD_VAULT names. A command finds its vault from the
// working directory or -C (ADR 0049); until TASK-472.09 refuses the variable,
// a set one still decides when -C is absent, and the server opens a page in it.
const ARCHBOARD_VAULT = process.env["ARCHBOARD_VAULT"] || undefined;

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

export { ARCHBOARD_URL, renamedUrlMessage, ARCHBOARD_NO_AUTOSTART, ARCHBOARD_VAULT };

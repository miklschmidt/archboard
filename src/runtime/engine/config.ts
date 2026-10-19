import dotenv from "dotenv";
import { DEFAULT_ARCHBOARD_URL } from "@archboard/workspace/source-checkout";

// Load environment variables once for every entry point (CLI and Archboard server)
dotenv.config({ quiet: true });

// The Archboard server the CLI talks to, and where an auto-started one listens:
// this checkout's own port unless a set ARCHBOARD_URL or --url names another.
const ARCHBOARD_URL = process.env["ARCHBOARD_URL"] || DEFAULT_ARCHBOARD_URL;

// Opt out of auto-starting the Archboard server from the CLI.
const ARCHBOARD_NO_AUTOSTART = process.env["ARCHBOARD_NO_AUTOSTART"] === "1";

/**
 * The refusal for an environment variable archboard no longer reads. A shell or `.envrc` or `.env`
 * that still sets one would otherwise be ignored without a word: `EXPRESS_SERVER_URL` would start
 * a second server on the default port, and `ARCHBOARD_VAULT` would address another vault than the
 * one the person means (TASK-310, ADR 0049).
 * @returns The refusal text, or null when no removed variable is set.
 */
function removedEnvironmentMessage(): string | null {
	if (process.env["EXPRESS_SERVER_URL"] !== undefined) {
		return "EXPRESS_SERVER_URL is now ARCHBOARD_URL. Rename it where it is set (a shell profile, an .envrc or a .env file), then run the command again.";
	}
	if (process.env["ARCHBOARD_VAULT"] !== undefined) {
		return (
			"ARCHBOARD_VAULT is no longer read, and a set one is refused so that it never addresses another vault than you mean. " +
			"A command finds its vault from the directory it runs in, or from -C <dir>. " +
			"Unset it where it is set (a shell profile, an .envrc or a .env file), then run the command again. " +
			"A vault outside a git checkout moves to <dir>/.archboard/vault, where a command run in <dir> finds it."
		);
	}
	return null;
}

export { ARCHBOARD_URL, removedEnvironmentMessage, ARCHBOARD_NO_AUTOSTART };

import path from "node:path";
import { homedir } from "os";

/**
 * Where archboard keeps machine-local state: the server pidfile, the registry
 * of repository checkouts on this machine (ADR 0011), and the Codex workbench
 * with its own home and sessions.
 *
 * Machine-local, not repo-local and not vault-local. The vault spans
 * repositories and is meant to be portable (ADR 0004), so nothing in it may
 * name a directory on one laptop; a checkout path is exactly that, so it lives
 * here instead.
 * @returns The platform's state directory for archboard.
 */
function stateDir(): string {
	if (process.platform === "darwin") {
		return path.join(homedir(), "Library", "Application Support", "archboard");
	}
	if (process.platform === "win32") {
		const base = process.env["LOCALAPPDATA"] || path.join(homedir(), "AppData", "Local");
		return path.join(base, "Archboard");
	}
	const xdgState = process.env["XDG_STATE_HOME"] || path.join(homedir(), ".local", "state");
	return path.join(xdgState, "archboard");
}

export { stateDir };

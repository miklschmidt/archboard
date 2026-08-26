import path from "path";
import { homedir } from "os";

/**
 * Where archboard keeps machine-local state: the canvas pidfile, and the
 * registry of repository checkouts on this machine (ADR 0011).
 *
 * Machine-local, not repo-local and not vault-local. The vault spans
 * repositories and is meant to be portable (ADR 0004), so nothing in it may
 * name a directory on one laptop; a checkout path is exactly that, so it lives
 * here instead.
 *
 * The directory keeps the old `excalidraw-canvas` spelling deliberately:
 * renaming it would orphan a running server's pidfile, and nothing prints it.
 */
export function stateDir(): string {
	if (process.platform === "darwin") {
		return path.join(homedir(), "Library", "Application Support", "excalidraw-canvas");
	}
	if (process.platform === "win32") {
		const base = process.env.LOCALAPPDATA || path.join(homedir(), "AppData", "Local");
		return path.join(base, "Excalidraw-Canvas");
	}
	const xdgState = process.env.XDG_STATE_HOME || path.join(homedir(), ".local", "state");
	return path.join(xdgState, "excalidraw-canvas");
}

import fs from "node:fs";
import path from "node:path";
import { homedir } from "os";

// Directories that have already been migrated in this process, so the check
// costs one `existsSync` per process rather than one per `stateDir()` call.
const migrated = new Set<string>();

/**
 * The platform's directory for machine-local state under a given product name.
 * @param posixName The directory name on Linux and macOS.
 * @param windowsName The directory name on Windows, which capitalises it.
 * @returns The absolute directory path.
 */
function platformStateDir(posixName: string, windowsName: string): string {
	if (process.platform === "darwin") {
		return path.join(homedir(), "Library", "Application Support", posixName);
	}
	if (process.platform === "win32") {
		const base = process.env["LOCALAPPDATA"] || path.join(homedir(), "AppData", "Local");
		return path.join(base, windowsName);
	}
	const xdgState = process.env["XDG_STATE_HOME"] || path.join(homedir(), ".local", "state");
	return path.join(xdgState, posixName);
}

/**
 * Where machine-local state lived before the product's own names were archboard.
 * The spelling names the past and is never written to again; it exists so a
 * machine that still has that directory is moved rather than started empty,
 * which would sign the operator out of the Codex session kept below it.
 * @returns The absolute path of the pre-rename state directory.
 */
function legacyStateDir(): string {
	return platformStateDir("excalidraw-canvas", "Excalidraw-Canvas");
}

/**
 * Move one entry out of the pre-rename directory, never overwriting what the
 * new directory already holds: the log file archboard already keeps there is
 * the live one, and a half-written copy of state is worse than two copies.
 * @param from The entry in the pre-rename directory.
 * @param to Where it belongs under the current state directory.
 * @returns True when the entry is no longer in the pre-rename directory.
 */
function moveEntry(from: string, to: string): boolean {
	if (fs.existsSync(to)) {
		return false;
	}
	try {
		fs.renameSync(from, to);
		return true;
	} catch {
		// One entry that will not move leaves the rest of the directory intact
		// for the next start to retry. Nothing is deleted on this path.
		return false;
	}
}

/**
 * Move every entry of the pre-rename directory into the current one.
 * @param legacy The pre-rename state directory.
 * @param current The state directory archboard uses now.
 * @returns How many entries stayed behind.
 */
function moveEntries(legacy: string, current: string): number {
	let left = 0;
	for (const entry of fs.readdirSync(legacy)) {
		if (!moveEntry(path.join(legacy, entry), path.join(current, entry))) {
			left += 1;
		}
	}
	return left;
}

/**
 * Whether the pre-rename directory still has to be moved in this process.
 * @param legacy The pre-rename state directory.
 * @param current The state directory archboard uses now.
 * @returns True when there is something to move.
 */
function needsMigration(legacy: string, current: string): boolean {
	return legacy !== current && !migrated.has(current) && fs.existsSync(legacy);
}

/**
 * Bring a machine that still keeps state under the pre-rename directory onto
 * the current one, entry by entry so that an already-present entry is kept.
 * The entries are renamed, not copied, so the Codex home below them keeps its
 * login, sessions and logs; the pre-rename directory is removed only once it
 * is empty.
 * @param current The state directory archboard uses now.
 */
function migrateLegacyState(current: string): void {
	const legacy = legacyStateDir();
	if (!needsMigration(legacy, current)) {
		return;
	}
	migrated.add(current);
	fs.mkdirSync(current, { recursive: true });
	if (moveEntries(legacy, current) > 0) {
		return;
	}
	try {
		fs.rmdirSync(legacy);
	} catch {
		// An empty directory nobody reads any more; the next start tries again.
	}
}

/**
 * Where archboard keeps machine-local state: the canvas pidfile, the registry
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
	const current = platformStateDir("archboard", "Archboard");
	migrateLegacyState(current);
	return current;
}

export { stateDir };

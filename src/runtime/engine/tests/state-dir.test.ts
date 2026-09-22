import { afterEach, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { stateDir } from "../state-dir.js";

// The one name from before the rename the test has to know: the migration is
// what turns it into the current directory, so it cannot be asked for it.
const LEGACY_NAME = process.platform === "win32" ? "Excalidraw-Canvas" : "excalidraw-canvas";

const HOME_VARIABLES = ["HOME", "USERPROFILE", "LOCALAPPDATA", "XDG_STATE_HOME"] as const;

const roots: string[] = [];
const saved = new Map<string, string | undefined>();

/**
 * Point every variable the state directory is resolved from at a temporary
 * root, so the test never reaches the operator's own state.
 * @returns The current and pre-rename state directories below that root.
 */
function isolatedState(): { current: string; legacy: string } {
	const root = mkdtempSync(join(tmpdir(), "archboard-state-dir-"));
	roots.push(root);
	for (const variable of HOME_VARIABLES) {
		if (!saved.has(variable)) {
			saved.set(variable, process.env[variable]);
		}
		process.env[variable] = root;
	}
	const current = stateDir();
	return { current, legacy: join(dirname(current), LEGACY_NAME) };
}

/**
 * Write a file and every directory above it.
 * @param file The file to write.
 * @param contents What to put in it.
 */
function seed(file: string, contents: string): void {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, contents, "utf8");
}

afterEach(() => {
	for (const [variable, value] of saved) {
		if (value === undefined) {
			delete process.env[variable];
		} else {
			process.env[variable] = value;
		}
	}
	saved.clear();
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

test("the Codex home moves out of the pre-rename directory, keeping its contents", () => {
	const { current, legacy } = isolatedState();
	seed(join(legacy, "codex-workbench", "codex-home", "auth.json"), '{"token":"kept"}');
	seed(join(legacy, "codex-workbench", "sqlite-home", "codex.db"), "sqlite");
	seed(join(legacy, "repos.json"), "[]");

	const resolved = stateDir();

	expect(resolved).toBe(current);
	expect(readFileSync(join(current, "codex-workbench", "codex-home", "auth.json"), "utf8")).toBe(
		'{"token":"kept"}',
	);
	expect(readFileSync(join(current, "codex-workbench", "sqlite-home", "codex.db"), "utf8")).toBe(
		"sqlite",
	);
	expect(readFileSync(join(current, "repos.json"), "utf8")).toBe("[]");
	expect(existsSync(legacy)).toBe(false);
});

test("an entry the current directory already holds is never overwritten", () => {
	const { current, legacy } = isolatedState();
	seed(join(current, "archboard.log"), "live log");
	seed(join(legacy, "archboard.log"), "stale log");
	seed(join(legacy, "repos.json"), "[]");

	stateDir();

	expect(readFileSync(join(current, "archboard.log"), "utf8")).toBe("live log");
	expect(readFileSync(join(current, "repos.json"), "utf8")).toBe("[]");
	// What could not move is left where it is rather than deleted.
	expect(readFileSync(join(legacy, "archboard.log"), "utf8")).toBe("stale log");
	expect(readdirSync(legacy)).toEqual(["archboard.log"]);
});

test("hundreds of stale pidfiles move with everything else", () => {
	const { current, legacy } = isolatedState();
	for (let port = 3000; port < 3300; port += 1) {
		seed(join(legacy, `server-${port}.pid`), String(port));
	}
	seed(join(legacy, "codex-workbench", "codex-home", "auth.json"), "{}");

	stateDir();

	expect(readdirSync(current).filter((entry) => entry.endsWith(".pid"))).toHaveLength(300);
	expect(readFileSync(join(current, "server-3299.pid"), "utf8")).toBe("3299");
	expect(existsSync(join(current, "codex-workbench", "codex-home", "auth.json"))).toBe(true);
	expect(existsSync(legacy)).toBe(false);
});

test("a machine with no pre-rename directory is left alone", () => {
	const { current, legacy } = isolatedState();

	const resolved = stateDir();

	expect(resolved).toBe(current);
	expect(existsSync(legacy)).toBe(false);
	expect(existsSync(current)).toBe(false);
});

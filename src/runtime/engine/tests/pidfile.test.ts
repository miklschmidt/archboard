import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { pidFilePath, readPidFile, sweepDeadPidFiles, writePidFile } from "../pidfile.js";
import { stateDir } from "../state-dir.js";

const HOME_VARIABLES = ["HOME", "USERPROFILE", "LOCALAPPDATA", "XDG_STATE_HOME"] as const;

const roots: string[] = [];
const saved = new Map<string, string | undefined>();

/**
 * Point the state directory at a temporary root, so the sweep never reaches
 * the operator's own pidfiles.
 * @returns The isolated state directory.
 */
function isolatedState(): string {
	const root = mkdtempSync(join(tmpdir(), "archboard-pidfile-"));
	roots.push(root);
	for (const variable of HOME_VARIABLES) {
		if (!saved.has(variable)) {
			saved.set(variable, process.env[variable]);
		}
		process.env[variable] = root;
	}
	const directory = stateDir();
	mkdirSync(directory, { recursive: true });
	return directory;
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

test("a sweep removes the pidfiles of gone canvases and keeps live ones", () => {
	const directory = isolatedState();
	writePidFile(4101, process.pid);
	const live = readFileSync(pidFilePath(4101), "utf-8");
	expect(readPidFile(4101)).toBe(process.pid);

	const exitedPid = Bun.spawnSync(["true"]).pid;
	const reusedStartTime = `${live.trim().split(" ")[1]}0`;
	writeFileSync(join(directory, "server-4102.pid"), String(exitedPid));
	writeFileSync(join(directory, "server-4103.pid"), `${process.pid} ${reusedStartTime}\n`);
	// A pid-only file from an older build is judged by its pid alone.
	writeFileSync(join(directory, "server-4104.pid"), String(process.pid));
	writeFileSync(join(directory, "unrelated.pid"), String(exitedPid));

	expect(sweepDeadPidFiles()).toBe(2);
	expect(existsSync(join(directory, "server-4102.pid"))).toBeFalse();
	expect(existsSync(join(directory, "server-4103.pid"))).toBeFalse();
	expect(readFileSync(pidFilePath(4101), "utf-8")).toBe(live);
	expect(readPidFile(4104)).toBe(process.pid);
	expect(existsSync(join(directory, "unrelated.pid"))).toBeTrue();
});

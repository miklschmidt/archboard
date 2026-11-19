import { cpSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { temporaryHome } from "#tests/runtime/support/temporary-home.ts";

const homes: string[] = [];
const originalState = process.env["XDG_STATE_HOME"];

export function cleanPrivateArchiveFixtures() {
	if (originalState === undefined) delete process.env["XDG_STATE_HOME"];
	else process.env["XDG_STATE_HOME"] = originalState;
	for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
}

export function untrackedFixture() {
	const home = temporaryHome("archboard-private-");
	homes.push(home);
	process.env["XDG_STATE_HOME"] = join(home, "state");
	const root = join(home, "notes");
	const vault = join(root, ".archboard/vault");
	cpSync(resolve("examples/canonical-model/.archboard/vault"), vault, { recursive: true });
	return { home, root, vault };
}

export function snapshot(directory: string): Record<string, string> {
	return Object.fromEntries(
		readdirSync(directory, { recursive: true, withFileTypes: true }).map((entry) => {
			const path = join(entry.parentPath, entry.name);
			return [
				path.slice(directory.length),
				entry.isDirectory() ? "directory" : readFileSync(path).toString("base64"),
			];
		}),
	);
}

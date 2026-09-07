// Where the rendering proof finds its inputs and how long it waits.
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const fixtureRoot = resolve(root, "docs/design/server-rendering-boundary-fixtures");
const fixtureNote = join(fixtureRoot, "board.excalidraw.md");
const chromium = "/run/current-system/sw/bin/chromium";
const setsid = "/run/current-system/sw/bin/setsid";
const jobTimeoutMs = 20_000;
const cleanupTimeoutMs = 5_000;
const cleanupPollMs = 50;

/**
 * Refuse to run without the local browser, the fixtures and the packages
 * the fixture page loads.
 * @throws {Error} When any required input is absent.
 */
function requirePreflight(): void {
	for (const file of [
		chromium,
		setsid,
		fixtureNote,
		join(fixtureRoot, "chromium.html"),
		join(fixtureRoot, "diagram.mmd"),
		join(root, "node_modules", "@excalidraw", "excalidraw", "package.json"),
		join(root, "node_modules", "@excalidraw", "mermaid-to-excalidraw", "package.json"),
		join(root, "node_modules", "mermaid", "package.json"),
	]) {
		if (!existsSync(file)) {
			throw new Error(`Preflight failed: required local input is absent: ${file}`);
		}
	}
}

/**
 * The disposable report directory this proof owns.
 * @param argv The command-line arguments, which must be empty.
 * @returns A fresh temporary directory.
 * @throws {Error} When arguments were passed.
 */
function ownedOutputDirectory(argv: readonly string[]): string {
	if (argv.length > 0) {
		throw new Error(
			"This proof owns its output. Run without arguments; it creates one disposable report directory under the system temporary root.",
		);
	}
	return mkdtempSync(join(tmpdir(), "archboard-server-rendering-proof-"));
}

export {
	chromium,
	cleanupPollMs,
	cleanupTimeoutMs,
	fixtureNote,
	fixtureRoot,
	jobTimeoutMs,
	ownedOutputDirectory,
	requirePreflight,
	root,
	setsid,
};

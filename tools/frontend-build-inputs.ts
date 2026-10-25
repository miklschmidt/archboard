import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const INPUT_DIRECTORIES = ["packages", "apps", "patches"];
const INPUT_FILES = [
	"vite.config.ts",
	"tsconfig.json",
	"tsconfig.frontend.json",
	"package.json",
	"bun.lock",
	"tools/frontend-build-inputs.ts",
];
const FRONTEND_INPUTS_FILE = ".frontend-inputs.sha256";
const FRONTEND_INPUT_GLOBS = [
	...INPUT_DIRECTORIES.map((directory) => directory + "/**"),
	...INPUT_FILES,
];

/**
 * Read the build's source inventory without depending on modification times.
 * @param root The checkout root.
 * @returns The existing source files, in a stable order.
 */
function inputFiles(root: string): string[] {
	const files = INPUT_FILES.map((file) => join(root, file)).filter(existsSync);
	const queue = INPUT_DIRECTORIES.map((directory) => join(root, directory)).filter(existsSync);
	while (queue.length > 0) {
		const directory = queue.pop()!;
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) queue.push(path);
			else if (entry.isFile()) files.push(path);
		}
	}
	return files.toSorted();
}

/**
 * Identify the source bytes a frontend build starts from, including its configuration.
 * @param root The checkout root.
 * @returns A content fingerprint that remains valid after cache restoration or checkout.
 */
function frontendInputsFingerprint(root: string): string {
	const hash = createHash("sha256");
	for (const file of inputFiles(root)) {
		hash.update(relative(root, file)).update("\0").update(readFileSync(file)).update("\0");
	}
	return hash.digest("hex");
}

export { FRONTEND_INPUTS_FILE, FRONTEND_INPUT_GLOBS, frontendInputsFingerprint };

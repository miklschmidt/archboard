import { existsSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const contractRoot = join(repositoryRoot, "src/shared/codex-app-server-contract");
const generatedRoot = join(contractRoot, "generated");
const stagingRoot = mkdtempSync(join(contractRoot, ".generated-"));
const previousRoot = join(contractRoot, ".generated-previous");

function restorePreviousGeneration(): void {
	if (!existsSync(previousRoot)) return;
	if (existsSync(generatedRoot)) rmSync(generatedRoot, { recursive: true });
	renameSync(previousRoot, generatedRoot);
}

try {
	const generated = Bun.spawnSync({
		cmd: [
			process.execPath,
			"x",
			"--bun",
			"codex",
			"app-server",
			"generate-ts",
			"--experimental",
			"--out",
			stagingRoot,
		],
		cwd: repositoryRoot,
		stdin: "ignore",
		stdout: "inherit",
		stderr: "inherit",
	});
	if (!generated.success) {
		throw new Error(`Codex app-server type generation exited ${generated.exitCode}`);
	}
	if (!existsSync(join(stagingRoot, "index.ts"))) {
		throw new Error("Codex app-server type generation produced no index.ts");
	}

	rmSync(previousRoot, { force: true, recursive: true });
	if (existsSync(generatedRoot)) renameSync(generatedRoot, previousRoot);
	try {
		renameSync(stagingRoot, generatedRoot);
	} catch (error) {
		restorePreviousGeneration();
		throw error;
	}
	rmSync(previousRoot, { force: true, recursive: true });
} catch (error) {
	rmSync(stagingRoot, { force: true, recursive: true });
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}

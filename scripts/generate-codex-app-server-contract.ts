import { randomUUID } from "node:crypto";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readlinkSync,
	readdirSync,
	realpathSync,
	renameSync,
	rmSync,
	symlinkSync,
	unlinkSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const contractRoot = join(repositoryRoot, "src/shared/codex-app-server-contract");
const generatedRoot = join(contractRoot, "generated");
const versionsRoot = join(generatedRoot, "versions");
const currentRoot = join(generatedRoot, "current");
const lockPath = join(generatedRoot, ".generation.lock");
const lockedEnvironment = "ARCHBOARD_CODEX_GENERATOR_LOCKED";

function errorCode(error: unknown): string | undefined {
	return error instanceof Error && "code" in error && typeof error.code === "string"
		? error.code
		: undefined;
}

function currentVersionName(): string | undefined {
	let current;
	try {
		current = lstatSync(currentRoot);
	} catch (error) {
		if (errorCode(error) === "ENOENT") return undefined;
		throw error;
	}
	if (!current.isSymbolicLink()) {
		throw new Error(`${relative(repositoryRoot, currentRoot)} must be the generated symlink`);
	}
	const target = resolve(generatedRoot, readlinkSync(currentRoot));
	const versionName = basename(target);
	if (dirname(target) !== versionsRoot || !versionName.startsWith("version-")) {
		throw new Error(`${relative(repositoryRoot, currentRoot)} points outside its owned versions`);
	}
	return versionName;
}

function removeOwnedVersion(name: string): void {
	if (!name.startsWith("version-") && !name.startsWith(".staging-")) {
		throw new Error(`Refusing to remove unowned generated entry ${name}`);
	}
	const target = join(versionsRoot, name);
	const entry = lstatSync(target);
	if (!entry.isDirectory() || entry.isSymbolicLink()) {
		throw new Error(`Refusing to remove non-directory generated entry ${name}`);
	}
	if (realpathSync(dirname(target)) !== realpathSync(versionsRoot)) {
		throw new Error(
			`Refusing to remove generated entry outside ${relative(repositoryRoot, versionsRoot)}`,
		);
	}
	rmSync(target, { recursive: true });
}

function cleanupOwnedArtifacts(activeVersion: string | undefined): void {
	for (const entry of readdirSync(versionsRoot, { withFileTypes: true })) {
		if (entry.name === activeVersion) continue;
		if (entry.name.startsWith("version-") || entry.name.startsWith(".staging-")) {
			removeOwnedVersion(entry.name);
		}
	}
	for (const entry of readdirSync(generatedRoot, { withFileTypes: true })) {
		if (!entry.name.startsWith(".current-")) continue;
		if (!entry.isSymbolicLink()) {
			throw new Error(`Refusing to remove non-symlink generated pointer ${entry.name}`);
		}
		unlinkSync(join(generatedRoot, entry.name));
	}
}

async function generateContract(): Promise<void> {
	cleanupOwnedArtifacts(currentVersionName());
	const stagingRoot = mkdtempSync(join(versionsRoot, ".staging-"));
	let versionRoot: string | undefined;
	let pointerCandidate: string | undefined;
	try {
		const generated = Bun.spawn({
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
		const exitCode = await generated.exited;
		if (exitCode !== 0) throw new Error(`Codex app-server type generation exited ${exitCode}`);
		if (!existsSync(join(stagingRoot, "index.ts"))) {
			throw new Error("Codex app-server type generation produced no index.ts");
		}

		const versionName = `version-${randomUUID()}`;
		versionRoot = join(versionsRoot, versionName);
		renameSync(stagingRoot, versionRoot);
		pointerCandidate = join(generatedRoot, `.current-${randomUUID()}`);
		symlinkSync(join("versions", versionName), pointerCandidate, "dir");
		renameSync(pointerCandidate, currentRoot);
		pointerCandidate = undefined;
		if (currentVersionName() !== versionName || !existsSync(join(currentRoot, "index.ts"))) {
			throw new Error("Generated Codex contract pointer switch did not complete");
		}
	} catch (error) {
		if (pointerCandidate !== undefined && existsSync(pointerCandidate))
			unlinkSync(pointerCandidate);
		const activeVersion = currentVersionName();
		for (const target of [stagingRoot, versionRoot]) {
			if (target === undefined || !existsSync(target) || basename(target) === activeVersion)
				continue;
			removeOwnedVersion(basename(target));
		}
		throw error;
	}
}

async function main(): Promise<void> {
	mkdirSync(versionsRoot, { recursive: true });
	if (process.env[lockedEnvironment] !== "1") {
		const locked = Bun.spawnSync({
			cmd: ["flock", "-x", "-w", "20", lockPath, process.execPath, fileURLToPath(import.meta.url)],
			cwd: repositoryRoot,
			env: { ...process.env, [lockedEnvironment]: "1" },
			stdin: "ignore",
			stdout: "inherit",
			stderr: "inherit",
		});
		if (!locked.success) {
			throw new Error(
				`Could not obtain the Codex contract generation lock; flock exited ${locked.exitCode}`,
			);
		}
		return;
	}
	await generateContract();
}

try {
	await main();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}

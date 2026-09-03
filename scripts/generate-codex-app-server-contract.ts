import { randomUUID } from "node:crypto";
import {
	existsSync,
	linkSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readlinkSync,
	readdirSync,
	realpathSync,
	renameSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
	CODEX_CONTRACT_GENERATION_LOCK_POLL_MS,
	CODEX_CONTRACT_GENERATION_LOCK_STEAL_GUARD_MS,
	CODEX_CONTRACT_GENERATION_LOCK_WAIT_MS,
} from "../src/shared/timing/timing.js";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const contractRoot = join(repositoryRoot, "src/shared/codex-app-server-contract");
const generatedRoot = join(contractRoot, "generated");
const versionsRoot = join(generatedRoot, "versions");
const currentRoot = join(generatedRoot, "current");
const lockPath = join(generatedRoot, ".generation.lock");
const expectedCodexVersion = "0.151.0";
const codexPackageRoot = join(repositoryRoot, "node_modules/@openai/codex");
const codexManifestPath = join(codexPackageRoot, "package.json");
const codexEntryPath = join(codexPackageRoot, "bin/codex.js");

interface GenerationLock {
	readonly token: string;
	readonly processId: number;
	readonly childProcessId?: number;
}

function errorCode(error: unknown): string | undefined {
	return error instanceof Error && "code" in error && typeof error.code === "string"
		? error.code
		: undefined;
}

function localCodexError(detail: string): Error {
	return new Error(
		`${detail} Expected checkout-local @openai/codex ${expectedCodexVersion}. Run "bun install" in this checkout and retry.`,
	);
}

function resolveLocalCodexEntry(): string {
	let manifest: unknown;
	try {
		manifest = JSON.parse(readFileSync(codexManifestPath, "utf8"));
	} catch (error) {
		throw localCodexError(
			`Could not read ${relative(repositoryRoot, codexManifestPath)}: ${error instanceof Error ? error.message : String(error)}.`,
		);
	}
	if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
		throw localCodexError(
			`${relative(repositoryRoot, codexManifestPath)} is not a package manifest.`,
		);
	}
	const packageManifest = manifest as Record<string, unknown>;
	if (packageManifest.name !== "@openai/codex") {
		throw localCodexError(
			`${relative(repositoryRoot, codexManifestPath)} names ${String(packageManifest.name)}.`,
		);
	}
	if (packageManifest.version !== expectedCodexVersion) {
		throw localCodexError(
			`${relative(repositoryRoot, codexManifestPath)} has version ${String(packageManifest.version)}.`,
		);
	}
	const manifestBin = packageManifest.bin;
	if (
		!manifestBin ||
		typeof manifestBin !== "object" ||
		Array.isArray(manifestBin) ||
		(manifestBin as Record<string, unknown>).codex !== "bin/codex.js"
	) {
		throw localCodexError(
			`${relative(repositoryRoot, codexManifestPath)} does not declare codex at bin/codex.js.`,
		);
	}

	let realPackageRoot: string;
	let realCodexEntry: string;
	try {
		realPackageRoot = realpathSync(codexPackageRoot);
		realCodexEntry = realpathSync(codexEntryPath);
	} catch (error) {
		throw localCodexError(
			`Could not resolve ${relative(repositoryRoot, codexEntryPath)}: ${error instanceof Error ? error.message : String(error)}.`,
		);
	}
	const entryWithinPackage = relative(realPackageRoot, realCodexEntry);
	if (
		entryWithinPackage === ".." ||
		entryWithinPackage.startsWith(`..${sep}`) ||
		isAbsolute(entryWithinPackage) ||
		!lstatSync(realCodexEntry).isFile()
	) {
		throw localCodexError(
			`${relative(repositoryRoot, codexEntryPath)} is not a file inside the checkout-local package.`,
		);
	}
	return codexEntryPath;
}

function readGenerationLock(file = lockPath): GenerationLock | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(file, "utf8"));
	} catch {
		return undefined;
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
	const record = parsed as Record<string, unknown>;
	if (
		typeof record.token !== "string" ||
		typeof record.processId !== "number" ||
		!Number.isSafeInteger(record.processId) ||
		record.processId <= 0 ||
		(record.childProcessId !== undefined &&
			(typeof record.childProcessId !== "number" ||
				!Number.isSafeInteger(record.childProcessId) ||
				record.childProcessId <= 0))
	) {
		return undefined;
	}
	return {
		token: record.token,
		processId: record.processId,
		...(record.childProcessId === undefined
			? {}
			: { childProcessId: record.childProcessId as number }),
	};
}

function processIsAlive(processId: number): boolean {
	try {
		process.kill(processId, 0);
		return true;
	} catch (error) {
		return errorCode(error) !== "ESRCH";
	}
}

function lockOwnerIsAlive(lock: GenerationLock): boolean {
	return (
		processIsAlive(lock.processId) ||
		(lock.childProcessId !== undefined && processIsAlive(lock.childProcessId))
	);
}

function lockCandidatePath(lock: GenerationLock): string {
	return join(generatedRoot, `.generation-owner-${lock.processId}-${lock.token}.tmp`);
}

function writeGenerationLock(lock: GenerationLock): void {
	const candidate = lockCandidatePath(lock);
	writeFileSync(candidate, JSON.stringify(lock), { flag: "wx" });
	try {
		renameSync(candidate, lockPath);
	} catch (error) {
		try {
			unlinkSync(candidate);
		} catch {
			/* never created, or already renamed */
		}
		throw error;
	}
}

function tryCreateGenerationLock(lock: GenerationLock): boolean {
	const candidate = lockCandidatePath(lock);
	writeFileSync(candidate, JSON.stringify(lock), { flag: "wx" });
	try {
		linkSync(candidate, lockPath);
		return true;
	} catch (error) {
		if (errorCode(error) !== "EEXIST") throw error;
		return false;
	} finally {
		try {
			unlinkSync(candidate);
		} catch {
			/* interrupted owner recovery cleans this identity-checked candidate */
		}
	}
}

function acquireGenerationLock(): GenerationLock {
	const lock: GenerationLock = { token: randomUUID(), processId: process.pid };
	const deadline = Date.now() + CODEX_CONTRACT_GENERATION_LOCK_WAIT_MS;
	for (;;) {
		if (tryCreateGenerationLock(lock)) return lock;
		const current = readGenerationLock();
		if (current && lockOwnerIsAlive(current)) {
			if (Date.now() >= deadline) {
				throw new Error(
					`Codex contract generation is still held by process ${current.processId}; retry after that generator exits.`,
				);
			}
			Bun.sleepSync(
				Math.min(CODEX_CONTRACT_GENERATION_LOCK_POLL_MS, Math.max(1, deadline - Date.now())),
			);
			continue;
		}

		writeGenerationLock(lock);
		Bun.sleepSync(CODEX_CONTRACT_GENERATION_LOCK_STEAL_GUARD_MS);
		if (readGenerationLock()?.token === lock.token) return lock;
		if (Date.now() >= deadline) {
			throw new Error("Codex contract generation lock recovery did not settle; retry generation.");
		}
	}
}

function updateGenerationLock(lock: GenerationLock, childProcessId?: number): GenerationLock {
	if (readGenerationLock()?.token !== lock.token) {
		throw new Error("Codex contract generation lost its lock before publishing output.");
	}
	const updated = {
		token: lock.token,
		processId: lock.processId,
		...(childProcessId === undefined ? {} : { childProcessId }),
	};
	writeGenerationLock(updated);
	return updated;
}

function releaseGenerationLock(lock: GenerationLock): void {
	if (readGenerationLock()?.token !== lock.token) {
		throw new Error(
			"Refusing to release a Codex contract generation lock owned by another process.",
		);
	}
	unlinkSync(lockPath);
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
		if (entry.name.startsWith(".current-")) {
			if (!entry.isSymbolicLink()) {
				throw new Error(`Refusing to remove non-symlink generated pointer ${entry.name}`);
			}
			unlinkSync(join(generatedRoot, entry.name));
			continue;
		}
		if (!entry.name.startsWith(".generation-owner-")) continue;
		const ownerMatch = /^\.generation-owner-(\d+)-.+\.tmp$/.exec(entry.name);
		if (!entry.isFile() || !ownerMatch) {
			throw new Error(`Refusing to remove unidentified generation-lock artifact ${entry.name}`);
		}
		const ownerProcessId = Number(ownerMatch[1]);
		if (!Number.isSafeInteger(ownerProcessId) || processIsAlive(ownerProcessId)) continue;
		unlinkSync(join(generatedRoot, entry.name));
	}
}

async function generateContract(
	codexEntry: string,
	setChildProcess: (processId?: number) => void,
): Promise<void> {
	cleanupOwnedArtifacts(currentVersionName());
	const stagingRoot = mkdtempSync(join(versionsRoot, ".staging-"));
	let versionRoot: string | undefined;
	let pointerCandidate: string | undefined;
	try {
		const generated = Bun.spawn({
			cmd: [
				process.execPath,
				codexEntry,
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
		setChildProcess(generated.pid);
		let exitCode: number;
		try {
			exitCode = await generated.exited;
		} finally {
			setChildProcess();
		}
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
	const codexEntry = resolveLocalCodexEntry();
	mkdirSync(versionsRoot, { recursive: true });
	let generationLock = acquireGenerationLock();
	try {
		await generateContract(codexEntry, (childProcessId) => {
			generationLock = updateGenerationLock(generationLock, childProcessId);
		});
	} finally {
		releaseGenerationLock(generationLock);
	}
}

try {
	await main();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}

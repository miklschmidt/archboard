import { randomUUID } from "node:crypto";
import {
	existsSync,
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

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const realRepositoryRoot = realpathSync(repositoryRoot);
const contractRoot = join(repositoryRoot, "src/shared/codex-app-server-contract");
const generatedRoot = join(contractRoot, "generated");
const versionsRoot = join(generatedRoot, "versions");
const currentRoot = join(generatedRoot, "current");
const expectedCodexVersion = "0.151.0";
// Bump when this tracked recipe changes the generated layout or Codex arguments.
const generationRecipeRevision = 1;
const versionPrefix = `version-${expectedCodexVersion}-recipe-${generationRecipeRevision}-`;
// Completion identifies safe cleanup candidates. It never validates or reuses a contract tree.
const completionStateFileName = ".archboard-generation-complete.json";
const activeOwnerFileName = ".archboard-generation-active";
// Keep current plus one predecessor so a reader of the previous symlink target can finish.
const retainedCompleteVersionCount = 2;
const codexPackageRoot = join(repositoryRoot, "node_modules/@openai/codex");
const codexManifestPath = join(codexPackageRoot, "package.json");
const codexEntryPath = join(codexPackageRoot, "bin/codex.js");
const expectedRealCodexPackageRoot = join(realRepositoryRoot, "node_modules/@openai/codex");

interface GenerationCompletion {
	readonly codexVersion: string;
	readonly recipeRevision: number;
	readonly generationId: string;
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

function pathIsInside(root: string, candidate: string): boolean {
	const relation = relative(root, candidate);
	return relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation);
}

function resolveLocalCodexEntry(): string {
	let realPackageRoot: string;
	try {
		realPackageRoot = realpathSync(codexPackageRoot);
	} catch (error) {
		throw localCodexError(
			`Could not resolve ${relative(repositoryRoot, codexPackageRoot)}: ${error instanceof Error ? error.message : String(error)}.`,
		);
	}
	if (realPackageRoot !== expectedRealCodexPackageRoot) {
		throw localCodexError(
			`${relative(repositoryRoot, codexPackageRoot)} resolves outside this checkout's node_modules tree.`,
		);
	}

	let realManifestPath: string;
	let realCodexEntry: string;
	try {
		realManifestPath = realpathSync(codexManifestPath);
		realCodexEntry = realpathSync(codexEntryPath);
	} catch (error) {
		throw localCodexError(
			`Could not resolve the checkout-local package files: ${error instanceof Error ? error.message : String(error)}.`,
		);
	}
	if (
		!pathIsInside(expectedRealCodexPackageRoot, realManifestPath) ||
		!lstatSync(realManifestPath).isFile()
	) {
		throw localCodexError(
			`${relative(repositoryRoot, codexManifestPath)} is not a file inside the checkout-local package.`,
		);
	}
	if (
		!pathIsInside(expectedRealCodexPackageRoot, realCodexEntry) ||
		!lstatSync(realCodexEntry).isFile()
	) {
		throw localCodexError(
			`${relative(repositoryRoot, codexEntryPath)} is not a file inside the checkout-local package.`,
		);
	}

	let manifest: unknown;
	try {
		manifest = JSON.parse(readFileSync(realManifestPath, "utf8"));
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

	return realCodexEntry;
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

function entryExists(target: string): boolean {
	try {
		lstatSync(target);
		return true;
	} catch (error) {
		if (errorCode(error) === "ENOENT") return false;
		throw error;
	}
}

function removeGeneratedDirectory(target: string, expectedName: string): void {
	if (dirname(target) !== versionsRoot || basename(target) !== expectedName) {
		throw new Error(`Refusing to remove unowned generated entry ${basename(target)}`);
	}
	const entry = lstatSync(target);
	if (!entry.isDirectory() || entry.isSymbolicLink()) {
		throw new Error(`Refusing to remove non-directory generated entry ${expectedName}`);
	}
	if (realpathSync(dirname(target)) !== realpathSync(versionsRoot)) {
		throw new Error(
			`Refusing to remove generated entry outside ${relative(repositoryRoot, versionsRoot)}`,
		);
	}
	rmSync(target, { recursive: true });
}

interface CompletedVersion extends GenerationCompletion {
	readonly name: string;
	readonly root: string;
	readonly completedAtMs: number;
	readonly active: boolean;
}

function readCompletedVersion(name: string): CompletedVersion | undefined {
	const root = join(versionsRoot, name);
	let versionEntry;
	let completionEntry;
	try {
		versionEntry = lstatSync(root);
		completionEntry = lstatSync(join(root, completionStateFileName));
	} catch {
		return undefined;
	}
	if (
		!versionEntry.isDirectory() ||
		versionEntry.isSymbolicLink() ||
		!completionEntry.isFile() ||
		completionEntry.isSymbolicLink()
	) {
		return undefined;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(join(root, completionStateFileName), "utf8"));
	} catch {
		return undefined;
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
	const completion = parsed as Record<string, unknown>;
	if (
		typeof completion.codexVersion !== "string" ||
		typeof completion.recipeRevision !== "number" ||
		!Number.isSafeInteger(completion.recipeRevision) ||
		typeof completion.generationId !== "string" ||
		name !==
			`version-${completion.codexVersion}-recipe-${completion.recipeRevision}-${completion.generationId}`
	) {
		return undefined;
	}
	return {
		name,
		root,
		codexVersion: completion.codexVersion,
		recipeRevision: completion.recipeRevision,
		generationId: completion.generationId,
		completedAtMs: completionEntry.mtimeMs,
		active: entryExists(join(root, activeOwnerFileName)),
	};
}

function removeCompletedInactiveVersion(version: CompletedVersion): void {
	const latest = readCompletedVersion(version.name);
	if (!latest || latest.active || currentVersionName() === latest.name) return;
	const retiredName = `.retired-${randomUUID()}`;
	const retiredRoot = join(versionsRoot, retiredName);
	try {
		renameSync(latest.root, retiredRoot);
	} catch (error) {
		if (errorCode(error) === "ENOENT") return;
		throw error;
	}
	removeGeneratedDirectory(retiredRoot, retiredName);
}

function cleanupRetiredVersions(): void {
	const current = currentVersionName();
	const inactive = readdirSync(versionsRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
		.map((entry) => readCompletedVersion(entry.name))
		.filter(
			(version): version is CompletedVersion =>
				version !== undefined && !version.active && version.name !== current,
		)
		.toSorted(
			(left, right) =>
				right.completedAtMs - left.completedAtMs || right.name.localeCompare(left.name),
		);
	for (const retired of inactive.slice(retainedCompleteVersionCount - 1)) {
		removeCompletedInactiveVersion(retired);
	}
}

async function generateContract(codexEntry: string): Promise<void> {
	const stagingRoot = mkdtempSync(join(versionsRoot, ".staging-"));
	const generationId = randomUUID();
	const versionName = `${versionPrefix}${generationId}`;
	const versionRoot = join(versionsRoot, versionName);
	const activeOwnerPath = join(versionRoot, activeOwnerFileName);
	let pointerCandidate: string | undefined;
	let installed = false;
	let published = false;
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
		const exitCode = await generated.exited;
		if (exitCode !== 0) throw new Error(`Codex app-server type generation exited ${exitCode}`);
		if (!existsSync(join(stagingRoot, "index.ts"))) {
			throw new Error("Codex app-server type generation produced no index.ts");
		}

		writeFileSync(join(stagingRoot, activeOwnerFileName), generationId, { flag: "wx" });
		writeFileSync(
			join(stagingRoot, completionStateFileName),
			JSON.stringify({
				codexVersion: expectedCodexVersion,
				recipeRevision: generationRecipeRevision,
				generationId,
			} satisfies GenerationCompletion),
			{ flag: "wx" },
		);
		renameSync(stagingRoot, versionRoot);
		installed = true;
		pointerCandidate = join(generatedRoot, `.current-${randomUUID()}`);
		symlinkSync(join("versions", versionName), pointerCandidate, "dir");
		renameSync(pointerCandidate, currentRoot);
		published = true;
		pointerCandidate = undefined;
		try {
			if (currentVersionName() === undefined || !existsSync(join(currentRoot, "index.ts"))) {
				throw new Error("Generated Codex contract pointer switch did not complete");
			}
		} finally {
			unlinkSync(activeOwnerPath);
		}
		cleanupRetiredVersions();
	} catch (error) {
		if (pointerCandidate !== undefined) {
			try {
				unlinkSync(pointerCandidate);
			} catch (unlinkError) {
				if (errorCode(unlinkError) !== "ENOENT") throw unlinkError;
			}
		}
		if (entryExists(stagingRoot)) {
			removeGeneratedDirectory(stagingRoot, basename(stagingRoot));
		} else if (installed && !published && entryExists(versionRoot)) {
			removeGeneratedDirectory(versionRoot, versionName);
		}
		throw error;
	}
}

async function main(): Promise<void> {
	const codexEntry = resolveLocalCodexEntry();
	mkdirSync(versionsRoot, { recursive: true });
	await generateContract(codexEntry);
}

try {
	await main();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}

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
	type Stats,
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
const generationRecipeRevision = 2;
const versionName = `version-${expectedCodexVersion}-recipe-${generationRecipeRevision}`;
const versionRoot = join(versionsRoot, versionName);
const codexPackageRoot = join(repositoryRoot, "node_modules/@openai/codex");
const codexManifestPath = join(codexPackageRoot, "package.json");
const codexEntryPath = join(codexPackageRoot, "bin/codex.js");
const expectedRealCodexPackageRoot = join(realRepositoryRoot, "node_modules/@openai/codex");

type DirectoryEntry = Stats;

/**
 * The `code` of a Node system error, when there is one.
 * @param error The caught value.
 * @returns The code, or undefined for anything else.
 */
function errorCode(error: unknown): string | undefined {
	return error instanceof Error && "code" in error && typeof error.code === "string"
		? error.code
		: undefined;
}

/**
 * The message of a caught value, whatever it is.
 * @param error The caught value.
 * @returns The error message, or the value as text.
 */
function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * An error telling the operator how to obtain the checkout-local Codex package.
 * @param detail What was wrong with the local package.
 * @returns The error to throw.
 */
function localCodexError(detail: string): Error {
	return new Error(
		`${detail} Expected checkout-local @openai/codex ${expectedCodexVersion}. Run "bun install" in this checkout and retry.`,
	);
}

/**
 * Whether a path lies inside a root directory (or is that root).
 * @param root The containing directory.
 * @param candidate The path to test.
 * @returns Whether the candidate does not escape the root.
 */
function pathIsInside(root: string, candidate: string): boolean {
	const relation = relative(root, candidate);
	return relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation);
}

/**
 * Whether a value is a plain JSON object.
 * @param value The parsed value.
 * @returns Whether it is a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Resolve a checkout-local package file, refusing symlinks that leave the
 * checkout's own node_modules tree.
 * @param filePath The path inside the package.
 * @returns The real path of the file.
 * @throws {Error} When the path cannot be resolved or resolves outside the package.
 */
function requireLocalPackageFile(filePath: string): string {
	let realPath: string;
	try {
		realPath = realpathSync(filePath);
	} catch (error) {
		throw localCodexError(
			`Could not resolve the checkout-local package files: ${errorMessage(error)}.`,
		);
	}
	if (!pathIsInside(expectedRealCodexPackageRoot, realPath) || !lstatSync(realPath).isFile()) {
		throw localCodexError(
			`${relative(repositoryRoot, filePath)} is not a file inside the checkout-local package.`,
		);
	}
	return realPath;
}

/**
 * The real root of the checkout-local Codex package.
 * @returns The real path of node_modules/@openai/codex.
 * @throws {Error} When it cannot be resolved or lies outside this checkout.
 */
function requireLocalPackageRoot(): string {
	let realPackageRoot: string;
	try {
		realPackageRoot = realpathSync(codexPackageRoot);
	} catch (error) {
		throw localCodexError(
			`Could not resolve ${relative(repositoryRoot, codexPackageRoot)}: ${errorMessage(error)}.`,
		);
	}
	if (realPackageRoot !== expectedRealCodexPackageRoot) {
		throw localCodexError(
			`${relative(repositoryRoot, codexPackageRoot)} resolves outside this checkout's node_modules tree.`,
		);
	}
	return realPackageRoot;
}

/**
 * Read the package manifest as a JSON object.
 * @param realManifestPath The manifest's real path.
 * @returns The manifest fields.
 * @throws {Error} When the file is unreadable or not an object.
 */
function readManifest(realManifestPath: string): Record<string, unknown> {
	let manifest: unknown;
	try {
		manifest = JSON.parse(readFileSync(realManifestPath, "utf8"));
	} catch (error) {
		throw localCodexError(
			`Could not read ${relative(repositoryRoot, codexManifestPath)}: ${errorMessage(error)}.`,
		);
	}
	if (!isRecord(manifest)) {
		throw localCodexError(
			`${relative(repositoryRoot, codexManifestPath)} is not a package manifest.`,
		);
	}
	return manifest;
}

/**
 * Refuse a manifest that is not the pinned Codex package with its CLI at bin/codex.js.
 * @param manifest The manifest fields.
 * @throws {Error} When the name, version or bin entry differ from the pin.
 */
function requirePinnedManifest(manifest: Record<string, unknown>): void {
	if (manifest["name"] !== "@openai/codex") {
		throw localCodexError(
			`${relative(repositoryRoot, codexManifestPath)} names ${String(manifest["name"])}.`,
		);
	}
	if (manifest["version"] !== expectedCodexVersion) {
		throw localCodexError(
			`${relative(repositoryRoot, codexManifestPath)} has version ${String(manifest["version"])}.`,
		);
	}
	const manifestBin = manifest["bin"];
	if (!isRecord(manifestBin) || manifestBin["codex"] !== "bin/codex.js") {
		throw localCodexError(
			`${relative(repositoryRoot, codexManifestPath)} does not declare codex at bin/codex.js.`,
		);
	}
}

/**
 * The CLI entry of the checkout-local, pinned Codex package.
 * @returns The real path of bin/codex.js.
 * @throws {Error} When the package is missing, elsewhere, or a different version.
 */
function resolveLocalCodexEntry(): string {
	requireLocalPackageRoot();
	const realManifestPath = requireLocalPackageFile(codexManifestPath);
	const realCodexEntry = requireLocalPackageFile(codexEntryPath);
	requirePinnedManifest(readManifest(realManifestPath));
	return realCodexEntry;
}

/**
 * The version directory the `current` symlink points at.
 * @returns The version name, or undefined when there is no symlink yet.
 * @throws {Error} When `current` is not a symlink into the owned versions directory.
 */
function currentVersionName(): string | undefined {
	let current;
	try {
		current = lstatSync(currentRoot);
	} catch (error) {
		if (errorCode(error) === "ENOENT") {
			return undefined;
		}
		throw error;
	}
	if (!current.isSymbolicLink()) {
		throw new Error(`${relative(repositoryRoot, currentRoot)} must be the generated symlink`);
	}
	const target = resolve(generatedRoot, readlinkSync(currentRoot));
	const currentTargetName = basename(target);
	if (dirname(target) !== versionsRoot || !currentTargetName.startsWith("version-")) {
		throw new Error(`${relative(repositoryRoot, currentRoot)} points outside its owned versions`);
	}
	return currentTargetName;
}

/**
 * Whether a filesystem entry exists, symlinks included.
 * @param target The path to test.
 * @returns Whether `lstat` succeeds.
 */
function entryExists(target: string): boolean {
	try {
		lstatSync(target);
		return true;
	} catch (error) {
		if (errorCode(error) === "ENOENT") {
			return false;
		}
		throw error;
	}
}

/**
 * Remove a staging directory this script created, refusing anything else.
 * @param target The staging directory.
 * @throws {Error} When the path is not an owned `.staging-` directory under versions.
 */
function removeOwnedStagingDirectory(target: string): void {
	const stagingName = basename(target);
	if (dirname(target) !== versionsRoot || !stagingName.startsWith(".staging-")) {
		throw new Error(`Refusing to remove unowned generated entry ${basename(target)}`);
	}
	const entry = lstatSync(target);
	if (!entry.isDirectory() || entry.isSymbolicLink()) {
		throw new Error(`Refusing to remove non-directory generated entry ${stagingName}`);
	}
	if (realpathSync(dirname(target)) !== realpathSync(versionsRoot)) {
		throw new Error(
			`Refusing to remove generated entry outside ${relative(repositoryRoot, versionsRoot)}`,
		);
	}
	rmSync(target, { recursive: true });
}

/**
 * Every regular file under a generated tree, as paths relative to its root.
 * @param root The generated tree.
 * @param directory The subdirectory being listed, relative to the root.
 * @returns The relative file paths.
 * @throws {Error} When the tree holds a symlink or other unsupported entry.
 */
function generatedFiles(root: string, directory = ""): string[] {
	return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
		const entryPath = join(directory, entry.name);
		if (entry.isSymbolicLink()) {
			throw new Error(`Generated Codex contract contains unsupported entry ${entryPath}`);
		}
		if (entry.isDirectory()) {
			return generatedFiles(root, entryPath);
		}
		if (entry.isFile()) {
			return [entryPath];
		}
		throw new Error(`Generated Codex contract contains unsupported entry ${entryPath}`);
	});
}

const generatedCorrections = [
	{
		file: join("v2", "ThreadRealtimeStartParams.ts"),
		upstream: "prompt?: string | null | null",
		corrected: "prompt?: string | null",
	},
	{
		file: join("v2", "ThreadForkParams.ts"),
		upstream: "serviceTier?: string | null | null",
		corrected: "serviceTier?: string | null",
	},
] as const;

/**
 * Apply the approved corrections to upstream's duplicate-null spellings.
 * @param root The freshly generated tree.
 * @throws {Error} When a corrected file no longer contains exactly one occurrence.
 */
function applyGeneratedCorrections(root: string): void {
	for (const correction of generatedCorrections) {
		const target = join(root, correction.file);
		const upstream = readFileSync(target, "utf8");
		const occurrences = upstream.split(correction.upstream).length - 1;
		if (occurrences !== 1) {
			throw new Error(
				`Pinned Codex generated ${correction.file} did not contain exactly one approved duplicate-null shape`,
			);
		}
		writeFileSync(target, upstream.replace(correction.upstream, correction.corrected));
	}
}

/**
 * Order generated files so every index.ts lands after the files it exports,
 * deepest index first among indexes.
 * @param left One relative path.
 * @param right The other relative path.
 * @returns The sort comparison.
 */
function publicationOrder(left: string, right: string): number {
	const leftIndex = basename(left) === "index.ts";
	const rightIndex = basename(right) === "index.ts";
	if (leftIndex !== rightIndex) {
		return leftIndex ? 1 : -1;
	}
	if (leftIndex && rightIndex) {
		const depthDifference = right.split(sep).length - left.split(sep).length;
		if (depthDifference !== 0) {
			return depthDifference;
		}
	}
	return left.localeCompare(right);
}

/**
 * The error for a generated-tree entry that is not a real directory.
 * @param directory The offending path.
 * @returns The error to throw.
 */
function notADirectoryError(directory: string): Error {
	return new Error(
		`${relative(repositoryRoot, directory)} must be a generated contract directory. Remove the generated tree and retry.`,
	);
}

/**
 * Create a directory when absent and return its entry; a concurrent creation
 * is tolerated because the entry is checked afterwards.
 * @param directory The directory path.
 * @returns The directory's entry.
 * @throws {Error} When the entry cannot be read even after creation.
 */
function ensureDirectoryEntry(directory: string): DirectoryEntry {
	try {
		return lstatSync(directory);
	} catch (error) {
		if (errorCode(error) !== "ENOENT") {
			throw error;
		}
	}
	try {
		mkdirSync(directory);
	} catch (mkdirError) {
		if (errorCode(mkdirError) !== "EEXIST") {
			throw mkdirError;
		}
	}
	try {
		return lstatSync(directory);
	} catch (createdEntryError) {
		throw new Error(notADirectoryError(directory).message, { cause: createdEntryError });
	}
}

/**
 * Walk (creating as needed) a relative directory below a generated root,
 * refusing any component that is a symlink or not a directory.
 * @param root The generated root, which must already be a real directory.
 * @param relativeDirectory The path below it, `.` for the root itself.
 * @returns The absolute directory path.
 * @throws {Error} When any component is not a plain directory.
 */
function requireOwnedDirectory(root: string, relativeDirectory: string): string {
	requirePlainDirectory(root, lstatSync(root));
	let directory = root;
	for (const component of relativeDirectory === "." ? [] : relativeDirectory.split(sep)) {
		directory = join(directory, component);
		requirePlainDirectory(directory, ensureDirectoryEntry(directory));
	}
	return directory;
}

/**
 * Refuse an entry that is not a real (non-symlink) directory.
 * @param directory The path the entry describes.
 * @param entry The entry.
 * @throws {Error} When the entry is a symlink or not a directory.
 */
function requirePlainDirectory(directory: string, entry: DirectoryEntry): void {
	if (!entry.isDirectory() || entry.isSymbolicLink()) {
		throw notADirectoryError(directory);
	}
}

/**
 * Move generated files one by one into an existing version directory.
 * @param stagingRoot The freshly generated tree.
 */
function repairStableTarget(stagingRoot: string): void {
	requireOwnedDirectory(versionRoot, ".");
	for (const generatedFile of generatedFiles(stagingRoot).toSorted(publicationOrder)) {
		const destinationDirectory = requireOwnedDirectory(versionRoot, dirname(generatedFile));
		const destination = join(destinationDirectory, basename(generatedFile));
		renameSync(join(stagingRoot, generatedFile), destination);
	}
}

/**
 * Publish the staging tree as the version directory: one rename when the
 * version is new, a file-by-file repair when it already exists.
 * @param stagingRoot The freshly generated tree.
 * @returns Whether the staging directory itself became the version directory.
 */
function installStableTarget(stagingRoot: string): boolean {
	if (entryExists(versionRoot)) {
		repairStableTarget(stagingRoot);
		return false;
	}
	try {
		renameSync(stagingRoot, versionRoot);
		return true;
	} catch (error) {
		if (errorCode(error) !== "EEXIST" && errorCode(error) !== "ENOTEMPTY") {
			throw error;
		}
		repairStableTarget(stagingRoot);
		return false;
	}
}

/**
 * Point `current` at this version atomically through a temporary symlink.
 * @throws {Error} When the symlink cannot be created or swapped in.
 */
function publishCurrent(): void {
	if (currentVersionName() === versionName) {
		return;
	}
	const pointerCandidate = join(generatedRoot, `.current-${randomUUID()}`);
	try {
		symlinkSync(join("versions", versionName), pointerCandidate, "dir");
		renameSync(pointerCandidate, currentRoot);
	} catch (error) {
		try {
			unlinkSync(pointerCandidate);
		} catch (unlinkError) {
			if (errorCode(unlinkError) !== "ENOENT") {
				throw unlinkError;
			}
		}
		throw error;
	}
}

/**
 * Run Codex's own TypeScript generator into the staging directory.
 * @param codexEntry The Codex CLI entry.
 * @param stagingRoot The staging directory to generate into.
 * @throws {Error} When generation exits non-zero or produces no index.ts.
 */
async function generateIntoStaging(codexEntry: string, stagingRoot: string): Promise<void> {
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
	if (exitCode !== 0) {
		throw new Error(`Codex app-server type generation exited ${exitCode}`);
	}
	if (!existsSync(join(stagingRoot, "index.ts"))) {
		throw new Error("Codex app-server type generation produced no index.ts");
	}
}

/**
 * Generate, correct, install and publish the contract, removing the staging
 * directory on every path.
 * @param codexEntry The Codex CLI entry.
 * @throws {Error} When any stage fails; the staging directory is removed first.
 */
async function generateContract(codexEntry: string): Promise<void> {
	const stagingRoot = mkdtempSync(join(versionsRoot, ".staging-"));
	try {
		await generateIntoStaging(codexEntry, stagingRoot);
		applyGeneratedCorrections(stagingRoot);

		const installed = installStableTarget(stagingRoot);
		publishCurrent();
		if (!contractIsCurrent()) {
			throw new Error("Generated Codex contract pointer switch did not complete");
		}
		if (!installed) {
			removeOwnedStagingDirectory(stagingRoot);
		}
	} catch (error) {
		if (entryExists(stagingRoot)) {
			removeOwnedStagingDirectory(stagingRoot);
		}
		throw error;
	}
}

/**
 * `--ensure`: generate only when the published pointer is not already the
 * expected version. Lint and type-check run this first so a fresh checkout
 * never lints against a missing contract, and a warm one pays one readlink.
 * @returns Whether `current` names this version and holds an index.ts.
 */
function contractIsCurrent(): boolean {
	return currentVersionName() === versionName && existsSync(join(currentRoot, "index.ts"));
}

/**
 * Generate the contract unless `--ensure` finds it already published.
 */
async function main(): Promise<void> {
	if (process.argv.includes("--ensure") && contractIsCurrent()) {
		return;
	}
	const codexEntry = resolveLocalCodexEntry();
	requireOwnedDirectory(contractRoot, join("generated", "versions"));
	await generateContract(codexEntry);
}

try {
	await main();
} catch (error) {
	console.error(errorMessage(error));
	process.exitCode = 1;
}

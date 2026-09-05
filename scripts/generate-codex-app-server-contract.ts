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
const versionName = `version-${expectedCodexVersion}-recipe-${generationRecipeRevision}`;
const versionRoot = join(versionsRoot, versionName);
const codexPackageRoot = join(repositoryRoot, "node_modules/@openai/codex");
const codexManifestPath = join(codexPackageRoot, "package.json");
const codexEntryPath = join(codexPackageRoot, "bin/codex.js");
const expectedRealCodexPackageRoot = join(realRepositoryRoot, "node_modules/@openai/codex");

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
	if (packageManifest["name"] !== "@openai/codex") {
		throw localCodexError(
			`${relative(repositoryRoot, codexManifestPath)} names ${String(packageManifest["name"])}.`,
		);
	}
	if (packageManifest["version"] !== expectedCodexVersion) {
		throw localCodexError(
			`${relative(repositoryRoot, codexManifestPath)} has version ${String(packageManifest["version"])}.`,
		);
	}
	const manifestBin = packageManifest["bin"];
	if (
		!manifestBin ||
		typeof manifestBin !== "object" ||
		Array.isArray(manifestBin) ||
		(manifestBin as Record<string, unknown>)["codex"] !== "bin/codex.js"
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
	const currentTargetName = basename(target);
	if (dirname(target) !== versionsRoot || !currentTargetName.startsWith("version-")) {
		throw new Error(`${relative(repositoryRoot, currentRoot)} points outside its owned versions`);
	}
	return currentTargetName;
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

function generatedFiles(root: string, directory = ""): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
		const entryPath = join(directory, entry.name);
		if (entry.isDirectory() && !entry.isSymbolicLink()) {
			files.push(...generatedFiles(root, entryPath));
		} else if (entry.isFile() && !entry.isSymbolicLink()) {
			files.push(entryPath);
		} else {
			throw new Error(`Generated Codex contract contains unsupported entry ${entryPath}`);
		}
	}
	return files;
}

function publicationOrder(left: string, right: string): number {
	const leftIndex = basename(left) === "index.ts";
	const rightIndex = basename(right) === "index.ts";
	if (leftIndex !== rightIndex) return leftIndex ? 1 : -1;
	if (leftIndex && rightIndex) {
		const depthDifference = right.split(sep).length - left.split(sep).length;
		if (depthDifference !== 0) return depthDifference;
	}
	return left.localeCompare(right);
}

function requireOwnedDirectory(root: string, relativeDirectory: string): string {
	const rootEntry = lstatSync(root);
	if (!rootEntry.isDirectory() || rootEntry.isSymbolicLink()) {
		throw new Error(
			`${relative(repositoryRoot, root)} must be a generated contract directory. Remove the generated tree and retry.`,
		);
	}

	let directory = root;
	for (const component of relativeDirectory === "." ? [] : relativeDirectory.split(sep)) {
		directory = join(directory, component);
		let entry: ReturnType<typeof lstatSync>;
		try {
			entry = lstatSync(directory);
		} catch (error) {
			if (errorCode(error) !== "ENOENT") throw error;
			try {
				mkdirSync(directory);
			} catch (mkdirError) {
				if (errorCode(mkdirError) !== "EEXIST") throw mkdirError;
			}
			try {
				entry = lstatSync(directory);
			} catch (createdEntryError) {
				throw new Error(
					`${relative(repositoryRoot, directory)} must be a generated contract directory. Remove the generated tree and retry.`,
					{ cause: createdEntryError },
				);
			}
		}
		if (!entry.isDirectory() || entry.isSymbolicLink()) {
			throw new Error(
				`${relative(repositoryRoot, directory)} must be a generated contract directory. Remove the generated tree and retry.`,
			);
		}
	}
	return directory;
}

function repairStableTarget(stagingRoot: string): void {
	requireOwnedDirectory(versionRoot, ".");
	for (const generatedFile of generatedFiles(stagingRoot).toSorted(publicationOrder)) {
		const destinationDirectory = requireOwnedDirectory(versionRoot, dirname(generatedFile));
		const destination = join(destinationDirectory, basename(generatedFile));
		renameSync(join(stagingRoot, generatedFile), destination);
	}
}

function installStableTarget(stagingRoot: string): boolean {
	if (entryExists(versionRoot)) {
		repairStableTarget(stagingRoot);
		return false;
	}
	try {
		renameSync(stagingRoot, versionRoot);
		return true;
	} catch (error) {
		if (errorCode(error) !== "EEXIST" && errorCode(error) !== "ENOTEMPTY") throw error;
		repairStableTarget(stagingRoot);
		return false;
	}
}

function publishCurrent(): void {
	if (currentVersionName() === versionName) return;
	const pointerCandidate = join(generatedRoot, `.current-${randomUUID()}`);
	try {
		symlinkSync(join("versions", versionName), pointerCandidate, "dir");
		renameSync(pointerCandidate, currentRoot);
	} catch (error) {
		try {
			unlinkSync(pointerCandidate);
		} catch (unlinkError) {
			if (errorCode(unlinkError) !== "ENOENT") throw unlinkError;
		}
		throw error;
	}
}

async function generateContract(codexEntry: string): Promise<void> {
	const stagingRoot = mkdtempSync(join(versionsRoot, ".staging-"));
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

		const installed = installStableTarget(stagingRoot);
		publishCurrent();
		if (currentVersionName() !== versionName || !existsSync(join(currentRoot, "index.ts"))) {
			throw new Error("Generated Codex contract pointer switch did not complete");
		}
		if (!installed) removeOwnedStagingDirectory(stagingRoot);
	} catch (error) {
		if (entryExists(stagingRoot)) {
			removeOwnedStagingDirectory(stagingRoot);
		}
		throw error;
	}
}

async function main(): Promise<void> {
	const codexEntry = resolveLocalCodexEntry();
	requireOwnedDirectory(contractRoot, join("generated", "versions"));
	await generateContract(codexEntry);
}

try {
	await main();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}

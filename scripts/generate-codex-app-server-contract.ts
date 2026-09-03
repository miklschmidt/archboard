import { randomUUID } from "node:crypto";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readlinkSync,
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
const canonicalVersionName = `version-${expectedCodexVersion}`;
const canonicalVersionRoot = join(versionsRoot, canonicalVersionName);
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

function removeOwnedStaging(stagingRoot: string): void {
	const name = basename(stagingRoot);
	if (dirname(stagingRoot) !== versionsRoot || !name.startsWith(".staging-")) {
		throw new Error(`Refusing to remove unowned generated entry ${name}`);
	}
	const entry = lstatSync(stagingRoot);
	if (!entry.isDirectory() || entry.isSymbolicLink()) {
		throw new Error(`Refusing to remove non-directory generated staging ${name}`);
	}
	if (realpathSync(dirname(stagingRoot)) !== realpathSync(versionsRoot)) {
		throw new Error(
			`Refusing to remove generated entry outside ${relative(repositoryRoot, versionsRoot)}`,
		);
	}
	rmSync(stagingRoot, { recursive: true });
}

function canonicalVersionIsComplete(): boolean {
	let version;
	try {
		version = lstatSync(canonicalVersionRoot);
	} catch (error) {
		if (errorCode(error) === "ENOENT") return false;
		throw error;
	}
	if (
		!version.isDirectory() ||
		version.isSymbolicLink() ||
		!existsSync(join(canonicalVersionRoot, "index.ts"))
	) {
		throw new Error(
			`${relative(repositoryRoot, canonicalVersionRoot)} is not a complete generated contract; remove the generated tree and retry.`,
		);
	}
	return true;
}

function installCanonicalVersion(stagingRoot: string): void {
	try {
		renameSync(stagingRoot, canonicalVersionRoot);
	} catch (error) {
		if (!canonicalVersionIsComplete()) throw error;
		removeOwnedStaging(stagingRoot);
		return;
	}
	if (!canonicalVersionIsComplete()) {
		throw new Error("Codex contract generation did not install a complete version");
	}
}

async function generateContract(codexEntry: string): Promise<void> {
	const stagingRoot = mkdtempSync(join(versionsRoot, ".staging-"));
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
		const exitCode = await generated.exited;
		if (exitCode !== 0) throw new Error(`Codex app-server type generation exited ${exitCode}`);
		if (!existsSync(join(stagingRoot, "index.ts"))) {
			throw new Error("Codex app-server type generation produced no index.ts");
		}

		installCanonicalVersion(stagingRoot);
		pointerCandidate = join(generatedRoot, `.current-${randomUUID()}`);
		symlinkSync(join("versions", canonicalVersionName), pointerCandidate, "dir");
		renameSync(pointerCandidate, currentRoot);
		pointerCandidate = undefined;
		if (
			currentVersionName() !== canonicalVersionName ||
			!existsSync(join(currentRoot, "index.ts"))
		) {
			throw new Error("Generated Codex contract pointer switch did not complete");
		}
	} catch (error) {
		if (pointerCandidate !== undefined) {
			try {
				unlinkSync(pointerCandidate);
			} catch (unlinkError) {
				if (errorCode(unlinkError) !== "ENOENT") throw unlinkError;
			}
		}
		if (existsSync(stagingRoot)) removeOwnedStaging(stagingRoot);
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

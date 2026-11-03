import { errorMessage } from "@archboard/diagnostics/errno";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { git } from "@archboard/process/git";
import { repoRootOf } from "@archboard/workspace/checkouts";
import { stateDir } from "@archboard/workspace/state-dir";
import type { ArchitectureModelRead } from "#shared/schemas/model.ts";

const ARCHIVE_REF = "refs/heads/archboard-history";
/** A structured local archive failure. */
class ArchiveError extends Error {
	/**
	 * Retain the public failure category and affected object.
	 * @param code The shared architecture failure code.
	 * @param message The underlying failure.
	 * @param checkpoint The unavailable object or reserved ref.
	 * @param subjects The affected architecture identities.
	 */
	constructor(
		readonly code: Extract<ArchitectureModelRead, { success: false }>["code"],
		message: string,
		readonly checkpoint = ARCHIVE_REF,
		readonly subjects: string[] = [],
	) {
		super(message);
	}
}

/**
 * Locate the managed archive without creating any storage during a read.
 * @param vault The explicitly addressed vault.
 * @returns The machine-private archive directory.
 */
function privateArchivePath(vault: string): string {
	const key = createHash("sha256").update(resolve(vault)).digest("hex");
	return join(stateDir(), "architecture-archives", `${key}.git`);
}

/**
 * Require a complete bare archive rather than adopting unrelated storage.
 * @param root The managed archive directory.
 */
async function requirePrivateArchive(root: string): Promise<void> {
	try {
		if (!lstatSync(root).isDirectory())
			throw new Error("Private archive storage is not a regular directory.");
		const bare = await git(root, ["rev-parse", "--is-bare-repository"]);
		const actual = await git(root, ["rev-parse", "--absolute-git-dir"]);
		if (bare !== "true" || actual === undefined || realpathSync(actual) !== realpathSync(root))
			throw new Error("Private archive storage is not its own bare Git repository.");
	} catch (error) {
		throw new ArchiveError("ARCHIVE_UNREADABLE", errorMessage(error));
	}
}

/**
 * Resolve source-backed or explicitly initialized private history through one engine.
 * @param vault The explicitly addressed vault.
 * @returns The Git command root, portable vault address and optional source checkout.
 */
async function archiveContext(vault: string) {
	const sourceRoot = await repoRootOf(vault);
	const root = privateArchivePath(vault);
	if (existsSync(root)) {
		if (sourceRoot !== undefined)
			throw new ArchiveError(
				"ARCHIVE_IN_USE",
				"This vault already owns private history. Move it outside the source repository before retrying. Source integration requires explicit migration.",
			);
		await requirePrivateArchive(root);
		return { root, vault: ".archboard/vault", sourceRoot: undefined };
	}
	if (sourceRoot !== undefined)
		return {
			root: sourceRoot,
			vault: relative(sourceRoot, vault).replaceAll("\\", "/"),
			sourceRoot,
		};
	throw new ArchiveError(
		"ARCHIVE_NOT_INITIALIZED",
		"Explicitly initialize private history with model archive-init before retaining or editing this untracked vault.",
	);
}

/**
 * Initialize only machine-private storage, preserving existing repositories and archive content.
 * @param vault The explicitly addressed vault.
 * @returns The existing or newly initialized bare archive directory.
 */
async function privateArchiveLocation(vault: string): Promise<string> {
	if ((await repoRootOf(vault)) !== undefined)
		throw new ArchiveError(
			"ARCHIVE_IN_USE",
			"Private archive initialization requires a vault outside a source repository. Use the existing source archive here.",
		);
	if (!lstatSync(vault).isDirectory())
		throw new ArchiveError(
			"ARCHIVE_WRITE_FAILED",
			"The addressed vault is not a regular directory.",
		);
	const root = privateArchivePath(vault);
	if ((await repoRootOf(dirname(root))) !== undefined)
		throw new ArchiveError(
			"ARCHIVE_IN_USE",
			"The machine state directory is inside a source repository. Choose an external state directory before initializing private history.",
		);
	return root;
}

/**
 * Create a bare archive after location approval under the existing installation lease.
 * @param vault The explicitly addressed vault.
 * @returns The complete private archive directory.
 */
async function initializePrivateArchive(vault: string): Promise<string> {
	const root = await privateArchiveLocation(vault);
	if (existsSync(root)) {
		await requirePrivateArchive(root);
		return root;
	}
	mkdirSync(dirname(root), { recursive: true, mode: 0o700 });
	mkdirSync(root, { mode: 0o700 });
	await git(root, ["init", "--bare", "--quiet", "--initial-branch=archboard-local", "--template="]);
	await requirePrivateArchive(root);
	return root;
}

export {
	archiveContext,
	privateArchivePath,
	privateArchiveLocation,
	initializePrivateArchive,
	ARCHIVE_REF,
	ArchiveError,
};

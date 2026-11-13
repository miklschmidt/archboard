import { createHash } from "node:crypto";
import { relative } from "node:path";
import { git, GitCommandError } from "@archboard/process/git";
import { repoRootOf } from "@archboard/workspace/checkouts";
import type {
	ArchitectureModelRead,
	ModelDiagnostic,
} from "#shared/canonical-contracts/schemas/model.ts";
import { checkpointBlobs } from "#runtime/canonical/archive/store/model-archive-blobs.ts";
import { isModelInput, modelRevision } from "#runtime/store/model-files.ts";
import {
	decodeModel,
	discoveryFailure,
	failure,
} from "#runtime/canonical/read/operations/model-read.ts";

/**
 * Refuse a ref that the vault's repository cannot resolve, and name it.
 * @param ref The requested branch, tag or commit.
 * @param reason Why this repository cannot resolve it.
 * @returns The structured refusal.
 */
function unresolvedRef(ref: string, reason: string) {
	return failure("SOURCE_REF_NOT_FOUND", [
		{
			code: "SOURCE_REF_NOT_FOUND",
			file: ".",
			subjects: [ref],
			message: `The ref "${ref}" ${reason}.`,
			recovery:
				"Name a local or remote branch, a tag or a commit that the repository holding the vault has.",
		},
	]);
}

/**
 * Run one Git command whose failure to find an object is an answer, not an error.
 * @param root The repository root.
 * @param args Git's arguments.
 * @returns Its output, or absence when Git exits with a failure.
 */
async function gitIfFound(root: string, args: string[]): Promise<string | undefined> {
	try {
		return await git(root, args, { trimOutput: false, maxOutputBytes: Infinity });
	} catch (error) {
		if (error instanceof GitCommandError && error.failure === "exit") return undefined;
		throw error;
	}
}

/**
 * Resolve a ref to its commit.
 * @param root The repository root.
 * @param ref A branch, tag or commit.
 * @returns The complete commit identity, or absence.
 */
async function commitOf(root: string, ref: string): Promise<string | undefined> {
	// A leading dash would read as a Git option.
	if (ref.startsWith("-")) return undefined;
	const found = await gitIfFound(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
	return found?.trim() || undefined;
}

type TreeEntry = { mode: string; kind: string; object: string; path: string };

/**
 * Parse one entry of a NUL-delimited tree listing.
 * @param entry `<mode> <kind> <object>` and a tab, then the path relative to the vault.
 * @returns Its parts.
 */
function treeEntry(entry: string): TreeEntry {
	const tab = entry.indexOf("\t");
	const [mode = "", kind = "", object = ""] = entry.slice(0, tab).split(" ");
	return { mode, kind, object, path: entry.slice(tab + 1) };
}

/**
 * Name what makes one tree entry unusable as an input, as a walk of the vault on disk would.
 * @param entry The tree entry.
 * @returns The diagnostic of a link or a non-file input, or absence.
 */
function entryProblem(entry: TreeEntry): ModelDiagnostic | undefined {
	const { mode, kind, path } = entry;
	if (mode === "120000")
		return {
			code: "UNSAFE_PATH",
			file: path,
			message: "A model input path is a symbolic link.",
			recovery: "Keep authored inputs inside the vault without symbolic links.",
		};
	if (isModelInput(path) && kind !== "blob")
		return {
			code: "INVALID_FILE",
			file: path,
			message: "A model input is not a regular file.",
			recovery: "Replace the input with a regular authored file.",
		};
	return undefined;
}

/**
 * Classify the entries of the vault's tree.
 * @param listing The NUL-delimited recursive tree listing, relative to the vault.
 * @returns The input blobs in listing order and the diagnostics of unusable entries.
 */
function vaultInputs(listing: string) {
	const entries = listing
		.split("\0")
		.filter((line) => line.includes("\t"))
		.map(treeEntry);
	return {
		blobs: entries.filter(
			(entry) => entry.mode !== "120000" && entry.kind === "blob" && isModelInput(entry.path),
		),
		diagnostics: entries.flatMap((entry) => entryProblem(entry) ?? []),
	};
}

/**
 * Read the vault's input files at one commit from Git objects, with no checkout.
 * @param root The repository root.
 * @param vault The vault path relative to the repository root.
 * @param commit The resolved commit.
 * @returns Exact bytes, the commit-bound revision and discovery diagnostics.
 */
async function capturedAtCommit(root: string, vault: string, commit: string) {
	const tree = (
		await gitIfFound(root, ["rev-parse", "--verify", "--quiet", `${commit}:${vault}`])
	)?.trim();
	const listing =
		tree === undefined ? "" : ((await gitIfFound(root, ["ls-tree", "-r", "-z", tree])) ?? "");
	const { blobs, diagnostics } = vaultInputs(listing);
	const bytes = await checkpointBlobs(
		{ root, vault, sourceRoot: root },
		blobs.map((blob) => blob.object),
	);
	const inputs = new Map(blobs.map((blob, index) => [blob.path, bytes[index]!]));
	const { files } = modelRevision(inputs);
	// The digest names the commit, so two commits never share a reading identity.
	const digest = createHash("sha256").update(JSON.stringify({ commit, files })).digest("hex");
	return { inputs, diagnostics, revision: { files, digest } };
}

/**
 * Read the model as the vault's repository holds it at a branch, tag or commit.
 * It reads Git objects only, so the working tree, the index and HEAD stay as they are, and it
 * decodes them with the decoder that reads the vault on disk. A branch reading is never live:
 * it names its ref and commit, and no writer, claim, retention or change feed uses it.
 * @param vault The explicitly addressed vault.
 * @param ref A branch, tag or commit of the repository that holds the vault.
 * @returns The coherent model at that commit, or a refusal.
 */
async function readModelAtRef(vault: string, ref: string): Promise<ArchitectureModelRead> {
	const root = await repoRootOf(vault);
	if (root === undefined)
		return unresolvedRef(ref, "cannot be read: the vault is in no Git repository");
	const commit = await commitOf(root, ref);
	if (commit === undefined)
		return unresolvedRef(ref, "names no commit in the repository that holds the vault");
	const captured = await capturedAtCommit(
		root,
		relative(root, vault).replaceAll("\\", "/"),
		commit,
	);
	const refusal = discoveryFailure(captured);
	if (refusal !== undefined) return refusal;
	const model = decodeModel(captured);
	return model.success ? { ...model, sourceRef: { ref, commit } } : model;
}

export { readModelAtRef };

import { modelRevision } from "#runtime/store/model-files.ts";
import { relative } from "node:path";
import { z } from "zod";
import { git, GitCommandError } from "@archboard/process/git";
import { repoRootOf, repoIdentityAt } from "@archboard/workspace/checkouts";
import {
	ArchitectureCheckpointSchema,
	type ArchitectureCheckpoint,
	type ArchitectureModel,
	type ArchitectureModelRead,
} from "#shared/schemas/model.ts";

import { ArchitectureModuleEditSchema } from "#shared/schemas/model-operations.ts";

const ARCHIVE_REF = "refs/heads/archboard-history";
const CheckpointRecordSchema = ArchitectureCheckpointSchema.omit({ id: true, publication: true })
	.extend({
		schemaVersion: z.literal(1),
		kind: z.literal("checkpoint"),
		vault: z.string(),
		edit: ArchitectureModuleEditSchema.optional(),
	})
	.strict();
const ArchiveRecordSchema = z.discriminatedUnion("kind", [
	CheckpointRecordSchema,
	z.object({ schemaVersion: z.literal(1), kind: z.literal("synchronization") }).strict(),
]);

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
 * Locate the caller's checkout. Git resolves its common objects and refs itself.
 * @param vault The explicitly addressed vault.
 * @returns The checkout and portable vault address.
 */
async function archiveContext(vault: string) {
	const root = await repoRootOf(vault);
	if (root === undefined)
		throw new ArchiveError(
			"ARCHIVE_NOT_INITIALIZED",
			"The vault has no source Git repository. Private archive initialization is not available yet.",
		);
	return { root, vault: relative(root, vault).replaceAll("\\", "/") };
}
type ArchiveContext = Awaited<ReturnType<typeof archiveContext>>;

/**
 * Read an optional Git value without hiding other failures.
 * @param context The caller's checkout.
 * @param args The Git probe.
 * @returns The probe value, or undefined for an absent value.
 */
async function optionalValue(context: ArchiveContext, args: string[]): Promise<string | undefined> {
	try {
		return await git(context.root, args);
	} catch (error) {
		if (error instanceof GitCommandError && error.failure === "exit" && error.exitCode === 1)
			return undefined;
		throw error;
	}
}

/**
 * Read an optional archive or retention ref.
 * @param context The caller's checkout.
 * @param ref The ref to inspect.
 * @returns The immutable object identity, when present.
 */
function archiveTip(context: ArchiveContext, ref = ARCHIVE_REF) {
	return optionalValue(context, ["rev-parse", "--verify", "--quiet", ref]);
}

/**
 * Settle all independent object commands before reporting a failure.
 * @param pending The independent commands.
 * @returns Every successful result, in input order.
 */
async function settledValues<T>(pending: Promise<T>[]): Promise<T[]> {
	const results = await Promise.allSettled(pending);
	return results.map((result) => {
		if (result.status === "rejected") throw result.reason;
		return result.value;
	});
}

/**
 * Store exact bytes as a Git blob, without an index.
 * @param context The caller's checkout.
 * @param bytes The complete authored bytes.
 * @returns The blob identity.
 */
async function blob(context: ArchiveContext, bytes: Uint8Array): Promise<string> {
	const id = await git(context.root, ["hash-object", "-w", "--stdin"], { input: bytes });
	if (id === undefined) throw new Error("Git returned no blob identity.");
	return id;
}

/**
 * Build a tree from architecture-only paths and bytes.
 * @param context The caller's checkout.
 * @param inputs Exact relative paths and authored bytes.
 * @returns The tree identity.
 */
async function tree(context: ArchiveContext, inputs: Map<string, Buffer>): Promise<string> {
	const directories = new Map<string, Map<string, Buffer>>();
	const files: [string, Buffer][] = [];
	for (const [path, bytes] of inputs) {
		const slash = path.indexOf("/");
		if (slash < 0) files.push([path, bytes]);
		else {
			const directory = path.slice(0, slash);
			const nested = directories.get(directory) ?? new Map<string, Buffer>();
			nested.set(path.slice(slash + 1), bytes);
			directories.set(directory, nested);
		}
	}
	const entries = await settledValues([
		...files.map(async ([path, bytes]) => `100644 blob ${await blob(context, bytes)}\t${path}`),
		...[...directories].map(
			async ([directory, nested]) => `040000 tree ${await tree(context, nested)}\t${directory}`,
		),
	]);
	const id = await git(context.root, ["mktree", "-z"], {
		input: Buffer.from(entries.join("\0") + "\0"),
	});
	if (id === undefined) throw new Error("Git returned no tree identity.");
	return id;
}

/**
 * Read a complete UTF-8 object with its authored whitespace.
 * @param context The caller's checkout.
 * @param object The Git object selector.
 * @returns Its exact UTF-8 text.
 */
async function readBlob(context: ArchiveContext, object: string): Promise<string> {
	return (
		(await git(context.root, ["cat-file", "blob", object], {
			trimOutput: false,
			maxOutputBytes: Infinity,
		})) ?? ""
	);
}

/**
 * Decode an archive record independently of current files.
 * @param context The caller's checkout.
 * @param id The immutable commit identity.
 * @returns The checkpoint or synchronization record.
 */
async function readRecord(context: ArchiveContext, id: string) {
	return ArchiveRecordSchema.parse(JSON.parse(await readBlob(context, `${id}:record.json`)));
}

/**
 * Capture source association without retaining code or refreshing the index.
 * @param context The caller's checkout.
 * @returns The source identity, revision and uncommitted-code status.
 */
async function captureSource(context: ArchiveContext) {
	const repo = await repoIdentityAt(context.root);
	const commit = await optionalValue(context, ["rev-parse", "--verify", "--quiet", "HEAD"]);
	const dirty = await git(context.root, [
		"status",
		"--porcelain",
		"--untracked-files=all",
		"--",
		".",
		`:(exclude)${context.vault}`,
	]);
	return [{ repo, commit: commit ?? null, uncommitted: dirty !== undefined }];
}

/**
 * Apply configured identity and signing to plumbing commits too.
 * @param context The caller's checkout, including its worktree configuration.
 * @param rootTree The retained architecture tree.
 * @param parents Actual Git parents that retain archive and dependency ancestry.
 * @param message The checkpoint or synchronization description.
 * @returns The signed commit identity when signing is configured.
 */
async function archiveCommit(
	context: ArchiveContext,
	rootTree: string,
	parents: string[],
	message: string,
): Promise<string> {
	try {
		const signing = await optionalValue(context, [
			"config",
			"--type=bool",
			"--get",
			"commit.gpgsign",
		]);
		const id = await git(context.root, [
			"commit-tree",
			rootTree,
			...(signing === "true" ? ["-S"] : []),
			...parents.flatMap((parent) => ["-p", parent]),
			"-m",
			message,
		]);
		if (id === undefined) throw new Error("Git returned no checkpoint identity.");
		return id;
	} catch (error) {
		throw new ArchiveError(
			"ARCHIVE_COMMIT_FAILED",
			error instanceof Error ? error.message : String(error),
		);
	}
}

/**
 * Test actual Git ancestry, never a JSON reference.
 * @param context The caller's checkout.
 * @param ancestor The required retained commit.
 * @param descendant The commit that must retain it.
 * @returns Whether the actual parent graph reaches the ancestor.
 */
async function isArchiveAncestor(
	context: ArchiveContext,
	ancestor: string,
	descendant: string,
): Promise<boolean> {
	try {
		await git(context.root, ["merge-base", "--is-ancestor", ancestor, descendant]);
		return true;
	} catch (error) {
		if (error instanceof GitCommandError && error.failure === "exit" && error.exitCode === 1)
			return false;
		throw error;
	}
}

/**
 * Join archive order without selecting or merging architecture inputs.
 * @param context The caller's checkout.
 * @param first One divergent archive tip.
 * @param second The other retained tip.
 * @returns A marked synchronization commit that retains both parents.
 */
async function synchronization(
	context: ArchiveContext,
	first: string,
	second: string,
): Promise<string> {
	const markerTree = await tree(
		context,
		new Map([
			["record.json", Buffer.from(JSON.stringify({ schemaVersion: 1, kind: "synchronization" }))],
		]),
	);
	return archiveCommit(
		context,
		markerTree,
		[first, second],
		"archboard: synchronize retained checkpoints",
	);
}

/**
 * Keep the reserved archive independent of source history and every checkout's HEAD.
 * @param context The caller's checkout.
 */
async function assertArchiveWritable(context: ArchiveContext): Promise<void> {
	const worktrees = await git(context.root, ["worktree", "list", "--porcelain"]);
	if (worktrees?.split("\n").includes(`branch ${ARCHIVE_REF}`))
		throw new ArchiveError("ARCHIVE_IN_USE", "A worktree has the archive branch checked out.");
	const tip = await archiveTip(context);
	if (tip === undefined) return;
	try {
		await readRecord(context, tip);
	} catch (error) {
		throw new ArchiveError(
			"ARCHIVE_UNREADABLE",
			error instanceof Error ? error.message : String(error),
		);
	}
}

/**
 * Attempt one conditional ref update, without overwriting another writer.
 * @param context The caller's checkout.
 * @param candidate The complete checkpoint or synchronization commit.
 * @param expected The ref value observed before preparation.
 * @returns Whether the update succeeded.
 */
async function conditionalAppend(
	context: ArchiveContext,
	candidate: string,
	expected: string | undefined,
): Promise<boolean> {
	try {
		await git(context.root, [
			"update-ref",
			ARCHIVE_REF,
			candidate,
			expected ?? "0".repeat(candidate.length),
		]);
		return true;
	} catch (error) {
		if (!(error instanceof GitCommandError) || error.failure !== "exit") throw error;
		if ((await archiveTip(context)) === expected) throw error;
		return false;
	}
}

/**
 * Prepare an append without using archive order as architectural meaning.
 * @param context The caller's checkout.
 * @param checkpoint The immutable retained checkpoint.
 * @param expected The observed archive ref.
 * @returns The checkpoint or a synchronization commit that retains the observed tip.
 */
async function appendCandidate(
	context: ArchiveContext,
	checkpoint: string,
	expected: string | undefined,
): Promise<string> {
	if (expected === undefined) return checkpoint;
	return (await isArchiveAncestor(context, expected, checkpoint))
		? checkpoint
		: synchronization(context, expected, checkpoint);
}

/**
 * Append with a compare-and-swap ref update and preserve divergent histories.
 * @param context The caller's checkout.
 * @param checkpoint The immutable checkpoint or synchronization commit.
 * @param expected The observed archive ref.
 * @param attempt The number of competing updates already observed.
 * @returns Completion after the archive retains the checkpoint.
 */
async function appendCheckpoint(
	context: ArchiveContext,
	checkpoint: string,
	expected: string | undefined,
	attempt = 0,
): Promise<void> {
	if (attempt >= 8)
		throw new ArchiveError(
			"ARCHIVE_BUSY",
			"Concurrent archive writers prevented this append. The retained operation can be retried.",
		);
	if (expected !== undefined && (await isArchiveAncestor(context, checkpoint, expected))) return;
	await assertArchiveWritable(context);
	const candidate = await appendCandidate(context, checkpoint, expected);
	if (await conditionalAppend(context, candidate, expected)) return;
	return appendCheckpoint(context, candidate, await archiveTip(context), attempt + 1);
}

/**
 * Prepare every archive commit that installation can need before any current file changes.
 * @param context The caller's checkout.
 * @param checkpoint The prepared architecture checkpoint.
 * @returns A signed conditional append plan, or an already-retained checkpoint.
 */
async function prepareCheckpointAppend(context: ArchiveContext, checkpoint: string) {
	const expected = await archiveTip(context);
	if (expected !== undefined && (await isArchiveAncestor(context, checkpoint, expected)))
		return { checkpoint, expected, candidate: expected };
	await assertArchiveWritable(context);
	return { checkpoint, expected, candidate: await appendCandidate(context, checkpoint, expected) };
}

/**
 * Install a prepared archive ref without invoking a signer after current-file changes.
 * @param context The caller's checkout.
 * @param plan The signed append prepared before installation.
 */
async function commitCheckpointAppend(
	context: ArchiveContext,
	plan: Awaited<ReturnType<typeof prepareCheckpointAppend>>,
): Promise<void> {
	const latest = await archiveTip(context);
	if (latest !== undefined && (await isArchiveAncestor(context, plan.checkpoint, latest))) return;
	await assertArchiveWritable(context);
	if (!(await conditionalAppend(context, plan.candidate, plan.expected)))
		throw new ArchiveError(
			"ARCHIVE_BUSY",
			"The archive advanced after signed preparation. Retry model recover to prepare its join before any further file changes.",
		);
}

/**
 * Determine whether a recorded source commit remains available.
 * @param context The caller's checkout.
 * @param source The retained source association.
 * @param ownIdentity The identity of the caller's source repository.
 * @returns Whether the recorded commit is locally readable.
 */
async function sourceAvailable(
	context: ArchiveContext,
	source: ArchitectureCheckpoint["sources"][number],
	ownIdentity: string,
): Promise<boolean> {
	if (source.repo !== ownIdentity || source.commit === null) return false;
	try {
		await git(context.root, ["cat-file", "-e", `${source.commit}^{commit}`]);
		return true;
	} catch (error) {
		if (!(error instanceof GitCommandError) || error.failure !== "exit") throw error;
		return false;
	}
}

/**
 * Assess source evidence separately from architecture availability. Code is never retained.
 * @param context The caller's checkout.
 * @param sources The recorded source associations.
 * @returns Current evidence availability, without changing the retained associations.
 */
async function sourceEvidence(
	context: ArchiveContext,
	sources: ArchitectureCheckpoint["sources"],
): Promise<NonNullable<ArchitectureModel["sourceEvidence"]>> {
	const ownIdentity = await repoIdentityAt(context.root);
	return settledValues(
		sources.map(async (source) => {
			if (!(await sourceAvailable(context, source, ownIdentity)))
				return {
					...source,
					status: "unavailable" as const,
					recovery:
						"Restore the recorded source revision from its repository or backup. The retained architecture remains readable.",
				};
			if (source.uncommitted)
				return {
					...source,
					status: "uncommitted" as const,
					recovery:
						"Recover the original uncommitted source separately. This checkpoint retains architecture inputs only.",
				};
			return { ...source, status: "available" as const };
		}),
	);
}

/**
 * Read a regular checkpoint input from one tree entry.
 * @param context The caller's checkout.
 * @param entry One NUL-delimited Git tree entry.
 * @returns Its relative path and exact authored bytes.
 */
async function checkpointInput(context: ArchiveContext, entry: string): Promise<[string, Buffer]> {
	const tab = entry.indexOf("\t");
	const [mode, kind, object] = entry.slice(0, tab).split(" ");
	if (mode !== "100644" || kind !== "blob" || object === undefined)
		throw new ArchiveError("CHECKPOINT_INVALID", "A checkpoint input is not a regular blob.");
	return [
		entry.slice(tab + 1).slice("inputs/".length),
		Buffer.from(await readBlob(context, object)),
	];
}

/**
 * Capture checkpoint inputs from Git objects without reading the current vault.
 * @param context The caller's checkout.
 * @param checkpoint The immutable checkpoint identity.
 * @returns Exact bytes, input fingerprints and empty discovery diagnostics.
 */
async function readCheckpointInputs(context: ArchiveContext, checkpoint: string) {
	const listing = await git(context.root, ["ls-tree", "-r", "-z", checkpoint, "--", "inputs"], {
		trimOutput: false,
		maxOutputBytes: Infinity,
	});
	const entries = (listing ?? "").split("\0").filter(Boolean);
	const inputs = new Map(
		await settledValues(entries.map((entry) => checkpointInput(context, entry))),
	);
	return { inputs, revision: modelRevision(inputs), diagnostics: [] };
}

/**
 * Keep one durable checkpoint per operation identity, including racing retries.
 * @param context The caller's checkout.
 * @param operationRef The retention ref for this operation.
 * @param checkpoint The prepared immutable checkpoint.
 * @returns The operation's single retained checkpoint identity.
 */
async function retainOperation(
	context: ArchiveContext,
	operationRef: string,
	checkpoint: string,
): Promise<string> {
	try {
		await git(context.root, [
			"update-ref",
			operationRef,
			checkpoint,
			"0".repeat(checkpoint.length),
		]);
		return checkpoint;
	} catch (error) {
		if (!(error instanceof GitCommandError) || error.failure !== "exit") throw error;
		const winner = await archiveTip(context, operationRef);
		if (winner === undefined) throw error;
		return winner;
	}
}

/**
 * Read archive records in traversal order without assigning architectural meaning.
 * @param context The caller's checkout.
 * @param tips The retained archive roots, or the local archive tip by default.
 * @returns The retained record identities and metadata.
 */
async function archiveRecords(context: ArchiveContext, tips?: string[]) {
	const tip = await archiveTip(context);
	const roots = tips ?? (tip === undefined ? [] : [tip]);
	if (roots.length === 0) return [];
	const history = await git(context.root, ["rev-list", ...roots], { maxOutputBytes: Infinity });
	return settledValues(
		(history ?? "")
			.split("\n")
			.filter(Boolean)
			.map(async (id) => ({ id, record: await readRecord(context, id) })),
	);
}

export {
	optionalValue,
	prepareCheckpointAppend,
	commitCheckpointAppend,
	readCheckpointInputs,
	archiveRecords,
	retainOperation,
	ARCHIVE_REF,
	ArchiveError,
	CheckpointRecordSchema,
	archiveContext,
	archiveTip,
	assertArchiveWritable,
	archiveCommit,
	appendCheckpoint,
	tree,
	readBlob,
	readRecord,
	captureSource,
	sourceEvidence,
	isArchiveAncestor,
	settledValues,
	type ArchiveContext,
};

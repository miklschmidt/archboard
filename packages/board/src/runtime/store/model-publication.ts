import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { git } from "@archboard/process/git";
import { writeFileAtomic } from "@archboard/workspace/atomic-write";
import { ArchitecturePublicationDestinationSchema } from "#shared/schemas/model.ts";
import {
	ArchiveError,
	archiveContext,
	isArchiveAncestor,
	archiveRecords,
	settledValues,
	type ArchiveContext,
} from "#runtime/store/model-archive.ts";

const ConfigurationSchema = ArchitecturePublicationDestinationSchema.extend({
	schemaVersion: z.literal(1),
	fingerprint: z.string(),
}).strict();
const retention = {
	protected: false as const,
	limitation:
		"Git transport cannot establish or inspect the remote host's archive rewrite and deletion policy.",
	recovery:
		"The remote owner must deny archive ref rewrites and deletions through server policy and maintain a backup. Published evidence records availability at the last explicit exchange, not protected retention.",
};

/**
 * Hash a private identity without exposing remote URLs or machine paths.
 * @param value The private value to interpret.
 * @returns The complete operation result.
 */
function digest(value: string) {
	return createHash("sha256").update(value).digest("hex");
}

/**
 * Locate shared private publication state for the portable vault address.
 * @param vault The addressed vault or resolved checkout context.
 * @returns The complete operation result.
 */
async function publicationContext(vault: string | ArchiveContext) {
	const context = typeof vault === "string" ? await archiveContext(vault) : vault;
	const common = await git(context.root, [
		"rev-parse",
		"--path-format=absolute",
		"--git-common-dir",
	]);
	if (common === undefined) throw new Error("Git returned no common directory.");
	const directory = join(common, "archboard", "publication", digest(context.vault));
	const file = join(directory, "destination.json");
	const configuration = existsSync(file)
		? ConfigurationSchema.parse(JSON.parse(readFileSync(file, "utf8")))
		: undefined;
	return { ...context, directory, configuration };
}
type PublicationContext = Awaited<ReturnType<typeof publicationContext>>;

/** An archive boundary that requires an explicit deeper named-ref fetch. */
class ShallowArchiveError extends ArchiveError {}

/**
 * Resolve one explicit named remote, without invoking a network operation.
 * @param context The resolved archive context.
 * @param destination The explicit archive destination.
 * @returns The complete operation result.
 */
async function resolveDestination(
	context: ArchiveContext,
	destination: z.infer<typeof ArchitecturePublicationDestinationSchema>,
) {
	try {
		const [, fetchUrl, pushUrl] = await settledValues([
			git(context.root, ["check-ref-format", destination.ref]),
			git(context.root, ["remote", "get-url", "--all", destination.remote]),
			git(context.root, ["remote", "get-url", "--push", "--all", destination.remote]),
		]);
		const urls = [fetchUrl, pushUrl].map(singleRemoteUrl);
		return {
			...destination,
			fetchUrl: urls[0]!,
			pushUrl: urls[1]!,
			fingerprint: digest(JSON.stringify([context.vault, destination, fetchUrl, pushUrl])),
		};
	} catch (error) {
		throw new ArchiveError(
			"PUBLICATION_INVALID",
			error instanceof Error ? error.message : String(error),
		);
	}
}

/**
 * Require exactly one effective URL for each remote direction.
 * @param value The private value to interpret.
 * @returns The complete operation result.
 */
function singleRemoteUrl(value: string | undefined) {
	if (value === undefined || value.includes("\n"))
		throw new Error("Publication requires one fetch URL and one push URL for the named remote.");
	return value;
}

/**
 * Save explicit destination ownership independently of model write recovery.
 * @param context The resolved archive context.
 * @param destination The explicit archive destination.
 */
function saveDestination(
	context: PublicationContext,
	destination: Awaited<ReturnType<typeof resolveDestination>>,
) {
	mkdirSync(context.directory, { recursive: true, mode: 0o700 });
	writeFileAtomic(
		join(context.directory, "destination.json"),
		JSON.stringify({
			schemaVersion: 1,
			remote: destination.remote,
			ref: destination.ref,
			fingerprint: destination.fingerprint,
		}),
	);
}

/**
 * Refuse implicit or changed destinations before sending any history.
 * @param context The resolved archive context.
 * @param requested The destination stated in this request.
 * @returns The complete operation result.
 */
async function configuredDestination(
	context: PublicationContext,
	requested?: z.infer<typeof ArchitecturePublicationDestinationSchema>,
) {
	const configuration = context.configuration;
	if (configuration === undefined)
		throw new ArchiveError(
			"PUBLICATION_NOT_CONFIGURED",
			"Configure a named remote and archive ref before publication or recovery.",
		);
	if (
		requested !== undefined &&
		(requested.remote !== configuration.remote || requested.ref !== configuration.ref)
	)
		throw new ArchiveError(
			"PUBLICATION_DESTINATION_CHANGED",
			"The request differs from the configured archive destination.",
		);
	const destination = await resolveDestination(context, {
		remote: configuration.remote,
		ref: configuration.ref,
	});
	if (destination.fingerprint !== configuration.fingerprint)
		throw new ArchiveError(
			"PUBLICATION_DESTINATION_CHANGED",
			"The configured remote URL changed. Explicitly configure the destination again.",
		);
	return destination;
}

/**
 * Keep pending intent durable before the first network request.
 * @param context The resolved archive context.
 * @param fingerprint The private destination fingerprint.
 * @param checkpoint The complete immutable checkpoint identity.
 * @param tip The retained archive tip.
 */
async function markPending(
	context: PublicationContext,
	fingerprint: string,
	checkpoint: string,
	tip: string,
) {
	await git(context.root, [
		"update-ref",
		`refs/archboard/pending/${fingerprint}/${checkpoint}`,
		tip,
	]);
}

/**
 * A receipt ref retains the exact closure acknowledged by an explicit exchange.
 * @param fingerprint The private destination fingerprint.
 * @returns The complete operation result.
 */
function receiptPrefix(fingerprint: string) {
	return `refs/archboard/published/${fingerprint}/`;
}

/**
 * Find retained publication closures even after the destination changes.
 * @param context The resolved archive context.
 * @returns The complete operation result.
 */
async function retainedPublicationTips(context: ArchiveContext) {
	const refs = await git(
		context.root,
		["for-each-ref", "--format=%(objectname)", "refs/archboard/published/"],
		{ maxOutputBytes: Infinity },
	);
	return (refs ?? "").split("\n").filter(Boolean);
}

/**
 * Record availability without moving or replacing another exchange's evidence.
 * @param context The resolved archive context.
 * @param fingerprint The private destination fingerprint.
 * @param tip The retained archive tip.
 */
async function acknowledgePublication(
	context: PublicationContext,
	fingerprint: string,
	tip: string,
) {
	await git(context.root, ["update-ref", `${receiptPrefix(fingerprint)}${tip}`, tip]);
}

/**
 * Own temporary fetch retention until the operation keeps its durable result.
 * @param context The resolved archive context.
 * @param destination The explicit archive destination.
 * @param read The operation that consumes the fetched tip.
 * @returns The operation's complete result.
 */
async function withFetchedArchive<T>(
	context: PublicationContext,
	destination: Awaited<ReturnType<typeof configuredDestination>>,
	read: (tip: string) => Promise<T>,
): Promise<T> {
	const ref = `refs/archboard/incoming/${randomUUID()}`;
	try {
		return await read(await fetchTip(context, destination, ref));
	} finally {
		try {
			await git(context.root, ["update-ref", "-d", ref]);
		} catch {
			// Cleanup failure only retains additional objects. It cannot undo a completed exchange.
		}
	}
}

/**
 * Fetch one named archive without touching source refs, FETCH_HEAD or fetch configuration.
 * @param context The resolved archive context.
 * @param destination The explicit archive destination.
 * @param ref The private incoming ref.
 * @param deepen Whether to restore an observed archive shallow boundary.
 * @returns The completely fetched archive tip.
 */
async function fetchTip(
	context: PublicationContext,
	destination: Awaited<ReturnType<typeof configuredDestination>>,
	ref: string,
	deepen = false,
): Promise<string> {
	const tip = await fetchNamedRef(context, destination, ref, deepen);
	try {
		await requireCompleteArchive(context, tip);
	} catch (error) {
		if (error instanceof ShallowArchiveError && !deepen)
			return fetchTip(context, destination, ref, true);
		throw error;
	}
	return tip;
}

/**
 * Fetch a named ref through Git without changing the source fetch mapping.
 * @param context The resolved archive context.
 * @param destination The explicit archive destination.
 * @param ref The private incoming ref.
 * @param deepen Whether to request complete archive depth.
 * @returns The fetched immutable tip.
 */
async function fetchNamedRef(
	context: PublicationContext,
	destination: Awaited<ReturnType<typeof configuredDestination>>,
	ref: string,
	deepen: boolean,
) {
	await git(context.root, [
		"fetch",
		"--no-tags",
		"--no-prune",
		"--no-write-fetch-head",
		"--no-recurse-submodules",
		...(deepen ? ["--depth=2147483647"] : []),
		"--no-filter",
		"--no-auto-maintenance",
		"--no-write-commit-graph",
		"--refmap=",
		destination.fetchUrl,
		`${destination.ref}:${ref}`,
	]);
	const tip = await git(context.root, ["rev-parse", "--verify", ref]);
	if (tip === undefined) throw new Error("The fetched archive has no tip.");
	return tip;
}

/**
 * Refuse incomplete objects, shallow boundaries, and foreign source ancestry.
 * @param context The resolved archive context.
 * @param tip The retained archive tip.
 * @param forPublication Whether this closure will be sent to a remote.
 * @returns The complete supported archive records.
 */
async function requireCompleteArchive(
	context: ArchiveContext,
	tip: string,
	forPublication = false,
) {
	const [, shallowPath] = await settledValues([
		git(context.root, ["rev-list", "--objects", "--missing=error", tip], {
			maxOutputBytes: Infinity,
		}),
		git(context.root, ["rev-parse", "--path-format=absolute", "--git-path", "shallow"]),
	]);
	const records = await archiveRecords(context, [tip]).catch((error: unknown) => {
		throw new ArchiveError(
			"ARCHIVE_UNREADABLE",
			error instanceof Error ? error.message : String(error),
			tip,
		);
	});
	if (forPublication) requirePortableRecords(records, tip);

	const boundaries = new Set(
		shallowPath !== undefined && existsSync(shallowPath)
			? readFileSync(shallowPath, "utf8").trim().split("\n")
			: [],
	);
	if (records.some(({ id }) => boundaries.has(id)))
		throw new ShallowArchiveError(
			"ARCHITECTURE_UNAVAILABLE",
			"The archive still has a shallow boundary. Restore complete history at the configured remote.",
			tip,
		);
	return records;
}

/**
 * Refuse machine-local metadata before sending immutable objects to a remote.
 * @param records The complete supported archive records.
 * @param tip The closure that will be published.
 */
function requirePortableRecords(records: Awaited<ReturnType<typeof archiveRecords>>, tip: string) {
	if (
		records.some(
			({ record }) =>
				record.kind === "checkpoint" &&
				record.sources.some((source) => /^(?:file:|\/|\\|\.{1,2}\/|[A-Za-z]:)/u.test(source.repo)),
		)
	)
		throw new ArchiveError(
			"ARCHIVE_NOT_PORTABLE",
			"The archive contains a machine-local source repository path. Its immutable metadata cannot be published unchanged.",
			tip,
		);
}

/**
 * Derive checkpoint status only from explicit publication evidence.
 * @param context The resolved archive context.
 * @param checkpoint The complete immutable checkpoint identity.
 * @returns The complete operation result.
 */
async function checkpointPublication(context: ArchiveContext, checkpoint: string) {
	try {
		return await publicationEvidence(context, checkpoint);
	} catch {
		// Publication metadata never blocks an otherwise coherent local reading or retention.
		// The explicit publication operation reports the configuration or evidence failure.
		return { publication: "saved-locally" as const };
	}
}

/**
 * Read publication evidence without concealing private metadata failures.
 * @param context The resolved archive context.
 * @param checkpoint The complete immutable checkpoint identity.
 * @returns The complete operation result.
 */
async function publicationEvidence(context: ArchiveContext, checkpoint: string) {
	const publication = await publicationContext(context);
	if (publication.configuration === undefined) return { publication: "saved-locally" as const };
	const destination = await configuredDestination(publication);
	const publishedTip = await retainingTip(
		context,
		checkpoint,
		receiptPrefix(destination.fingerprint),
	);
	if (publishedTip !== undefined) return { publication: "published" as const, publishedTip };
	const pending = await retainingTip(
		context,
		checkpoint,
		`refs/archboard/pending/${destination.fingerprint}/`,
	);
	return {
		publication:
			pending === undefined ? ("saved-locally" as const) : ("publication-pending" as const),
	};
}

/**
 * Find a retained tip whose real ancestry includes this checkpoint.
 * @param context The resolved archive context.
 * @param checkpoint The exact checkpoint to classify.
 * @param prefix The private ref namespace to inspect.
 * @returns The retaining tip, when one exists.
 */
async function retainingTip(context: ArchiveContext, checkpoint: string, prefix: string) {
	const refs = await git(context.root, ["for-each-ref", "--format=%(objectname)", prefix], {
		maxOutputBytes: Infinity,
	});
	for (const tip of (refs ?? "").split("\n").filter(Boolean)) {
		// oxlint-disable-next-line no-await-in-loop -- stop at the first retained ancestry proof
		if (await isArchiveAncestor(context, checkpoint, tip)) return tip;
	}
	return undefined;
}

export {
	publicationContext,
	resolveDestination,
	saveDestination,
	configuredDestination,
	markPending,
	acknowledgePublication,
	checkpointPublication,
	publicationEvidence,
	retainedPublicationTips,
	withFetchedArchive,
	requireCompleteArchive,
	retention,
	type PublicationContext,
};

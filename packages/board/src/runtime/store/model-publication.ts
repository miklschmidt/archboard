import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { git } from "@archboard/process/git";
import { writeFileAtomic } from "@archboard/workspace/atomic-write";
import {
	ArchitecturePublicationDestinationSchema,
	GitObjectIdSchema,
} from "#shared/schemas/model.ts";
import {
	ArchiveError,
	archiveContext,
	isArchiveAncestor,
	archiveRecords,
	type ArchiveContext,
} from "#runtime/store/model-archive.ts";

const ConfigurationSchema = ArchitecturePublicationDestinationSchema.extend({
	schemaVersion: z.literal(1),
	fingerprint: z.string(),
}).strict();
const PendingSchema = z.object({ checkpoint: GitObjectIdSchema, tip: GitObjectIdSchema }).strict();
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
		await git(context.root, ["check-ref-format", destination.ref]);
		const fetchUrl = await git(context.root, ["remote", "get-url", "--all", destination.remote]);
		const pushUrl = await git(context.root, [
			"remote",
			"get-url",
			"--push",
			"--all",
			destination.remote,
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
function markPending(
	context: PublicationContext,
	fingerprint: string,
	checkpoint: string,
	tip: string,
) {
	const directory = join(context.directory, fingerprint);
	mkdirSync(directory, { recursive: true, mode: 0o700 });
	writeFileAtomic(join(directory, `${checkpoint}.json`), JSON.stringify({ checkpoint, tip }));
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
 * Fetch one named archive without touching source refs, FETCH_HEAD or fetch configuration.
 * @param context The resolved archive context.
 * @param destination The explicit archive destination.
 * @returns The complete operation result.
 */
async function fetchArchive(
	context: PublicationContext,
	destination: Awaited<ReturnType<typeof configuredDestination>>,
	deepen = false,
) {
	const ref = `refs/archboard/incoming/${randomUUID()}`;
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
	try {
		await requireCompleteArchive(context, tip);
	} catch (error) {
		if (error instanceof ShallowArchiveError && !deepen)
			return fetchArchive(context, destination, true);
		throw error;
	}
	return { tip, ref };
}

/**
 * Refuse incomplete objects, shallow boundaries, and foreign source ancestry.
 * @param context The resolved archive context.
 * @param tip The retained archive tip.
 */
async function requireCompleteArchive(context: ArchiveContext, tip: string) {
	await git(context.root, ["rev-list", "--objects", "--missing=error", tip], {
		maxOutputBytes: Infinity,
	});
	const records = await archiveRecords(context, [tip]);
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
	const shallowPath = await git(context.root, [
		"rev-parse",
		"--path-format=absolute",
		"--git-path",
		"shallow",
	]);
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
	const receipts = await git(
		context.root,
		["for-each-ref", "--format=%(objectname)", receiptPrefix(destination.fingerprint)],
		{ maxOutputBytes: Infinity },
	);
	for (const tip of (receipts ?? "").split("\n").filter(Boolean)) {
		// oxlint-disable-next-line no-await-in-loop -- stop at the first retained proof for this checkpoint
		if (await isArchiveAncestor(context, checkpoint, tip))
			return { publication: "published" as const, publishedTip: tip };
	}
	return {
		publication: (await pendingClosure(publication, destination.fingerprint, checkpoint))
			? ("publication-pending" as const)
			: ("saved-locally" as const),
	};
}

/**
 * Include every retained baseline in the pending publication intent.
 * @param context The private publication context.
 * @param fingerprint The private destination fingerprint.
 * @param checkpoint The exact checkpoint to classify.
 * @returns Whether a pending intent retains the checkpoint.
 */
async function pendingClosure(
	context: PublicationContext,
	fingerprint: string,
	checkpoint: string,
) {
	const directory = join(context.directory, fingerprint);
	if (!existsSync(directory)) return false;
	for (const file of readdirSync(directory).filter((name) => name.endsWith(".json"))) {
		const pending = PendingSchema.parse(JSON.parse(readFileSync(join(directory, file), "utf8")));
		// oxlint-disable-next-line no-await-in-loop -- stop after the first pending ancestry proof
		if (await isArchiveAncestor(context, checkpoint, pending.tip)) return true;
	}
	return false;
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
	fetchArchive,
	requireCompleteArchive,
	retention,
	type PublicationContext,
};

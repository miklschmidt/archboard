import { z } from "zod";
import { git, GitCommandError } from "@archboard/process/git";
import {
	ArchitecturePublicationDestinationSchema,
	ArchitecturePublicationRequestSchema,
	ArchitecturePublicationSchema,
	GitObjectIdSchema,
} from "#shared/schemas/model.ts";
import {
	ArchiveError,
	archiveTip,
	appendCheckpoint,
	isArchiveAncestor,
} from "#runtime/store/model-archive.ts";
import {
	publicationContext,
	resolveDestination,
	saveDestination,
	configuredDestination,
	markPending,
	acknowledgePublication,
	retention,
	withFetchedArchive,
	requireCompleteArchive,
	publicationEvidence,
} from "#runtime/store/model-publication.ts";
import { archiveFailure, historyResult } from "#runtime/operations/history/result.ts";
import { readArchitectureCheckpoint } from "#runtime/operations/history/read.ts";

type Publication = z.infer<typeof ArchitecturePublicationSchema>;

/**
 * Read durable local evidence without contacting the configured remote.
 * @param vault The addressed vault or resolved checkout context.
 * @param checkpoint The complete immutable checkpoint identity.
 * @returns The complete operation result.
 */
async function readArchitecturePublication(
	vault: string,
	checkpoint: string,
): Promise<Publication> {
	if (!GitObjectIdSchema.safeParse(checkpoint).success)
		return archiveFailure(
			"CHECKPOINT_INVALID",
			new Error("Use a complete immutable checkpoint identity."),
			checkpoint,
		);
	return historyResult("ARCHIVE_UNREADABLE", async () => {
		const context = await publicationContext(vault);
		const destination =
			context.configuration === undefined ? undefined : await configuredDestination(context);
		const status = {
			checkpoint,
			retention,
			...(destination === undefined
				? {}
				: { destination: { remote: destination.remote, ref: destination.ref } }),
		};
		const reading = await readArchitectureCheckpoint(vault, checkpoint);
		if (!reading.success) return { ...reading, ...status, publication: "unavailable" as const };
		return {
			success: true as const,
			...status,
			...(await publicationEvidence(context, checkpoint)),
		};
	});
}

/**
 * Fetch complete named history and prove the requested exact reading.
 * @param vault The addressed vault or resolved checkout context.
 * @param input The explicit publication request.
 * @returns The complete operation result.
 */
async function fetchArchitectureHistory(
	vault: string,
	input: z.infer<typeof ArchitecturePublicationRequestSchema>,
): Promise<Publication> {
	const request = ArchitecturePublicationRequestSchema.parse(input);
	return historyResult("ARCHIVE_NETWORK_FAILED", async () => {
		const context = await publicationContext(vault);
		const destination = await configuredDestination(context, request);
		try {
			return await withFetchedArchive(context, destination, async (tip) => {
				await requirePublishedCheckpoint(context, request.checkpoint, tip);
				const reading = await readArchitectureCheckpoint(vault, request.checkpoint);
				if (!reading.success)
					return {
						...reading,
						publication: "unavailable" as const,
						checkpoint: request.checkpoint,
						retention,
					};
				await acknowledgePublication(context, destination.fingerprint, tip);
				return {
					success: true as const,
					publication: "published" as const,
					checkpoint: request.checkpoint,
					destination: { remote: destination.remote, ref: destination.ref },
					retention,
					publishedTip: tip,
				};
			});
		} catch (error) {
			return {
				...archiveFailure(
					error instanceof ArchiveError ? error.code : "ARCHIVE_NETWORK_FAILED",
					error,
					request.checkpoint,
				),
				publication: "unavailable" as const,
				checkpoint: request.checkpoint,
				destination: { remote: destination.remote, ref: destination.ref },
				retention,
			};
		}
	});
}

/**
 * Distinguish an absent reading from a failed network exchange.
 * @param context The resolved archive context.
 * @param checkpoint The requested immutable checkpoint.
 * @param tip The completely fetched archive tip.
 */
async function requirePublishedCheckpoint(
	context: Awaited<ReturnType<typeof publicationContext>>,
	checkpoint: string,
	tip: string,
) {
	try {
		if (await isArchiveAncestor(context, checkpoint, tip)) return;
	} catch (error) {
		if (!(error instanceof GitCommandError) || error.failure !== "exit") throw error;
	}
	throw new ArchiveError(
		"ARCHITECTURE_UNAVAILABLE",
		"The configured archive ref does not retain the requested checkpoint.",
		checkpoint,
	);
}

/**
 * Configure a deliberate destination and report the remote-policy limitation.
 * @param vault The addressed vault or resolved checkout context.
 * @param input The explicit publication request.
 * @returns The complete operation result.
 */
async function configureArchitecturePublication(
	vault: string,
	input: z.infer<typeof ArchitecturePublicationDestinationSchema>,
): Promise<Publication> {
	const request = ArchitecturePublicationDestinationSchema.parse(input);
	return historyResult("ARCHIVE_WRITE_FAILED", async () => {
		const context = await publicationContext(vault);
		const destination = await resolveDestination(context, request);
		saveDestination(context, destination);
		return {
			success: true as const,
			publication: "saved-locally" as const,
			destination: request,
			retention,
		};
	});
}

/**
 * Explicitly publish retained architecture without changing current files.
 * @param vault The addressed vault or resolved checkout context.
 * @param input The explicit publication request.
 * @returns The complete operation result.
 */
async function publishArchitectureHistory(
	vault: string,
	input: z.infer<typeof ArchitecturePublicationRequestSchema>,
): Promise<Publication> {
	const request = ArchitecturePublicationRequestSchema.parse(input);
	return historyResult("ARCHIVE_WRITE_FAILED", async () => {
		const context = await publicationContext(vault);
		const destination = await configuredDestination(context, request);
		const reading = await readArchitectureCheckpoint(vault, request.checkpoint);
		if (!reading.success) return reading;
		await appendCheckpoint(context, request.checkpoint, await archiveTip(context));
		const tip = await archiveTip(context);
		if (tip === undefined)
			throw new ArchiveError("ARCHIVE_UNREADABLE", "The local archive has no tip.");
		await markPending(context, destination.fingerprint, request.checkpoint, tip);
		try {
			const published = await publishClosure(context, destination, tip);
			await acknowledgePublication(context, destination.fingerprint, published);
			return {
				success: true as const,
				publication: "published" as const,
				checkpoint: request.checkpoint,
				destination: { remote: destination.remote, ref: destination.ref },
				retention,
				publishedTip: published,
			};
		} catch (error) {
			return {
				...archiveFailure(
					error instanceof ArchiveError ? error.code : "ARCHIVE_NETWORK_FAILED",
					error,
					request.checkpoint,
				),
				publication: "publication-pending" as const,
				checkpoint: request.checkpoint,
				destination: { remote: destination.remote, ref: destination.ref },
				retention,
			};
		}
	});
}

/**
 * Join a stale archive with signed ancestry, then retry a non-forced push.
 * @param context The resolved archive context.
 * @param destination The explicit archive destination.
 * @param tip The retained archive tip.
 * @param attempt The number of observed competing publications.
 * @returns The complete operation result.
 */
async function publishClosure(
	context: Awaited<ReturnType<typeof publicationContext>>,
	destination: Awaited<ReturnType<typeof configuredDestination>>,
	tip: string,
	attempt = 0,
): Promise<string> {
	if (attempt >= 8)
		throw new ArchiveError(
			"ARCHIVE_BUSY",
			"Concurrent remote publications prevented this append. Retry the retained publication.",
		);
	await requireCompleteArchive(context, tip, true);
	try {
		await git(context.root, [
			"push",
			"--porcelain",
			"--no-mirror",
			"--no-follow-tags",
			"--recurse-submodules=no",
			destination.pushUrl,
			`${tip}:${destination.ref}`,
		]);
		return tip;
	} catch (error) {
		return retryStalePublication(context, destination, tip, attempt, error);
	}
}

/**
 * Preserve the remote's accepted ancestry before retrying a rejected push.
 * @param context The resolved archive context.
 * @param destination The explicit archive destination.
 * @param tip The retained archive tip.
 * @param attempt The number of observed competing publications.
 * @param error The rejected push outcome.
 * @returns The complete operation result.
 */
async function retryStalePublication(
	context: Awaited<ReturnType<typeof publicationContext>>,
	destination: Awaited<ReturnType<typeof configuredDestination>>,
	tip: string,
	attempt: number,
	error: unknown,
): Promise<string> {
	if (!(error instanceof GitCommandError) || error.failure !== "exit") throw error;
	return withFetchedArchive(context, destination, async (remoteTip) => {
		if (await isArchiveAncestor(context, remoteTip, tip)) throw error;
		await appendCheckpoint(context, remoteTip, await archiveTip(context));
		const joined = await archiveTip(context);
		if (joined === undefined)
			throw new ArchiveError("ARCHIVE_UNREADABLE", "The joined archive has no tip.");
		return publishClosure(context, destination, joined, attempt + 1);
	});
}

export {
	readArchitecturePublication,
	configureArchitecturePublication,
	publishArchitectureHistory,
	fetchArchitectureHistory,
};

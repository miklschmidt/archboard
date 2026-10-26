import { z } from "zod";
import { git } from "@archboard/process/git";
import {
	ArchitecturePublicationDestinationSchema,
	ArchitecturePublicationRequestSchema,
	ArchitecturePublicationSchema,
	GitObjectIdSchema,
} from "#shared/schemas/model.ts";
import { ArchiveError, archiveTip } from "#runtime/store/model-archive.ts";
import {
	publicationContext,
	resolveDestination,
	saveDestination,
	configuredDestination,
	markPending,
	acknowledgePublication,
	checkpointPublication,
	retention,
} from "#runtime/store/model-publication.ts";
import { archiveFailure, historyResult } from "#runtime/operations/history/result.ts";
import { readArchitectureCheckpoint } from "#runtime/operations/history/read.ts";

type Publication = z.infer<typeof ArchitecturePublicationSchema>;

/** Read durable local evidence without contacting the configured remote. */
async function readArchitecturePublication(
	vault: string,
	checkpoint: string,
): Promise<Publication> {
	GitObjectIdSchema.parse(checkpoint);
	return historyResult("ARCHIVE_UNREADABLE", async () => {
		const context = await publicationContext(vault);
		const reading = await readArchitectureCheckpoint(vault, checkpoint);
		if (!reading.success)
			return { ...reading, publication: "unavailable" as const, checkpoint, retention };
		const destination =
			context.configuration === undefined ? undefined : await configuredDestination(context);
		return {
			success: true as const,
			checkpoint,
			retention,
			...(destination === undefined
				? {}
				: { destination: { remote: destination.remote, ref: destination.ref } }),
			...(await checkpointPublication(context, checkpoint)),
		};
	});
}

/** Configure a deliberate destination and report the remote-policy limitation. */
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

/** Explicitly publish retained architecture without changing current files. */
async function publishArchitectureHistory(
	vault: string,
	input: z.infer<typeof ArchitecturePublicationRequestSchema>,
): Promise<Publication> {
	const request = ArchitecturePublicationRequestSchema.parse(input);
	return historyResult("ARCHIVE_NETWORK_FAILED", async () => {
		const context = await publicationContext(vault);
		const destination = await configuredDestination(context, request);
		const reading = await readArchitectureCheckpoint(vault, request.checkpoint);
		if (!reading.success) return reading;
		const tip = await archiveTip(context);
		if (tip === undefined)
			throw new ArchiveError("ARCHIVE_UNREADABLE", "The local archive has no tip.");
		markPending(context, destination.fingerprint, request.checkpoint, tip);
		try {
			await git(context.root, [
				"push",
				"--porcelain",
				"--no-follow-tags",
				"--recurse-submodules=no",
				destination.pushUrl,
				`${tip}:${destination.ref}`,
			]);
			await acknowledgePublication(context, destination.fingerprint, tip);
			return readArchitecturePublication(vault, request.checkpoint);
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

export {
	readArchitecturePublication,
	configureArchitecturePublication,
	publishArchitectureHistory,
};

import { createHash } from "node:crypto";
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

/** Hash a private identity without exposing remote URLs or machine paths. */
function digest(value: string) {
	return createHash("sha256").update(value).digest("hex");
}

/** Locate shared private publication state for the portable vault address. */
async function publicationContext(vault: string) {
	const context = await archiveContext(vault);
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

/** Resolve one explicit named remote, without invoking a network operation. */
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
		if (
			fetchUrl === undefined ||
			pushUrl === undefined ||
			fetchUrl.includes("\n") ||
			pushUrl.includes("\n")
		)
			throw new Error("Publication requires one fetch URL and one push URL for the named remote.");
		return {
			...destination,
			fetchUrl,
			pushUrl,
			fingerprint: digest(JSON.stringify([context.vault, destination, fetchUrl, pushUrl])),
		};
	} catch (error) {
		throw new ArchiveError(
			"PUBLICATION_INVALID",
			error instanceof Error ? error.message : String(error),
		);
	}
}

/** Save explicit destination ownership independently of model write recovery. */
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

/** Refuse implicit or changed destinations before sending any history. */
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

/** Keep pending intent durable before the first network request. */
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

/** A receipt ref retains the exact closure acknowledged by an explicit exchange. */
function receiptPrefix(fingerprint: string) {
	return `refs/archboard/published/${fingerprint}/`;
}

/** Record availability without moving or replacing another exchange's evidence. */
async function acknowledgePublication(
	context: PublicationContext,
	fingerprint: string,
	tip: string,
) {
	await git(context.root, ["update-ref", `${receiptPrefix(fingerprint)}${tip}`, tip]);
}

/** Derive checkpoint status only from explicit publication evidence. */
async function checkpointPublication(context: ArchiveContext, checkpoint: string) {
	const publication = await publicationContext(join(context.root, context.vault));
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
		publication: existsSync(
			join(publication.directory, destination.fingerprint, `${checkpoint}.json`),
		)
			? ("publication-pending" as const)
			: ("saved-locally" as const),
	};
}

export {
	publicationContext,
	resolveDestination,
	saveDestination,
	configuredDestination,
	markPending,
	acknowledgePublication,
	checkpointPublication,
	retention,
	type PublicationContext,
};

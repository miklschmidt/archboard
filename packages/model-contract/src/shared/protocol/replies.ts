// What the model answers a caller, read once for every client.
//
// An answer is the operation's success or a structured refusal. An answer that
// came with an HTTP failure is read only as a refusal: whatever else a failed
// request carries, a client keeps the refusal's code and guidance, and reports
// anything that is not one as the failure it is.

import { z } from "zod";
import {
	ArchitectureArchiveInitializationSchema,
	ArchitectureCheckpointListSchema,
	ArchitectureCheckpointRetainSchema,
	ArchitectureCheckpointRowsSchema,
	ArchitectureModelReadSchema,
	ArchitecturePublicationSchema,
	ArchitectureRetainedModuleSchema,
	ModuleNavigationReadSchema,
} from "#shared/canonical-contracts/schemas/model.ts";
import {
	ArchitectureClaimListSchema,
	ArchitectureClaimResultSchema,
	ArchitectureFeedFrameSchema,
	ArchitectureModuleEditResultSchema,
	ArchitectureRecoveryResultSchema,
	ArchitectureRenderResultSchema,
} from "#shared/canonical-contracts/schemas/model-operations.ts";
import { LegacyInventoryReadSchema } from "#shared/schemas/migration.ts";
import { ArchitectureExportResultSchema } from "#shared/schemas/model-portable.ts";
import { VaultCheckSchema } from "#shared/schemas/semantic-policy.ts";

/** The answer of each operation. */
const REPLIES = {
	read: ArchitectureModelReadSchema,
	readModule: ModuleNavigationReadSchema,
	readRetainedModule: ArchitectureRetainedModuleSchema,
	retainCheckpoint: ArchitectureCheckpointRetainSchema,
	listCheckpoints: ArchitectureCheckpointListSchema,
	listCheckpointRows: ArchitectureCheckpointRowsSchema,
	edit: ArchitectureModuleEditResultSchema,
	initialize: ArchitectureModuleEditResultSchema,
	import: ArchitectureModuleEditResultSchema,
	migrate: ArchitectureModuleEditResultSchema,
	export: ArchitectureExportResultSchema,
	claim: ArchitectureClaimResultSchema,
	readClaims: ArchitectureClaimListSchema,
	releaseClaim: ArchitectureClaimListSchema,
	takeBackClaim: ArchitectureClaimListSchema,
	recover: ArchitectureRecoveryResultSchema,
	readPublication: ArchitecturePublicationSchema,
	configurePublication: ArchitecturePublicationSchema,
	publish: ArchitecturePublicationSchema,
	fetch: ArchitecturePublicationSchema,
	initializeArchive: ArchitectureArchiveInitializationSchema,
	render: ArchitectureRenderResultSchema,
	readLegacyInventory: LegacyInventoryReadSchema,
	saveLegacyMappingPlan: LegacyInventoryReadSchema,
	checkVault: VaultCheckSchema,
	feed: ArchitectureFeedFrameSchema,
} as const;

/** Every operation whose answer a client reads. */
type ReplyOperation = keyof typeof REPLIES;

/** The answer of an operation: its success or its refusal. */
type ModelReply<O extends ReplyOperation> = z.output<(typeof REPLIES)[O]>;

/** An answer read: the operation's answer, or why the body is not one. */
type ReadReply<O extends ReplyOperation> =
	| { readonly success: true; readonly data: ModelReply<O> }
	| { readonly success: false; readonly error: z.ZodError };

/** Each operation's answer, by the data it reads. */
const ANSWERS: { readonly [O in ReplyOperation]: z.ZodType<ModelReply<O>> } = REPLIES;

/** How an answer arrived: with a success status, or with an HTTP failure. */
type ReplyDelivery = "answered" | "failed";

/**
 * Read an untrusted body as the answer of one operation.
 * @param operation The operation that was asked.
 * @param body The body as received.
 * @param delivery "failed" when the body came with an HTTP failure: then only a refusal is an answer.
 * @returns The answer, or why the body is not one.
 */
function readModelReply<O extends ReplyOperation>(
	operation: O,
	body: unknown,
	delivery: ReplyDelivery = "answered",
): ReadReply<O> {
	const parsed = ANSWERS[operation].safeParse(body);
	if (delivery === "answered" || !parsed.success || isRefusal(parsed.data)) return parsed;
	return {
		success: false,
		error: new z.ZodError([
			{
				code: "custom",
				path: ["success"],
				message: "An answer that came with an HTTP failure must be a refusal.",
				input: body,
			},
		]),
	};
}

/**
 * Whether an answer is a structured refusal.
 * @param answer The parsed answer.
 * @returns True when it says it did not succeed.
 */
function isRefusal(answer: unknown): boolean {
	return typeof answer === "object" && answer !== null && Reflect.get(answer, "success") === false;
}

export { readModelReply, type ModelReply, type ReadReply, type ReplyDelivery, type ReplyOperation };

// What a caller asks of the model, read once for every side that receives it.
//
// A request names its vault beside its fields. The server's routes take the
// vault from the address and read the rest; the store reads the same intent
// again before it writes. Each operation keeps the way its route has always
// read its body, so a refusal names the same fields in the same words: an edit
// or a claim reads an envelope first and the intent without its vault, the
// others read their fields and the vault together, and a query must name its
// vault.

import { z } from "zod";
import {
	ArchitectureCheckpointRequestSchema,
	ArchitecturePublicationDestinationSchema,
	ArchitecturePublicationRequestSchema,
} from "#shared/canonical-contracts/schemas/model.ts";
import {
	ArchitectureClaimReleaseSchema,
	ArchitectureClaimRequestSchema,
	ArchitectureClaimTakeBackSchema,
	ArchitectureFeedRequestSchema,
	ArchitectureModuleEditSchema,
	ArchitectureRenderRequestSchema,
} from "#shared/canonical-contracts/schemas/model-operations.ts";
import { ArchitectureMigrationRequestSchema } from "#shared/schemas/migration-installation.ts";
import { LegacyMappingWriteSchema } from "#shared/schemas/migration.ts";
import {
	ArchitectureImportRequestSchema,
	ArchitectureInitializationRequestSchema,
} from "#shared/schemas/model-portable.ts";

/** A body that names its vault beside fields this reading does not look at yet. */
const EnvelopeSchema = z.object({ vault: z.string().optional() }).catchall(z.unknown());
const OptionalVault = { vault: z.string().optional() };
const RequiredVault = { vault: z.string() };

/** Each request: its intent alone, and how its body names the vault. */
const REQUESTS = {
	edit: { intent: ArchitectureModuleEditSchema, body: "envelope" },
	claim: { intent: ArchitectureClaimRequestSchema, body: "envelope" },
	releaseClaim: { intent: ArchitectureClaimReleaseSchema, body: "envelope" },
	takeBackClaim: { intent: ArchitectureClaimTakeBackSchema, body: "envelope" },
	recover: { intent: z.object({}).strict(), body: "envelope" },
	initialize: {
		intent: ArchitectureInitializationRequestSchema,
		body: ArchitectureInitializationRequestSchema.extend(OptionalVault),
	},
	import: {
		intent: ArchitectureImportRequestSchema,
		body: ArchitectureImportRequestSchema.extend(OptionalVault),
	},
	export: { intent: z.strictObject({}), body: z.strictObject(OptionalVault) },
	initializeArchive: { intent: z.strictObject({}), body: z.object(OptionalVault).strict() },
	configurePublication: {
		intent: ArchitecturePublicationDestinationSchema,
		body: ArchitecturePublicationDestinationSchema.extend(OptionalVault),
	},
	publish: {
		intent: ArchitecturePublicationRequestSchema,
		body: ArchitecturePublicationRequestSchema.extend(OptionalVault),
	},
	fetch: {
		intent: ArchitecturePublicationRequestSchema,
		body: ArchitecturePublicationRequestSchema.extend(OptionalVault),
	},
	readPublication: {
		intent: ArchitecturePublicationRequestSchema.pick({ checkpoint: true }),
		body: ArchitecturePublicationRequestSchema.pick({ checkpoint: true }).extend(RequiredVault),
	},
	migrate: {
		intent: ArchitectureMigrationRequestSchema,
		body: ArchitectureMigrationRequestSchema.extend(OptionalVault),
	},
	saveLegacyMappingPlan: {
		intent: LegacyMappingWriteSchema,
		body: LegacyMappingWriteSchema.extend(OptionalVault),
	},
	retainCheckpoint: {
		intent: ArchitectureCheckpointRequestSchema,
		body: ArchitectureCheckpointRequestSchema.safeExtend(OptionalVault),
	},
	render: {
		intent: ArchitectureRenderRequestSchema,
		body: ArchitectureRenderRequestSchema.extend(RequiredVault),
	},
	feed: { intent: ArchitectureFeedRequestSchema, body: "frame" },
} as const;

/** Every operation a caller asks of the model. */
type RequestOperation = keyof typeof REQUESTS;

/** The intent of an operation, as read: defaults filled, the vault left out. */
type ModelRequest<O extends RequestOperation> = z.output<(typeof REQUESTS)[O]["intent"]>;

/** The intent of an operation, as a caller writes it: defaults may be left out. */
type ModelRequestInput<O extends RequestOperation> = z.input<(typeof REQUESTS)[O]["intent"]>;

/** The refusal a server answers a request it cannot read with. */
interface InvalidRequest {
	readonly success: false;
	readonly code: "INVALID_REQUEST";
	readonly error: string;
}

/** A request read: the vault it names and its intent, or why it is not one. */
type ParsedRequest<O extends RequestOperation> =
	| {
			readonly success: true;
			readonly vault: string | undefined;
			readonly data: ModelRequest<O>;
	  }
	| { readonly success: false; readonly error: z.ZodError; readonly refusal: InvalidRequest };

/** Each operation's intent, by the data it reads, and how its body names the vault. */
const READINGS: {
	readonly [O in RequestOperation]: {
		readonly intent: z.ZodType<ModelRequest<O>>;
		readonly body: z.ZodType | "envelope" | "frame";
	};
} = REQUESTS;

/**
 * Read an untrusted body as the request of one operation.
 *
 * A body read whole with its vault is read again without it for the intent, so the refusal names
 * the fields the route always named and the intent is read once by its own schema.
 * @param operation The operation asked for.
 * @param body The body or query as received.
 * @returns The vault it names and the intent, or the error and the refusal to answer with.
 */
function parseModelRequest<O extends RequestOperation>(
	operation: O,
	body: unknown,
): ParsedRequest<O> {
	const { intent, body: whole } = READINGS[operation];
	if (whole === "frame") return intentOf(intent, body, undefined);
	if (whole !== "envelope") {
		const checked = whole.safeParse(body);
		if (!checked.success) return invalid(checked.error);
	}
	const envelope = EnvelopeSchema.safeParse(body);
	if (!envelope.success) return invalid(envelope.error);
	const { vault, ...fields } = envelope.data;
	return intentOf(intent, fields, vault);
}

/**
 * Read a request's intent once its vault is known.
 * @param intent The intent's schema.
 * @param fields The body without its vault.
 * @param vault The vault the body names.
 * @returns The vault and the intent, or the error and the refusal.
 */
function intentOf<T>(
	intent: z.ZodType<T>,
	fields: unknown,
	vault: string | undefined,
):
	| { readonly success: true; readonly vault: string | undefined; readonly data: T }
	| ReturnType<typeof invalid> {
	const parsed = intent.safeParse(fields);
	return parsed.success ? { success: true, vault, data: parsed.data } : invalid(parsed.error);
}

/**
 * The reading of a request that is not one.
 * @param error Why it is not one.
 * @returns The error, and the refusal a server answers with.
 */
function invalid(error: z.ZodError): {
	readonly success: false;
	readonly error: z.ZodError;
	readonly refusal: InvalidRequest;
} {
	return {
		success: false,
		error,
		refusal: { success: false, code: "INVALID_REQUEST", error: z.prettifyError(error) },
	};
}

export {
	parseModelRequest,
	type InvalidRequest,
	type ModelRequest,
	type ModelRequestInput,
	type ParsedRequest,
	type RequestOperation,
};

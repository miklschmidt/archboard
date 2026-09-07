import { z } from "zod";

import type {
	AnyIdentity,
	ApprovalId,
	BrowserCommandId,
	ChildEpoch,
	ChildId,
	CodexIdentity,
	DynamicToolCallId,
	IdentityAuthority,
	IdentityValidator,
	ItemId,
	JsonRpcRequestId,
	LoginId,
	OperationAuthority,
	OperationId,
	QueuedSubmissionId,
	RealtimeSessionId,
	ThreadId,
	TurnId,
	TrustedIdentityDecoder,
} from "@/shared/codex-workbench-identity/index";

const JsonValueSchema = z.json();

/**
 * A non-empty string bounded in both characters and UTF-8 bytes, without NUL,
 * so a browser payload can never exceed what its wire budget assumed.
 * @param maximum - The limit, applied to both the length and the encoded byte size.
 * @returns The string schema.
 */
const boundedText = (maximum: number) =>
	z
		.string()
		.min(1)
		.max(maximum)
		.refine((value) => !value.includes("\0"), "NUL is not allowed")
		.refine(
			(value) => new TextEncoder().encode(value).byteLength <= maximum,
			`text exceeds ${maximum} UTF-8 bytes`,
		);

/**
 * Like {@link boundedText} but allows the empty string, for bodies that may
 * legitimately be blank on the wire.
 * @param maximum - The limit, applied to both the length and the encoded byte size.
 * @returns The string schema.
 */
const boundedWireText = (maximum: number) =>
	z
		.string()
		.max(maximum)
		.refine((value) => !value.includes("\0"), "NUL is not allowed")
		.refine(
			(value) => new TextEncoder().encode(value).byteLength <= maximum,
			`text exceeds ${maximum} UTF-8 bytes`,
		);

/**
 * Bounded text that may be null.
 * @param maximum - The limit, applied to both the length and the encoded byte size.
 * @returns The nullable string schema.
 */
const nullableText = (maximum: number) => boundedText(maximum).nullable();

/**
 * Bounded text that may be null or absent.
 * @param maximum - The limit, applied to both the length and the encoded byte size.
 * @returns The optional, nullable string schema.
 */
const optionalNullableText = (maximum: number) => boundedText(maximum).nullable().optional();

const SafeUrlSchema = boundedText(2048).refine((value) => {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}, "only http and https URLs are supported");

const NonNegativeIntegerSchema = z.number().int().nonnegative();
const NullableNonNegativeIntegerSchema = NonNegativeIntegerSchema.nullable();

interface IdentitySchemas {
	readonly ChildIdSchema: z.ZodType<ChildId>;
	readonly ChildEpochSchema: z.ZodType<ChildEpoch>;
	readonly BrowserCommandIdSchema: z.ZodType<BrowserCommandId>;
	readonly ThreadIdSchema: z.ZodType<ThreadId>;
	readonly TurnIdSchema: z.ZodType<TurnId>;
	readonly ItemIdSchema: z.ZodType<ItemId>;
	readonly QueuedSubmissionIdSchema: z.ZodType<QueuedSubmissionId>;
	readonly LoginIdSchema: z.ZodType<LoginId>;
	readonly JsonRpcRequestIdSchema: z.ZodType<JsonRpcRequestId>;
	readonly DynamicToolCallIdSchema: z.ZodType<DynamicToolCallId>;
	readonly RealtimeSessionIdSchema: z.ZodType<RealtimeSessionId>;
	readonly ApprovalIdSchema: z.ZodType<ApprovalId>;
	readonly OperationIdSchema: z.ZodType<OperationId>;
	readonly OpaqueIdentitySchema: z.ZodType<AnyIdentity>;
}

type IdentityContext = Pick<IdentityAuthority, "decoder" | "validator"> & {
	/** Dynamic approval schemas are authority-bound when this capability is supplied. */
	readonly operation?: Pick<OperationAuthority, "decoder" | "validator">;
};

/**
 * Wraps one authority parser as a zod schema, so a refusal from the identity
 * authority surfaces as an ordinary validation issue instead of a throw.
 * @param parse - The authority's parser for one identity domain.
 * @returns A schema that yields the branded identity or an issue.
 */
function authorityIdentity<Identity extends string>(
	parse: (value: unknown) => Identity,
): z.ZodType<Identity> {
	return z.unknown().transform((value, context) => {
		try {
			return parse(value);
		} catch (error) {
			context.addIssue({
				code: "custom",
				message: error instanceof Error ? error.message : "identity is not valid in this session",
			});
			return z.NEVER;
		}
	});
}

/**
 * Builds one schema per identity domain over the session's authority. The
 * operation schema refuses everything when no operation authority is supplied,
 * because a browser context without one must never accept an operation id.
 * @param context - The decoder and validator, plus the operation capability when present.
 * @returns The per-domain schemas and a union that accepts any of them.
 */
function createIdentitySchemas(context: IdentityContext): IdentitySchemas {
	const decoder: TrustedIdentityDecoder = context.decoder;
	const identities = {
		ChildIdSchema: authorityIdentity(decoder.parseChildId),
		ChildEpochSchema: authorityIdentity(decoder.parseChildEpoch),
		BrowserCommandIdSchema: authorityIdentity(decoder.parseBrowserCommandId),
		ThreadIdSchema: authorityIdentity(decoder.parseThreadId),
		TurnIdSchema: authorityIdentity(decoder.parseTurnId),
		ItemIdSchema: authorityIdentity(decoder.parseItemId),
		QueuedSubmissionIdSchema: authorityIdentity(decoder.parseQueuedSubmissionId),
		LoginIdSchema: authorityIdentity(decoder.parseLoginId),
		JsonRpcRequestIdSchema: authorityIdentity(decoder.parseJsonRpcRequestId),
		DynamicToolCallIdSchema: authorityIdentity(decoder.parseDynamicToolCallId),
		RealtimeSessionIdSchema: authorityIdentity(decoder.parseRealtimeSessionId),
		ApprovalIdSchema: authorityIdentity(decoder.parseApprovalId),
		OperationIdSchema: context.operation
			? authorityIdentity(context.operation.decoder.parseOperationId)
			: z.custom<OperationId>(() => false, "OperationId authority is not available"),
	};
	return {
		...identities,
		OpaqueIdentitySchema: z.union([
			identities.ChildIdSchema,
			identities.ChildEpochSchema,
			identities.BrowserCommandIdSchema,
			identities.ThreadIdSchema,
			identities.TurnIdSchema,
			identities.ItemIdSchema,
			identities.QueuedSubmissionIdSchema,
			identities.LoginIdSchema,
			identities.JsonRpcRequestIdSchema,
			identities.DynamicToolCallIdSchema,
			identities.RealtimeSessionIdSchema,
			identities.ApprovalIdSchema,
			identities.OperationIdSchema,
		]),
	};
}

/**
 * Refuses a target addressed to another child or an earlier epoch.
 * @param context - The validator that knows the current child and epoch.
 * @param value - The target being addressed.
 * @param value.childId - The child the target names.
 * @param value.epoch - The epoch the target names.
 */
function assertCurrentTarget(
	context: Pick<IdentityValidator, "assertCurrentEpoch">,
	value: { childId: ChildId; epoch: ChildEpoch },
): void {
	context.assertCurrentEpoch(value.childId, value.epoch);
}

type JsonValue = z.infer<typeof JsonValueSchema>;

export {
	JsonValueSchema,
	boundedText,
	boundedWireText,
	nullableText,
	optionalNullableText,
	SafeUrlSchema,
	NonNegativeIntegerSchema,
	NullableNonNegativeIntegerSchema,
	type IdentitySchemas,
	type IdentityContext,
	createIdentitySchemas,
	assertCurrentTarget,
	type AnyIdentity,
	type CodexIdentity,
	type JsonValue,
};

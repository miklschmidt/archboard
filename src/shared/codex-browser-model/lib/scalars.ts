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

const boundedWireText = (maximum: number) =>
	z
		.string()
		.max(maximum)
		.refine((value) => !value.includes("\0"), "NUL is not allowed")
		.refine(
			(value) => new TextEncoder().encode(value).byteLength <= maximum,
			`text exceeds ${maximum} UTF-8 bytes`,
		);

const nullableText = (maximum: number) => boundedText(maximum).nullable();

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

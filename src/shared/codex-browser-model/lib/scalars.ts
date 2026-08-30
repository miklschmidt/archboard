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
	QueuedSubmissionId,
	RealtimeSessionId,
	ThreadId,
	TurnId,
	TrustedIdentityDecoder,
} from "../../codex-workbench-identity/index.js";

export const JsonValueSchema = z.json();

export const boundedText = (maximum: number) =>
	z
		.string()
		.min(1)
		.max(maximum)
		.refine((value) => !value.includes("\0"), "NUL is not allowed")
		.refine(
			(value) => new TextEncoder().encode(value).byteLength <= maximum,
			`text exceeds ${maximum} UTF-8 bytes`,
		);

export const boundedWireText = (maximum: number) =>
	z
		.string()
		.max(maximum)
		.refine((value) => !value.includes("\0"), "NUL is not allowed")
		.refine(
			(value) => new TextEncoder().encode(value).byteLength <= maximum,
			`text exceeds ${maximum} UTF-8 bytes`,
		);

export const nullableText = (maximum: number) => boundedText(maximum).nullable();

export const optionalNullableText = (maximum: number) => boundedText(maximum).nullable().optional();

export const SafeUrlSchema = boundedText(2048).refine((value) => {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}, "only http and https URLs are supported");

export const NonNegativeIntegerSchema = z.number().int().nonnegative();
export const NullableNonNegativeIntegerSchema = NonNegativeIntegerSchema.nullable();

export interface IdentitySchemas {
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
	readonly OpaqueIdentitySchema: z.ZodType<AnyIdentity>;
}

export type IdentityContext = Pick<IdentityAuthority, "decoder" | "validator">;

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

export function createIdentitySchemas(context: IdentityContext): IdentitySchemas {
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
		]),
	};
}

export function assertCurrentTarget(
	context: Pick<IdentityValidator, "assertCurrentEpoch">,
	value: { childId: ChildId; epoch: ChildEpoch },
): void {
	context.assertCurrentEpoch(value.childId, value.epoch);
}

export type { AnyIdentity, CodexIdentity };
export type JsonValue = z.infer<typeof JsonValueSchema>;

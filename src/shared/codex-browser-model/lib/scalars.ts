import { z } from "zod";

import type {
	ApprovalId,
	BrowserCommandId,
	ChildEpoch,
	ChildId,
	DynamicToolCallId,
	ItemId,
	JsonRpcRequestId,
	LoginId,
	QueuedSubmissionId,
	RealtimeSessionId,
	ThreadId,
	TurnId,
} from "../../codex-workbench-identity/index.js";

const MAX_IDENTITY_TOKEN_LENGTH = 8193;
const IDENTITY_TOKEN = `[A-Za-z0-9][A-Za-z0-9._~-]{0,${MAX_IDENTITY_TOKEN_LENGTH - 1}}`;

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

export const nullableText = (maximum: number) => boundedText(maximum).nullable();

export const optionalNullableText = (maximum: number) => boundedText(maximum).nullable().optional();

function identitySchema<Identity extends string>(domain: string) {
	return z
		.string()
		.regex(
			new RegExp(`^archboard:${domain}:${IDENTITY_TOKEN}$`),
			`expected canonical ${domain} identity`,
		)
		.transform((value) => value as Identity);
}

export const ChildIdSchema = identitySchema<ChildId>("child");
export const ChildEpochSchema = identitySchema<ChildEpoch>("epoch");
export const BrowserCommandIdSchema = identitySchema<BrowserCommandId>("browser-command");
export const ThreadIdSchema = identitySchema<ThreadId>("thread");
export const TurnIdSchema = identitySchema<TurnId>("turn");
export const ItemIdSchema = identitySchema<ItemId>("item");
export const QueuedSubmissionIdSchema = identitySchema<QueuedSubmissionId>("queued-submission");
export const LoginIdSchema = identitySchema<LoginId>("login");
export const JsonRpcRequestIdSchema = identitySchema<JsonRpcRequestId>("json-rpc-request");
export const DynamicToolCallIdSchema = identitySchema<DynamicToolCallId>("dynamic-tool-call");
export const RealtimeSessionIdSchema = identitySchema<RealtimeSessionId>("realtime-session");
export const ApprovalIdSchema = identitySchema<ApprovalId>("approval");

export const OpaqueIdentitySchema = z.union([
	ChildIdSchema,
	ChildEpochSchema,
	BrowserCommandIdSchema,
	ThreadIdSchema,
	TurnIdSchema,
	ItemIdSchema,
	QueuedSubmissionIdSchema,
	LoginIdSchema,
	JsonRpcRequestIdSchema,
	DynamicToolCallIdSchema,
	RealtimeSessionIdSchema,
	ApprovalIdSchema,
]);

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

export type JsonValue = z.infer<typeof JsonValueSchema>;

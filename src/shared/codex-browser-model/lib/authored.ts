import { z } from "zod";

import type {
	CodexIngressConformance,
	CodexInitializeCapabilities,
	CodexLoginAccountParams,
	CodexOutputConformance,
} from "../../codex-app-server-contract/index.js";
import {
	boundedText,
	JsonValueSchema,
	NonNegativeIntegerSchema,
	optionalNullableText,
} from "./scalars.js";

function codexOutputSchema<Wire>() {
	return <Schema extends z.ZodType>(
		schema: Schema & CodexOutputConformance<Wire, z.output<Schema>>,
	): Schema => schema;
}

function codexIngressSchema<Wire>() {
	return <Schema extends z.ZodType>(
		schema: Schema & CodexIngressConformance<Wire, z.input<Schema>, z.output<Schema>>,
	): Schema => schema;
}

export const INITIALIZE_CAPABILITIES = Object.freeze({
	experimentalApi: true,
	requestAttestation: false,
	mcpServerOpenaiFormElicitation: true,
	optOutNotificationMethods: Object.freeze([]),
	extensions: Object.freeze({}),
} as const);

export const InitializeCapabilitiesSchema = codexOutputSchema<CodexInitializeCapabilities>()(
	z
		.object({
			experimentalApi: z.literal(true),
			requestAttestation: z.literal(false),
			mcpServerOpenaiFormElicitation: z.literal(true),
			optOutNotificationMethods: z.tuple([]),
			extensions: z.object({}).strict(),
		})
		.strict(),
);

export const LOGIN_VARIANTS = [
	"apiKey",
	"chatgpt",
	"chatgptDeviceCode",
	"chatgptAuthTokens",
	"amazonBedrock",
	"amazonBedrockAccessKeys",
] as const;

export const LoginVariantSchema = z.enum(LOGIN_VARIANTS);

export const LOGIN_POLICIES = Object.freeze([
	Object.freeze({ variant: "apiKey", policy: "supported" }),
	Object.freeze({ variant: "chatgpt", policy: "supported" }),
	Object.freeze({ variant: "chatgptDeviceCode", policy: "refused" }),
	Object.freeze({ variant: "chatgptAuthTokens", policy: "refused" }),
	Object.freeze({ variant: "amazonBedrock", policy: "supported" }),
	Object.freeze({ variant: "amazonBedrockAccessKeys", policy: "supported" }),
] as const);

export const LoginPolicySchema = z
	.object({ variant: LoginVariantSchema, policy: z.enum(["supported", "refused"]) })
	.strict();

const ExactLoginPolicySchema = <
	Variant extends (typeof LOGIN_VARIANTS)[number],
	Policy extends "supported" | "refused",
>(
	variant: Variant,
	policy: Policy,
) => z.object({ variant: z.literal(variant), policy: z.literal(policy) }).strict();

export const LoginPoliciesSchema = z.tuple([
	ExactLoginPolicySchema("apiKey", "supported"),
	ExactLoginPolicySchema("chatgpt", "supported"),
	ExactLoginPolicySchema("chatgptDeviceCode", "refused"),
	ExactLoginPolicySchema("chatgptAuthTokens", "refused"),
	ExactLoginPolicySchema("amazonBedrock", "supported"),
	ExactLoginPolicySchema("amazonBedrockAccessKeys", "supported"),
]);

const ApiKeyLoginSchema = z
	.object({ type: z.literal("apiKey"), apiKey: boundedText(16_384) })
	.strict();
const ChatgptLoginSchema = z
	.object({
		type: z.literal("chatgpt"),
		codexStreamlinedLogin: z.boolean().optional(),
		useHostedLoginSuccessPage: z.boolean().optional(),
		appBrand: z.enum(["codex", "chatgpt"]).nullable().optional(),
	})
	.strict();
const DeviceCodeLoginSchema = z.object({ type: z.literal("chatgptDeviceCode") }).strict();
const AuthTokensLoginSchema = z
	.object({
		type: z.literal("chatgptAuthTokens"),
		accessToken: boundedText(16_384),
		chatgptAccountId: boundedText(256),
		chatgptPlanType: optionalNullableText(256),
	})
	.strict();
const BedrockApiKeyLoginSchema = z
	.object({
		type: z.literal("amazonBedrock"),
		apiKey: boundedText(16_384),
		region: boundedText(256),
	})
	.strict();
const BedrockAccessKeysLoginSchema = z
	.object({
		type: z.literal("amazonBedrockAccessKeys"),
		accessKeyId: boundedText(256),
		secretAccessKey: boundedText(16_384),
		sessionToken: optionalNullableText(16_384),
		region: boundedText(256),
	})
	.strict();

export const LoginAccountParamsSchema = codexIngressSchema<CodexLoginAccountParams>()(
	z.discriminatedUnion("type", [
		ApiKeyLoginSchema,
		ChatgptLoginSchema,
		DeviceCodeLoginSchema,
		AuthTokensLoginSchema,
		BedrockApiKeyLoginSchema,
		BedrockAccessKeysLoginSchema,
	]),
);
export type LoginAccountParams = z.infer<typeof LoginAccountParamsSchema>;

type SupportedLoginVariant = Extract<
	(typeof LOGIN_POLICIES)[number],
	{ readonly policy: "supported" }
>["variant"];
type SupportedCodexLoginAccountParams = Extract<
	CodexLoginAccountParams,
	{ type: SupportedLoginVariant }
>;

export const SupportedLoginAccountParamsSchema =
	codexIngressSchema<SupportedCodexLoginAccountParams>()(
		z.discriminatedUnion("type", [
			ApiKeyLoginSchema,
			ChatgptLoginSchema,
			BedrockApiKeyLoginSchema,
			BedrockAccessKeysLoginSchema,
		]),
	);
export type SupportedLoginAccountParams = z.infer<typeof SupportedLoginAccountParamsSchema>;

export const BedrockSetupParamsSchema = z.discriminatedUnion("type", [
	z
		.object({ type: z.literal("profile"), profile: boundedText(256), region: boundedText(256) })
		.strict(),
	z.object({ type: z.literal("environment"), region: boundedText(256) }).strict(),
]);
export type BedrockSetupParams = z.infer<typeof BedrockSetupParamsSchema>;

export const BEDROCK_SETUP_POLICIES = [
	{ variant: "profile", policy: "refused" },
	{ variant: "environment", policy: "refused" },
] as const;

export const UNSUPPORTED_TOKEN_REFRESH_ERROR = {
	code: -32601,
	message: "Client-managed ChatGPT token refresh is not supported",
} as const;

export const UNSUPPORTED_ATTESTATION_ERROR = {
	code: -32601,
	message: "Attestation is not supported by this client",
} as const;

export const ProtocolErrorSchema = z
	.object({ code: z.literal(-32601), message: boundedText(256), data: JsonValueSchema.optional() })
	.strict();

export const CurrentTimeReadResponseSchema = z
	.object({ currentTimeAt: NonNegativeIntegerSchema })
	.strict();

export type InitializeCapabilities = z.infer<typeof InitializeCapabilitiesSchema>;
export type LoginVariant = z.infer<typeof LoginVariantSchema>;
export type LoginPolicy = z.infer<typeof LoginPolicySchema>;
export type CurrentTimeReadResponse = z.infer<typeof CurrentTimeReadResponseSchema>;

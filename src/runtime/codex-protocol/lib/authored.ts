import { z } from "zod";

import type {
	CodexIngressConformance,
	CodexInitializeCapabilities,
	CodexLoginAccountParams,
	CodexOutputConformance,
} from "@/shared/codex-app-server-contract";
import {
	boundedText,
	JsonValueSchema,
	optionalNullableText,
} from "@/runtime/codex-protocol/lib/scalars";

/**
 * Proves a handwritten schema for a value Archboard sends to Codex against the generated
 * wire type, so a protocol bump fails at type-check rather than on the wire.
 * @returns An identity function that only accepts a schema whose output conforms to the wire type.
 */
function codexOutputSchema<Wire>() {
	return <Schema extends z.ZodType>(
		schema: Schema & CodexOutputConformance<Wire, z.output<Schema>>,
	): Schema => schema;
}

/**
 * Proves a handwritten schema for a value Archboard receives from Codex against the generated
 * wire type in both its input and output shapes.
 * @returns An identity function that only accepts a schema conforming to the wire type.
 */
function codexIngressSchema<Wire>() {
	return <Schema extends z.ZodType>(
		schema: Schema & CodexIngressConformance<Wire, z.input<Schema>, z.output<Schema>>,
	): Schema => schema;
}

const INITIALIZE_CAPABILITIES = Object.freeze({
	experimentalApi: true,
	requestAttestation: false,
	mcpServerOpenaiFormElicitation: true,
	optOutNotificationMethods: Object.freeze([]),
	extensions: Object.freeze({}),
} as const);

const InitializeCapabilitiesSchema = codexOutputSchema<CodexInitializeCapabilities>()(
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

const LOGIN_VARIANTS = [
	"apiKey",
	"chatgpt",
	"chatgptDeviceCode",
	"chatgptAuthTokens",
	"amazonBedrock",
	"amazonBedrockAccessKeys",
] as const;

const LoginVariantSchema = z.enum(LOGIN_VARIANTS);

const LOGIN_POLICIES = Object.freeze([
	Object.freeze({ variant: "apiKey", policy: "supported" }),
	Object.freeze({ variant: "chatgpt", policy: "supported" }),
	Object.freeze({ variant: "chatgptDeviceCode", policy: "refused" }),
	Object.freeze({ variant: "chatgptAuthTokens", policy: "refused" }),
	Object.freeze({ variant: "amazonBedrock", policy: "supported" }),
	Object.freeze({ variant: "amazonBedrockAccessKeys", policy: "supported" }),
] as const);

const LoginPolicySchema = z
	.object({ variant: LoginVariantSchema, policy: z.enum(["supported", "refused"]) })
	.strict();

/**
 * Builds the schema for one fixed login policy row, so the policy table can only be the
 * reviewed table and nothing else.
 * @param variant - The login variant the row describes.
 * @param policy - Whether Archboard supports or refuses that variant.
 * @returns A closed schema matching exactly that row.
 */
const ExactLoginPolicySchema = <
	Variant extends (typeof LOGIN_VARIANTS)[number],
	Policy extends "supported" | "refused",
>(
	variant: Variant,
	policy: Policy,
) => z.object({ variant: z.literal(variant), policy: z.literal(policy) }).strict();

const LoginPoliciesSchema = z.tuple([
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

type LoginAccountParams = CodexLoginAccountParams;

type SupportedLoginVariant = Extract<
	(typeof LOGIN_POLICIES)[number],
	{ readonly policy: "supported" }
>["variant"];
type SupportedCodexLoginAccountParams = Extract<
	CodexLoginAccountParams,
	{ type: SupportedLoginVariant }
>;

const SupportedLoginAccountParamsSchema = codexIngressSchema<SupportedCodexLoginAccountParams>()(
	z.discriminatedUnion("type", [
		ApiKeyLoginSchema,
		ChatgptLoginSchema,
		BedrockApiKeyLoginSchema,
		BedrockAccessKeysLoginSchema,
	]),
);
type SupportedLoginAccountParams = z.infer<typeof SupportedLoginAccountParamsSchema>;

const BedrockSetupParamsSchema = z.discriminatedUnion("type", [
	z
		.object({ type: z.literal("profile"), profile: boundedText(256), region: boundedText(256) })
		.strict(),
	z.object({ type: z.literal("environment"), region: boundedText(256) }).strict(),
]);
type BedrockSetupParams = z.infer<typeof BedrockSetupParamsSchema>;

const BEDROCK_SETUP_POLICIES = [
	{ variant: "profile", policy: "refused" },
	{ variant: "environment", policy: "refused" },
] as const;

const UNSUPPORTED_TOKEN_REFRESH_ERROR = {
	code: -32601,
	message: "Client-managed ChatGPT token refresh is not supported",
} as const;

const UNSUPPORTED_ATTESTATION_ERROR = {
	code: -32601,
	message: "Attestation is not supported by this client",
} as const;

const ProtocolErrorSchema = z
	.object({ code: z.literal(-32601), message: boundedText(256), data: JsonValueSchema.optional() })
	.strict();

type InitializeCapabilities = z.infer<typeof InitializeCapabilitiesSchema>;
type LoginVariant = z.infer<typeof LoginVariantSchema>;
type LoginPolicy = z.infer<typeof LoginPolicySchema>;

export {
	INITIALIZE_CAPABILITIES,
	InitializeCapabilitiesSchema,
	LOGIN_VARIANTS,
	LoginVariantSchema,
	LOGIN_POLICIES,
	LoginPolicySchema,
	LoginPoliciesSchema,
	type LoginAccountParams,
	SupportedLoginAccountParamsSchema,
	type SupportedLoginAccountParams,
	BedrockSetupParamsSchema,
	type BedrockSetupParams,
	BEDROCK_SETUP_POLICIES,
	UNSUPPORTED_TOKEN_REFRESH_ERROR,
	UNSUPPORTED_ATTESTATION_ERROR,
	ProtocolErrorSchema,
	type InitializeCapabilities,
	type LoginVariant,
	type LoginPolicy,
};

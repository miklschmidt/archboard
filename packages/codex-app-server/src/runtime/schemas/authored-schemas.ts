import { z } from "zod";

import type {
	CodexInitializeCapabilities,
	CodexLoginAccountParams,
} from "#shared/protocol/app-server-contract.ts";
import { boundedText, JsonValueSchema } from "#runtime/schemas/scalars.ts";
import { codexOutputSchema } from "#runtime/schemas/vendor-schema.ts";

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
 * @param policy - Whether the client supports or refuses that variant.
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

type LoginAccountParams = CodexLoginAccountParams;

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

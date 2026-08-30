import { createBrowserSchemas, DeliveryOutcomeSchema } from "./lib/browser.js";
import {
	createIdentitySchemas,
	JsonValueSchema,
	boundedText,
	boundedWireText,
	NonNegativeIntegerSchema,
	NullableNonNegativeIntegerSchema,
	SafeUrlSchema,
} from "./lib/scalars.js";
import { createServerRequestSchemas, SERVER_REQUEST_METHODS } from "./lib/server-requests.js";
import type { IdentityContext } from "./lib/scalars.js";

export {
	BEDROCK_SETUP_POLICIES,
	BedrockSetupParamsSchema,
	CurrentTimeReadResponseSchema,
	INITIALIZE_CAPABILITIES,
	InitializeCapabilitiesSchema,
	LoginAccountParamsSchema,
	LoginPoliciesSchema,
	LoginPolicySchema,
	LoginVariantSchema,
	LOGIN_POLICIES,
	LOGIN_VARIANTS,
	ProtocolErrorSchema,
	SupportedLoginAccountParamsSchema,
	UNSUPPORTED_ATTESTATION_ERROR,
	UNSUPPORTED_TOKEN_REFRESH_ERROR,
} from "./lib/authored.js";

export { DeliveryOutcomeSchema };
export {
	JsonValueSchema,
	NonNegativeIntegerSchema,
	NullableNonNegativeIntegerSchema,
	SafeUrlSchema,
	boundedText,
	boundedWireText,
};
export { SERVER_REQUEST_METHODS };

export function createCodexBrowserModel(context: IdentityContext) {
	const identity = createIdentitySchemas(context);
	return {
		...identity,
		...createBrowserSchemas(identity, context),
		...createServerRequestSchemas(identity),
	};
}

export type CodexBrowserModel = ReturnType<typeof createCodexBrowserModel>;

export type {
	BrowserAccount,
	BrowserApproval,
	BrowserApprovalResponse,
	BrowserCommand,
	BrowserCommandLease,
	BrowserCoordinator,
	BrowserDto,
	BrowserLogin,
	BrowserOperationOutcome,
	BrowserQueue,
	BrowserReadiness,
	BrowserSemanticDelivery,
	BrowserSettings,
	BrowserSnapshot,
	BrowserTextCommand,
	BrowserThreadLink,
	BrowserTimeline,
	BrowserToolResult,
	BrowserVoice,
	BrowserSchemas,
	DeliveryOutcome,
} from "./lib/browser.js";

export type {
	AnyIdentity,
	CodexIdentity,
	IdentityContext,
	IdentitySchemas,
	JsonValue,
} from "./lib/scalars.js";

export type {
	CodexServerRequest,
	ServerRequest,
	ServerRequestMethod,
	ServerRequestResult,
	ServerRequestSchemas,
} from "./lib/server-requests.js";

export type {
	CurrentTimeReadResponse,
	InitializeCapabilities,
	LoginAccountParams,
	LoginPolicy,
	LoginVariant,
	SupportedLoginAccountParams,
} from "./lib/authored.js";

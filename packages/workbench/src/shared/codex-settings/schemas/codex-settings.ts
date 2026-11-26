import { z } from "zod";

/** One role's selected Codex model, reasoning effort, and optional service tier. */
export const RoleModelSelectionSchema = z.object({
	model: z.string().min(1),
	effort: z.string().min(1),
	serviceTier: z.string().min(1).nullable(),
});

export type RoleModelSelection = z.infer<typeof RoleModelSelectionSchema>;

/** Persisted per-machine Codex model overrides for the orchestrator and workhorse. */
export const CodexModelPreferencesSchema = z.object({
	version: z.literal(1),
	orchestrator: RoleModelSelectionSchema.nullable(),
	workhorse: RoleModelSelectionSchema.nullable(),
});

export type CodexModelPreferences = z.infer<typeof CodexModelPreferencesSchema>;

/** One reasoning effort option advertised by a Codex model. */
export const CodexReasoningEffortOptionSchema = z.object({
	reasoningEffort: z.string().min(1),
	description: z.string(),
});

export type CodexReasoningEffortOption = z.infer<typeof CodexReasoningEffortOptionSchema>;

/** One service tier option advertised by a Codex model. */
export const CodexServiceTierOptionSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	description: z.string(),
});

export type CodexServiceTierOption = z.infer<typeof CodexServiceTierOptionSchema>;

/** One available model returned by the authenticated Codex app-server's model/list. */
export const CodexModelOptionSchema = z.object({
	id: z.string().min(1),
	model: z.string().min(1),
	displayName: z.string().min(1),
	description: z.string(),
	isDefault: z.boolean(),
	supportedReasoningEfforts: z.array(CodexReasoningEffortOptionSchema),
	defaultReasoningEffort: z.string().min(1),
	serviceTiers: z.array(CodexServiceTierOptionSchema),
	defaultServiceTier: z.string().min(1).nullable(),
});

export type CodexModelOption = z.infer<typeof CodexModelOptionSchema>;

/** Authenticated Codex account details shown in settings. */
export const CodexAuthAccountSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("chatgpt"),
		email: z.string().min(1).nullable(),
		planType: z.string().min(1),
		workspaceName: z.string().min(1).nullable(),
	}),
	z.object({
		type: z.literal("apiKey"),
	}),
	z.object({
		type: z.literal("amazonBedrock"),
		usesCodexManagedCredentials: z.boolean(),
	}),
	z.object({
		type: z.literal("gcp"),
	}),
]);

export type CodexAuthAccount = z.infer<typeof CodexAuthAccountSchema>;

/** Current authentication state of the running Codex app-server. */
export const CodexAuthStateSchema = z.discriminatedUnion("state", [
	z.object({
		state: z.literal("authenticated"),
		account: CodexAuthAccountSchema,
	}),
	z.object({
		state: z.literal("signed_out"),
		requiresOpenaiAuth: z.boolean(),
		reason: z.string().nullable(),
	}),
	z.object({
		state: z.literal("login_pending"),
		loginId: z.string().min(1),
		variant: z.enum(["chatgpt", "apiKey", "amazonBedrock", "amazonBedrockAccessKeys"]),
		authUrl: z.string().url().nullable(),
	}),
	z.object({
		state: z.literal("starting"),
		reason: z.string(),
	}),
	z.object({
		state: z.literal("unavailable"),
		reason: z.string(),
	}),
]);

export type CodexAuthState = z.infer<typeof CodexAuthStateSchema>;

/** Complete settings snapshot returned by /api/settings/codex routes. */
export const CodexSettingsReplySchema = z.object({
	success: z.literal(true),
	auth: CodexAuthStateSchema,
	models: z.array(CodexModelOptionSchema),
	modelError: z.string().nullable(),
	selection: CodexModelPreferencesSchema,
	defaults: z.object({
		orchestrator: RoleModelSelectionSchema,
		workhorse: RoleModelSelectionSchema,
	}),
});

export type CodexSettingsReply = z.infer<typeof CodexSettingsReplySchema>;

/** Payload sent to PUT /api/settings/codex. */
export const CodexSettingsSaveRequestSchema = z.object({
	orchestrator: RoleModelSelectionSchema,
	workhorse: RoleModelSelectionSchema,
});

export type CodexSettingsSaveRequest = z.infer<typeof CodexSettingsSaveRequestSchema>;

/** Payload sent to POST /api/settings/codex/login. */
export const CodexSettingsLoginRequestSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("chatgpt") }),
	z.object({ type: z.literal("apiKey"), apiKey: z.string().min(1) }),
]);

export type CodexSettingsLoginRequest = z.infer<typeof CodexSettingsLoginRequestSchema>;

/** Payload sent to POST /api/settings/codex/login/cancel. */
export const CodexSettingsCancelLoginRequestSchema = z.object({
	loginId: z.string().min(1),
});

export type CodexSettingsCancelLoginRequest = z.infer<typeof CodexSettingsCancelLoginRequestSchema>;

export type CodexSettingsFailureCode =
	| "REQUEST_INVALID"
	| "CODEX_UNAVAILABLE"
	| "CODEX_UNAUTHENTICATED"
	| "MODEL_LIST_FAILED"
	| "MODEL_SELECTION_INVALID"
	| "CODEX_CONFIG_INVALID"
	| "LOGIN_FAILED"
	| "LOGOUT_FAILED";

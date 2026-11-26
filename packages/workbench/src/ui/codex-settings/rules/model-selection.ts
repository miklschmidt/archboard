import type {
	CodexAuthState,
	CodexModelOption,
	CodexSettingsReply,
	RoleModelSelection,
} from "#shared/codex-settings/schemas/codex-settings.ts";

/** Sentinel select value representing an unset / default service tier (`null`). */
const DEFAULT_TIER_VALUE = "__default__";

/** Editable selection draft for one agent role. */
interface RoleModelDraft {
	readonly model: string;
	readonly effort: string;
	readonly serviceTier: string | null;
}

/** Editable selection draft for both roles in the Codex settings form. */
interface CodexModelDraft {
	readonly orchestrator: RoleModelDraft;
	readonly workhorse: RoleModelDraft;
}

/** One choice in a service tier dropdown. */
interface ServiceTierChoice {
	readonly value: string;
	readonly label: string;
	readonly description: string;
}

const EFFORT_LABELS: Readonly<Record<string, string>> = {
	none: "None",
	minimal: "Minimal",
	low: "Low",
	medium: "Medium",
	high: "High",
	xhigh: "Extra high",
};

const PLAN_LABELS: Readonly<Record<string, string>> = {
	free: "Free",
	go: "Go",
	plus: "Plus",
	pro: "Pro",
	prolite: "Pro Lite",
	team: "Team",
	self_serve_business_usage_based: "Business",
	business: "Business",
	enterprise_cbp_usage_based: "Enterprise",
	enterprise: "Enterprise",
	edu: "Edu",
	unknown: "ChatGPT",
};

/**
 * Format a Codex reasoning effort id as a concise display label.
 * @param effort Effort string advertised by Codex.
 * @returns Human-readable label.
 */
function formatEffortLabel(effort: string): string {
	const known = EFFORT_LABELS[effort];
	if (known !== undefined) return known;
	if (effort.length === 0) return "";
	return `${effort[0]!.toUpperCase()}${effort.slice(1)}`;
}

/**
 * Pick the default reasoning effort and service tier for a newly selected model.
 * @param model Model entry from model/list.
 * @returns Valid draft for that model.
 */
function defaultDraftForModel(model: CodexModelOption): RoleModelDraft {
	const effort = model.supportedReasoningEfforts.some(
		(entry) => entry.reasoningEffort === model.defaultReasoningEffort,
	)
		? model.defaultReasoningEffort
		: (model.supportedReasoningEfforts[0]?.reasoningEffort ?? model.defaultReasoningEffort);
	const serviceTier =
		model.defaultServiceTier !== null &&
		model.serviceTiers.some((tier) => tier.id === model.defaultServiceTier)
			? model.defaultServiceTier
			: null;
	return {
		model: model.model,
		effort,
		serviceTier,
	};
}

/**
 * Build the service tier options for one model strictly from its advertised service tiers.
 * Includes a "Standard (default)" option only when tiers are advertised and the default tier is null/unlisted.
 * @param model Selected model entry, or undefined when unavailable.
 * @returns Dropdown choices (empty when the model advertises no service tiers).
 */
function serviceTierChoicesForModel(
	model: CodexModelOption | undefined,
): readonly ServiceTierChoice[] {
	if (model === undefined || model.serviceTiers.length === 0) {
		return [];
	}
	const advertised = model.serviceTiers.map((tier) => ({
		value: tier.id,
		label: tier.name,
		description: tier.description,
	}));
	const includesDefault =
		model.defaultServiceTier !== null &&
		model.serviceTiers.some((tier) => tier.id === model.defaultServiceTier);
	if (includesDefault) {
		return advertised;
	}
	return [
		{
			value: DEFAULT_TIER_VALUE,
			label: "Standard (default)",
			description: "Use the model's default service tier.",
		},
		...advertised,
	];
}

/**
 * Resolve the service tier for a matched model against the preferred tier.
 * @param matched Advertised model entry.
 * @param preferredTier Saved or default service tier.
 * @returns Valid service tier id or null.
 */
function resolveMatchedServiceTier(
	matched: CodexModelOption,
	preferredTier: string | null,
): string | null {
	if (preferredTier !== null) {
		return matched.serviceTiers.some((tier) => tier.id === preferredTier)
			? preferredTier
			: defaultDraftForModel(matched).serviceTier;
	}
	const defaultTier = matched.defaultServiceTier;
	return defaultTier !== null && matched.serviceTiers.some((tier) => tier.id === defaultTier)
		? defaultTier
		: null;
}

/**
 * Resolve the initial role draft from saved preferences, server defaults, and live available models.
 * @param saved Saved override, or null when using defaults.
 * @param fallback Server-reported default for the role.
 * @param models Available models from the authenticated Codex app-server.
 * @returns Initial draft for the role.
 */
function resolveRoleDraft(
	saved: RoleModelSelection | null,
	fallback: RoleModelSelection,
	models: readonly CodexModelOption[],
): RoleModelDraft {
	if (models.length === 0) {
		return { model: "", effort: "", serviceTier: null };
	}
	const preferred = saved ?? fallback;
	const matched = models.find((entry) => entry.model === preferred.model);
	if (matched === undefined) {
		return defaultDraftForModel(models.find((entry) => entry.isDefault) ?? models[0]!);
	}
	const effortSupported = matched.supportedReasoningEfforts.some(
		(entry) => entry.reasoningEffort === preferred.effort,
	);
	return {
		model: matched.model,
		effort: effortSupported ? preferred.effort : defaultDraftForModel(matched).effort,
		serviceTier: resolveMatchedServiceTier(matched, preferred.serviceTier),
	};
}

/**
 * Resolve both orchestrator and workhorse form drafts from a settings reply.
 * @param reply Settings reply from the server.
 * @returns Initial form draft.
 */
function resolveCodexModelDraft(reply: CodexSettingsReply): CodexModelDraft {
	return {
		orchestrator: resolveRoleDraft(
			reply.selection.orchestrator,
			reply.defaults.orchestrator,
			reply.models,
		),
		workhorse: resolveRoleDraft(reply.selection.workhorse, reply.defaults.workhorse, reply.models),
	};
}

/**
 * Reconcile reasoning effort and service tier when the user switches a role to another model.
 * Keeps the previous effort/tier when supported by the new model; otherwise falls back to the new model's defaults.
 * @param current Current draft before switching.
 * @param nextModel Newly chosen model entry.
 * @returns Reconciled draft valid for the new model.
 */
function reconcileRoleForModelChange(
	current: RoleModelDraft,
	nextModel: CodexModelOption,
): RoleModelDraft {
	const fallback = defaultDraftForModel(nextModel);
	const effort = nextModel.supportedReasoningEfforts.some(
		(entry) => entry.reasoningEffort === current.effort,
	)
		? current.effort
		: fallback.effort;
	let serviceTier: string | null;
	if (current.serviceTier !== null) {
		serviceTier = nextModel.serviceTiers.some((tier) => tier.id === current.serviceTier)
			? current.serviceTier
			: fallback.serviceTier;
	} else {
		serviceTier = fallback.serviceTier;
	}
	return {
		model: nextModel.model,
		effort,
		serviceTier,
	};
}

/**
 * Check whether one role's draft names an available model, supported effort, and valid service tier.
 * @param draft Role draft.
 * @param models Available models.
 * @returns True when valid.
 */
function isRoleDraftValid(draft: RoleModelDraft, models: readonly CodexModelOption[]): boolean {
	const model = models.find((entry) => entry.model === draft.model);
	if (model === undefined) return false;
	if (!model.supportedReasoningEfforts.some((entry) => entry.reasoningEffort === draft.effort)) {
		return false;
	}
	if (
		draft.serviceTier !== null &&
		!model.serviceTiers.some((tier) => tier.id === draft.serviceTier)
	) {
		return false;
	}
	return true;
}

/**
 * Check whether both orchestrator and workhorse drafts are valid against live available models.
 * @param draft Full form draft.
 * @param models Available models.
 * @returns True when both roles are valid.
 */
function isCodexModelDraftValid(
	draft: CodexModelDraft,
	models: readonly CodexModelOption[],
): boolean {
	return isRoleDraftValid(draft.orchestrator, models) && isRoleDraftValid(draft.workhorse, models);
}

/**
 * Format a ChatGPT account record into primary email and plan/workspace subtitle.
 * @param account ChatGPT account details.
 * @returns Primary and secondary display lines.
 */
function formatChatgptAccount(
	account: Extract<
		Extract<CodexAuthState, { readonly state: "authenticated" }>["account"],
		{ readonly type: "chatgpt" }
	>,
): { readonly primary: string; readonly secondary: string } {
	const plan = PLAN_LABELS[account.planType] ?? account.planType;
	const secondary = account.workspaceName
		? `ChatGPT ${plan} · ${account.workspaceName}`
		: `ChatGPT ${plan}`;
	return { primary: account.email ?? "ChatGPT", secondary };
}

/**
 * Format an authenticated Codex account for the settings status plate.
 * @param auth Authenticated auth state.
 * @returns Primary and optional secondary lines.
 */
function formatAuthenticatedAccount(
	auth: Extract<CodexAuthState, { readonly state: "authenticated" }>,
): { readonly primary: string; readonly secondary: string | null } {
	if (auth.account.type === "chatgpt") {
		return formatChatgptAccount(auth.account);
	}
	if (auth.account.type === "apiKey") {
		return { primary: "OpenAI API key", secondary: "Signed in to Codex app-server" };
	}
	if (auth.account.type === "amazonBedrock") {
		return {
			primary: "Amazon Bedrock",
			secondary: auth.account.usesCodexManagedCredentials
				? "Codex-managed credentials"
				: "External AWS credentials",
		};
	}
	return { primary: "Google Cloud Vertex AI", secondary: "Signed in to Codex app-server" };
}

export {
	DEFAULT_TIER_VALUE,
	defaultDraftForModel,
	formatAuthenticatedAccount,
	formatEffortLabel,
	isCodexModelDraftValid,
	isRoleDraftValid,
	reconcileRoleForModelChange,
	resolveCodexModelDraft,
	resolveRoleDraft,
	serviceTierChoicesForModel,
	type CodexModelDraft,
	type RoleModelDraft,
	type ServiceTierChoice,
};

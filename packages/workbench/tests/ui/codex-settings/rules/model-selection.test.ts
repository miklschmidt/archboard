import { describe, expect, test } from "bun:test";
import type {
	CodexModelOption,
	CodexSettingsReply,
} from "#shared/codex-settings/schemas/codex-settings.ts";
import {
	DEFAULT_TIER_VALUE,
	formatAuthenticatedAccount,
	formatEffortLabel,
	isCodexModelDraftValid,
	reconcileRoleForModelChange,
	resolveCodexModelDraft,
	serviceTierChoicesForModel,
} from "#ui/codex-settings/rules/model-selection.ts";

const SOL: CodexModelOption = {
	id: "gpt-6-sol",
	model: "gpt-6-sol",
	displayName: "GPT-6 Sol",
	description: "Fast voice coordinator",
	isDefault: false,
	supportedReasoningEfforts: [
		{ reasoningEffort: "low", description: "Fast" },
		{ reasoningEffort: "medium", description: "Balanced" },
	],
	defaultReasoningEffort: "low",
	serviceTiers: [{ id: "priority", name: "Priority", description: "Low latency" }],
	defaultServiceTier: null,
};

const ASTRA: CodexModelOption = {
	id: "gpt-6-astra",
	model: "gpt-6-astra",
	displayName: "GPT-6 Astra",
	description: "Deep coding workhorse",
	isDefault: true,
	supportedReasoningEfforts: [
		{ reasoningEffort: "medium", description: "Balanced" },
		{ reasoningEffort: "xhigh", description: "Maximum reasoning" },
	],
	defaultReasoningEffort: "medium",
	serviceTiers: [],
	defaultServiceTier: null,
};

const EXPLICIT_TIER_MODEL: CodexModelOption = {
	...ASTRA,
	id: "gpt-explicit",
	model: "gpt-explicit",
	serviceTiers: [
		{ id: "standard", name: "Standard", description: "Default speed" },
		{ id: "priority", name: "Priority", description: "Fast" },
	],
	defaultServiceTier: "standard",
};

/**
 * Build a complete CodexSettingsReply fixture with optional overrides.
 * @param overrides Partial fields to override.
 * @returns Settings reply fixture.
 */
function makeReply(overrides: Partial<CodexSettingsReply> = {}): CodexSettingsReply {
	return {
		success: true,
		auth: {
			state: "authenticated",
			account: {
				type: "chatgpt",
				email: "dev@example.com",
				planType: "pro",
				workspaceName: "Core",
			},
		},
		models: [SOL, ASTRA],
		modelError: null,
		selection: { version: 1, orchestrator: null, workhorse: null, voiceLanguage: null },
		defaults: {
			orchestrator: { model: "gpt-6-sol", effort: "low", serviceTier: "priority" },
			workhorse: { model: "gpt-6-astra", effort: "medium", serviceTier: null },
		},
		...overrides,
	};
}

describe("codex model selection rules", () => {
	test("resolves defaults when authenticated and empties draft when unauthenticated", () => {
		const authedDraft = resolveCodexModelDraft(makeReply());
		expect(authedDraft).toEqual({
			orchestrator: { model: "gpt-6-sol", effort: "low", serviceTier: "priority" },
			workhorse: { model: "gpt-6-astra", effort: "medium", serviceTier: null },
			voiceLanguage: null,
		});
		expect(isCodexModelDraftValid(authedDraft, [SOL, ASTRA])).toBe(true);

		const signedOutDraft = resolveCodexModelDraft(
			makeReply({
				auth: { state: "signed_out", requiresOpenaiAuth: true, reason: null },
				models: [],
			}),
		);
		expect(signedOutDraft).toEqual({
			orchestrator: { model: "", effort: "", serviceTier: null },
			workhorse: { model: "", effort: "", serviceTier: null },
			voiceLanguage: null,
		});
		expect(isCodexModelDraftValid(signedOutDraft, [])).toBe(false);
	});

	test("reconciles effort and service tier when switching between models", () => {
		const switchedToAstra = reconcileRoleForModelChange(
			{ model: "gpt-6-sol", effort: "low", serviceTier: "priority" },
			ASTRA,
		);
		expect(switchedToAstra).toEqual({
			model: "gpt-6-astra",
			effort: "medium",
			serviceTier: null,
		});

		const keptEffort = reconcileRoleForModelChange(
			{ model: "gpt-6-sol", effort: "medium", serviceTier: "priority" },
			EXPLICIT_TIER_MODEL,
		);
		expect(keptEffort).toEqual({
			model: "gpt-explicit",
			effort: "medium",
			serviceTier: "priority",
		});
	});

	test("leaves unavailable configured models unselected until the user chooses an offered model", () => {
		const reply = makeReply({
			models: [ASTRA],
			selection: {
				version: 1,
				orchestrator: null,
				workhorse: { model: "retired-model", effort: "medium", serviceTier: null },
				voiceLanguage: null,
			},
		});
		const draft = resolveCodexModelDraft(reply);
		expect(draft.orchestrator.model).toBe("");
		expect(draft.workhorse.model).toBe("");
		expect(isCodexModelDraftValid(draft, reply.models)).toBe(false);
	});

	test("builds service tier choices strictly from advertised tiers", () => {
		expect(serviceTierChoicesForModel(ASTRA)).toEqual([]);
		expect(serviceTierChoicesForModel(SOL).map((c) => c.value)).toEqual([
			DEFAULT_TIER_VALUE,
			"priority",
		]);
		expect(serviceTierChoicesForModel(EXPLICIT_TIER_MODEL).map((c) => c.value)).toEqual([
			DEFAULT_TIER_VALUE,
			"standard",
			"priority",
		]);
	});

	test("keeps the default workhorse tier unset when the catalog names a default", () => {
		const reply = makeReply({
			models: [SOL, EXPLICIT_TIER_MODEL],
			defaults: {
				orchestrator: { model: SOL.model, effort: "low", serviceTier: "priority" },
				workhorse: { model: EXPLICIT_TIER_MODEL.model, effort: "medium", serviceTier: null },
			},
		});
		expect(resolveCodexModelDraft(reply).workhorse).toEqual(reply.defaults.workhorse);
		expect(
			reconcileRoleForModelChange(
				{ model: ASTRA.model, effort: "medium", serviceTier: null },
				EXPLICIT_TIER_MODEL,
			),
		).toEqual(reply.defaults.workhorse);
	});

	test("formats effort labels and authenticated account summaries", () => {
		expect(formatEffortLabel("xhigh")).toBe("Extra high");
		expect(formatEffortLabel("custom")).toBe("Custom");
		expect(
			formatAuthenticatedAccount({
				state: "authenticated",
				account: {
					type: "chatgpt",
					email: "dev@example.com",
					planType: "pro",
					workspaceName: "Core",
				},
			}),
		).toEqual({ primary: "dev@example.com", secondary: "ChatGPT Pro · Core" });
	});
});

const configFixture = {
	model: null,
	review_model: null,
	model_context_window: null,
	model_auto_compact_token_limit: null,
	model_auto_compact_token_limit_scope: null,
	model_provider: null,
	approval_policy: null,
	approvals_reviewer: null,
	sandbox_mode: null,
	sandbox_workspace_write: null,
	forced_chatgpt_workspace_id: null,
	forced_login_method: null,
	web_search: null,
	tools: null,
	instructions: null,
	developer_instructions: null,
	compact_prompt: null,
	model_reasoning_effort: null,
	model_reasoning_summary: null,
	model_verbosity: null,
	service_tier: null,
	analytics: null,
	apps: null,
	browser_use: null,
	computer_use: null,
	desktop: null,
};
const modelFixture = {
	id: "gpt-6-luna",
	model: "gpt-6-luna",
	upgrade: null,
	upgradeInfo: null,
	availabilityNux: null,
	displayName: "Luna",
	description: "production fixture",
	modelSpecialty: null,
	hidden: false,
	supportedReasoningEfforts: [{ reasoningEffort: "high", description: "fixture" }],
	defaultReasoningEffort: "high",
	inputModalities: ["text"],
	supportsPersonality: false,
	multiAgentVersion: null,
	additionalSpeedTiers: [],
	serviceTiers: [],
	defaultServiceTier: null,
	availableAccessPrograms: null,
	isDefault: true,
};

/** The model the coordinator runs on, listed with the effort it asks for. */
const coordinatorModelFixture = {
	...modelFixture,
	id: "gpt-6-sol",
	model: "gpt-6-sol",
	displayName: "Sol",
	supportedReasoningEfforts: [
		{ reasoningEffort: "low", description: "fixture" },
		{ reasoningEffort: "medium", description: "fixture" },
	],
	defaultReasoningEffort: "medium",
	isDefault: false,
};

/** Every model the fixture lists, the default first. */
const modelFixtures = [modelFixture, coordinatorModelFixture];

/** Thread fields this fixture never gives a value. */
const unsetThreadFields = {
	agentNickname: null,
	agentRole: null,
	gitInfo: null,
	name: null,
	environments: null,
	model: null,
	reasoningEffort: null,
	originator: null,
	daybreakEnabled: null,
};

/** The plan the workhorse turn reports, which reaches a client only as a notification. */
const workhorsePlan = {
	explanation: "Prove both reverse-request owners.",
	plan: [
		{ step: "Answer the command approval", status: "completed" },
		{ step: "Answer the dynamic tool call", status: "completed" },
	],
};

const breakdown = {
	totalTokens: 1_200,
	inputTokens: 1_000,
	cachedInputTokens: 600,
	cacheWriteInputTokens: 0,
	outputTokens: 200,
	reasoningOutputTokens: 50,
};

/** The thread token usage the workhorse turn reports. */
const workhorseTokenUsage = { total: breakdown, last: breakdown, modelContextWindow: 258_000 };

/** Now, as the Unix seconds Codex reports turn times in. */
const unixSeconds = (): number => Math.floor(Date.now() / 1000);

const dynamicItem = {
	type: "dynamicToolCall",
	id: "dynamic-call-1",
	namespace: "archboard_app",
	tool: "create_thread",
	arguments: { prompt: "Create the production proof thread." },
	status: "inProgress",
	contentItems: null,
	success: null,
	durationMs: null,
};

/** What the person sent, as the item Codex opens every turn's history with. */
const promptItem = (id: string, input: unknown) => ({
	type: "userMessage",
	id,
	clientId: null,
	content: input ?? [],
});

export type FixtureThread = Record<string, unknown> & {
	id: string;
	status: { type: string; activeFlags?: string[] };
	turns: Record<string, unknown>[];
};

/** The command approval that the controlled workhorse requests once. */
export function ordinaryApproval(threadId: string) {
	return {
		threadId,
		turnId: "turn-1",
		itemId: "approval-item-1",
		kind: "command",
		startedAtMs: Date.now(),
		approvalId: "ordinary-approval-1",
		environmentId: null,
		reason: "Prove the production approval route.",
		networkApprovalContext: null,
		command: "bun test",
		cwd: process.cwd(),
		commandActions: null,
		additionalPermissions: null,
		proposedExecpolicyAmendment: null,
		proposedNetworkPolicyAmendments: null,
		availableDecisions: ["accept", "decline", "cancel"],
	};
}

/** Finish the exact turn that a controlled interrupt names. */
export function interruptFixtureTurn(
	thread: FixtureThread | undefined,
	turnId: unknown,
	notify: (method: string, params: unknown) => void,
): void {
	const turn = thread?.turns.find((candidate) => candidate["id"] === turnId);
	if (thread === undefined || turn === undefined) return;
	turn["status"] = "interrupted";
	turn["completedAt"] = unixSeconds();
	thread.status = { type: "idle" };
	notify("turn/completed", { threadId: thread.id, turn });
	notify("thread/status/changed", { threadId: thread.id, status: thread.status });
}

export {
	configFixture,
	coordinatorModelFixture,
	dynamicItem,
	modelFixture,
	modelFixtures,
	promptItem,
	unixSeconds,
	unsetThreadFields,
	workhorsePlan,
	workhorseTokenUsage,
};

// The fixture is copied elsewhere before it runs, and this module is imported by its absolute
// path, so what the fixture needs from its other modules reaches it through here.
export { explainStep, narrating, speakAgain, startRealtime } from "./fake-codex-realtime.ts";

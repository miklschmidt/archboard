import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

export interface GeneratedNotificationUnionPath {
	readonly method: string;
	readonly path: string;
}

/**
 * Canonical inventory for the pinned generated notification graph.
 *
 * This is checked-in conformance metadata, not a test challenge list. The
 * extractor below derives the same paths from a fresh generator output so a
 * schema change cannot silently leave this inventory stale.
 */
export const CODEX_PROTOCOL_GENERATED_NOTIFICATION_UNION_PATHS = [
	{ method: "account/login/completed", path: "onboardingEntrypoint" },
	{ method: "account/rateLimits/updated", path: "rateLimits.credits" },
	{ method: "account/rateLimits/updated", path: "rateLimits.individualLimit" },
	{ method: "account/rateLimits/updated", path: "rateLimits.planType" },
	{ method: "account/rateLimits/updated", path: "rateLimits.primary" },
	{ method: "account/rateLimits/updated", path: "rateLimits.rateLimitReachedType" },
	{ method: "account/rateLimits/updated", path: "rateLimits.secondary" },
	{ method: "account/updated", path: "authMode" },
	{ method: "account/updated", path: "planType" },
	{ method: "app/list/updated", path: "data.appMetadata" },
	{ method: "app/list/updated", path: "data.appMetadata.review" },
	{ method: "app/list/updated", path: "data.branding" },
	{ method: "app/list/updated", path: "data.iconAssets" },
	{ method: "app/list/updated", path: "data.iconDarkAssets" },
	{ method: "app/list/updated", path: "data.labels" },
	{ method: "command/exec/outputDelta", path: "stream" },
	{ method: "error", path: "error.codexErrorInfo" },
	{ method: "error", path: "error.codexErrorInfo.activeTurnNotSteerable.turnKind" },
	{ method: "error", path: "error.misalignment" },
	{ method: "error", path: "error.misalignment.steer" },
	{ method: "externalAgentConfig/import/completed", path: "itemTypeResults.failures.itemType" },
	{ method: "externalAgentConfig/import/completed", path: "itemTypeResults.itemType" },
	{ method: "externalAgentConfig/import/completed", path: "itemTypeResults.successes.itemType" },
	{ method: "externalAgentConfig/import/progress", path: "itemTypeResults.failures.itemType" },
	{ method: "externalAgentConfig/import/progress", path: "itemTypeResults.itemType" },
	{ method: "externalAgentConfig/import/progress", path: "itemTypeResults.successes.itemType" },
	{ method: "fuzzyFileSearch/sessionUpdated", path: "files.match_type" },
	{ method: "hook/completed", path: "run.entries.kind" },
	{ method: "hook/completed", path: "run.eventName" },
	{ method: "hook/completed", path: "run.executionMode" },
	{ method: "hook/completed", path: "run.handlerType" },
	{ method: "hook/completed", path: "run.scope" },
	{ method: "hook/completed", path: "run.source" },
	{ method: "hook/completed", path: "run.status" },
	{ method: "hook/started", path: "run.entries.kind" },
	{ method: "hook/started", path: "run.eventName" },
	{ method: "hook/started", path: "run.executionMode" },
	{ method: "hook/started", path: "run.handlerType" },
	{ method: "hook/started", path: "run.scope" },
	{ method: "hook/started", path: "run.source" },
	{ method: "hook/started", path: "run.status" },
	{ method: "item/autoApprovalReview/completed", path: "action.command.source" },
	{ method: "item/autoApprovalReview/completed", path: "action.execve.source" },
	{ method: "item/autoApprovalReview/completed", path: "action.networkAccess.protocol" },
	{
		method: "item/autoApprovalReview/completed",
		path: "action.requestPermissions.permissions.fileSystem",
	},
	{
		method: "item/autoApprovalReview/completed",
		path: "action.requestPermissions.permissions.fileSystem.entries.access",
	},
	{
		method: "item/autoApprovalReview/completed",
		path: "action.requestPermissions.permissions.fileSystem.entries.path.special.value.kind",
	},
	{
		method: "item/autoApprovalReview/completed",
		path: "action.requestPermissions.permissions.fileSystem.entries.path.type",
	},
	{
		method: "item/autoApprovalReview/completed",
		path: "action.requestPermissions.permissions.network",
	},
	{ method: "item/autoApprovalReview/completed", path: "action.type" },
	{ method: "item/autoApprovalReview/completed", path: "decisionSource" },
	{ method: "item/autoApprovalReview/completed", path: "review.riskLevel" },
	{ method: "item/autoApprovalReview/completed", path: "review.status" },
	{ method: "item/autoApprovalReview/completed", path: "review.userAuthorization" },
	{ method: "item/autoApprovalReview/started", path: "action.command.source" },
	{ method: "item/autoApprovalReview/started", path: "action.execve.source" },
	{ method: "item/autoApprovalReview/started", path: "action.networkAccess.protocol" },
	{
		method: "item/autoApprovalReview/started",
		path: "action.requestPermissions.permissions.fileSystem",
	},
	{
		method: "item/autoApprovalReview/started",
		path: "action.requestPermissions.permissions.fileSystem.entries.access",
	},
	{
		method: "item/autoApprovalReview/started",
		path: "action.requestPermissions.permissions.fileSystem.entries.path.special.value.kind",
	},
	{
		method: "item/autoApprovalReview/started",
		path: "action.requestPermissions.permissions.fileSystem.entries.path.type",
	},
	{
		method: "item/autoApprovalReview/started",
		path: "action.requestPermissions.permissions.network",
	},
	{ method: "item/autoApprovalReview/started", path: "action.type" },
	{ method: "item/autoApprovalReview/started", path: "review.riskLevel" },
	{ method: "item/autoApprovalReview/started", path: "review.status" },
	{ method: "item/autoApprovalReview/started", path: "review.userAuthorization" },
	{ method: "item/completed", path: "item.agentMessage.delivery" },
	{ method: "item/completed", path: "item.agentMessage.memoryCitation" },
	{ method: "item/completed", path: "item.agentMessage.phase" },
	{ method: "item/completed", path: "item.collabAgentToolCall.agentsStates.status" },
	{ method: "item/completed", path: "item.collabAgentToolCall.status" },
	{ method: "item/completed", path: "item.collabAgentToolCall.tool" },
	{ method: "item/completed", path: "item.commandExecution.commandActions.type" },
	{ method: "item/completed", path: "item.commandExecution.source" },
	{ method: "item/completed", path: "item.commandExecution.status" },
	{ method: "item/completed", path: "item.dynamicToolCall.contentItems.type" },
	{ method: "item/completed", path: "item.dynamicToolCall.status" },
	{ method: "item/completed", path: "item.fileChange.changes.kind.type" },
	{ method: "item/completed", path: "item.fileChange.status" },
	{ method: "item/completed", path: "item.functionCallOutput.output" },
	{ method: "item/completed", path: "item.functionCallOutput.output.input_image.detail" },
	{ method: "item/completed", path: "item.functionCallOutput.output.type" },
	{ method: "item/completed", path: "item.imageGeneration.failure.type" },
	{ method: "item/completed", path: "item.mcpToolCall.appContext" },
	{ method: "item/completed", path: "item.mcpToolCall.error" },
	{ method: "item/completed", path: "item.mcpToolCall.result" },
	{ method: "item/completed", path: "item.mcpToolCall.status" },
	{ method: "item/completed", path: "item.subAgentActivity.kind" },
	{ method: "item/completed", path: "item.type" },
	{ method: "item/completed", path: "item.userMessage.content.image.detail" },
	{ method: "item/completed", path: "item.userMessage.content.localImage.detail" },
	{ method: "item/completed", path: "item.userMessage.content.type" },
	{ method: "item/completed", path: "item.webSearch.action.type" },
	{ method: "item/fileChange/patchUpdated", path: "changes.kind.type" },
	{ method: "item/started", path: "item.agentMessage.delivery" },
	{ method: "item/started", path: "item.agentMessage.memoryCitation" },
	{ method: "item/started", path: "item.agentMessage.phase" },
	{ method: "item/started", path: "item.collabAgentToolCall.agentsStates.status" },
	{ method: "item/started", path: "item.collabAgentToolCall.status" },
	{ method: "item/started", path: "item.collabAgentToolCall.tool" },
	{ method: "item/started", path: "item.commandExecution.commandActions.type" },
	{ method: "item/started", path: "item.commandExecution.source" },
	{ method: "item/started", path: "item.commandExecution.status" },
	{ method: "item/started", path: "item.dynamicToolCall.contentItems.type" },
	{ method: "item/started", path: "item.dynamicToolCall.status" },
	{ method: "item/started", path: "item.fileChange.changes.kind.type" },
	{ method: "item/started", path: "item.fileChange.status" },
	{ method: "item/started", path: "item.functionCallOutput.output" },
	{ method: "item/started", path: "item.functionCallOutput.output.input_image.detail" },
	{ method: "item/started", path: "item.functionCallOutput.output.type" },
	{ method: "item/started", path: "item.imageGeneration.failure.type" },
	{ method: "item/started", path: "item.mcpToolCall.appContext" },
	{ method: "item/started", path: "item.mcpToolCall.error" },
	{ method: "item/started", path: "item.mcpToolCall.result" },
	{ method: "item/started", path: "item.mcpToolCall.status" },
	{ method: "item/started", path: "item.subAgentActivity.kind" },
	{ method: "item/started", path: "item.type" },
	{ method: "item/started", path: "item.userMessage.content.image.detail" },
	{ method: "item/started", path: "item.userMessage.content.localImage.detail" },
	{ method: "item/started", path: "item.userMessage.content.type" },
	{ method: "item/started", path: "item.webSearch.action.type" },
	{ method: "mcpServer/startupStatus/updated", path: "failureReason" },
	{ method: "mcpServer/startupStatus/updated", path: "status" },
	{ method: "model/rerouted", path: "reason" },
	{ method: "model/verification", path: "verifications" },
	{ method: "process/outputDelta", path: "stream" },
	{ method: "project/changed", path: "changeType" },
	{ method: "rawResponse/completed", path: "usage" },
	{ method: "rawResponse/completed", path: "usageMetadata" },
	{ method: "rawResponseItem/completed", path: "item.agent_message.content.type" },
	{ method: "rawResponseItem/completed", path: "item.custom_tool_call_output.output" },
	{
		method: "rawResponseItem/completed",
		path: "item.custom_tool_call_output.output.input_image.detail",
	},
	{ method: "rawResponseItem/completed", path: "item.custom_tool_call_output.output.type" },
	{ method: "rawResponseItem/completed", path: "item.function_call_output.output" },
	{
		method: "rawResponseItem/completed",
		path: "item.function_call_output.output.input_image.detail",
	},
	{ method: "rawResponseItem/completed", path: "item.function_call_output.output.type" },
	{ method: "rawResponseItem/completed", path: "item.local_shell_call.action.env" },
	{ method: "rawResponseItem/completed", path: "item.local_shell_call.action.type" },
	{ method: "rawResponseItem/completed", path: "item.local_shell_call.status" },
	{ method: "rawResponseItem/completed", path: "item.message.content.input_image.detail" },
	{ method: "rawResponseItem/completed", path: "item.message.content.type" },
	{ method: "rawResponseItem/completed", path: "item.message.phase" },
	{ method: "rawResponseItem/completed", path: "item.reasoning.content.type" },
	{ method: "rawResponseItem/completed", path: "item.reasoning.summary.type" },
	{ method: "rawResponseItem/completed", path: "item.type" },
	{ method: "rawResponseItem/completed", path: "item.web_search_call.action.type" },
	{ method: "remoteControl/status/changed", path: "status" },
	{ method: "serverRequest/resolved", path: "requestId" },
	{ method: "thread/goal/updated", path: "goal.status" },
	{ method: "thread/realtime/item/completed", path: "item.bemItemPromoted.presentation.type" },
	{ method: "thread/realtime/item/completed", path: "item.realtimeSessionClosed.outcome" },
	{ method: "thread/realtime/item/completed", path: "item.transcriptSegment.role" },
	{ method: "thread/realtime/item/completed", path: "item.type" },
	{ method: "thread/realtime/item/started", path: "item.bemItemPromoted.presentation.type" },
	{ method: "thread/realtime/item/started", path: "item.realtimeSessionClosed.outcome" },
	{ method: "thread/realtime/item/started", path: "item.transcriptSegment.role" },
	{ method: "thread/realtime/item/started", path: "item.type" },
	{ method: "thread/realtime/started", path: "version" },
	{ method: "thread/settings/updated", path: "threadSettings.activePermissionProfile" },
	{ method: "thread/settings/updated", path: "threadSettings.approvalPolicy" },
	{ method: "thread/settings/updated", path: "threadSettings.approvalsReviewer" },
	{ method: "thread/settings/updated", path: "threadSettings.collaborationMode.mode" },
	{ method: "thread/settings/updated", path: "threadSettings.multiAgentMode" },
	{ method: "thread/settings/updated", path: "threadSettings.personality" },
	{
		method: "thread/settings/updated",
		path: "threadSettings.sandboxPolicy.externalSandbox.networkAccess",
	},
	{ method: "thread/settings/updated", path: "threadSettings.sandboxPolicy.type" },
	{ method: "thread/settings/updated", path: "threadSettings.summary" },
	{ method: "thread/started", path: "thread.gitInfo" },
	{ method: "thread/started", path: "thread.historyMode" },
	{ method: "thread/started", path: "thread.section" },
	{ method: "thread/started", path: "thread.section.appearance" },
	{ method: "thread/started", path: "thread.source" },
	{ method: "thread/started", path: "thread.source.subAgent" },
	{ method: "thread/started", path: "thread.status.active.activeFlags" },
	{ method: "thread/started", path: "thread.status.type" },
	{ method: "thread/started", path: "thread.turns.error" },
	{ method: "thread/started", path: "thread.turns.error.codexErrorInfo" },
	{
		method: "thread/started",
		path: "thread.turns.error.codexErrorInfo.activeTurnNotSteerable.turnKind",
	},
	{ method: "thread/started", path: "thread.turns.error.misalignment" },
	{ method: "thread/started", path: "thread.turns.error.misalignment.steer" },
	{ method: "thread/started", path: "thread.turns.items.agentMessage.delivery" },
	{ method: "thread/started", path: "thread.turns.items.agentMessage.memoryCitation" },
	{ method: "thread/started", path: "thread.turns.items.agentMessage.phase" },
	{ method: "thread/started", path: "thread.turns.items.collabAgentToolCall.agentsStates.status" },
	{ method: "thread/started", path: "thread.turns.items.collabAgentToolCall.status" },
	{ method: "thread/started", path: "thread.turns.items.collabAgentToolCall.tool" },
	{ method: "thread/started", path: "thread.turns.items.commandExecution.commandActions.type" },
	{ method: "thread/started", path: "thread.turns.items.commandExecution.source" },
	{ method: "thread/started", path: "thread.turns.items.commandExecution.status" },
	{ method: "thread/started", path: "thread.turns.items.dynamicToolCall.contentItems.type" },
	{ method: "thread/started", path: "thread.turns.items.dynamicToolCall.status" },
	{ method: "thread/started", path: "thread.turns.items.fileChange.changes.kind.type" },
	{ method: "thread/started", path: "thread.turns.items.fileChange.status" },
	{ method: "thread/started", path: "thread.turns.items.functionCallOutput.output" },
	{
		method: "thread/started",
		path: "thread.turns.items.functionCallOutput.output.input_image.detail",
	},
	{ method: "thread/started", path: "thread.turns.items.functionCallOutput.output.type" },
	{ method: "thread/started", path: "thread.turns.items.imageGeneration.failure.type" },
	{ method: "thread/started", path: "thread.turns.items.mcpToolCall.appContext" },
	{ method: "thread/started", path: "thread.turns.items.mcpToolCall.error" },
	{ method: "thread/started", path: "thread.turns.items.mcpToolCall.result" },
	{ method: "thread/started", path: "thread.turns.items.mcpToolCall.status" },
	{ method: "thread/started", path: "thread.turns.items.subAgentActivity.kind" },
	{ method: "thread/started", path: "thread.turns.items.type" },
	{ method: "thread/started", path: "thread.turns.items.userMessage.content.image.detail" },
	{ method: "thread/started", path: "thread.turns.items.userMessage.content.localImage.detail" },
	{ method: "thread/started", path: "thread.turns.items.userMessage.content.type" },
	{ method: "thread/started", path: "thread.turns.items.webSearch.action.type" },
	{ method: "thread/started", path: "thread.turns.itemsView" },
	{ method: "thread/started", path: "thread.turns.status" },
	{ method: "thread/status/changed", path: "status.active.activeFlags" },
	{ method: "thread/status/changed", path: "status.type" },
	{ method: "turn/completed", path: "turn.error" },
	{ method: "turn/completed", path: "turn.error.codexErrorInfo" },
	{ method: "turn/completed", path: "turn.error.codexErrorInfo.activeTurnNotSteerable.turnKind" },
	{ method: "turn/completed", path: "turn.error.misalignment" },
	{ method: "turn/completed", path: "turn.error.misalignment.steer" },
	{ method: "turn/completed", path: "turn.items.agentMessage.delivery" },
	{ method: "turn/completed", path: "turn.items.agentMessage.memoryCitation" },
	{ method: "turn/completed", path: "turn.items.agentMessage.phase" },
	{ method: "turn/completed", path: "turn.items.collabAgentToolCall.agentsStates.status" },
	{ method: "turn/completed", path: "turn.items.collabAgentToolCall.status" },
	{ method: "turn/completed", path: "turn.items.collabAgentToolCall.tool" },
	{ method: "turn/completed", path: "turn.items.commandExecution.commandActions.type" },
	{ method: "turn/completed", path: "turn.items.commandExecution.source" },
	{ method: "turn/completed", path: "turn.items.commandExecution.status" },
	{ method: "turn/completed", path: "turn.items.dynamicToolCall.contentItems.type" },
	{ method: "turn/completed", path: "turn.items.dynamicToolCall.status" },
	{ method: "turn/completed", path: "turn.items.fileChange.changes.kind.type" },
	{ method: "turn/completed", path: "turn.items.fileChange.status" },
	{ method: "turn/completed", path: "turn.items.functionCallOutput.output" },
	{ method: "turn/completed", path: "turn.items.functionCallOutput.output.input_image.detail" },
	{ method: "turn/completed", path: "turn.items.functionCallOutput.output.type" },
	{ method: "turn/completed", path: "turn.items.imageGeneration.failure.type" },
	{ method: "turn/completed", path: "turn.items.mcpToolCall.appContext" },
	{ method: "turn/completed", path: "turn.items.mcpToolCall.error" },
	{ method: "turn/completed", path: "turn.items.mcpToolCall.result" },
	{ method: "turn/completed", path: "turn.items.mcpToolCall.status" },
	{ method: "turn/completed", path: "turn.items.subAgentActivity.kind" },
	{ method: "turn/completed", path: "turn.items.type" },
	{ method: "turn/completed", path: "turn.items.userMessage.content.image.detail" },
	{ method: "turn/completed", path: "turn.items.userMessage.content.localImage.detail" },
	{ method: "turn/completed", path: "turn.items.userMessage.content.type" },
	{ method: "turn/completed", path: "turn.items.webSearch.action.type" },
	{ method: "turn/completed", path: "turn.itemsView" },
	{ method: "turn/completed", path: "turn.status" },
	{ method: "turn/plan/updated", path: "plan.status" },
	{ method: "turn/started", path: "turn.error" },
	{ method: "turn/started", path: "turn.error.codexErrorInfo" },
	{ method: "turn/started", path: "turn.error.codexErrorInfo.activeTurnNotSteerable.turnKind" },
	{ method: "turn/started", path: "turn.error.misalignment" },
	{ method: "turn/started", path: "turn.error.misalignment.steer" },
	{ method: "turn/started", path: "turn.items.agentMessage.delivery" },
	{ method: "turn/started", path: "turn.items.agentMessage.memoryCitation" },
	{ method: "turn/started", path: "turn.items.agentMessage.phase" },
	{ method: "turn/started", path: "turn.items.collabAgentToolCall.agentsStates.status" },
	{ method: "turn/started", path: "turn.items.collabAgentToolCall.status" },
	{ method: "turn/started", path: "turn.items.collabAgentToolCall.tool" },
	{ method: "turn/started", path: "turn.items.commandExecution.commandActions.type" },
	{ method: "turn/started", path: "turn.items.commandExecution.source" },
	{ method: "turn/started", path: "turn.items.commandExecution.status" },
	{ method: "turn/started", path: "turn.items.dynamicToolCall.contentItems.type" },
	{ method: "turn/started", path: "turn.items.dynamicToolCall.status" },
	{ method: "turn/started", path: "turn.items.fileChange.changes.kind.type" },
	{ method: "turn/started", path: "turn.items.fileChange.status" },
	{ method: "turn/started", path: "turn.items.functionCallOutput.output" },
	{ method: "turn/started", path: "turn.items.functionCallOutput.output.input_image.detail" },
	{ method: "turn/started", path: "turn.items.functionCallOutput.output.type" },
	{ method: "turn/started", path: "turn.items.imageGeneration.failure.type" },
	{ method: "turn/started", path: "turn.items.mcpToolCall.appContext" },
	{ method: "turn/started", path: "turn.items.mcpToolCall.error" },
	{ method: "turn/started", path: "turn.items.mcpToolCall.result" },
	{ method: "turn/started", path: "turn.items.mcpToolCall.status" },
	{ method: "turn/started", path: "turn.items.subAgentActivity.kind" },
	{ method: "turn/started", path: "turn.items.type" },
	{ method: "turn/started", path: "turn.items.userMessage.content.image.detail" },
	{ method: "turn/started", path: "turn.items.userMessage.content.localImage.detail" },
	{ method: "turn/started", path: "turn.items.userMessage.content.type" },
	{ method: "turn/started", path: "turn.items.webSearch.action.type" },
	{ method: "turn/started", path: "turn.itemsView" },
	{ method: "turn/started", path: "turn.status" },
	{ method: "windowsSandbox/setupCompleted", path: "mode" },
] as const satisfies readonly GeneratedNotificationUnionPath[];

type Expr =
	| { kind: "array"; element: Expr }
	| { kind: "intersection"; parts: Expr[] }
	| { kind: "keyword"; name: string }
	| { kind: "literal"; value: boolean | number | string | null }
	| { kind: "object"; fields: Field[]; indexValue?: Expr }
	| { kind: "ref"; args: Expr[]; name: string }
	| { kind: "union"; parts: Expr[] };

interface Field {
	readonly name: string;
	readonly type: Expr;
}

interface ResolvedField extends Field {
	readonly filePath: string;
}

interface Token {
	readonly kind?: "number" | "string";
	readonly value: string;
}

interface GeneratedFile {
	readonly aliases: Map<string, Expr>;
	readonly imports: Map<string, string>;
}

interface AliasRef {
	readonly filePath: string;
	readonly name: string;
	readonly expr: Expr;
}

interface WalkState {
	readonly files: Map<string, GeneratedFile>;
	readonly paths: Set<string>;
	readonly aliases: ReadonlySet<string>;
}

const OPEN_TYPE_NAMES = ["JsonObject", "JsonValue", "any", "unknown"] as const;

function isOpenTypeName(name: string): boolean {
	return OPEN_TYPE_NAMES.includes(name as (typeof OPEN_TYPE_NAMES)[number]);
}

function sourceFiles(root: string, prefix = ""): string[] {
	return readdirSync(join(root, prefix), { withFileTypes: true }).flatMap((entry) => {
		const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) return sourceFiles(root, relativePath);
		return entry.isFile() && extname(entry.name) === ".ts" ? [join(root, relativePath)] : [];
	});
}

function tokenize(source: string): Token[] {
	const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\r\n]*/g, "");
	const tokens: Token[] = [];
	for (let index = 0; index < withoutComments.length;) {
		const character = withoutComments[index]!;
		if (/\s/.test(character)) {
			index += 1;
			continue;
		}
		if (character === '"' || character === "'") {
			const quote = character;
			let end = index + 1;
			let value = "";
			while (end < withoutComments.length && withoutComments[end] !== quote) {
				if (withoutComments[end] === "\\" && end + 1 < withoutComments.length) end += 1;
				value += withoutComments[end];
				end += 1;
			}
			tokens.push({ kind: "string", value });
			index = end + 1;
			continue;
		}
		const identifier = withoutComments.slice(index).match(/^[A-Za-z_$][A-Za-z0-9_$]*/)?.[0];
		if (identifier) {
			tokens.push({ value: identifier });
			index += identifier.length;
			continue;
		}
		const number = withoutComments.slice(index).match(/^(?:\d+\.?)\d*/)?.[0];
		if (number) {
			tokens.push({ kind: "number", value: number });
			index += number.length;
			continue;
		}
		tokens.push({ value: character });
		index += 1;
	}
	return tokens;
}

class TypeParser {
	private index = 0;

	constructor(private readonly tokens: readonly Token[]) {}

	peek(): string {
		return this.tokens[this.index]?.value ?? "";
	}

	consume(value?: string): string {
		const token = this.tokens[this.index]?.value ?? "";
		if (value && token !== value)
			throw new Error(
				`Generated type parser expected ${value}, received ${token} at token ${this.index} (${this.tokens
					.slice(Math.max(0, this.index - 4), this.index + 4)
					.map((candidate) => candidate.value)
					.join(" ")})`,
			);
		this.index += 1;
		return token;
	}

	parseType(): Expr {
		const parts = [this.parseIntersection()];
		while (this.peek() === "|") {
			this.consume("|");
			parts.push(this.parseIntersection());
		}
		return parts.length === 1 ? parts[0]! : { kind: "union", parts };
	}

	private parseIntersection(): Expr {
		const parts = [this.parsePrimary()];
		while (this.peek() === "&") {
			this.consume("&");
			parts.push(this.parsePrimary());
		}
		return parts.length === 1 ? parts[0]! : { kind: "intersection", parts };
	}

	private parsePrimary(): Expr {
		let expression: Expr;
		if (this.peek() === "(") {
			this.consume("(");
			expression = this.parseType();
			this.consume(")");
		} else if (this.peek() === "{") {
			expression = this.parseObject();
		} else {
			const token = this.tokens[this.index];
			const value = this.consume();
			if (token?.kind === "string") {
				expression = { kind: "literal", value };
			} else if (token?.kind === "number") {
				expression = { kind: "literal", value: Number(value) };
			} else if (value === "true" || value === "false") {
				expression = { kind: "literal", value: value === "true" };
			} else if (value === "null") {
				expression = { kind: "literal", value: null };
			} else if (
				value === "string" ||
				value === "number" ||
				value === "boolean" ||
				value === "unknown"
			) {
				expression = { kind: "keyword", name: value };
			} else {
				const args: Expr[] = [];
				if (this.peek() === "<") {
					this.consume("<");
					while (this.peek() && this.peek() !== ">") {
						args.push(this.parseType());
						if (this.peek() === ",") this.consume(",");
					}
					this.consume(">");
				}
				expression = { kind: "ref", name: value, args };
			}
		}
		while (this.peek() === "[" && this.tokens[this.index + 1]?.value === "]") {
			this.consume("[");
			this.consume("]");
			expression = { kind: "array", element: expression };
		}
		return expression;
	}

	private parseObject(): Expr {
		this.consume("{");
		const fields: Field[] = [];
		let indexValue: Expr | undefined;
		while (this.peek() && this.peek() !== "}") {
			if (this.peek() === "," || this.peek() === ";") {
				this.consume();
				continue;
			}
			if (this.peek() === "[") {
				while (this.peek() && this.peek() !== "]") this.consume();
				this.consume("]");
				if (this.peek() === "?") this.consume("?");
				this.consume(":");
				indexValue = this.parseType();
				continue;
			}
			const name = this.consume();
			if (this.peek() === "?") this.consume("?");
			this.consume(":");
			fields.push({ name, type: this.parseType() });
		}
		this.consume("}");
		return { kind: "object", fields, ...(indexValue ? { indexValue } : {}) };
	}
}

function parseAliases(source: string, filePath: string): Map<string, Expr> {
	const tokens = tokenize(source);
	const aliases = new Map<string, Expr>();
	for (let index = 0; index + 3 < tokens.length; index += 1) {
		if (tokens[index]!.value !== "export" || tokens[index + 1]!.value !== "type") continue;
		if (tokens[index + 3]!.value !== "=") continue;
		const name = tokens[index + 2]!.value;
		try {
			const parser = new TypeParser(tokens.slice(index + 4));
			aliases.set(name, parser.parseType());
		} catch (error) {
			throw new Error(
				`Generated type parser failed in ${filePath}, alias ${name}: ${error instanceof Error ? error.message : String(error)}`,
				{ cause: error },
			);
		}
	}
	return aliases;
}

function parseImports(source: string, filePath: string): Map<string, string> {
	const imports = new Map<string, string>();
	const importPattern = /import\s+type\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/g;
	for (const match of source.matchAll(importPattern)) {
		const target = resolve(dirname(filePath), `${match[2]!}.ts`);
		for (const imported of match[1]!.split(",")) {
			const [sourceName, localName] = imported.trim().split(/\s+as\s+/);
			if (sourceName) imports.set(localName ?? sourceName, target);
		}
	}
	return imports;
}

function loadFiles(root: string): Map<string, GeneratedFile> {
	const files = new Map<string, GeneratedFile>();
	for (const rawPath of sourceFiles(root)) {
		const filePath = resolve(rawPath);
		const source = readFileSync(filePath, "utf8");
		files.set(filePath, {
			aliases: parseAliases(source, filePath),
			imports: parseImports(source, filePath),
		});
	}
	return files;
}

function resolveAlias(
	filePath: string,
	name: string,
	files: Map<string, GeneratedFile>,
): AliasRef | null {
	const file = files.get(filePath);
	if (!file) return null;
	const local = file.aliases.get(name);
	if (local) return { filePath, name, expr: local };
	const importedPath = file.imports.get(name);
	const imported = importedPath ? files.get(importedPath)?.aliases.get(name) : undefined;
	return importedPath && imported ? { filePath: importedPath, name, expr: imported } : null;
}

function literalValue(expression: Expr): string | null {
	return expression.kind === "literal" && expression.value !== null
		? String(expression.value)
		: null;
}

function isNull(expression: Expr): boolean {
	return expression.kind === "literal" && expression.value === null;
}

function objectFields(
	expression: Expr,
	filePath: string,
	files: Map<string, GeneratedFile>,
	seen = new Set<string>(),
): ResolvedField[] | null {
	if (expression.kind === "object")
		return expression.fields.map((field) => ({ ...field, filePath }));
	if (expression.kind === "intersection")
		return expression.parts.flatMap((part) => objectFields(part, filePath, files, seen) ?? []);
	if (expression.kind !== "ref") return null;
	const alias = resolveAlias(filePath, expression.name, files);
	if (!alias || seen.has(`${alias.filePath}:${alias.name}`)) return null;
	seen.add(`${alias.filePath}:${alias.name}`);
	return objectFields(alias.expr, alias.filePath, files, seen);
}

function unionParts(
	expression: Expr,
	filePath: string,
	files: Map<string, GeneratedFile>,
	seen = new Set<string>(),
): Array<{ expression: Expr; filePath: string }> {
	if (expression.kind === "union")
		return expression.parts.flatMap((part) => unionParts(part, filePath, files, seen));
	if (expression.kind !== "ref") return [{ expression, filePath }];
	if (isOpenTypeName(expression.name)) return [{ expression, filePath }];
	const alias = resolveAlias(filePath, expression.name, files);
	if (!alias || seen.has(`${alias.filePath}:${alias.name}`)) return [{ expression, filePath }];
	seen.add(`${alias.filePath}:${alias.name}`);
	return unionParts(alias.expr, alias.filePath, files, seen);
}

function discriminator(
	parts: Array<{ expression: Expr; filePath: string }>,
	files: Map<string, GeneratedFile>,
): { name: string; values: string[] } | null {
	const objects = parts.map((part) => objectFields(part.expression, part.filePath, files));
	if (!objects.length || objects.some((fields) => fields === null)) return null;
	const candidates = objects[0]!.map((field) => field.name);
	for (const name of candidates) {
		const values = objects.map((fields) => {
			const field = fields!.find((candidate) => candidate.name === name);
			return field ? literalValue(field.type) : null;
		});
		if (values.every((value): value is string => value !== null)) return { name, values };
	}
	return null;
}

function isOpen(expression: Expr, filePath: string, files: Map<string, GeneratedFile>): boolean {
	if (expression.kind === "keyword") return true;
	if (expression.kind !== "ref") return false;
	if (isOpenTypeName(expression.name)) return true;
	const alias = resolveAlias(filePath, expression.name, files);
	return alias ? isOpen(alias.expr, alias.filePath, files) : true;
}

function addPath(state: WalkState, method: string, path: readonly string[]): void {
	if (path.length) state.paths.add(`${method}:${path.join(".")}`);
}

function walkObject(
	expression: Expr,
	filePath: string,
	method: string,
	path: readonly string[],
	state: WalkState,
	skipField?: string,
): void {
	const fields = objectFields(expression, filePath, state.files) ?? [];
	for (const field of fields)
		if (field.name !== skipField)
			walk(field.type, field.filePath, method, [...path, field.name], state, true);
	if (expression.kind === "object" && expression.indexValue)
		walk(expression.indexValue, filePath, method, path, state, true);
}

function walk(
	expression: Expr,
	filePath: string,
	method: string,
	path: readonly string[],
	state: WalkState,
	recordLiteral: boolean,
): void {
	if (expression.kind === "literal") {
		if (recordLiteral && !isNull(expression)) addPath(state, method, path);
		return;
	}
	if (expression.kind === "keyword") return;
	if (expression.kind === "array")
		return walk(expression.element, filePath, method, path, state, true);
	if (expression.kind === "intersection") {
		for (const part of expression.parts) walk(part, filePath, method, path, state, recordLiteral);
		return;
	}
	if (expression.kind === "object") return walkObject(expression, filePath, method, path, state);
	if (expression.kind === "ref") {
		if (expression.name === "never" || isOpenTypeName(expression.name)) return;
		if (expression.name === "Array" || expression.name === "ReadonlyArray") {
			if (expression.args[0]) walk(expression.args[0], filePath, method, path, state, true);
			return;
		}
		if (expression.name === "Record") {
			if (expression.args[1]) walk(expression.args[1], filePath, method, path, state, true);
			return;
		}
		const alias = resolveAlias(filePath, expression.name, state.files);
		if (!alias) return;
		const key = `${alias.filePath}:${alias.name}`;
		if (state.aliases.has(key)) return;
		const aliases = new Set(state.aliases);
		aliases.add(key);
		walk(alias.expr, alias.filePath, method, path, { ...state, aliases }, recordLiteral);
		return;
	}
	const parts = unionParts(expression, filePath, state.files);
	const nonNull = parts.filter((part) => !isNull(part.expression));
	const shape = discriminator(nonNull, state.files);
	if (shape) {
		addPath(state, method, [...path, shape.name]);
		for (const part of nonNull) {
			const fields = objectFields(part.expression, part.filePath, state.files) ?? [];
			const value = fields.find((field) => field.name === shape.name);
			const branch = value ? literalValue(value.type) : null;
			const branchPath = nonNull.length > 1 && branch ? [...path, branch] : path;
			walkObject(part.expression, part.filePath, method, branchPath, state, shape.name);
		}
		return;
	}
	if (
		nonNull.length > 1 ||
		nonNull.some((part) => !isOpen(part.expression, part.filePath, state.files))
	)
		addPath(state, method, path);
	for (const part of nonNull) walk(part.expression, part.filePath, method, path, state, false);
}

function notificationBranches(
	server: AliasRef,
	files: Map<string, GeneratedFile>,
): Array<{ method: string; params: Expr; filePath: string }> {
	const branches = unionParts(server.expr, server.filePath, files);
	return branches.flatMap((branch) => {
		const fields = objectFields(branch.expression, branch.filePath, files) ?? [];
		const method = fields.find((field) => field.name === "method");
		const params = fields.find((field) => field.name === "params");
		const methodValue = method ? literalValue(method.type) : null;
		return methodValue && params
			? [{ method: methodValue, params: params.type, filePath: branch.filePath }]
			: [];
	});
}

/** Derives closed-union and literal-discriminator paths from fresh Codex sources. */
export function deriveGeneratedNotificationUnionPaths(
	root: string,
): GeneratedNotificationUnionPath[] {
	const files = loadFiles(root);
	const serverFile = resolve(root, "ServerNotification.ts");
	const server = resolveAlias(serverFile, "ServerNotification", files);
	if (!server)
		throw new Error("Generated ServerNotification.ts does not export ServerNotification");
	const state: WalkState = { files, paths: new Set(), aliases: new Set() };
	for (const branch of notificationBranches(server, files))
		walk(branch.params, branch.filePath, branch.method, [], state, true);
	return [...state.paths].toSorted().map((entry) => {
		const separator = entry.indexOf(":");
		return { method: entry.slice(0, separator), path: entry.slice(separator + 1) };
	});
}

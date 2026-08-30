import type { ServerNotificationMethod } from "../index.js";
import { turnFixture } from "./fixtures.js";
import { threadItemChallenges } from "./thread-item-challenges.js";
import type { NotificationUnionChallenge, PathSegment } from "./union-challenge-utils.js";
import { future, replace } from "./union-challenge-utils.js";

function turnError(codexErrorInfo: unknown) {
	return {
		message: "fixture",
		codexErrorInfo,
		additionalDetails: null,
		misalignment: null,
	};
}

function turnErrorChallenges(
	name: string,
	path: readonly PathSegment[],
): NotificationUnionChallenge[] {
	return [
		replace(`${name}.codexErrorInfo`, path, {
			...turnFixture,
			error: turnError("futureUnionMember"),
		}),
		replace(`${name}.codexErrorInfo.activeTurnNotSteerable.turnKind`, path, {
			...turnFixture,
			error: turnError({ activeTurnNotSteerable: { turnKind: "futureUnionMember" } }),
		}),
	];
}

function turnErrorObjectChallenges(
	name: string,
	path: readonly PathSegment[],
): NotificationUnionChallenge[] {
	return [
		future(`${name}.codexErrorInfo`, ...path, "codexErrorInfo"),
		replace(
			`${name}.codexErrorInfo.activeTurnNotSteerable.turnKind`,
			path,
			turnError({ activeTurnNotSteerable: { turnKind: "futureUnionMember" } }),
		),
	];
}

function threadStatusChallenges(
	name: string,
	path: readonly PathSegment[],
): NotificationUnionChallenge[] {
	return [
		future(`${name}.type`, ...path, "type"),
		replace(`${name}.activeFlags`, path, {
			type: "active",
			activeFlags: ["futureUnionMember"],
		}),
	];
}

function hookChallenges(): NotificationUnionChallenge[] {
	return [
		future("hook.eventName", "run", "eventName"),
		future("hook.handlerType", "run", "handlerType"),
		future("hook.executionMode", "run", "executionMode"),
		future("hook.scope", "run", "scope"),
		future("hook.source", "run", "source"),
		future("hook.status", "run", "status"),
		replace(
			"hook.entry.kind",
			["run", "entries"],
			[{ kind: "futureUnionMember", text: "fixture" }],
		),
	];
}

function autoReviewChallenges(): NotificationUnionChallenge[] {
	return [
		future("review.status", "review", "status"),
		future("review.riskLevel", "review", "riskLevel"),
		future("review.userAuthorization", "review", "userAuthorization"),
		future("action.type", "action", "type"),
		future("action.source", "action", "source"),
		replace("action.networkAccess.protocol", ["action"], {
			type: "networkAccess",
			target: "https://example.test",
			host: "example.test",
			protocol: "futureUnionMember",
			port: 443,
		}),
		replace("action.requestPermissions.path.type", ["action"], {
			type: "requestPermissions",
			reason: null,
			permissions: {
				network: null,
				fileSystem: {
					read: null,
					write: null,
					entries: [{ path: { type: "futureUnionMember" }, access: "read" }],
				},
			},
		}),
		replace("action.requestPermissions.specialPath.kind", ["action"], {
			type: "requestPermissions",
			reason: null,
			permissions: {
				network: null,
				fileSystem: {
					read: null,
					write: null,
					entries: [
						{
							path: { type: "special", value: { kind: "futureUnionMember" } },
							access: "read",
						},
					],
				},
			},
		}),
		replace("action.requestPermissions.access", ["action"], {
			type: "requestPermissions",
			reason: null,
			permissions: {
				network: null,
				fileSystem: {
					read: null,
					write: null,
					entries: [{ path: { type: "path", path: "/tmp" }, access: "futureUnionMember" }],
				},
			},
		}),
	];
}

function realtimeItemChallenges(): NotificationUnionChallenge[] {
	return [
		future("realtime-item.type", "item", "type"),
		replace("realtime-item.transcript.role", ["item"], {
			id: "realtime-item-1",
			realtimeSessionId: "realtime-1",
			type: "transcriptSegment",
			role: "futureUnionMember",
			text: "raw",
		}),
		replace("realtime-item.presentation.type", ["item"], {
			id: "realtime-item-1",
			realtimeSessionId: "realtime-1",
			type: "bemItemPromoted",
			turnId: "turn-1",
			itemId: "item-1",
			presentation: { type: "futureUnionMember" },
		}),
		replace("realtime-item.closed.outcome", ["item"], {
			id: "realtime-item-1",
			realtimeSessionId: "realtime-1",
			type: "realtimeSessionClosed",
			outcome: "futureUnionMember",
		}),
	];
}

/**
 * Inventory derived from the generated Codex 0.151.0 notification graph.
 * Every accepted method is present; empty rows have no closed union in the
 * exercised payload, while JsonValue and provider-defined strings stay open.
 */
export const SERVER_NOTIFICATION_UNION_CHALLENGES = {
	error: turnErrorObjectChallenges("error", ["error"]),
	"thread/started": [
		...threadStatusChallenges("thread.status", ["thread", "status"]),
		future("thread.historyMode", "thread", "historyMode"),
		future("thread.source", "thread", "source"),
		replace("thread.source.subAgent", ["thread", "source"], {
			subAgent: "futureUnionMember",
		}),
		future("thread.turn.status", "thread", "turns", 0, "status"),
		future("thread.turn.itemsView", "thread", "turns", 0, "itemsView"),
		...turnErrorChallenges("thread.turn.error", ["thread", "turns", 0]),
		...threadItemChallenges("thread", "turns", 0, "items", 0),
	],
	"thread/status/changed": threadStatusChallenges("status", ["status"]),
	"thread/archived": [],
	"thread/deleted": [],
	"thread/unarchived": [],
	"thread/closed": [],
	"thread/reverted": [],
	"skills/changed": [],
	"thread/name/updated": [],
	"thread/goal/updated": [future("goal.status", "goal", "status")],
	"thread/goal/cleared": [],
	"thread/queue/changed": [],
	"project/changed": [future("changeType", "changeType")],
	"thread/project/updated": [],
	"thread/environment/connected": [],
	"thread/environment/disconnected": [],
	"thread/settings/updated": [
		future("settings.approvalPolicy", "threadSettings", "approvalPolicy"),
		future("settings.approvalsReviewer", "threadSettings", "approvalsReviewer"),
		future("settings.sandboxPolicy.type", "threadSettings", "sandboxPolicy", "type"),
		replace("settings.sandboxPolicy.networkAccess", ["threadSettings", "sandboxPolicy"], {
			type: "externalSandbox",
			networkAccess: "futureUnionMember",
		}),
		future("settings.collaborationMode.mode", "threadSettings", "collaborationMode", "mode"),
		future("settings.multiAgentMode", "threadSettings", "multiAgentMode"),
		future("settings.summary", "threadSettings", "summary"),
		future("settings.personality", "threadSettings", "personality"),
	],
	"thread/tokenUsage/updated": [],
	"turn/started": [
		future("turn.status", "turn", "status"),
		future("turn.itemsView", "turn", "itemsView"),
		...turnErrorChallenges("turn.error", ["turn"]),
		...threadItemChallenges("turn", "items", 0),
	],
	"hook/started": hookChallenges(),
	"turn/completed": [
		future("turn.status", "turn", "status"),
		future("turn.itemsView", "turn", "itemsView"),
		...turnErrorChallenges("turn.error", ["turn"]),
		...threadItemChallenges("turn", "items", 0),
	],
	"hook/completed": hookChallenges(),
	"turn/diff/updated": [],
	"turn/plan/updated": [
		replace("plan-step.status", ["plan"], [{ step: "fixture", status: "futureUnionMember" }]),
	],
	"item/started": [...threadItemChallenges("item")],
	"item/autoApprovalReview/started": autoReviewChallenges(),
	"item/autoApprovalReview/completed": autoReviewChallenges(),
	"autoApprovalReview/strictReviewRequired": [],
	"item/completed": [...threadItemChallenges("item")],
	"rawResponseItem/completed": [
		future("response-item.type", "item", "type"),
		future("response-item.content.type", "item", "content", 0, "type"),
		future("response-item.phase", "item", "phase"),
		replace(
			"response-item.image.detail",
			["item", "content"],
			[
				{
					type: "input_image",
					image_url: "https://example.test/image",
					detail: "futureUnionMember",
				},
			],
		),
		replace("response-item.agentMessage.content.type", ["item"], {
			type: "agent_message",
			author: "fixture",
			recipient: "fixture",
			content: [{ type: "futureUnionMember", text: "fixture" }],
		}),
		replace("response-item.reasoning.content.type", ["item"], {
			type: "reasoning",
			summary: [{ type: "summary_text", text: "fixture" }],
			content: [{ type: "futureUnionMember", text: "fixture" }],
			encrypted_content: null,
		}),
		replace("response-item.functionCallOutput.content.type", ["item"], {
			type: "function_call_output",
			output: [{ type: "futureUnionMember", text: "fixture" }],
		}),
		replace("response-item.customToolCallOutput.content.type", ["item"], {
			type: "custom_tool_call_output",
			call_id: "call-1",
			output: [{ type: "futureUnionMember", text: "fixture" }],
		}),
		replace("response-item.webSearch.action.type", ["item"], {
			type: "web_search_call",
			action: { type: "futureUnionMember" },
		}),
	],
	"rawResponse/completed": [],
	"item/agentMessage/delta": [],
	"item/plan/delta": [],
	"command/exec/outputDelta": [future("stream", "stream")],
	"process/outputDelta": [future("stream", "stream")],
	"process/exited": [],
	"item/commandExecution/outputDelta": [],
	"item/commandExecution/terminalInteraction": [],
	"item/fileChange/outputDelta": [],
	"item/fileChange/patchUpdated": [
		replace(
			"file-change.kind.type",
			["changes"],
			[{ path: "file", kind: { type: "futureUnionMember" }, diff: "" }],
		),
	],
	"serverRequest/resolved": [replace("requestId.type", ["requestId"], false)],
	"item/mcpToolCall/progress": [],
	"mcpServer/oauthLogin/completed": [],
	"mcpServer/startupStatus/updated": [
		future("status", "status"),
		future("failureReason", "failureReason"),
	],
	"mcpServer/event/stream/notification": [],
	"account/updated": [future("authMode", "authMode"), future("planType", "planType")],
	"account/rateLimits/updated": [
		future("rateLimits.planType", "rateLimits", "planType"),
		future("rateLimits.rateLimitReachedType", "rateLimits", "rateLimitReachedType"),
	],
	"app/list/updated": [],
	"remoteControl/status/changed": [future("status", "status")],
	"externalAgentConfig/import/progress": [
		replace(
			"item-type",
			["itemTypeResults"],
			[{ itemType: "futureUnionMember", successes: [], failures: [] }],
		),
	],
	"externalAgentConfig/import/completed": [
		replace(
			"item-type",
			["itemTypeResults"],
			[{ itemType: "futureUnionMember", successes: [], failures: [] }],
		),
	],
	"fs/changed": [],
	"item/reasoning/summaryTextDelta": [],
	"item/reasoning/summaryPartAdded": [],
	"item/reasoning/textDelta": [],
	"thread/compacted": [],
	"model/rerouted": [future("reason", "reason")],
	"model/verification": [replace("verification", ["verifications"], ["futureUnionMember"])],
	"turn/moderationMetadata": [],
	"model/safetyBuffering/updated": [],
	warning: [],
	guardianWarning: [],
	deprecationNotice: [],
	configWarning: [],
	"fuzzyFileSearch/sessionUpdated": [
		replace(
			"file.match_type",
			["files"],
			[
				{
					root: "/",
					path: "file",
					match_type: "futureUnionMember",
					file_name: "file",
					score: 0,
					indices: null,
				},
			],
		),
	],
	"fuzzyFileSearch/sessionCompleted": [],
	"thread/realtime/started": [future("version", "version")],
	"thread/realtime/itemAdded": [],
	"thread/realtime/item/started": realtimeItemChallenges(),
	"thread/realtime/item/transcript/delta": [],
	"thread/realtime/item/completed": realtimeItemChallenges(),
	"thread/realtime/transcript/delta": [],
	"thread/realtime/transcript/done": [],
	"thread/realtime/outputAudio/delta": [],
	"thread/realtime/sdp": [],
	"thread/realtime/error": [],
	"thread/realtime/closed": [],
	"windows/worldWritableWarning": [],
	"windowsSandbox/setupCompleted": [future("mode", "mode")],
	"account/login/completed": [future("onboardingEntrypoint", "onboardingEntrypoint")],
} as const satisfies Record<ServerNotificationMethod, readonly NotificationUnionChallenge[]>;

export const GENERATED_UNION_BEARING_NOTIFICATION_METHODS = [
	"error",
	"thread/started",
	"thread/status/changed",
	"thread/goal/updated",
	"project/changed",
	"thread/settings/updated",
	"turn/started",
	"hook/started",
	"turn/completed",
	"hook/completed",
	"turn/plan/updated",
	"item/started",
	"item/autoApprovalReview/started",
	"item/autoApprovalReview/completed",
	"item/completed",
	"rawResponseItem/completed",
	"command/exec/outputDelta",
	"process/outputDelta",
	"item/fileChange/patchUpdated",
	"serverRequest/resolved",
	"mcpServer/startupStatus/updated",
	"account/updated",
	"account/rateLimits/updated",
	"remoteControl/status/changed",
	"externalAgentConfig/import/progress",
	"externalAgentConfig/import/completed",
	"model/rerouted",
	"model/verification",
	"fuzzyFileSearch/sessionUpdated",
	"thread/realtime/started",
	"thread/realtime/item/started",
	"thread/realtime/item/completed",
	"windowsSandbox/setupCompleted",
	"account/login/completed",
] as const satisfies readonly ServerNotificationMethod[];

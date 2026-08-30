import { readFileSync } from "node:fs";
import { join } from "node:path";

export type GeneratedProtocolMethodDirection =
	| "response"
	| "clientNotification"
	| "serverRequest"
	| "serverNotification";

export interface GeneratedProtocolMethodInventories {
	readonly response: readonly string[];
	readonly clientNotification: readonly string[];
	readonly serverRequest: readonly string[];
	readonly serverNotification: readonly string[];
}

/**
 * Codex 0.151.0 ClientRequest methods that Archboard deliberately does not
 * decode. Keep this list explicit. It is the reviewed complement of the
 * supported response methods, not a runtime-derived fallback.
 */
export const CODEX_PROTOCOL_GENERATED_CLIENT_REQUEST_EXCLUDED_METHODS = [
	"account/bedrock/discover",
	"account/bedrock/setup",
	"account/rateLimitResetCredit/consume",
	"account/rateLimits/read",
	"account/sendAddCreditsNudgeEmail",
	"account/usage/read",
	"account/workspaceMessages/read",
	"app/installed",
	"app/list",
	"app/read",
	"collaborationMode/list",
	"command/exec",
	"command/exec/resize",
	"command/exec/terminate",
	"command/exec/write",
	"config/batchWrite",
	"config/mcpServer/reload",
	"config/value/write",
	"environment/add",
	"environment/info",
	"environment/status",
	"experimentalFeature/enablement/set",
	"experimentalFeature/list",
	"externalAgentConfig/detect",
	"externalAgentConfig/import",
	"externalAgentConfig/import/readHistories",
	"externalAgentConfig/import/recordHistory",
	"feedback/upload",
	"fs/copy",
	"fs/createDirectory",
	"fs/getMetadata",
	"fs/readDirectory",
	"fs/readFile",
	"fs/remove",
	"fs/unwatch",
	"fs/watch",
	"fs/writeFile",
	"fuzzyFileSearch",
	"fuzzyFileSearch/sessionStart",
	"fuzzyFileSearch/sessionStop",
	"fuzzyFileSearch/sessionUpdate",
	"getAuthStatus",
	"getConversationSummary",
	"gitDiffToRemote",
	"hooks/list",
	"marketplace/add",
	"marketplace/remove",
	"marketplace/upgrade",
	"mcpServer/event/stream/start",
	"mcpServer/event/stream/stop",
	"mcpServer/oauth/login",
	"mcpServer/resource/read",
	"mcpServer/tool/call",
	"mcpServerStatus/list",
	"memory/reset",
	"mock/experimentalMethod",
	"modelProvider/capabilities/read",
	"permissionProfile/list",
	"plugin/install",
	"plugin/installed",
	"plugin/list",
	"plugin/read",
	"plugin/search",
	"plugin/share/checkout",
	"plugin/share/delete",
	"plugin/share/list",
	"plugin/share/save",
	"plugin/share/updateTargets",
	"plugin/skill/read",
	"plugin/uninstall",
	"process/kill",
	"process/resizePty",
	"process/spawn",
	"process/writeStdin",
	"project/create",
	"project/delete",
	"project/import",
	"project/list",
	"project/move",
	"project/read",
	"project/update",
	"remoteControl/client/list",
	"remoteControl/client/revoke",
	"remoteControl/disable",
	"remoteControl/enable",
	"remoteControl/pairing/start",
	"remoteControl/pairing/status",
	"remoteControl/status/read",
	"review/start",
	"server/diagnostics",
	"skills/config/write",
	"skills/extraRoots/set",
	"skills/list",
	"thread/approveGuardianDeniedAction",
	"thread/archive",
	"thread/backgroundTerminals/clean",
	"thread/backgroundTerminals/list",
	"thread/backgroundTerminals/terminate",
	"thread/compact/start",
	"thread/decrement_elicitation",
	"thread/goal/clear",
	"thread/goal/get",
	"thread/goal/set",
	"thread/increment_elicitation",
	"thread/memoryMode/set",
	"thread/metadata/update",
	"thread/name/set",
	"thread/realtime/appendAudio",
	"thread/realtime/listVoices",
	"thread/resume",
	"thread/revert",
	"thread/rollback",
	"thread/search",
	"thread/searchOccurrences",
	"thread/section/move",
	"thread/shellCommand",
	"thread/unarchive",
	"thread/unsubscribe",
	"threadSection/create",
	"threadSection/delete",
	"threadSection/list",
	"threadSection/update",
	"turn/settings/update",
	"windowsSandbox/readiness",
	"windowsSandbox/setupStart",
] as const;

const GENERATED_METHOD_FILES: Readonly<Record<GeneratedProtocolMethodDirection, string>> =
	Object.freeze({
		response: "ClientRequest.ts",
		clientNotification: "ClientNotification.ts",
		serverRequest: "ServerRequest.ts",
		serverNotification: "ServerNotification.ts",
	});

function generatedMethods(root: string, file: string): string[] {
	const source = readFileSync(join(root, file), "utf8");
	const methods = [...source.matchAll(/"method"\s*:\s*"([^"]+)"/g)].map((match) => match[1]!);
	if (!methods.length) throw new Error(`Generated ${file} contains no method literals`);
	const unique = new Set(methods);
	if (unique.size !== methods.length)
		throw new Error(`Generated ${file} contains duplicate method literals`);
	return methods.toSorted();
}

/** Derives all generated JSON-RPC method sets from one temporary tree. */
export function deriveGeneratedProtocolMethodInventories(
	root: string,
): GeneratedProtocolMethodInventories {
	return {
		response: generatedMethods(root, GENERATED_METHOD_FILES.response),
		clientNotification: generatedMethods(root, GENERATED_METHOD_FILES.clientNotification),
		serverRequest: generatedMethods(root, GENERATED_METHOD_FILES.serverRequest),
		serverNotification: generatedMethods(root, GENERATED_METHOD_FILES.serverNotification),
	};
}

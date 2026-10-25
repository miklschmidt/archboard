import {
	CODEX_SESSION_THREAD_SOURCE,
	type SessionParams,
} from "@archboard/codex-app-server/session";
import type { WorkbenchThreadProfile } from "#runtime/protocol/host/instructions.ts";

const WORKHORSE_OPERATION_KIND = "create_thread";
const WORKHORSE_CLEANUP_OPERATION_KIND = "thread_delete";
const WORKHORSE_RPC = "thread/start";
const WORKHORSE_CLEANUP_RPC = "thread/delete";
const WORKHORSE_THREAD_SOURCE = CODEX_SESSION_THREAD_SOURCE;

/**
 * Build one checkout workhorse from the exact host profile.
 * @param checkoutRoot The admitted checkout directory.
 * @param profile The immutable exact thread profile.
 * @returns The thread/start parameters for this exact profile.
 */
function createWorkhorseThreadStartParams(
	checkoutRoot: string,
	profile: WorkbenchThreadProfile,
): SessionParams<"thread/start"> {
	return {
		model: "gpt-6-astra",
		config: { model_reasoning_effort: "medium" },
		cwd: checkoutRoot,
		runtimeWorkspaceRoots: [checkoutRoot],
		serviceName: profile.identity.serviceName,
		developerInstructions: profile.instructions.text,
		ephemeral: false,
		historyMode: "paginated",
		sessionStartSource: "startup",
		threadSource: profile.identity.threadSource,
		dynamicTools: [...profile.dynamicTools],
		experimentalRawEvents: false,
	};
}

export {
	WORKHORSE_CLEANUP_OPERATION_KIND,
	WORKHORSE_CLEANUP_RPC,
	WORKHORSE_OPERATION_KIND,
	WORKHORSE_RPC,
	WORKHORSE_THREAD_SOURCE,
	createWorkhorseThreadStartParams,
};

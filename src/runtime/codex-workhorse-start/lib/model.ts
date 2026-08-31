import {
	ARCHBOARD_APP_DYNAMIC_TOOLS,
	ARCHBOARD_APP_MANIFEST_SHA256,
} from "../../codex-thread-tools/index.js";
import {
	assertCanonicalInstructionBytes,
	WORKHORSE_DEVELOPER_INSTRUCTIONS,
	WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256,
} from "../../codex-instructions/index.js";
import type { SessionParams } from "../../codex-session/index.js";

export const WORKHORSE_OPERATION_KIND = "create_thread";
export const WORKHORSE_CLEANUP_OPERATION_KIND = "thread_delete";
export const WORKHORSE_RPC = "thread/start";
export const WORKHORSE_CLEANUP_RPC = "thread/delete";
export const WORKHORSE_THREAD_SOURCE = "appServer";
export const WORKHORSE_THREAD_SOURCE_TAG = "archboard";

export const WORKHORSE_INSTRUCTION_HASH = WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256;
export const WORKHORSE_MANIFEST_HASH = ARCHBOARD_APP_MANIFEST_SHA256;

/** Build the literal workhorse profile; omitted fields deliberately inherit child defaults. */
export function createWorkhorseThreadStartParams(
	checkoutRoot: string,
): SessionParams<"thread/start"> {
	assertCanonicalInstructionBytes("workhorse", WORKHORSE_DEVELOPER_INSTRUCTIONS);
	return {
		cwd: checkoutRoot,
		runtimeWorkspaceRoots: [checkoutRoot],
		serviceName: "archboard",
		developerInstructions: WORKHORSE_DEVELOPER_INSTRUCTIONS,
		ephemeral: false,
		historyMode: "paginated",
		sessionStartSource: "startup",
		threadSource: "archboard",
		dynamicTools: [...ARCHBOARD_APP_DYNAMIC_TOOLS],
		experimentalRawEvents: false,
	} satisfies SessionParams<"thread/start">;
}

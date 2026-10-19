import { createHash } from "node:crypto";

import {
	ARCHBOARD_COORDINATOR_MANIFEST_SHA256,
	ARCHBOARD_COORDINATOR_NAMESPACE,
} from "@/runtime/codex-coordinator-callbacks";
import {
	ARCHBOARD_APP_DYNAMIC_TOOLS,
	ARCHBOARD_APP_MANIFEST_SHA256,
} from "@/runtime/codex-thread-tools";
import {
	assertCanonicalInstructionBytes,
	WORKHORSE_DEVELOPER_INSTRUCTIONS,
	WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256,
} from "@/runtime/codex-instructions";
import { CODEX_SESSION_THREAD_SOURCE } from "@archboard/codex-app-server/session-api";
import type { SessionParams } from "@archboard/codex-app-server/session-api";

const WORKHORSE_OPERATION_KIND = "create_thread";
const WORKHORSE_CLEANUP_OPERATION_KIND = "thread_delete";
const WORKHORSE_RPC = "thread/start";
const WORKHORSE_CLEANUP_RPC = "thread/delete";
const WORKHORSE_THREAD_SOURCE = CODEX_SESSION_THREAD_SOURCE;
const WORKHORSE_THREAD_SOURCE_TAG = "archboard";

const WORKHORSE_INSTRUCTION_HASH = WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256;
/** The workhorse's tools, proven by both reviewed manifests it is started with. */
const WORKHORSE_MANIFEST_HASH = createHash("sha256")
	.update(
		JSON.stringify({
			app: ARCHBOARD_APP_MANIFEST_SHA256,
			coordinator: ARCHBOARD_COORDINATOR_MANIFEST_SHA256,
		}),
		"utf8",
	)
	.digest("hex");

/**
 * Build the literal workhorse profile; omitted fields deliberately inherit child defaults.
 * @param checkoutRoot Canonical checkout root assigned to the workhorse.
 * @returns The literal thread-start request profile.
 */
function createWorkhorseThreadStartParams(checkoutRoot: string): SessionParams<"thread/start"> {
	assertCanonicalInstructionBytes("workhorse", WORKHORSE_DEVELOPER_INSTRUCTIONS);
	return {
		model: "gpt-6-astra",
		config: { model_reasoning_effort: "medium" },
		cwd: checkoutRoot,
		runtimeWorkspaceRoots: [checkoutRoot],
		serviceName: "archboard",
		developerInstructions: WORKHORSE_DEVELOPER_INSTRUCTIONS,
		ephemeral: false,
		historyMode: "paginated",
		sessionStartSource: "startup",
		threadSource: "archboard",
		dynamicTools: [...ARCHBOARD_APP_DYNAMIC_TOOLS, ARCHBOARD_COORDINATOR_NAMESPACE],
		experimentalRawEvents: false,
	} satisfies SessionParams<"thread/start">;
}

export {
	WORKHORSE_CLEANUP_OPERATION_KIND,
	WORKHORSE_CLEANUP_RPC,
	WORKHORSE_INSTRUCTION_HASH,
	WORKHORSE_MANIFEST_HASH,
	WORKHORSE_OPERATION_KIND,
	WORKHORSE_RPC,
	WORKHORSE_THREAD_SOURCE,
	WORKHORSE_THREAD_SOURCE_TAG,
	createWorkhorseThreadStartParams,
};

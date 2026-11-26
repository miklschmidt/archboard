import { codexSessionThreadSource, type SessionParams } from "@archboard/codex-app-server/session";
import type { WorkbenchThreadProfile } from "#runtime/host/protocol/instructions.ts";
import { defaultVoiceAgentModels, type RoleModelSelection } from "#runtime/host/protocol/models.ts";

const WORKHORSE_OPERATION_KIND = "create_thread";
const WORKHORSE_CLEANUP_OPERATION_KIND = "thread_delete";
const WORKHORSE_RPC = "thread/start";
const WORKHORSE_CLEANUP_RPC = "thread/delete";
const WORKHORSE_THREAD_SOURCE = codexSessionThreadSource();

/**
 * Resolve the workhorse model selection, falling back to the reviewed default when unset.
 * @param selection Optional host override.
 * @returns Concrete model, effort, and optional service tier.
 */
function resolvedWorkhorseSelection(selection: RoleModelSelection | null): RoleModelSelection {
	return selection ?? defaultVoiceAgentModels().workhorse;
}

/**
 * Build one checkout workhorse from the exact host profile and optional model selection.
 * @param checkoutRoot The admitted checkout directory.
 * @param profile The immutable exact thread profile.
 * @param selection Optional host model, reasoning effort, and service tier override.
 * @returns The thread/start parameters for this exact profile.
 */
function createWorkhorseThreadStartParams(
	checkoutRoot: string,
	profile: WorkbenchThreadProfile,
	selection: RoleModelSelection | null = null,
): SessionParams<"thread/start"> {
	const { model, effort, serviceTier } = resolvedWorkhorseSelection(selection);
	return {
		model,
		serviceTier,
		config: { model_reasoning_effort: effort },
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

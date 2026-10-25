import type { SessionParams } from "@archboard/codex-app-server/session";
import type { VoiceAgentIdentity } from "#runtime/protocol/host/identity.ts";

type WorkbenchDynamicTools = NonNullable<SessionParams<"thread/start">["dynamicTools"]>;

interface WorkbenchRoleInstructions {
	readonly text: string;
	readonly sha256: string;
}

/** A frozen role profile binds the exact instruction and tool bytes used by a thread. */
interface WorkbenchThreadProfile {
	/** How the host names itself to Codex on the thread. */
	readonly identity: VoiceAgentIdentity;
	readonly instructions: WorkbenchRoleInstructions;
	readonly dynamicTools: WorkbenchDynamicTools;
	readonly manifestHash: string;
}

interface WorkbenchInstructions {
	readonly coordinator: WorkbenchThreadProfile;
	readonly workhorse: WorkbenchThreadProfile;
}

export type {
	WorkbenchDynamicTools,
	WorkbenchRoleInstructions,
	WorkbenchThreadProfile,
	WorkbenchInstructions,
};

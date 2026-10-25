import type { SessionParams } from "@archboard/codex-app-server/session";

type WorkbenchDynamicTools = NonNullable<SessionParams<"thread/start">["dynamicTools"]>;

interface WorkbenchRoleInstructions {
	readonly text: string;
	readonly sha256: string;
}

/** A frozen role profile binds the exact instruction and tool bytes used by a thread. */
interface WorkbenchThreadProfile {
	readonly serviceName: string;
	readonly threadSource: string;
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

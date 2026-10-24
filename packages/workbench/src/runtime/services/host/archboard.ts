import {
	WORKHORSE_DEVELOPER_INSTRUCTIONS,
	COORDINATOR_DEVELOPER_INSTRUCTIONS,
} from "#runtime/rules/instructions/authored.ts";
import { canonicalContext, encodeCanonicalContext } from "#runtime/rules/instructions/context.ts";
import { ARCHBOARD_APP_DYNAMIC_TOOLS } from "#runtime/protocol/thread-tools/manifest.ts";
import { createWorkbenchThreadProfile } from "#runtime/rules/host/instructions.ts";
import type {
	WorkbenchContextCodec,
	WorkbenchExecutionContext,
} from "#runtime/protocol/host/context.ts";
import type { WorkbenchInstructions } from "#runtime/protocol/host/instructions.ts";
import { ArchboardContextSchema } from "#runtime/rules/instructions/context.ts";

const ARCHBOARD_CONTEXT_CODEC: WorkbenchContextCodec = Object.freeze({
	key: "archboard",
	turnTrigger: "archboard",
	/**
	 * Preserve canonical Archboard wire bytes through the neutral context codec.
	 * @param context The captured execution facts and host payload.
	 * @returns The canonical Archboard context JSON.
	 */
	encode: (context: WorkbenchExecutionContext) =>
		encodeCanonicalContext(canonicalContext(ArchboardContextSchema.parse(context))),
});

const ARCHBOARD_INSTRUCTIONS: WorkbenchInstructions = Object.freeze({
	coordinator: createWorkbenchThreadProfile({
		serviceName: "archboard",
		threadSource: "archboard",
		role: "coordinator",
		domainInstructions: COORDINATOR_DEVELOPER_INSTRUCTIONS,
		dynamicTools: [],
	}),
	workhorse: createWorkbenchThreadProfile({
		serviceName: "archboard",
		threadSource: "archboard",
		role: "workhorse",
		domainInstructions: WORKHORSE_DEVELOPER_INSTRUCTIONS,
		dynamicTools: [...ARCHBOARD_APP_DYNAMIC_TOOLS],
	}),
});

export { ARCHBOARD_CONTEXT_CODEC, ARCHBOARD_INSTRUCTIONS };

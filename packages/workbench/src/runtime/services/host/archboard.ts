import {
	WORKHORSE_DOMAIN_INSTRUCTIONS,
	COORDINATOR_DOMAIN_INSTRUCTIONS,
} from "#runtime/rules/instructions/authored.ts";
import { canonicalContext, encodeCanonicalContext } from "#runtime/rules/instructions/context.ts";
import { ARCHBOARD_APP_DYNAMIC_TOOLS } from "#runtime/protocol/thread-tools/manifest.ts";
import { createWorkbenchThreadProfile } from "@archboard/agent-workbench/runtime";
import type {
	WorkbenchContextCodec,
	WorkbenchExecutionContext,
} from "@archboard/agent-workbench/runtime";
import type { WorkbenchInstructions } from "@archboard/agent-workbench/runtime";
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
		domainInstructions: COORDINATOR_DOMAIN_INSTRUCTIONS,
		dynamicTools: [],
	}),
	workhorse: createWorkbenchThreadProfile({
		serviceName: "archboard",
		threadSource: "archboard",
		role: "workhorse",
		domainInstructions: WORKHORSE_DOMAIN_INSTRUCTIONS,
		dynamicTools: [...ARCHBOARD_APP_DYNAMIC_TOOLS],
	}),
});

export { ARCHBOARD_CONTEXT_CODEC, ARCHBOARD_INSTRUCTIONS };

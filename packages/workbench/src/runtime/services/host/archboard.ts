import {
	WORKHORSE_DOMAIN_INSTRUCTIONS,
	COORDINATOR_DOMAIN_INSTRUCTIONS,
} from "#runtime/rules/instructions/authored.ts";
import { canonicalContext, encodeCanonicalContext } from "#runtime/rules/instructions/context.ts";
import { ARCHBOARD_APP_DYNAMIC_TOOLS } from "#runtime/protocol/thread-tools/manifest.ts";
import { createWorkbenchThreadProfile } from "@archboard/codex-realtime-voice/runtime";
import type {
	WorkbenchContextCodec,
	WorkbenchExecutionContext,
} from "@archboard/codex-realtime-voice/runtime";
import type { WorkbenchInstructions } from "@archboard/codex-realtime-voice/runtime";
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

/** How Archboard names itself to Codex: the values its existing threads were started with. */
const ARCHBOARD_IDENTITY = Object.freeze({ serviceName: "archboard", threadSource: "archboard" });

const ARCHBOARD_INSTRUCTIONS: WorkbenchInstructions = Object.freeze({
	coordinator: createWorkbenchThreadProfile({
		identity: ARCHBOARD_IDENTITY,
		role: "coordinator",
		domainInstructions: COORDINATOR_DOMAIN_INSTRUCTIONS,
		dynamicTools: [],
	}),
	workhorse: createWorkbenchThreadProfile({
		identity: ARCHBOARD_IDENTITY,
		role: "workhorse",
		domainInstructions: WORKHORSE_DOMAIN_INSTRUCTIONS,
		dynamicTools: [...ARCHBOARD_APP_DYNAMIC_TOOLS],
	}),
});

export { ARCHBOARD_CONTEXT_CODEC, ARCHBOARD_INSTRUCTIONS };

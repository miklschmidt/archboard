import type {
	WorkbenchContextCodec,
	WorkbenchExecutionContext,
} from "#runtime/protocol/voice/extension.ts";
import {
	WORKHORSE_DOMAIN_INSTRUCTIONS,
	COORDINATOR_DOMAIN_INSTRUCTIONS,
} from "#runtime/rules/instructions/authored.ts";
import { canonicalContext, encodeCanonicalContext } from "#runtime/rules/instructions/context.ts";
import { ARCHBOARD_APP_DYNAMIC_TOOLS } from "#runtime/protocol/thread-tools/manifest.ts";
import { ArchboardContextSchema } from "#runtime/rules/instructions/context.ts";
import type {
	VoiceAgentExtensions,
	VoiceAgentOptions,
} from "@archboard/codex-realtime-voice/server";

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

/**
 * How Archboard's voice agent names itself and what it adds to the built-in roles. The identity
 * keeps the values its existing threads were started with; the workhorse also gets the Archboard
 * app tools.
 */
const ARCHBOARD_AGENT = Object.freeze({
	identity: Object.freeze({ serviceName: "archboard", threadSource: "archboard" }),
	instructions: Object.freeze({
		coordinator: COORDINATOR_DOMAIN_INSTRUCTIONS,
		workhorse: WORKHORSE_DOMAIN_INSTRUCTIONS,
	}),
	tools: Object.freeze({ workhorse: [...ARCHBOARD_APP_DYNAMIC_TOOLS] }),
}) satisfies Pick<VoiceAgentOptions, "identity" | "instructions"> & {
	readonly tools: VoiceAgentExtensions["tools"];
};

export { ARCHBOARD_AGENT, ARCHBOARD_CONTEXT_CODEC };

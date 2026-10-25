import type {
	WorkbenchContextCodec,
	WorkbenchExecutionContext,
} from "#runtime/protocol/voice/extension.ts";
import {
	WORKHORSE_DOMAIN_INSTRUCTIONS,
	COORDINATOR_DOMAIN_INSTRUCTIONS,
} from "#runtime/rules/instructions/authored.ts";
import {
	ArchboardContextSchema,
	canonicalContext,
	encodeCanonicalContext,
	type ArchboardContext,
} from "#runtime/rules/instructions/context.ts";
import { ARCHBOARD_APP_DYNAMIC_TOOLS } from "#runtime/protocol/thread-tools/manifest.ts";
import type {
	VoiceAgentExtensions,
	VoiceAgentOptions,
} from "@archboard/codex-realtime-voice/server";

/**
 * An Archboard context as the voice agent captures it: the brief under `brief`, and whether it was
 * truncated beside Archboard's own fields.
 * @param context The Archboard context.
 * @returns The execution context.
 */
function workbenchContextOf(
	context: ArchboardContext,
): WorkbenchExecutionContext & { readonly truncated: boolean } {
	const { semantic, ...rest } = context;
	return {
		...rest,
		truncated: semantic.truncated,
		brief: {
			text: semantic.brief,
			capturedAtMs: semantic.capturedAtMs,
			freshUntilMs: semantic.freshUntilMs,
		},
	};
}

/**
 * Archboard's own fields of a context: what an announced change carries as its payload, beside
 * the execution facts and the brief the voice agent states itself.
 * @param context The Archboard context.
 * @returns The payload.
 */
function archboardPayloadOf(context: ArchboardContext): Readonly<Record<string, unknown>> {
	const { schema, paneId, board, focus, variant, view, selection, reconciliation, claim } = context;
	return {
		schema,
		paneId,
		board,
		focus,
		variant,
		view,
		selection,
		reconciliation,
		claim,
		ambiguity: context.ambiguity,
		truncated: context.semantic.truncated,
	};
}

const ARCHBOARD_CONTEXT_CODEC: WorkbenchContextCodec = Object.freeze({
	key: "archboard",
	turnTrigger: "archboard",
	/**
	 * Preserve canonical Archboard wire bytes through the neutral context codec: the brief goes back
	 * under `semantic`, with whether it was truncated.
	 * @param context The captured execution facts and host payload.
	 * @returns The canonical Archboard context JSON.
	 */
	encode: (context: WorkbenchExecutionContext & Readonly<Record<string, unknown>>) => {
		const { brief, truncated, ...rest } = context;
		const semantic = {
			brief: brief.text,
			capturedAtMs: brief.capturedAtMs,
			freshUntilMs: brief.freshUntilMs,
			truncated,
		};
		return encodeCanonicalContext(
			canonicalContext(ArchboardContextSchema.parse({ ...rest, semantic })),
		);
	},
});

/**
 * How Archboard's voice agent names itself and what it adds to the built-in roles. The identity
 * keeps the values its existing threads were started with; the workhorse also gets the Archboard
 * app tools.
 */
const ARCHBOARD_AGENT = Object.freeze({
	identity: Object.freeze({
		serviceName: "archboard",
		threadSource: "archboard",
		productName: "Archboard",
		toolNamespaces: Object.freeze({
			workhorse: "archboard_workhorse",
			voice: "archboard_voice",
			coordinator: "archboard_coordinator",
		}),
		recordPrefix: "archboard",
	}),
	instructions: Object.freeze({
		coordinator: COORDINATOR_DOMAIN_INSTRUCTIONS,
		workhorse: WORKHORSE_DOMAIN_INSTRUCTIONS,
	}),
	tools: Object.freeze({ workhorse: [...ARCHBOARD_APP_DYNAMIC_TOOLS] }),
}) satisfies Pick<VoiceAgentOptions, "identity" | "instructions"> & {
	readonly tools: VoiceAgentExtensions["tools"];
};

export { ARCHBOARD_AGENT, ARCHBOARD_CONTEXT_CODEC, archboardPayloadOf, workbenchContextOf };

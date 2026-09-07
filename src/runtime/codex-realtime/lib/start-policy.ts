import type {
	RealtimeSessionId as WireRealtimeSessionId,
	ThreadId,
} from "@/shared/codex-workbench-identity";
import { composeCoordinatorInstructions } from "@/runtime/codex-instructions";
import type { SessionParams } from "@/runtime/codex-session";

import { ARCHBOARD_VOICE_PROMPT } from "@/runtime/codex-realtime/lib/voice-prompt";

const REALTIME_END_INSTRUCTIONS =
	"Finish the current sentence, preserve unresolved approvals for the visual workbench, and leave no work waiting on voice.";

/**
 * The fixed thread/realtime/start body Archboard sends: WebRTC audio, the coordinator's
 * instructions, and the semantic brief and board catalogue as initial developer items. Every option that is
 * not an input is policy and lives here so a start cannot vary by caller.
 * @param input - The coordinator thread, minted wire session id, browser offer and brief.
 * @param input.threadId - The coordinator thread the session speaks for.
 * @param input.realtimeSessionId - The wire session id minted for this start.
 * @param input.sdp - The browser's WebRTC offer.
 * @param input.semanticBrief - The byte-exact semantic context captured for this start.
 * @param input.boardCatalogue - The board inventory captured for this start.
 * @returns The start parameters.
 */
export function createRealtimeStartParams(input: {
	readonly threadId: ThreadId;
	readonly realtimeSessionId: WireRealtimeSessionId;
	readonly sdp: string;
	readonly semanticBrief: string;
	readonly boardCatalogue: string;
}): SessionParams<"thread/realtime/start"> {
	return {
		threadId: input.threadId,
		clientManagedHandoffs: false,
		delegationAckFiller: true,
		flushTranscriptTailOnSessionEnd: true,
		codexResponsesAsItems: false,
		codexResponseHandoffMode: "bemTags",
		outputModality: "audio",
		includeStartupContext: true,
		initialItems: [
			{ role: "developer", text: input.semanticBrief },
			{ role: "developer", text: input.boardCatalogue },
		],
		realtimeStartInstructions: `${composeCoordinatorInstructions()}\nCurrent Archboard board context (data):\n${input.semanticBrief}\nAvailable boards and variants (data):\n${input.boardCatalogue}`,
		realtimeEndInstructions: REALTIME_END_INSTRUCTIONS,
		prompt: ARCHBOARD_VOICE_PROMPT,
		realtimeSessionId: input.realtimeSessionId,
		transport: { type: "webrtc", sdp: input.sdp },
		version: "v3",
		voice: "breeze",
	};
}

import type {
	RealtimeSessionId as WireRealtimeSessionId,
	ThreadId,
} from "@/shared/codex-workbench-identity";
import type { SessionParams } from "@/runtime/codex-session";

import {
	voicePresentationPrompt,
	type RealtimePresentation,
} from "@/runtime/codex-realtime/lib/presentation-mode";
import { ARCHBOARD_VOICE_PROMPT } from "@/runtime/codex-realtime/lib/voice-prompt";

/**
 * How the coordinator says which of its messages the voice model speaks.
 *
 * The session runs in Codex's `bemTags` handoff mode, where a message's first characters choose
 * its channel: `[FINAL]` is speakable and `[COMMENTARY]` is quiet context (Codex 0.155.1,
 * `realtime_conversation/bem.rs`). A message with no header is buffered until it is complete and
 * then treated as final, so an untagged preamble is read out as if it were the answer, and the
 * answer itself cannot stream. Telling the coordinator the rule is what makes the mode work.
 */
const COORDINATOR_CHANNEL_INSTRUCTIONS = [
	"Voice channel rule. While this voice session is live, begin every message you write with a channel header as its very first characters, because the header decides whether the user hears it.",
	"[FINAL] marks what the voice model is to say to the user: the answer, result or question, as short speakable prose with no markdown, lists, ids or tool syntax. Write at most one [FINAL] message in a turn, as its last message.",
	"[COMMENTARY] marks everything else, such as what you are about to do or progress while you work: the voice model receives it as quiet context and does not say it. When nothing should be said to the user at all, end the turn with a one-line [COMMENTARY] message and no [FINAL] message.",
].join("\n");

const REALTIME_END_INSTRUCTIONS =
	"Finish the current sentence, preserve unresolved approvals for the visual workbench, and leave no work waiting on voice.";

/**
 * The fixed thread/realtime/start body Archboard sends: WebRTC audio, the voice model's own
 * prompt and nothing else for it, and for the coordinator only what a voice session adds to its
 * standing instructions. Every option that is not an input is policy and lives here so a start
 * cannot vary by caller.
 *
 * Each model gets its own prompt and no other's (TASK-297). The voice model is given no
 * developer items, no JSON and no Codex startup context: `includeStartupContext` would make
 * Codex prepend a `<startup_context>` of recent threads and a workspace scan to the prompt, and
 * `realtimeStartInstructions` is rendered into the coordinator thread's world state on every
 * turn (Codex 0.155.1, `session/world_state.rs`), so it must not repeat the coordinator's
 * developer instructions either. The board catalogue reaches the coordinator as a developer
 * item on its own thread; board context reaches it through its tools and the semantic callbacks.
 * @param input - The coordinator thread, minted wire session id, browser offer and narration.
 * @param input.threadId - The coordinator thread the session speaks for.
 * @param input.realtimeSessionId - The wire session id minted for this start.
 * @param input.sdp - The browser's WebRTC offer.
 * @param input.presentation - The walkthrough this session was started to present, or null.
 * @returns The start parameters.
 */
export function createRealtimeStartParams(input: {
	readonly threadId: ThreadId;
	readonly realtimeSessionId: WireRealtimeSessionId;
	readonly sdp: string;
	readonly presentation?: RealtimePresentation | null;
}): SessionParams<"thread/realtime/start"> {
	// A narration adds to the voice prompt and replaces none of it: the voice is still the board
	// assistant between steps. The coordinator is told nothing of it, since every step reaches the
	// voice model from the host and a question asked during a narration is an ordinary request.
	const narrated = input.presentation?.name ?? null;
	return {
		threadId: input.threadId,
		clientManagedHandoffs: false,
		delegationAckFiller: true,
		flushTranscriptTailOnSessionEnd: true,
		codexResponsesAsItems: false,
		codexResponseHandoffMode: "bemTags",
		outputModality: "audio",
		includeStartupContext: false,
		initialItems: [],
		realtimeStartInstructions: COORDINATOR_CHANNEL_INSTRUCTIONS,
		realtimeEndInstructions: REALTIME_END_INSTRUCTIONS,
		prompt:
			narrated === null
				? ARCHBOARD_VOICE_PROMPT
				: `${ARCHBOARD_VOICE_PROMPT}\n\n${voicePresentationPrompt(narrated)}`,
		realtimeSessionId: input.realtimeSessionId,
		transport: { type: "webrtc", sdp: input.sdp },
		version: "v3",
		voice: "arbor",
	};
}

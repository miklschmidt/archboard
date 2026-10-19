import type {
	RealtimeSessionId as WireRealtimeSessionId,
	ThreadId,
} from "@archboard/codex-app-server/identity";
import type { SessionParams } from "@archboard/codex-app-server/session";

import {
	voicePresentationPrompt,
	type RealtimePresentation,
} from "#runtime/rules/realtime/presentation-mode.ts";
import {
	ARCHBOARD_RECORDING_VOICE_PROMPT,
	ARCHBOARD_VOICE_PROMPT,
} from "#runtime/rules/realtime/voice-prompt.ts";

/**
 * How the coordinator says which of its messages the voice model speaks.
 *
 * The session runs in Codex's `bemTags` handoff mode, where a message's first characters choose
 * its channel: `[FINAL]` is appended to the voice session as speakable, which the voice model
 * reacts to, and `[COMMENTARY]` as quiet context, which it never reacts to (Codex 0.160.0,
 * `realtime_conversation/bem.rs`, `v3_output_writer`). A message with no header is buffered until
 * it is complete and then treated as final, so an untagged preamble is read out as if it were the
 * answer, and the answer itself cannot stream. Telling the coordinator the rule is what makes the
 * mode work.
 */
const CHANNEL_RULE = [
	"Voice channel rule. While this voice session is live, begin every message you write with a channel header as its very first characters, because the header decides whether the voice model reacts to it.",
	"[FINAL] is the only message the voice model reacts to: it says it to the user in its own words. Use it for the answer, result or question, as short speakable prose with no markdown, lists, ids or tool syntax. Write at most one [FINAL] message in a turn, as its last message.",
	"[COMMENTARY] marks everything else, such as what you are about to do or progress while you work: the voice model receives it as quiet context and never reacts to it.",
];

/**
 * The channel rule while somebody is listening. A handoff answered with commentary alone leaves
 * the voice model silent after its "one moment": in the 2026-09-23 session the user had to ask
 * "You good" (TASK-315).
 */
const COORDINATOR_CHANNEL_INSTRUCTIONS = [
	...CHANNEL_RULE,
	"A turn that answers a handoff always ends with one [FINAL] message, even when you only started work, found nothing, or could not tell what was asked: the voice model is waiting for your answer, and commentary alone leaves it silent and the user waiting. End a turn with only a one-line [COMMENTARY] message when nothing should be said at all, such as news the user is not waiting for.",
	'For example, a turn that answers "what does the Archboard server do?" writes two messages:',
	"[COMMENTARY] Reading the Archboard server on the Archboard board.",
	"[FINAL] It is the only part that writes a board: it checks each write, takes the board's lease and commits it to disk before it answers.",
	"A turn that hands work to the workhorse ends the same way:",
	"[COMMENTARY] Delegating the new proposal to the workhorse.",
	"[FINAL] The workhorse is drafting that proposal now. I will tell you when it is on the board.",
].join("\n");

/**
 * The channel rule while a recording holds the voice (TASK-304). Nobody is there to hear an answer,
 * and whatever the voice says lands in the video as narration of the step on screen, so the
 * coordinator is told it has nobody to speak to until the session ends.
 */
const RECORDING_COORDINATOR_INSTRUCTIONS = [
	...CHANNEL_RULE,
	"A recording is using this voice session: every word the voice says goes into a video of a walkthrough, and nobody is listening. Until the session ends, begin every message with [COMMENTARY] and never write [FINAL]; nothing you write is to be spoken.",
].join("\n");

const REALTIME_END_INSTRUCTIONS =
	"Finish the current sentence, preserve unresolved approvals for the visual workbench, and leave no work waiting on voice.";

/**
 * The voice model's prompt: the ordinary one, the ordinary one with a narration added, or for a
 * recording the persona with the recording's section, since nobody is there to talk to.
 * @param presentation The walkthrough the session presents, or null.
 * @returns The prompt.
 */
function voicePrompt(presentation: RealtimePresentation | null): string {
	if (presentation === null) return ARCHBOARD_VOICE_PROMPT;
	const base =
		presentation.recording === null ? ARCHBOARD_VOICE_PROMPT : ARCHBOARD_RECORDING_VOICE_PROMPT;
	return `${base}\n\n${voicePresentationPrompt(presentation)}`;
}

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
 * turn (Codex 0.160.0, `session/world_state.rs`), so it must not repeat the coordinator's
 * developer instructions either. The board catalogue reaches the coordinator as a developer
 * item on its own thread; board context reaches it through its tools and the semantic callbacks.
 *
 * A recorded walkthrough (TASK-304) is the one start that varies policy: its voice prompt says the
 * talk is recorded, it sends no delegation acknowledgement filler, and the coordinator is told to
 * write nothing speakable, since anything it answered would be spoken into the video.
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
	// voice model from the server and a question asked during a narration is an ordinary request.
	// A recording hands nothing off, so it has no delegation to fill: the Realtime API's own
	// "one moment" filler would be the only thing it could say that nobody asked for. Its
	// coordinator is told to say nothing, because a turn it ran anyway would be heard in the video.
	const presentation = input.presentation ?? null;
	const recording = presentation !== null && presentation.recording !== null;
	return {
		threadId: input.threadId,
		clientManagedHandoffs: false,
		delegationAckFiller: !recording,
		flushTranscriptTailOnSessionEnd: true,
		codexResponsesAsItems: false,
		codexResponseHandoffMode: "bemTags",
		outputModality: "audio",
		includeStartupContext: false,
		initialItems: [],
		realtimeStartInstructions: recording
			? RECORDING_COORDINATOR_INSTRUCTIONS
			: COORDINATOR_CHANNEL_INSTRUCTIONS,
		realtimeEndInstructions: REALTIME_END_INSTRUCTIONS,
		prompt: voicePrompt(presentation),
		realtimeSessionId: input.realtimeSessionId,
		transport: { type: "webrtc", sdp: input.sdp },
		version: "v3",
		voice: "cove",
	};
}

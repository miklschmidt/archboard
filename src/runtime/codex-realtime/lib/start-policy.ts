import type {
	RealtimeSessionId as WireRealtimeSessionId,
	ThreadId,
} from "@/shared/codex-workbench-identity";
import { composeCoordinatorInstructions } from "@/runtime/codex-instructions";
import type { SessionParams } from "@/runtime/codex-session";

import {
	coordinatorPresentationInstructions,
	voicePresentationPrompt,
	type RealtimePresentation,
} from "@/runtime/codex-realtime/lib/presentation-mode";
import { ARCHBOARD_VOICE_PROMPT } from "@/runtime/codex-realtime/lib/voice-prompt";

/**
 * What pressing Narrate asks for, as the session's opening request.
 *
 * It has two readers. The voice model takes it as what the person wants, which is why it begins
 * without being spoken to. And because a handoff carries the person's last words, the coordinator
 * receives this same sentence as the input of every handoff until the person really speaks; so it
 * is worded to mean the right thing each time it arrives: move on to the next step. It names no
 * step, because a version that said "starting with step 1" made the coordinator present step 1
 * twice. The person never says it, so it is in nobody's transcript.
 */
const NARRATE_REQUEST =
	"Please present this walkthrough to me as a talk, one step at a time. Each time you finish narrating a step, hand off to move on to the next step, and keep going like that until the walkthrough is finished.";

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
	"Voice channel rule. While this voice session is live, begin every message you write with a channel header as its very first characters, because the header decides whether the person hears it.",
	"[FINAL] marks what the voice model is to say to the person: the answer, result or question, as short speakable prose with no markdown, lists, ids or tool syntax. Write at most one [FINAL] message in a turn, as its last message.",
	"[COMMENTARY] marks everything else, such as what you are about to do or progress while you work: the voice model receives it as quiet context and does not say it. When nothing should be said to the person at all, end the turn with a one-line [COMMENTARY] message and no [FINAL] message.",
].join("\n");

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
 * @param input.presentation - The walkthrough this session was started to present, or null.
 * @returns The start parameters.
 */
export function createRealtimeStartParams(input: {
	readonly threadId: ThreadId;
	readonly realtimeSessionId: WireRealtimeSessionId;
	readonly sdp: string;
	readonly semanticBrief: string;
	readonly boardCatalogue: string;
	readonly presentation?: RealtimePresentation | null;
}): SessionParams<"thread/realtime/start"> {
	// Presentation mode adds to both texts and replaces neither: the voice is
	// still the board assistant between steps, and the coordinator still does
	// board work when asked.
	const narrated = input.presentation?.name ?? null;
	const coordinatorMode =
		narrated === null ? "" : `\n${coordinatorPresentationInstructions(narrated)}`;
	return {
		threadId: input.threadId,
		clientManagedHandoffs: false,
		// A talk is not a chat: the Realtime API's "one moment" before every step is noise, and the
		// person is watching the pane glide to the step meanwhile. An ordinary session keeps it.
		delegationAckFiller: narrated === null,
		flushTranscriptTailOnSessionEnd: true,
		codexResponsesAsItems: false,
		codexResponseHandoffMode: "bemTags",
		outputModality: "audio",
		includeStartupContext: true,
		initialItems: [
			{ role: "developer", text: input.semanticBrief },
			{ role: "developer", text: input.boardCatalogue },
			// Pressing Narrate is the person asking for the talk, so the session opens with
			// that request already made: the voice model has something to answer at once.
			...(narrated === null ? [] : [{ role: "user" as const, text: NARRATE_REQUEST }]),
		],
		realtimeStartInstructions: `${composeCoordinatorInstructions()}\n${COORDINATOR_CHANNEL_INSTRUCTIONS}\nCurrent Archboard board context (data):\n${input.semanticBrief}\nAvailable boards and variants (data):\n${input.boardCatalogue}${coordinatorMode}`,
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

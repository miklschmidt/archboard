import type {
	RealtimeSessionId as WireRealtimeSessionId,
	ThreadId,
} from "@archboard/codex-app-server/identity";
import type { SessionParams } from "@archboard/codex-app-server/session";

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
	'For example, a turn that answers "what does the service do?" writes two messages:',
	"[COMMENTARY] Reading the service implementation.",
	"[FINAL] It accepts requests and commits each change before it answers.",
	"A turn that hands work to the workhorse ends the same way:",
	"[COMMENTARY] Delegating the requested change to the workhorse.",
	"[FINAL] The workhorse is implementing the change now. I will tell you when it finishes.",
].join("\n");

/**
 * The channel rule while a recording holds the voice (TASK-304). Nobody is there to hear an answer,
 * and whatever the voice says lands in the video as narration of the step on screen, so the
 * coordinator is told it has nobody to speak to until the session ends.
 */
const RECORDING_COORDINATOR_INSTRUCTIONS = [
	...CHANNEL_RULE,
	"The host suppresses spoken coordinator replies during this voice session. Until the session ends, begin every message with [COMMENTARY] and never write [FINAL]; nothing you write is to be spoken.",
].join("\n");

const REALTIME_END_INSTRUCTIONS =
	"Finish the current sentence, preserve unresolved approvals for the visual workbench, and leave no work waiting on voice.";

/**
 * Build a Codex realtime start with core channel rules and the exact host voice prompt.
 * The coordinator receives coordination instructions. The voice receives the host prompt.
 * Domain snapshots travel through the context source after startup.
 * @param input The exact coordinator, wire session, browser offer, and host voice policy.
 * @param input.threadId The coordinator thread this voice session speaks for.
 * @param input.realtimeSessionId The minted wire session identity.
 * @param input.sdp The browser offer.
 * @param input.voice The host voice policy for this start.
 * @param input.voice.prompt The exact host prompt.
 * @param input.voice.suppressCoordinatorSpeech Whether coordinator replies stay quiet.
 * @param input.voice.delegationAckFiller Whether voice acknowledges a handoff.
 * @returns The realtime start parameters.
 */
export function createRealtimeStartParams(input: {
	readonly threadId: ThreadId;
	readonly realtimeSessionId: WireRealtimeSessionId;
	readonly sdp: string;
	readonly voice: {
		readonly prompt: string;
		readonly suppressCoordinatorSpeech: boolean;
		readonly delegationAckFiller: boolean;
	};
}): SessionParams<"thread/realtime/start"> {
	return {
		threadId: input.threadId,
		clientManagedHandoffs: false,
		delegationAckFiller: input.voice.delegationAckFiller,
		flushTranscriptTailOnSessionEnd: true,
		codexResponsesAsItems: false,
		codexResponseHandoffMode: "bemTags",
		outputModality: "audio",
		includeStartupContext: false,
		initialItems: [],
		realtimeStartInstructions: input.voice.suppressCoordinatorSpeech
			? RECORDING_COORDINATOR_INSTRUCTIONS
			: COORDINATOR_CHANNEL_INSTRUCTIONS,
		realtimeEndInstructions: REALTIME_END_INSTRUCTIONS,
		prompt: input.voice.prompt,
		realtimeSessionId: input.realtimeSessionId,
		transport: { type: "webrtc", sdp: input.sdp },
		version: "v3",
		voice: "cove",
	};
}

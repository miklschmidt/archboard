import { CHANNEL_RULE, COORDINATOR_CHANNEL_INSTRUCTIONS } from "#runtime/rules/host/authored.ts";
import type {
	RealtimeSessionId as WireRealtimeSessionId,
	ThreadId,
} from "@archboard/codex-app-server/identity";
import type { SessionParams } from "@archboard/codex-app-server/session";

/**
 * The channel rule while the host suppresses coordinator speech, as it does when nobody listens
 * live: the coordinator is told it has nobody to speak to until the session ends.
 */
const SILENT_COORDINATOR_INSTRUCTIONS = `${CHANNEL_RULE}\nThe host suppresses spoken coordinator replies during this voice session. Until the session ends, begin every message with [COMMENTARY] and never write [FINAL]; nothing you write is to be spoken.`;

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
			? SILENT_COORDINATOR_INSTRUCTIONS
			: COORDINATOR_CHANNEL_INSTRUCTIONS,
		realtimeEndInstructions: REALTIME_END_INSTRUCTIONS,
		prompt: input.voice.prompt,
		realtimeSessionId: input.realtimeSessionId,
		transport: { type: "webrtc", sdp: input.sdp },
		version: "v3",
		voice: "cove",
	};
}

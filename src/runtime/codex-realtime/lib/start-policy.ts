import type {
	RealtimeSessionId as WireRealtimeSessionId,
	ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";
import { composeCoordinatorInstructions } from "../../codex-instructions/index.js";
import type { SessionParams } from "../../codex-session/index.js";
import { ARCHBOARD_VOICE_PROMPT } from "./voice-prompt.js";

const REALTIME_END_INSTRUCTIONS =
	"Finish the current sentence, preserve unresolved approvals for the visual workbench, and leave no work waiting on voice.";

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

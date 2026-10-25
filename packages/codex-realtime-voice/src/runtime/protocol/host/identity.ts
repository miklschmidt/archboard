/**
 * How a host names itself to Codex. Codex records both values on every thread the voice agent
 * starts, and the voice agent drives only a thread whose recorded source is its own, so a host
 * that changes either value no longer reaches the threads it started before.
 */
interface VoiceAgentIdentity {
	/** The client service name Codex records for each thread the voice agent starts. */
	readonly serviceName: string;
	/** The thread source Codex records, and the voice agent requires, on each of its threads. */
	readonly threadSource: string;
}

/** The identity of a host that names none of its own. */
const DEFAULT_VOICE_AGENT_IDENTITY: VoiceAgentIdentity = Object.freeze({
	serviceName: "codex-realtime-voice",
	threadSource: "codex-realtime-voice",
});

export { DEFAULT_VOICE_AGENT_IDENTITY, type VoiceAgentIdentity };

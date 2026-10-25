/**
 * How a host names itself: to Codex on every thread and tool, and to the user in what the agents
 * are told. Codex records the service name and thread source on every thread the voice agent
 * starts, and the voice agent drives only a thread whose recorded source is its own. A thread keeps
 * the tool namespaces it started with, so a host that changes any value no longer reaches the
 * threads it started before.
 */
interface VoiceAgentIdentity {
	/** The client service name Codex records for each thread the voice agent starts. */
	readonly serviceName: string;
	/** The thread source Codex records, and the voice agent requires, on each of its threads. */
	readonly threadSource: string;
	/** What the user talks with, as the workhorse is told: "while they talk with <product> by voice". */
	readonly productName: string;
	/**
	 * The Codex tool namespace of each built-in role, each `^[a-z][a-z0-9_]{0,63}$`: the coordinator's
	 * workhorse tools, its spoken-approval tool, and the workhorse's way to reach the coordinator.
	 */
	readonly toolNamespaces: {
		readonly workhorse: string;
		readonly voice: string;
		readonly coordinator: string;
	};
}

/** The identity of a host that names none of its own. */
const DEFAULT_VOICE_AGENT_IDENTITY: VoiceAgentIdentity = Object.freeze({
	serviceName: "codex-realtime-voice",
	threadSource: "codex-realtime-voice",
	productName: "Codex",
	toolNamespaces: Object.freeze({
		workhorse: "voice_workhorse",
		voice: "voice_channel",
		coordinator: "voice_coordinator",
	}),
});

const TOOL_NAMESPACE = /^[a-z][a-z0-9_]{0,63}$/u;
/** One line a JSON string and a prompt can hold verbatim: no quote, backslash, brace or control. */
const PRODUCT_NAME = /^[^"\\{}\p{Cc}]{1,64}$/u;

/**
 * Copy and check a host's identity, so what reaches Codex and the records is what the host named.
 * @param named The values the host names; each one it leaves out is the default's.
 * @returns The frozen, complete identity.
 * @throws {TypeError} When a value is empty or not of its shape, or two roles share a namespace.
 */
function captureVoiceAgentIdentity(named: Partial<VoiceAgentIdentity>): VoiceAgentIdentity {
	const identity = { ...DEFAULT_VOICE_AGENT_IDENTITY, ...named };
	const { workhorse, voice, coordinator } = identity.toolNamespaces;
	if (!identity.serviceName || !identity.threadSource)
		throw new TypeError("A voice agent identity requires a service name and a thread source.");
	if (!PRODUCT_NAME.test(identity.productName))
		throw new TypeError("A voice agent product name is one line of 1 to 64 plain characters.");
	if (![workhorse, voice, coordinator].every((name) => TOOL_NAMESPACE.test(name)))
		throw new TypeError("A voice agent tool namespace must match ^[a-z][a-z0-9_]{0,63}$.");
	if (new Set([workhorse, voice, coordinator]).size !== 3)
		throw new TypeError("Each voice agent role needs a tool namespace of its own.");
	return Object.freeze({
		serviceName: identity.serviceName,
		threadSource: identity.threadSource,
		productName: identity.productName,
		toolNamespaces: Object.freeze({ workhorse, voice, coordinator }),
	});
}

export { DEFAULT_VOICE_AGENT_IDENTITY, captureVoiceAgentIdentity, type VoiceAgentIdentity };

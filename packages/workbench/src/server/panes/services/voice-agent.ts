// The voice agent this server runs, from its creation until its stop: the pane sockets connect to
// it, and the panes read their tabs from it.

import type {
	VoiceAgent,
	VoiceConnection,
	VoiceRoute,
	VoiceSocket,
} from "@archboard/codex-realtime-voice/server";

let installed: Pick<VoiceAgent, "connect" | "tabs" | "voiceStartTrace"> | null = null;

/**
 * Make an agent the one the panes connect to and read their tabs from.
 * @param agent The agent.
 * @returns How to stop using it, which leaves a later agent in place.
 */
function installVoiceAgent(agent: NonNullable<typeof installed>): () => void {
	if (installed !== null) throw new Error("A voice agent is already installed.");
	installed = agent;
	return () => {
		if (installed === agent) installed = null;
	};
}

/**
 * Connect one pane socket to the agent.
 * @param socket The socket.
 * @param route Who it is.
 * @returns Its connection, or null while no agent runs.
 */
function connectVoice(socket: VoiceSocket, route: VoiceRoute): VoiceConnection | null {
	return installed?.connect(socket, route) ?? null;
}

/**
 * The browser tabs as the agent's sockets name them.
 * @returns Them, or null while no agent runs.
 */
function voiceTabs(): VoiceAgent["tabs"] | null {
	return installed?.tabs ?? null;
}

/**
 * What happened in the last voice starts.
 * @returns The kept attempts, none while no agent runs.
 */
function voiceStartAttempts(): ReturnType<VoiceAgent["voiceStartTrace"]> {
	return installed?.voiceStartTrace() ?? [];
}

export { connectVoice, installVoiceAgent, voiceStartAttempts, voiceTabs };

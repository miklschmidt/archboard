import { useCallback } from "react";
import type { VoiceClientSnapshot } from "@archboard/codex-realtime-voice/browser";
import { useVoiceClient, useVoiceState } from "@archboard/codex-realtime-voice/react";

const LIVE_PHASES = new Set(["listening", "speaking", "muted", "processing"]);
const STOPPABLE_PHASES = new Set([...LIVE_PHASES, "requesting_permission", "negotiating"]);

/**
 * Present coordinator voice with a stop that does not interrupt repository work.
 * @returns The rendered controls or content.
 */
function VoicePanel() {
	const client = useVoiceClient();
	const state = useVoiceState();
	const phase = state.voice.phase;
	const live = LIVE_PHASES.has(phase);
	const start = useCallback(() => {
		void client.startVoice();
	}, [client]);
	const mute = useCallback(() => {
		void client.setMuted(phase !== "muted");
	}, [client, phase]);
	const stop = useCallback(() => {
		void client.stopVoice();
	}, [client]);
	return (
		<section className="panel voice-panel" aria-labelledby="coordinator-heading">
			<div className="panel-heading">
				<h2 id="coordinator-heading">Coordinator</h2>
				<output>{phase.replaceAll("_", " ")}</output>
			</div>
			<p>Talk through the work. The coordinator delegates sustained tasks to the workhorse.</p>
			<div className="actions">
				<button className="primary" disabled={!canStart(state)} onClick={start}>
					Start voice
				</button>
				<button disabled={state.busy || !live} onClick={mute}>
					{phase === "muted" ? "Unmute microphone" : "Mute microphone"}
				</button>
				<button disabled={!STOPPABLE_PHASES.has(phase)} onClick={stop}>
					Stop voice
				</button>
			</div>
			<MediaProblem voice={state.voice} />
			<VoiceTranscript state={state} />
		</section>
	);
}

/**
 * Decide whether a new voice run can start.
 * @param state The client state.
 * @returns Whether Start voice is offered.
 */
function canStart(state: VoiceClientSnapshot): boolean {
	if (state.busy || STOPPABLE_PHASES.has(state.voice.phase) || !state.voice.available) return false;
	return state.connection === "connected" && state.server?.account.state === "ready";
}

/**
 * Explain browser media failures without hiding the conversation.
 * @param props The rendered state.
 * @param props.voice The coordinator's voice run.
 * @returns The rendered controls or content.
 */
function MediaProblem({ voice }: { readonly voice: VoiceClientSnapshot["voice"] }) {
	if (voice.problem === null) return null;
	if (!voice.available)
		return (
			<p role="alert">
				{voice.problem} Allow microphone access in your browser, then select Reconnect.
			</p>
		);
	return <p role="alert">{voice.problem}</p>;
}

/**
 * Read the coordinator transcript from the server state.
 * @param props The rendered state.
 * @param props.state The client state.
 * @returns The rendered controls or content.
 */
function VoiceTranscript({ state }: { readonly state: VoiceClientSnapshot }) {
	const items = state.server === null ? [] : state.server.voice.transcript;
	return (
		<div className="voice-transcript" aria-label="Voice transcript">
			{items.length === 0 && <p className="empty">The voice transcript appears here.</p>}
			{items.map((item) => (
				<div className="message" key={item.itemId}>
					<span>{item.speaker === "user" ? "You" : "Coordinator"}</span>
					<p>{item.text}</p>
				</div>
			))}
		</div>
	);
}

export { VoicePanel };

import { useCallback } from "react";
import type { ExampleClient, ExampleClientSnapshot } from "#ui/clients/workbench/client.ts";

const LIVE_PHASES = new Set(["listening", "speaking", "muted", "processing"]);
const STOPPABLE_PHASES = new Set([...LIVE_PHASES, "requesting_permission", "negotiating"]);

/**
 * Present coordinator voice with a stop that does not interrupt repository work.
 * @param props The rendered state and its action owners.
 * @param props.client The shared connection and media client.
 * @param props.state The current page projection.
 * @returns The rendered controls or content.
 */
function VoicePanel({
	client,
	state,
}: {
	readonly client: ExampleClient;
	readonly state: ExampleClientSnapshot;
}) {
	const phase = state.media === null ? "idle" : state.media.state.phase;
	const live = LIVE_PHASES.has(phase);
	const start = useCallback(() => {
		void client.startVoice();
	}, [client]);
	const mute = useCallback(() => {
		void client.toggleMute();
	}, [client]);
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
				<button className="primary" disabled={!canStart(state, phase)} onClick={start}>
					Start voice
				</button>
				<button disabled={state.busy || !live} onClick={mute}>
					{phase === "muted" ? "Unmute microphone" : "Mute microphone"}
				</button>
				<button disabled={!STOPPABLE_PHASES.has(phase)} onClick={stop}>
					Stop voice
				</button>
			</div>
			<MediaProblem state={state} />
			<VoiceTranscript state={state} />
		</section>
	);
}

/**
 * Decide whether a new voice run can start.
 * @param state The current page projection.
 * @param phase The phase value.
 * @returns The rendered controls or content.
 */
function canStart(state: ExampleClientSnapshot, phase: string): boolean {
	if (state.busy || STOPPABLE_PHASES.has(phase) || state.mediaState.state !== "ready") return false;
	return (
		state.transport.connection === "connected" &&
		state.transport.snapshot?.account.state === "ready"
	);
}

/**
 * Explain browser media failures without hiding the conversation.
 * @param props The rendered state and its action owners.
 * @param props.state The current page projection.
 * @returns The rendered controls or content.
 */
function MediaProblem({ state }: { readonly state: ExampleClientSnapshot }) {
	if (state.mediaState.state === "unavailable")
		return (
			<p role="alert">
				{state.mediaState.message} Allow microphone access in your browser, then select Reconnect.
			</p>
		);
	if (state.media === null) return null;
	const media = state.media.state;
	if (media.phase === "recoverable_error" || media.phase === "terminal_error")
		return <p role="alert">{media.reason}</p>;
	return null;
}

/**
 * Read the coordinator transcript from its shared owner.
 * @param props The rendered state and its action owners.
 * @param props.state The current page projection.
 * @returns The rendered controls or content.
 */
function VoiceTranscript({ state }: { readonly state: ExampleClientSnapshot }) {
	const snapshot = state.transport.snapshot;
	const items = snapshot === null ? [] : snapshot.voice.transcript;
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

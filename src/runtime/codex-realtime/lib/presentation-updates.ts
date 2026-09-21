import type { CodexRealtimeAdapterOptions } from "@/runtime/codex-realtime/lib/contract";
import {
	presentationChangeTexts,
	type RealtimePresentationChange,
	type VoiceDelivery,
} from "@/runtime/codex-realtime/lib/presentation-mode";
import type { ActiveRealtimeSession } from "@/runtime/codex-realtime/lib/state";

/**
 * Tell the coordinator and the voice model when a user moves a presented walkthrough by hand
 * or leaves it, so the narration follows the picture (TASK-251). Changes are serialized behind
 * session startup and sent to the coordinator first, as the board catalogue is; a lost response
 * is never retried, because the next change says where the picture is anyway.
 * @param options The change source and the session transport.
 * @param session The voice session that owns the watcher.
 * @param isCurrent Whether the session still owns its binding.
 * @param onError Receives unconfirmed deliveries.
 * @returns Stops watching and prevents queued changes from sending.
 */
export function watchPresentationChanges(
	options: CodexRealtimeAdapterOptions,
	session: ActiveRealtimeSession,
	isCurrent: () => boolean,
	onError: (message: string) => void,
): () => void {
	const source = options.presentationChanges;
	if (source === undefined) {
		return () => undefined;
	}
	let stopped = false;
	let tail = Promise.resolve();
	/**
	 * Whether this watcher still owns a live session binding.
	 * @returns True while delivery is allowed.
	 */
	const current = () => !stopped && isCurrent();
	const { coordinatorThreadId: threadId } = session.binding;
	/**
	 * Tell the coordinator, without retrying an unknown outcome.
	 * @param text What the user did.
	 */
	const injectCoordinator = async (text: string): Promise<void> => {
		try {
			await options.session.threadInjectItems({
				threadId,
				items: [{ type: "message", role: "developer", content: [{ type: "input_text", text }] }],
			});
		} catch {
			if (current())
				onError("The coordinator was not confirmed told that the user moved the presentation.");
		}
	};
	/**
	 * Tell the voice model after the coordinator attempt settles: as speech it says, or as
	 * quiet context.
	 * @param voice What it is given, and how.
	 */
	const appendVoice = async (voice: VoiceDelivery): Promise<void> => {
		try {
			await (voice.via === "speech"
				? options.session.realtimeAppendSpeech({ threadId, text: voice.text })
				: options.session.realtimeAppendText({ threadId, role: "developer", text: voice.text }));
		} catch {
			if (current())
				onError("The voice model was not confirmed told that the user moved the presentation.");
		}
	};
	/**
	 * Deliver one change to both histories, once the session has started.
	 * @param change What the user did.
	 */
	const deliver = async (change: RealtimePresentationChange): Promise<void> => {
		try {
			await session.answer;
		} catch {
			return;
		}
		if (!current()) return;
		const texts = presentationChangeTexts(change);
		await injectCoordinator(texts.coordinator);
		if (!current()) return;
		await appendVoice(texts.voice);
	};
	const unsubscribe = source.subscribe((change) => {
		// What a user did before the narrator existed is not news to it: it begins by asking
		// for the first step, which puts the pane there whatever was on screen.
		if (!session.started) return;
		tail = tail.then(() => deliver(change)).catch(() => undefined);
	});
	return () => {
		stopped = true;
		unsubscribe();
	};
}

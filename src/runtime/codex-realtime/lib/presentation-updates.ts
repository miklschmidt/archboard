import type { CodexRealtimeAdapterOptions } from "@/runtime/codex-realtime/lib/contract";
import {
	presentationSpeech,
	type RealtimePresentationChange,
} from "@/runtime/codex-realtime/lib/presentation-mode";
import type { ActiveRealtimeSession } from "@/runtime/codex-realtime/lib/state";

/**
 * Hand the voice model each step of a narrated walkthrough as it lands on the user's screen, and
 * tell it when they leave (TASK-251). Deliveries are serialized behind session startup, so a step
 * that arrived while Codex was still starting the session is said once it has; a lost response is
 * never retried, because the next step says where the picture is anyway.
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
	/**
	 * Hand one change to the voice model as speech, once the session has started.
	 * @param change Where the walkthrough now is.
	 */
	const deliver = async (change: RealtimePresentationChange): Promise<void> => {
		try {
			await session.answer;
		} catch {
			return;
		}
		if (!current()) return;
		try {
			await options.session.realtimeAppendSpeech({
				threadId: session.binding.coordinatorThreadId,
				text: presentationSpeech(change),
			});
		} catch {
			if (current()) onError("The voice model was not confirmed told where the walkthrough is.");
		}
	};
	const unsubscribe = source.subscribe((change) => {
		tail = tail.then(() => deliver(change)).catch(() => undefined);
	});
	return () => {
		stopped = true;
		unsubscribe();
	};
}

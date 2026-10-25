import type { CodexRealtimeAdapterOptions } from "#runtime/services/realtime/contract.ts";
import type { ActiveRealtimeSession } from "#runtime/services/realtime/state.ts";
import type { WorkbenchVoiceInput } from "#runtime/protocol/host/context-source.ts";

// Serialize host input behind start. A lost response is never retried.
/**
 * Serialize host voice inputs behind session startup and stop them with their generation.
 * @param options The session ports and host policy.
 * @param session The exact active voice generation.
 * @param isCurrent The core generation predicate.
 * @param onError Receives an unconfirmed delivery or source failure.
 * @returns The cleanup that stops future input delivery.
 */
export function watchVoiceInputs(
	options: CodexRealtimeAdapterOptions,
	session: ActiveRealtimeSession,
	isCurrent: () => boolean,
	onError: (message: string) => void,
): () => void {
	const subscribe = options.voice.subscribe;
	if (subscribe === undefined) return () => undefined;
	let stopped = false;
	let tail = Promise.resolve();
	/**
	 * Test whether this watcher still owns the active generation.
	 * @returns Whether the stated condition holds.
	 */
	const current = (): boolean => !stopped && isCurrent();
	/**
	 * Deliver one captured host input at most once to its exact voice generation.
	 * @param input The captured input and its operation identity.
	 * @returns Resolves after this input settles or is skipped.
	 */
	const deliver = async (input: WorkbenchVoiceInput): Promise<void> => {
		try {
			await session.answer;
		} catch {
			return;
		}
		if (!current()) return;
		try {
			const params = { threadId: session.binding.coordinatorThreadId, text: input.text };
			await sendHostInput(options, params, input.channel);
			if (!current()) onError("The voice input outcome is unknown because its session changed.");
		} catch {
			if (current()) onError("The voice input delivery was not confirmed.");
		}
	};
	const unsubscribe = subscribe(session.presentation, (input) => {
		const captured = Object.freeze({ ...input });
		tail = tail.then(() => deliver(captured)).catch(() => undefined);
	});
	return () => {
		stopped = true;
		unsubscribe();
	};
}

/**
 * Send host input through the explicitly selected channel.
 * @param options The session transport.
 * @param params The exact coordinator thread and input text.
 * @param params.threadId The coordinator thread of this generation.
 * @param params.text The captured host input.
 * @param channel Whether the input can cause speech.
 * @returns Resolves after the one append attempt.
 */
async function sendHostInput(
	options: CodexRealtimeAdapterOptions,
	params: {
		readonly threadId: ActiveRealtimeSession["binding"]["coordinatorThreadId"];
		readonly text: string;
	},
	channel: WorkbenchVoiceInput["channel"],
): Promise<void> {
	if (channel === "speech") await options.session.realtimeAppendSpeech(params);
	else await options.session.realtimeAppendText({ ...params, role: "developer" });
}

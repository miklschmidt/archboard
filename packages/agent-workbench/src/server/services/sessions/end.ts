// How one tab session ends (TASK-373), and the settlement steps the store shares.
//
// A session ends once its tab has gone for good. What it was asked is settled first, and what it
// runs is stopped. Then each thread it started is unsubscribed once nothing runs on it, so Codex
// unloads it. Its coordinator's tools and its voice adapter stay until then, so a turn still
// running is answered rather than left waiting.

import type { CodexRealtimeAdapter } from "#runtime/services/realtime/contract.ts";
import type { CodexThreadLinkPort } from "#runtime/rules/thread-link/contract.ts";
import type { ThreadUnload } from "#runtime/operations/thread-unload/unload.ts";
import type { ThreadId } from "@archboard/codex-app-server/identity";
import type { TabSessionId } from "#server/rules/tab-session/tab-session.ts";
import { appendFailure } from "#server/rules/generation/failures.ts";
import type { CodexWorkbenchTabSession } from "#server/services/sessions/sessions.ts";

/** What ending a session reaches beyond the session itself. */
interface TabSessionEnding {
	/** Where the links of the session's workhorses are cleared. */
	readonly threadLink: Pick<CodexThreadLinkPort, "read" | "clear">;
	/** Settle every approval the session was still to answer. */
	readonly endApprovals: (id: TabSessionId) => Promise<void>;
	/** Unsubscribe a thread once nothing runs on it. */
	readonly unload: (threadId: ThreadId) => Promise<ThreadUnload>;
	/** Stop the session owning a thread. */
	readonly release: (threadId: ThreadId) => void;
}

/**
 * Run every step, each whatever the others did, and report every failure together.
 * @param steps The steps, in order.
 * @param message What a failure was part of.
 */
async function settleEach(steps: readonly (() => unknown)[], message: string): Promise<void> {
	let failure: Error | null = null;
	for (const step of steps) {
		try {
			// oxlint-disable-next-line no-await-in-loop -- each step settles fully before the next, in the order the owners depend on
			await step();
		} catch (error) {
			failure = appendFailure(failure, error, message);
		}
	}
	if (failure !== null) {
		throw failure;
	}
}

/**
 * Stop a session's voice, if it is carrying any.
 * @param realtime The session's realtime adapter.
 */
async function stopVoice(realtime: CodexRealtimeAdapter): Promise<void> {
	const generation = realtime.generation();
	if (generation === null) {
		return;
	}
	await realtime.stop({
		sessionId: generation.browserSessionId,
		correlationId: generation.browserCorrelationId,
	});
}

/**
 * Clear a workhorse's link, so a tab that comes back under the same id starts without one and a
 * create still running for the session that ended cannot take it.
 * @param threadLink The link port.
 * @param key The workhorse's link key.
 */
function clearLink(threadLink: TabSessionEnding["threadLink"], key: string): void {
	const binding = threadLink.read(key);
	if (binding.link.state !== "unbound") {
		threadLink.clear(key, binding.cas);
	}
}

/**
 * End one session: settle what it was asked, stop what it runs, then unload each of its threads
 * once nothing runs on it, and only then dispose what a running turn could still reach.
 * @param session The session, already out of the live ones.
 * @param ending What ending it reaches beyond the session.
 * @returns Resolves once every thread of it was unloaded and it holds nothing any more.
 */
function endTabSession(session: CodexWorkbenchTabSession, ending: TabSessionEnding): Promise<void> {
	const { components, state } = session;
	const workhorses = [...session.workhorses.values()];
	return settleEach(
		[
			// First, and at once: a tab coming back under this id meanwhile starts unlinked, and the
			// approvals settled are exactly this session's.
			...workhorses.map(
				({ key }) =>
					() =>
						clearLink(ending.threadLink, key),
			),
			() => ending.endApprovals(session.id),
			() => stopVoice(components.realtime),
			() => components.spokenApproval.dispose(),
			...workhorses.map(
				({ components: owned }) =>
					() =>
						owned.semanticDelivery.dispose(),
			),
			() => components.callbacks.dispose(),
			() => components.semanticPublisher.dispose(),
			...workhorses.flatMap(({ components: owned }) => [
				() => owned.semanticPublisher.dispose(),
				() => owned.queue.shutdown(),
			]),
			() => Promise.all([...state.threads].map((threadId) => ending.unload(threadId))),
			() => components.realtime.dispose(),
			() => components.coordinatorTools.dispose(),
			() => {
				for (const threadId of state.threads) ending.release(threadId);
			},
		],
		"Ending a Codex tab session failed.",
	);
}

export { endTabSession, settleEach, stopVoice };
export type { TabSessionEnding };

// Whether the setup has anything new to say. The transport publishes with every
// piece of a reply, and nearly none of them moves the setup, so a snapshot is
// published only when it differs from the last one (TASK-385.03).

import type { HeldMessage } from "#ui/state/agent-setup/held.ts";
import type { AgentSetupSnapshot } from "#ui/state/agent-setup/setup.ts";

/**
 * Whether two lists of held messages are the same messages: a message that
 * changes is replaced, never edited in place.
 * @param a One list.
 * @param b The other.
 * @returns True when they hold the same messages in the same order.
 */
function sameHeld(a: readonly HeldMessage[], b: readonly HeldMessage[]): boolean {
	return a.length === b.length && a.every((message, index) => message === b[index]);
}

/**
 * Whether two snapshots say the same: the phase is made afresh from each
 * transport state, so it is compared by what it says.
 * @param a One snapshot.
 * @param b The other.
 * @returns True when nothing in them differs.
 */
function sameSnapshot(a: AgentSetupSnapshot, b: AgentSetupSnapshot): boolean {
	const sameWords = a.talk === b.talk && a.step === b.step && a.failure === b.failure;
	return (
		sameWords &&
		a.talkFailure === b.talkFailure &&
		sameHeld(a.held, b.held) &&
		JSON.stringify(a.phase) === JSON.stringify(b.phase)
	);
}

export { sameSnapshot };

// Where each participant of a sequence is busy: the activation bars its
// column draws, from a call that waits to the reply that answers it.
import { BAR_OVERHANG, MESSAGE_PITCH } from "@/transformers/semantic-renderer/lib/sequence-design";
import type {
	ActivationBar,
	PlacedStep,
} from "@/transformers/semantic-renderer/lib/layout/dataflow";

/**
 * Whether one message is the reply that answers a call.
 * @param candidate The message that might be the reply.
 * @param node The participant that received the call.
 * @param caller The participant that made it.
 * @returns True when it answers that call.
 */
function answers(candidate: PlacedStep, node: string, caller: string): boolean {
	return (
		candidate.step.kind === "return" && candidate.step.from === node && candidate.step.to === caller
	);
}

/**
 * The first later reply that answers a call and has not already answered one.
 * @param steps Every message of the flow, in order.
 * @param index The call being answered.
 * @param claimed Which messages have already been spent answering a call.
 * @returns Its position, or -1 when nothing answers the call.
 */
function answerIndex(
	steps: readonly PlacedStep[],
	index: number,
	claimed: ReadonlySet<number>,
): number {
	const call = steps[index];
	if (call === undefined) {
		return -1;
	}
	return steps.findIndex(
		(candidate, position) =>
			position > index &&
			!claimed.has(position) &&
			answers(candidate, call.step.to, call.step.from),
	);
}

/**
 * The lowest row a participant is still involved in, from a given message on.
 * @param steps Every message of the flow, in order.
 * @param from Where to start looking.
 * @param node The participant.
 * @returns The height of its last involvement.
 */
function lastInvolvement(steps: readonly PlacedStep[], from: number, node: string): number {
	let lowest = steps[from]?.y ?? 0;
	for (const candidate of steps.slice(from)) {
		if (candidate.step.from === node || candidate.step.to === node) {
			lowest = Math.max(lowest, candidate.y);
		}
	}
	return lowest;
}

/**
 * Nested or unanswered calls hand one column overlapping stretches; one bar per
 * busy run is what keeps the column readable. The bars arrive ordered by top,
 * because a message's height only ever grows.
 * @param bars The stretches, in the order they were found.
 * @returns The stretches, merged where they touch.
 */
function mergedBars(bars: readonly ActivationBar[]): ActivationBar[] {
	const merged: { top: number; bottom: number }[] = [];
	for (const bar of bars) {
		const current = merged[merged.length - 1];
		if (current !== undefined && bar.top <= current.bottom) {
			current.bottom = Math.max(current.bottom, bar.bottom);
		} else {
			merged.push({ ...bar });
		}
	}
	return merged;
}

/**
 * Where one participant is busy.
 *
 * A synchronous call is the one kind whose sender waits, so it is the one kind
 * that activates its receiver: the bar starts where the call arrives and runs to
 * the reply that answers it. A call nothing answers keeps its receiver busy
 * through that participant's last involvement, because the drawing never shows
 * the work finishing. An asynchronous message and a self-message activate
 * nothing — neither implies that anybody is waiting. A bar runs a little past
 * the call and the reply, so each arrow meets its straight side rather than
 * its rounded end.
 * @param node The participant.
 * @param steps Every message of the flow, in order.
 * @returns Its activation bars, in order and merged.
 */
function activationsFor(node: string, steps: readonly PlacedStep[]): ActivationBar[] {
	const claimed = new Set<number>();
	const bars: ActivationBar[] = [];
	for (const [index, call] of steps.entries()) {
		if (call.step.kind !== "sync" || call.step.to !== node) {
			continue;
		}
		const answer = answerIndex(steps, index, claimed);
		const answered = steps[answer];
		if (answered === undefined) {
			bars.push({
				top: call.y - BAR_OVERHANG,
				bottom: lastInvolvement(steps, index, node) + MESSAGE_PITCH / 3,
			});
			continue;
		}
		claimed.add(answer);
		bars.push({ top: call.y - BAR_OVERHANG, bottom: answered.y + BAR_OVERHANG });
	}
	return mergedBars(bars);
}

export { activationsFor };

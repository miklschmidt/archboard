// Where each participant of a sequence is busy: the activation bars its
// column draws, from a call that waits to the reply that answers it.
import { BAR_OVERHANG, MESSAGE_PITCH } from "#shared/rules/layout/sequence/sequence-design.ts";
import type { ActivationBar, PlacedStep } from "#shared/rules/layout/sequence/dataflow.ts";

/**
 * Whether two messages can both run in one pass through the flow: no decision
 * holds them on different alternatives.
 * @param one A message.
 * @param other Another.
 * @returns True when one run can meet both.
 */
function together(one: PlacedStep, other: PlacedStep): boolean {
	for (const [decision, alternative] of one.branch) {
		const theirs = other.branch.get(decision);
		if (theirs !== undefined && theirs !== alternative) return false;
	}
	return true;
}

/**
 * Whether one message is the reply that answers a call.
 * @param candidate The message that might be the reply.
 * @param call The call.
 * @returns True when it answers that call.
 */
function answers(candidate: PlacedStep, call: PlacedStep): boolean {
	return (
		candidate.step.kind === "return" &&
		candidate.step.from === call.step.to &&
		candidate.step.to === call.step.from &&
		together(candidate, call)
	);
}

/**
 * The later replies that answer a call and have not already answered one: the
 * first, and the first on each alternative of a decision that the first does
 * not run on, since a call answered on one answer of a decision is answered
 * on the others too.
 * @param steps Every message of the flow, in order.
 * @param index The call being answered.
 * @param claimed Which messages have already been spent answering a call.
 * @returns Their positions, in order; none when nothing answers the call.
 */
function answerIndexes(
	steps: readonly PlacedStep[],
	index: number,
	claimed: ReadonlySet<number>,
): number[] {
	const call = steps[index]!;
	const found: number[] = [];
	for (const [position, candidate] of steps.entries()) {
		const fresh = position > index && !claimed.has(position) && answers(candidate, call);
		if (fresh && !found.some((prior) => together(steps[prior]!, candidate))) {
			found.push(position);
		}
	}
	return found;
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
		bars.push(barOf(node, steps, index, claimed));
	}
	return mergedBars(bars);
}

/**
 * The bar one synchronous call starts: to the last reply that answers it, each
 * of which it claims, or through its receiver's last involvement when nothing
 * answers it.
 * @param node The receiver.
 * @param steps Every message of the flow, in order.
 * @param index The call's position.
 * @param claimed The replies earlier calls claimed, to which this call adds its own.
 * @returns The bar.
 */
function barOf(
	node: string,
	steps: readonly PlacedStep[],
	index: number,
	claimed: Set<number>,
): ActivationBar {
	const top = (steps[index]?.y ?? 0) - BAR_OVERHANG;
	const answered = answerIndexes(steps, index, claimed);
	const last = steps[answered.at(-1) ?? -1];
	if (last === undefined) {
		return { top, bottom: lastInvolvement(steps, index, node) + MESSAGE_PITCH / 3 };
	}
	for (const answer of answered) claimed.add(answer);
	return { top, bottom: last.y + BAR_OVERHANG };
}

export { activationsFor };

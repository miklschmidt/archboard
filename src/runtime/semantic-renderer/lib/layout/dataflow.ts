// Where every participant column, lifeline and message of a message sequence
// goes.
//
// Forked from PR Lens's `layout/dataflow.ts`. The skeleton is upstream's and is
// why the rest reads as it does: a flow is a row of equal-width columns, each
// with a card at its head and a lifeline hanging under it, and the messages are
// horizontal runs stacked down the page in the order the flow states them.
// Order is array position — a flow carries no step number, so there is no
// second opinion about the order to reconcile against this one.
//
// One thing upstream had is gone: there is no cap on participants or steps.
// ADR 0023 refuses size-driven limits, so nothing here may assume a small
// number of either, and every fold over them is written as a loop rather than
// as a spread into `Math.max`.
//
// The animation schedule is upstream's and is here: every message of every flow
// takes a turn on ONE clock for the whole drawing, counted straight through the
// stack in the order the flows are stated. A clock per flow would have every
// exchange on the page crossing at once, which is the ladder the motion is
// there to break.
//
// What is new is the frame. Upstream drew one band per column, in its lane
// language; here a flow is a single named box around the whole exchange, which
// is what lets several flows stack down one page and still be told apart.

import type {
	FlowStep,
	MessageKind,
	SemanticFlow,
	SemanticNode,
} from "@/shared/semantic-board/index";
import {
	CONTAINER_BOTTOM_PAD,
	CONTAINER_TOP_PAD,
	DIAGRAM_MARGIN,
	HEADER_GAP,
	HEADER_HEIGHT,
	HEADER_HEIGHT_WITH_NOTE,
	ICON_MIN_CARD_WIDTH,
	NEST_INSET,
	TITLE_SIZE,
	TITLE_SIZE_MIN,
	TITLE_SIZE_SMALL,
	TITLE_SIZE_STEP,
} from "@/runtime/semantic-renderer/lib/design";
import {
	MAX_PULSES_PER_STEP,
	COLUMN_GAP,
	COLUMN_MAX_WIDTH,
	COLUMN_MIN_WIDTH,
	FIRST_MESSAGE_DROP,
	FLOW_BOTTOM_PADDING,
	FLOW_GAP,
	LIFELINE_GAP,
	MESSAGE_PITCH,
	SELF_LOOP_EXTENT,
	SELF_MESSAGE_PITCH,
} from "@/runtime/semantic-renderer/lib/sequence-design";
import type { Box } from "@/runtime/semantic-renderer/lib/geometry";
import { CARD_TITLE_FONT } from "@/runtime/semantic-renderer/lib/fonts";
import { fittedSize } from "@/runtime/semantic-renderer/lib/text";
import {
	cardHeight,
	cardNotes,
	cardContentWidth,
	cardTextWidth,
	type SequenceCard,
} from "@/runtime/semantic-renderer/lib/layout/sequence-card";

/** A stretch of one column where its participant is busy. */
interface ActivationBar {
	/** Where the stretch begins. */
	readonly top: number;
	/** Where it ends. */
	readonly bottom: number;
}

/** One participant, as a column of the drawing. */
interface PlacedColumn {
	/** The card heading the column. */
	readonly card: SequenceCard;
	/** Where its lifeline runs. */
	readonly centreX: number;
	/** The stretches where it is working on a call it received. */
	readonly activations: readonly ActivationBar[];
}

/** One message, placed on its row. */
interface PlacedStep {
	/** The step itself. */
	readonly step: FlowStep;
	/** The label as drawn, with a repeat count folded in when there is one. */
	readonly label: string;
	/** The height its line runs at. */
	readonly y: number;
	/** The lifeline it leaves. */
	readonly fromX: number;
	/** The lifeline it arrives at. */
	readonly toX: number;
	/**
	 * This message's turn on the drawing's shared clock: where its first dot
	 * starts, and how many dots it sends.
	 *
	 * The clock is the whole drawing's, so turns keep counting across the stack
	 * of flows rather than restarting at each one. Every message takes a turn and
	 * the turns do not overlap, so a reader sees the exchange told in order
	 * rather than a dozen dots crossing at once — and reads one page of flows in
	 * the order they are stated rather than as several running at once. A
	 * repeated step sends its repeat — capped, because a step somebody wrote
	 * `×40` on would otherwise take the whole cycle and everything after it
	 * would stand still waiting.
	 */
	readonly slot: { readonly start: number; readonly count: number };
}

/** One flow, placed. */
interface FlowLayout {
	/** The flow itself. */
	readonly flow: SemanticFlow;
	/** The box around the whole exchange. */
	readonly frame: Box;
	/** Where the frame's name and summary go. */
	readonly header: Box;
	/** Where the lifelines start, under the tallest card in the header row. */
	readonly lifelineTop: number;
	/** Where they stop. */
	readonly lifelineBottom: number;
	/** Its participants, in the order the flow states them. */
	readonly columns: readonly PlacedColumn[];
	/** Its messages, in the order the flow states them. */
	readonly steps: readonly PlacedStep[];
}

/** Everything a stack of flows' geometry says, before anything is drawn. */
interface DataFlowLayout {
	/** The width the frames asked for. */
	readonly width: number;
	/** The height they asked for. */
	readonly height: number;
	/** The width every column of every flow is drawn at. */
	readonly columnWidth: number;
	/** The flows, in document order, stacked down the page. */
	readonly flows: readonly FlowLayout[];
	/**
	 * How many turns the drawing's clock is divided into: every dot every
	 * message of every flow sends, counted once.
	 *
	 * Zero when nothing crosses, which is a drawing with no clock at all.
	 */
	readonly turns: number;
}

/**
 * Whether a column is busy at a given height.
 *
 * An activated column is a bar rather than a line, so an arrow that touches one
 * has to stop at its edge; every caller that draws or measures a message asks
 * this first.
 */
type ActiveAt = (node: string, y: number) => boolean;

/**
 * The largest of a list, folded rather than spread.
 *
 * A spread into `Math.max` is an argument list, and an argument list has a
 * length a machine enforces. Nothing here may assume a flow is small, so the
 * fold is the honest way to write it.
 * @param values The numbers.
 * @param floor The answer when the list is empty, and the smallest it can be.
 * @returns The largest value, or the floor.
 */
function largest(values: Iterable<number>, floor: number): number {
	let most = floor;
	for (const value of values) {
		most = Math.max(most, value);
	}
	return most;
}

/**
 * The node a column stands for.
 *
 * A board is checked before it is read, and a flow whose participants are not
 * nodes of the same variant is refused there — so the fallback is a backstop
 * rather than a policy. It draws a column named after the id, because a
 * sequence that silently lost a participant would be a different sequence.
 * @param id The participant's node id.
 * @param byId The variant's nodes.
 * @returns The node, or a stand-in carrying its id.
 */
function participantNode(id: string, byId: ReadonlyMap<string, SemanticNode>): SemanticNode {
	return byId.get(id) ?? { id, name: id, kind: "other" };
}

/**
 * The one width every column of every flow is drawn at.
 *
 * One width rather than one per flow, because stacked flows share a page and
 * columns that almost line up read as a mistake. One width rather than one per
 * column, because a column's width is also the step from one lifeline to the
 * next, and lifelines at uneven intervals make a sequence hard to follow down
 * the page.
 * @param flows The flows being drawn.
 * @param byId The variant's nodes.
 * @returns The shared width in whole units and complete measured note lines.
 */
function measureColumns(
	flows: readonly SemanticFlow[],
	byId: ReadonlyMap<string, SemanticNode>,
): { readonly width: number; readonly notes: ReadonlyMap<string, SequenceCard["notes"]> } {
	const asked = flows.flatMap((flow) =>
		flow.participants.map((participant) => cardContentWidth(participantNode(participant, byId))),
	);
	// A whole unit: adding measured widths leaves floating-point dust, and a card
	// handed back exactly the width its name measured would round into cutting it.
	const preferred = Math.min(COLUMN_MAX_WIDTH, Math.ceil(largest(asked, COLUMN_MIN_WIDTH)));
	// Whole-line kerning and unbroken identifiers can exceed the preferred wrap
	// width. Widen every column together so complete notes still fit their cards.
	const participants = new Set(flows.flatMap((flow) => flow.participants));
	const notes = new Map(
		[...participants].map((id) => [id, cardNotes(participantNode(id, byId), preferred)]),
	);
	const painted = [...notes.values()].flatMap((runs) => runs.map((run) => run.width));
	return {
		width: Math.max(
			preferred,
			Math.ceil(largest(painted, 0) + preferred - cardTextWidth(preferred)),
		),
		notes,
	};
}

/**
 * The label as drawn: a repeated step says so rather than being drawn twice.
 * @param step The message.
 * @returns Its label, with the repeat count folded in.
 */
function labelFor(step: FlowStep): string {
	return step.repeat === undefined ? step.label : `${step.label} ×${step.repeat}`;
}

/**
 * The vertical step from one message to the next. A self-message needs more,
 * because it drops below its own row before it comes back.
 * @param kind What the message does.
 * @returns The pitch of its row.
 */
function pitchOf(kind: MessageKind): number {
	return kind === "self" ? SELF_MESSAGE_PITCH : MESSAGE_PITCH;
}

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
 * nothing — neither implies that anybody is waiting.
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
			bars.push({ top: call.y, bottom: lastInvolvement(steps, index, node) + MESSAGE_PITCH / 3 });
			continue;
		}
		claimed.add(answer);
		bars.push({ top: call.y, bottom: answered.y });
	}
	return mergedBars(bars);
}

/**
 * Which columns are busy where, as one question a caller can ask.
 * @param columns The flow's columns.
 * @returns Whether a given participant is busy at a given height.
 */
function activationLookup(columns: readonly PlacedColumn[]): ActiveAt {
	const byNode = new Map(columns.map((column) => [column.card.node.id, column.activations]));
	return (node, y) => (byNode.get(node) ?? []).some((bar) => bar.top <= y && y <= bar.bottom);
}

/**
 * The card heading one column.
 *
 * A long participant name steps down in half-points before it is cut, and is
 * cut against the run the painter will use. Responsibility lines are complete
 * and already measured, including any widening needed to fit their ink.
 * @param node The participant.
 * @param centreX Where its column sits.
 * @param top The height every card in this flow's header row starts at.
 * @param width The shared column width.
 * @param notes The participant's measured responsibility lines.
 * @returns The placed card.
 */
function placeColumnCard(
	node: SemanticNode,
	centreX: number,
	top: number,
	width: number,
	notes: SequenceCard["notes"],
): SequenceCard {
	const box = { x: centreX - width / 2, y: top, width, height: cardHeight(notes) };
	return {
		node,
		box,
		notes,
		titleSize: fittedSize(
			node.name,
			CARD_TITLE_FONT,
			width >= ICON_MIN_CARD_WIDTH ? TITLE_SIZE : TITLE_SIZE_SMALL,
			cardTextWidth(width),
			TITLE_SIZE_MIN,
			TITLE_SIZE_STEP,
		),
	};
}

/**
 * Every message of one flow, stacked down the page in the order it is stated.
 * @param flow The flow.
 * @param centreOf Where each participant's lifeline runs.
 * @param firstY The height the first message runs at.
 * @param firstTurn The turn of the drawing's clock this flow's first dot takes.
 * @returns The placed messages.
 */
function placeSteps(
	flow: SemanticFlow,
	centreOf: ReadonlyMap<string, number>,
	firstY: number,
	firstTurn: number,
): PlacedStep[] {
	const placed: PlacedStep[] = [];
	let y = firstY;
	let turn = firstTurn;
	for (const step of flow.steps) {
		const count = Math.min(step.repeat ?? 1, MAX_PULSES_PER_STEP);
		placed.push({
			step,
			label: labelFor(step),
			y,
			fromX: centreOf.get(step.from) ?? 0,
			toX: centreOf.get(step.to) ?? 0,
			slot: { start: turn, count },
		});
		turn += count;
		y += pitchOf(step.kind);
	}
	return placed;
}

/**
 * How far down the page one flow's own drawing reaches.
 * @param steps The placed messages.
 * @param floor The height of the first message's row, when there is nothing below it.
 * @returns The lowest row anything was drawn on.
 */
function lowestDrawn(steps: readonly PlacedStep[], floor: number): number {
	return largest(
		steps.map((placed) => placed.y + (placed.step.kind === "self" ? SELF_LOOP_EXTENT : 0)),
		floor,
	);
}

/**
 * One flow, placed.
 * @param flow The flow.
 * @param byId The variant's nodes.
 * @param measurement The shared column width and measured responsibility lines.
 * @param start Where this flow begins: the height of its frame, and its first turn of the drawing's clock.
 * @param start.top Where its frame begins.
 * @param start.turn Its first turn.
 * @returns Its geometry.
 */
function layoutFlow(
	flow: SemanticFlow,
	byId: ReadonlyMap<string, SemanticNode>,
	measurement: ReturnType<typeof measureColumns>,
	start: { readonly top: number; readonly turn: number },
): FlowLayout {
	const top = start.top;
	const columnWidth = measurement.width;
	const nodes = flow.participants.map((participant) => participantNode(participant, byId));
	const contentLeft = DIAGRAM_MARGIN + NEST_INSET;
	const centres = nodes.map(
		(_, index) => contentLeft + columnWidth / 2 + index * (columnWidth + COLUMN_GAP),
	);
	const contentWidth = columnWidth * nodes.length + COLUMN_GAP * (nodes.length - 1);

	const header = {
		x: contentLeft,
		y: top + CONTAINER_TOP_PAD,
		width: contentWidth,
		height: flow.summary === undefined ? HEADER_HEIGHT : HEADER_HEIGHT_WITH_NOTE,
	};
	const cardsTop = header.y + header.height + HEADER_GAP;
	const cards = nodes.map((node, index) =>
		placeColumnCard(
			node,
			centres[index] ?? 0,
			cardsTop,
			columnWidth,
			measurement.notes.get(node.id) ?? [],
		),
	);
	const lifelineTop =
		cardsTop +
		largest(
			cards.map((card) => card.box.height),
			0,
		) +
		LIFELINE_GAP;

	const steps = placeSteps(
		flow,
		new Map(flow.participants.map((participant, index) => [participant, centres[index] ?? 0])),
		lifelineTop + FIRST_MESSAGE_DROP,
		start.turn,
	);
	const lifelineBottom = lowestDrawn(steps, lifelineTop + FIRST_MESSAGE_DROP) + FLOW_BOTTOM_PADDING;

	const columns = cards.map((card, index) => {
		const centreX = centres[index] ?? 0;
		return {
			card,
			centreX,
			activations: activationsFor(card.node.id, steps),
		};
	});

	return {
		flow,
		frame: {
			x: DIAGRAM_MARGIN,
			y: top,
			width: NEST_INSET * 2 + contentWidth,
			height: lifelineBottom + CONTAINER_BOTTOM_PAD - top,
		},
		header,
		lifelineTop,
		lifelineBottom,
		columns,
		steps,
	};
}

/**
 * Every flow of one variant, stacked down one page.
 * @param flows The flows, in document order.
 * @param nodes The variant's nodes.
 * @returns Where everything goes.
 */
function layoutDataFlow(
	flows: readonly SemanticFlow[],
	nodes: readonly SemanticNode[],
): DataFlowLayout {
	const byId = new Map(nodes.map((node) => [node.id, node]));
	const measurement = measureColumns(flows, byId);

	const placed: FlowLayout[] = [];
	let cursor = DIAGRAM_MARGIN;
	// The clock's cursor runs straight through the stack, which is what makes the
	// flows on one page take their turns in the order they are stated.
	let turn = 0;
	for (const flow of flows) {
		const laid = layoutFlow(flow, byId, measurement, { top: cursor, turn });
		placed.push(laid);
		cursor = laid.frame.y + laid.frame.height + FLOW_GAP;
		turn = laid.steps.reduce((total, step) => total + step.slot.count, turn);
	}

	return {
		// Whole numbers, for the same reason the architecture canvas uses them: the
		// page is reported to a pane as pixels, and half a pixel of diagram is not
		// a thing a person can be shown.
		width: Math.ceil(
			largest(
				placed.map((laid) => laid.frame.x + laid.frame.width),
				0,
			) + DIAGRAM_MARGIN,
		),
		height: Math.ceil(cursor - FLOW_GAP + DIAGRAM_MARGIN),
		columnWidth: measurement.width,
		flows: placed,
		turns: turn,
	};
}

export {
	type ActivationBar,
	type ActiveAt,
	type DataFlowLayout,
	type FlowLayout,
	type PlacedColumn,
	type PlacedStep,
	activationLookup,
	largest,
	layoutDataFlow,
	pitchOf,
};

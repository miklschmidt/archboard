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
// Two things upstream had are gone. There is no cap on participants or steps:
// ADR 0023 refuses size-driven limits, so nothing here may assume a small
// number of either, and every fold over them is written as a loop rather than
// as a spread into `Math.max`. And there is no animation schedule — the beats,
// slots and pulse counts that made a PR Lens sequence move belong to the
// viewer, which owns motion.
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
	CARD_PADDING_X,
	CONTAINER_BOTTOM_PAD,
	CONTAINER_TOP_PAD,
	DIAGRAM_MARGIN,
	HEADER_GAP,
	HEADER_HEIGHT,
	HEADER_HEIGHT_WITH_NOTE,
	ICON_CHIP_GAP,
	ICON_CHIP_SIZE,
	ICON_MIN_CARD_WIDTH,
	NEST_INSET,
	NOTE_SIZE,
	TITLE_SIZE,
	TITLE_SIZE_MIN,
	TITLE_SIZE_SMALL,
	TITLE_SIZE_STEP,
} from "@/runtime/semantic-renderer/lib/design";
import {
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
} from "@/runtime/semantic-renderer/lib/dataflow-design";
import type { Box } from "@/runtime/semantic-renderer/lib/geometry";
import { CARD_NOTE_FONT, CARD_TITLE_FONT } from "@/runtime/semantic-renderer/lib/fonts";
import { fittedSize, measure } from "@/runtime/semantic-renderer/lib/text";
import {
	cardHeight,
	cardTextWidth,
	type PlacedNode,
} from "@/runtime/semantic-renderer/lib/layout/architecture";

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
	readonly card: PlacedNode;
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
 * The width one participant's card asks for: chip, name, and responsibility.
 * @param node The participant.
 * @returns The width that would fit it without cutting anything.
 */
function cardContentWidth(node: SemanticNode): number {
	return (
		CARD_PADDING_X * 2 +
		ICON_CHIP_SIZE +
		ICON_CHIP_GAP +
		Math.max(
			measure(node.name, CARD_TITLE_FONT, TITLE_SIZE),
			node.responsibility === undefined
				? 0
				: measure(node.responsibility, CARD_NOTE_FONT, NOTE_SIZE),
		)
	);
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
 * @returns The column width, in whole units.
 */
function columnWidthFor(
	flows: readonly SemanticFlow[],
	byId: ReadonlyMap<string, SemanticNode>,
): number {
	const asked = flows.flatMap((flow) =>
		flow.participants.map((participant) => cardContentWidth(participantNode(participant, byId))),
	);
	// A whole unit: adding measured widths leaves floating-point dust, and a card
	// handed back exactly the width its name measured would round into cutting it.
	return Math.min(COLUMN_MAX_WIDTH, Math.ceil(largest(asked, COLUMN_MIN_WIDTH)));
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
 * @param index Which message is the call.
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
 * Its name is fitted to the column exactly as a card's name is fitted to a card
 * in the architecture grammar, so a long participant name steps down in
 * half-points before it is cut, and is cut against the run the painter will use.
 * @param node The participant.
 * @param centreX Where its column sits.
 * @param top The height every card in this flow's header row starts at.
 * @param width The shared column width.
 * @param index Which column it is.
 * @returns The placed card.
 */
function placeColumnCard(
	node: SemanticNode,
	centreX: number,
	top: number,
	width: number,
	index: number,
): PlacedNode {
	const box = { x: centreX - width / 2, y: top, width, height: cardHeight(node) };
	return {
		node,
		box,
		chrome: "card",
		titleSize: fittedSize(
			node.name,
			CARD_TITLE_FONT,
			width >= ICON_MIN_CARD_WIDTH ? TITLE_SIZE : TITLE_SIZE_SMALL,
			cardTextWidth(width),
			TITLE_SIZE_MIN,
			TITLE_SIZE_STEP,
		),
		row: 0,
		regionIndex: index,
	};
}

/**
 * Every message of one flow, stacked down the page in the order it is stated.
 * @param flow The flow.
 * @param centreOf Where each participant's lifeline runs.
 * @param firstY The height the first message runs at.
 * @returns The placed messages.
 */
function placeSteps(
	flow: SemanticFlow,
	centreOf: ReadonlyMap<string, number>,
	firstY: number,
): PlacedStep[] {
	const placed: PlacedStep[] = [];
	let y = firstY;
	for (const step of flow.steps) {
		placed.push({
			step,
			label: labelFor(step),
			y,
			fromX: centreOf.get(step.from) ?? 0,
			toX: centreOf.get(step.to) ?? 0,
		});
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
 * @param columnWidth The width every column is drawn at.
 * @param top Where this flow's frame begins.
 * @returns Its geometry.
 */
function layoutFlow(
	flow: SemanticFlow,
	byId: ReadonlyMap<string, SemanticNode>,
	columnWidth: number,
	top: number,
): FlowLayout {
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
	const lifelineTop = cardsTop + largest(nodes.map(cardHeight), 0) + LIFELINE_GAP;

	const steps = placeSteps(
		flow,
		new Map(flow.participants.map((participant, index) => [participant, centres[index] ?? 0])),
		lifelineTop + FIRST_MESSAGE_DROP,
	);
	const lifelineBottom = lowestDrawn(steps, lifelineTop + FIRST_MESSAGE_DROP) + FLOW_BOTTOM_PADDING;

	const columns = nodes.map((node, index) => {
		const centreX = centres[index] ?? 0;
		return {
			card: placeColumnCard(node, centreX, cardsTop, columnWidth, index),
			centreX,
			activations: activationsFor(node.id, steps),
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
	const columnWidth = columnWidthFor(flows, byId);

	const placed: FlowLayout[] = [];
	let cursor = DIAGRAM_MARGIN;
	for (const flow of flows) {
		const laid = layoutFlow(flow, byId, columnWidth, cursor);
		placed.push(laid);
		cursor = laid.frame.y + laid.frame.height + FLOW_GAP;
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
		columnWidth,
		flows: placed,
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

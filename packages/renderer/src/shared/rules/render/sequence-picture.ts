// A message sequence's layout as the core reads it (ADR 0057): every flow,
// column, message and frame where the layout put it, with what each message's
// line does worked out here, where the layout's rules for it live.

import type { SequenceDrawing } from "#shared/protocol/generated/core/types.ts";
import {
	activationLookup,
	type ActiveAt,
	type DataFlowLayout,
	type FlowLayout,
	type PlacedStep,
} from "#shared/rules/layout/sequence/dataflow.ts";
import {
	endsFor,
	labelBox,
	selfStart,
	stepBox,
	travelOf,
	type Ends,
	type Travel,
} from "#shared/rules/layout/sequence/messages.ts";
import { titleRoom } from "#shared/rules/layout/sequence/sequence-card.ts";
import { pitchOf } from "#shared/rules/layout/sequence/step-rows.ts";

/**
 * Where a message's line starts and where it ends: a message to itself starts
 * and ends at its loop.
 * @param placed The message.
 * @param activeAt Whether a column is busy at a given height.
 * @param travel Which way its line runs.
 * @returns Its ends.
 */
function endsOf(placed: PlacedStep, activeAt: ActiveAt, travel: Travel): Ends {
	if (travel !== 0) return endsFor(placed, activeAt, travel);
	const loop = selfStart(placed, activeAt(placed.step.from, placed.y));
	return { start: loop, end: loop };
}

/**
 * One flow as the core reads it.
 * @param layout The flow, laid out.
 * @returns The flow, with each message's run and each card's room for its name.
 */
function flowOf(layout: FlowLayout): SequenceDrawing["flows"][number] {
	const activeAt = activationLookup(layout.columns);
	return {
		...layout,
		columns: layout.columns.map((column) => ({
			...column,
			card: { ...column.card, titleRoom: titleRoom(column.card.node, column.card.box.width) },
		})),
		steps: layout.steps.map((placed) => {
			const travel = travelOf(placed.step.kind, placed.fromX, placed.toX);
			return {
				...placed,
				...endsOf(placed, activeAt, travel),
				travel,
				labelBox: labelBox(placed, activeAt),
				box: stepBox(placed, activeAt),
				pitch: pitchOf(placed.step.kind),
			};
		}),
	};
}

/**
 * A stack of flows as the core reads it.
 * @param layout The flows, laid out.
 * @returns The drawing.
 */
function sequenceDrawing(layout: DataFlowLayout): SequenceDrawing {
	return { width: layout.width, height: layout.height, flows: layout.flows.map(flowOf) };
}

export { sequenceDrawing };

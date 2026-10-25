// What a proposal changed about each container's interface, for the Board tab
// (TASK-538.01, ADR 0044). It is the reading that `semantic compare` lists
// first, from the same rule over both variants whole, so the two never differ.
// It sets no comparison status: a part a new caller now reaches keeps its own
// standing.

import { compareInterfaces, type InterfaceChange } from "@archboard/board/container-interface";
import type { SemanticNode } from "@archboard/board/content";
import type { VariantReading } from "#ui/rules/semantic-board-canvas/board/board-document.ts";

/** How a part moved, by the list of the change that holds it. */
type InterfaceMove = Exclude<keyof InterfaceChange, "container" | "holdsParts">;

/** The moves in the order a reader is told them: the interface first, then who calls it. */
const MOVES: readonly InterfaceMove[] = [
	"entryPointsAdded",
	"entryPointsRemoved",
	"becameEntryPoints",
	"becameHidden",
	"callersGained",
	"callersLost",
];

/** One part whose place in a container's interface moved. */
interface MovedPart {
	readonly part: SemanticNode;
	readonly move: InterfaceMove;
}

/**
 * What the variant on screen changed about each container's interface,
 * against another variant of its board.
 * @param reading The variant on screen.
 * @param against The id of the variant it is read against.
 * @returns The containers whose interface changed, or null when either variant cannot be read.
 */
function interfaceChangesOf(
	reading: VariantReading,
	against: string,
): readonly InterfaceChange[] | null {
	const before = reading.contents.get(against);
	if (before === undefined || reading.variant === null) {
		return null;
	}
	return compareInterfaces(before, reading.variant.content).changed;
}

/**
 * Every part of one change, each with its move, in the order a reader is told them.
 * @param change One container's change.
 * @returns The parts.
 */
function movedParts(change: InterfaceChange): MovedPart[] {
	return MOVES.flatMap((move) => change[move].map((part) => ({ part, move })));
}

export { type InterfaceMove, type MovedPart, interfaceChangesOf, movedParts };

// Everything on the board that is not a node and not an edge.
//
// A board is not only its architecture: annotations, legends, a box somebody
// drew round a subsystem and never promoted. They are still compared, because
// a legend that disappeared is a change; they are just compared by what they
// say and where they sit, which is all the identity they have.

import { isArchitectureConnectorType } from "@/runtime/board-inspection/architecture";
import { readElementMetadata } from "@/runtime/engine/metadata";
import { boxOf } from "@/runtime/engine/layout";
import type { BoundingBox } from "@/runtime/engine/layout";
import type { ServerElement } from "@/runtime/engine/types";
import type { PlainElement, PlainSide } from "@/runtime/engine/lib/compare-contract";
import { labelOfAll } from "@/runtime/engine/lib/compare-node-model";
import { regionOfBox } from "@/runtime/engine/lib/compare-board-layout";

// An arrow or a line is a connector until somebody promotes it. Promotion is
// an explicit act, so metadata outranks the drawn type (TASK-053).
const isConnector = isArchitectureConnectorType;

/**
 * Count one more of something.
 * @param counts The tally, edited in place.
 * @param key What was counted.
 */
function tally(counts: Record<string, number>, key: string): void {
	counts[key] = (counts[key] || 0) + 1;
}

/**
 * One element that carries archboard metadata but is not a node.
 *
 * Worth reporting rather than dropping: it is usually a half-finished
 * promotion, or a node whose id was edited out by hand.
 * @param el The element.
 * @param label What it says, if anything.
 * @param block Its archboard block.
 * @returns The report.
 */
function unidentifiedOf(
	el: ServerElement,
	label: string | undefined,
	block: PlainSide["unidentified"][number]["archboard"],
): PlainSide["unidentified"][number] {
	return { id: el.id, type: el.type, ...(label ? { label } : {}), archboard: block };
}

/**
 * One plain element that says something, which is the only kind that can be
 * matched to its counterpart on the other board.
 * @param el The element.
 * @param label What it says.
 * @param foreign Custom data another tool wrote on it.
 * @param nodeBox The extent of the board's nodes, for the region.
 * @returns The plain element.
 */
function labelledPlainOf(
	el: ServerElement,
	label: string,
	foreign: Record<string, unknown>,
	nodeBox: BoundingBox | null,
): PlainElement {
	return {
		id: el.id,
		type: el.type,
		label,
		region: regionOfBox(boxOf(el), nodeBox),
		...(el.link ? { link: el.link } : {}),
		...(Object.keys(foreign).length > 0 ? { foreignCustomData: foreign } : {}),
	};
}

/**
 * Everything on the board that belongs to no node, is no connector and labels
 * nothing.
 *
 * A promoted connector falls out on the first test, so this pass and the node
 * and edge passes divide the board between them rather than overlapping.
 * @param all Every element on the board.
 * @param nodeOfElement Which node each element belongs to.
 * @param boundLabelIds The text elements that are somebody else's label.
 * @param nodeBox The extent of the board's nodes, for the regions.
 * @returns The plain side of the board.
 */
function plainSideOf(
	all: readonly ServerElement[],
	nodeOfElement: ReadonlyMap<string, string>,
	boundLabelIds: ReadonlySet<string>,
	nodeBox: BoundingBox | null,
): PlainSide {
	const plainElements = all.filter(
		(el) => !nodeOfElement.has(el.id) && !isConnector(el.type) && !boundLabelIds.has(el.id),
	);
	const byType: Record<string, number> = {};
	const unlabelled: Record<string, number> = {};
	const labelled: PlainElement[] = [];
	const unidentified: PlainSide["unidentified"] = [];
	for (const el of plainElements) {
		tally(byType, el.type);
		const label = labelOfAll(el, all);
		const metadata = readElementMetadata(el);
		if (metadata.archboard) {
			unidentified.push(unidentifiedOf(el, label, metadata.archboard));
		}
		if (label) {
			labelled.push(labelledPlainOf(el, label, metadata.foreign, nodeBox));
		} else {
			tally(unlabelled, el.type);
		}
	}
	return { count: plainElements.length, byType, labelled, unlabelled, unidentified };
}

export { plainSideOf };

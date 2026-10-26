// What the Selection tab can say about a picked container's exposed names
// (TASK-539.02), from what the server remembers of the last code pass.
//
// What these catch: a region on a card or an unbound container, counts shown
// over a version or a variant the pass did not read, a skipped container read
// as one whose binding names no module, and the reverse.

import { expect, test } from "bun:test";

import type { RememberedFindings } from "@archboard/code-intel/code-check";
import type { SemanticNode, VariantContent } from "@archboard/board/content";
import { exposedNamesState } from "#ui/rules/semantic-board-canvas/code/exposed-names.ts";

/** What the last pass found on one board at one variant. */
type RememberedReading = RememberedFindings["readings"][number];

const BINDING = { repo: "github.com/acme/shop", path: "src/orders" };
const ORDERS: SemanticNode = {
	id: "orders",
	name: "Orders",
	kind: "module",
	order: 1000,
	binding: BINDING,
};
const CONTENT: Pick<VariantContent, "nodes"> = {
	nodes: [
		ORDERS,
		{ id: "place", name: "Place order", kind: "function", order: 2000, parent: "orders" },
	],
};

/** Where the picked part is: version 4 of the current variant of the board. */
const ON = { board: "Checkout", variant: "v1", version: 4 };

/**
 * One remembered reading of the board.
 * @param over What differs from a reading of exactly what is on screen that judged nothing.
 * @returns The reading.
 */
function reading(over: Partial<RememberedReading> = {}): RememberedReading {
	return {
		...ON,
		checkedAt: "2026-10-25T10:00:00.000Z",
		findings: [],
		skipped: [],
		containers: [],
		...over,
	};
}

const JUDGED = { container: "orders", module: "src/orders", exposed: 7, usedOutside: 3 };

test("a card or an unbound container has no region", () => {
	const card = CONTENT.nodes[1]!;
	expect(exposedNamesState([], { ...ON, node: card, content: CONTENT }).kind).toBe("none");
	const { binding: _binding, ...unbound } = ORDERS;
	expect(exposedNamesState([], { ...ON, node: unbound, content: CONTENT }).kind).toBe("none");
});

test("a bound container says why there is no reading until a pass read what is on screen", () => {
	const at = { ...ON, node: ORDERS, content: CONTENT };
	expect(exposedNamesState([], at).kind).toBe("no-pass");
	expect(exposedNamesState([reading({ variant: "v2" })], at).kind).toBe("variant-unread");
	expect(exposedNamesState([reading({ version: 3, containers: [JUDGED] })], at).kind).toBe(
		"board-changed",
	);
});

test("a pass that read what is on screen gives the counts, the skip, or no region", () => {
	const at = { ...ON, node: ORDERS, content: CONTENT };
	expect(exposedNamesState([reading({ containers: [JUDGED] })], at)).toEqual({
		kind: "read",
		checkedAt: "2026-10-25T10:00:00.000Z",
		counts: JUDGED,
	});
	const skipped = reading({
		skipped: [
			{
				reason: "exposure-unknown",
				subject: { kind: "node", id: "orders", name: "Orders" },
				detail: "src/orders",
			},
		],
	});
	expect(exposedNamesState([skipped], at).kind).toBe("skipped");
	// Judged nothing and skipped nothing: the binding names no module.
	expect(exposedNamesState([reading()], at).kind).toBe("none");
});

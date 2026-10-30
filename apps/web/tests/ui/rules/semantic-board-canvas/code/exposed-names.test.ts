// What the Selection tab can say about a picked container's exposed names
// (TASK-539.02), from what the server remembers of the last code pass.
//
// What these catch: a region on a card or an unbound container, counts shown
// over a version or a variant the pass did not read, a pass that read no board
// read as no pass, a skipped container read as one whose binding names no
// module, and the reverse.

import { expect, test } from "bun:test";

import type { RememberedFindingsSchema } from "@archboard/code-intel/code-check";
import type { z } from "zod";
import type { SemanticNode, VariantContent } from "@archboard/board/content";
import { exposedNamesState } from "#ui/rules/semantic-board-canvas/code/exposed-names.ts";

/** What the server remembers of the vault's passes. */
type RememberedFindings = z.infer<typeof RememberedFindingsSchema>;

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

/** Before any pass ran. */
const NO_PASS: RememberedFindings = { readings: [] };

/**
 * What the server remembers after one pass.
 * @param readings The readings it left.
 * @returns The memory.
 */
function passed(...readings: RememberedReading[]): RememberedFindings {
	return { readings, lastCheckedAt: "2026-10-25T10:00:00.000Z" };
}

const JUDGED = { container: "orders", module: "src/orders", exposed: 7, usedOutside: 3 };

test("a card or an unbound container has no region", () => {
	const card = CONTENT.nodes[1]!;
	expect(exposedNamesState(NO_PASS, { ...ON, node: card, content: CONTENT }).kind).toBe("none");
	const { binding: _binding, ...unbound } = ORDERS;
	expect(exposedNamesState(NO_PASS, { ...ON, node: unbound, content: CONTENT }).kind).toBe("none");
});

test("a bound container says why there is no reading until a pass read what is on screen", () => {
	const at = { ...ON, node: ORDERS, content: CONTENT };
	expect(exposedNamesState(NO_PASS, at).kind).toBe("no-pass");
	expect(exposedNamesState(passed(), at).kind).toBe("variant-unread");
	expect(exposedNamesState(passed(reading({ variant: "v2" })), at).kind).toBe("variant-unread");
	expect(exposedNamesState(passed(reading({ version: 3, containers: [JUDGED] })), at).kind).toBe(
		"board-changed",
	);
});

test("a pass that read what is on screen gives the counts, the skip, or no region", () => {
	const at = { ...ON, node: ORDERS, content: CONTENT };
	expect(exposedNamesState(passed(reading({ containers: [JUDGED] })), at)).toEqual({
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
	expect(exposedNamesState(passed(skipped), at).kind).toBe("skipped");
	// Judged nothing and skipped nothing: the binding names no module.
	expect(exposedNamesState(passed(reading()), at).kind).toBe("none");
});

test("an unavailable checkout explains the skipped container only in its own repository", () => {
	const at = { ...ON, node: ORDERS, content: CONTENT };
	const skip = {
		reason: "checkout-unavailable",
		repo: BINDING.repo,
		detail: "Checkout is missing.",
	} as const;
	expect(exposedNamesState(passed(reading({ skipped: [skip] })), at)).toEqual({
		kind: "skipped",
		checkedAt: "2026-10-25T10:00:00.000Z",
		skip,
	});
	expect(
		exposedNamesState(
			passed(reading({ skipped: [{ ...skip, repo: "github.com/acme/other" }] })),
			at,
		).kind,
	).toBe("none");
});

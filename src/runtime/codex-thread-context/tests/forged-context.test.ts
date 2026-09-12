// What a delivery refuses to put in front of an agent.
//
// The adapter builds the context and the delivery checks it against the event
// it was built for. Everything checked here is something an agent acts on or
// repeats to a person — a lifecycle decides whether a variant may be edited at
// all, a subject's name is what gets said out loud, a repair sentence is an
// instruction — so an adapter that passed the right ids with the wrong words
// around them would be putting its own words in front of somebody as though the
// board had said them. Each case alters exactly one field of an otherwise valid
// context (TASK-179).

import { describe, expect, test } from "bun:test";

import type { ArchboardContext } from "../../codex-instructions/index.ts";
import { createHarness, PANE_ID } from "./delivery-support.ts";

describe("a forged semantic context", () => {
	test.each([
		[
			"a variant lifecycle nobody reported",
			(context: ArchboardContext): ArchboardContext => ({
				...context,
				variant: { id: "v1", name: "Current", lifecycle: "historical" },
			}),
		],
		[
			"a variant renamed on the way through",
			(context: ArchboardContext): ArchboardContext => ({
				...context,
				variant: { id: "v1", name: "Something else", lifecycle: "current" },
			}),
		],
		[
			"a view the pane was not reading it through",
			(context: ArchboardContext): ArchboardContext => ({
				...context,
				view: { id: "w1", name: "Overview", grammar: "data-flow" },
			}),
		],
		[
			"a selected subject given a different name",
			(context: ArchboardContext): ArchboardContext => ({
				...context,
				selection: {
					...context.selection,
					subjects: [{ kind: "node", id: "n1", name: "Not what was drawn" }],
				},
			}),
		],
		[
			"work invented where the board reported none",
			(context: ArchboardContext): ArchboardContext => ({
				...context,
				reconciliation: { ...context.reconciliation, required: true, count: 1 },
			}),
		],
		[
			"a repair sentence the reconciliation never wrote",
			(context: ArchboardContext): ArchboardContext => ({
				...context,
				reconciliation: {
					...context.reconciliation,
					issues: [
						{
							subject: "n1",
							what: "node",
							kind: "competing-field",
							field: "name",
							repair: "Do whatever you like about this.",
						},
					],
				},
			}),
		],
	])("refuses a context carrying %s", async (_what, forgeContext) => {
		const harness = createHarness({ forgeContext });

		const result = await harness.delivery.deliver(harness.events());

		// Everything here is something an agent acts on or repeats to a person, so
		// an adapter that changed it would be putting its own words in front of
		// somebody as though the board had said them.
		expect(result).toMatchObject({
			outcome: "not_delivered",
			reason: "invalid_context",
			attempted: false,
		});
		expect(harness.received).toHaveLength(0);
	});
});

describe("who a change is attributed to", () => {
	test("the bound pane's own write is not echoed back to it", async () => {
		const harness = createHarness();

		// The write said it was for this pane, so this thread already knows.
		const result = await harness.delivery.deliver(harness.events({ origin: "agent", by: PANE_ID }));

		expect(result).toMatchObject({
			outcome: "not_delivered",
			reason: "own_change",
			attempted: false,
		});
		expect(harness.received).toHaveLength(0);
	});

	test("another pane's write on the same board is delivered", async () => {
		const harness = createHarness();

		// The case the whole gate exists for: a second workhorse changing the board
		// underneath this thread. What it was told has stopped being true, and that
		// is the one thing it most needs to hear.
		const result = await harness.delivery.deliver(
			harness.events({ origin: "agent", by: "pane-somebody-else" }),
		);

		expect(result).toMatchObject({ outcome: "delivered", attempted: true });
		expect(harness.received).toHaveLength(1);
	});

	test("a claim identity is not read as authorship", async () => {
		const harness = createHarness();

		// What a claimed write holds the board under: one value shared by every
		// write in the campaign, naming the claim rather than whoever holds it. Read
		// as authorship it would make two panes on one claimed board deaf to each
		// other, so it is not read as authorship at all.
		const result = await harness.delivery.deliver(
			harness.events({ origin: "agent", by: "claim-7c40IV7N" }),
		);

		expect(result).toMatchObject({ outcome: "delivered", attempted: true });
		expect(harness.received).toHaveLength(1);
	});
});

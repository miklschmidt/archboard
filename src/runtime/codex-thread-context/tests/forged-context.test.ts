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
import { createHarness } from "./delivery-support.ts";

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
	test("nothing is, because a change carries no author to read", async () => {
		const harness = createHarness();

		// Two settled changes on the board this thread was told about, and nothing
		// on either says whose work made it. Both are delivered.
		//
		// A change used to carry the pane a write said it was running for, and a
		// delivery port dropped one whose pane matched its own. That made a surface
		// a person opens and closes decide who hears about an architecture, and it
		// failed in the case that mattered most: two threads on one claimed board,
		// where the second suppressed the first's change. What replaces it is
		// redundancy — a thread may hear about its own write, and that is a thing
		// it is told how to read.
		const first = await harness.delivery.deliver(harness.events({ origin: "agent" }));
		const second = await harness.delivery.deliver(harness.events({ sequence: 2, origin: "agent" }));

		expect(first).toMatchObject({ outcome: "delivered", attempted: true });
		expect(second).toMatchObject({ outcome: "delivered", attempted: true });
		expect(harness.received).toHaveLength(2);
	});
});

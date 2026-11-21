// What each pane is offered of narration (narration-offer.ts).
//
// What this catches: a pane offered a new narration on every ask, which draws it again, and one
// that narrates for another pane.

import { expect, test } from "bun:test";

import { offerNarration } from "#ui/application/rules/narration-offer.ts";

test("a pane is offered one narration, again each time it is asked for, that starts for that pane", () => {
	const started: string[] = [];
	const offer = offerNarration(
		(paneId, walkthrough) => {
			started.push(`${paneId}:${walkthrough}`);
		},
		null,
		false,
	);
	expect(offer("b")).toBe(offer("b"));
	expect(offer("b")).not.toBe(offer("a"));

	offer("b").start("tour");
	expect(started).toEqual(["b:tour"]);
});

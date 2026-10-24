// Where a sequence participant's type chip stands on its card: in the top
// corner with its words, as on an architecture card, however tall the card.

import { expect, test } from "bun:test";

import { renderDataFlow } from "#runtime/operations/render.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { subjectGroups } from "#tests/runtime/support/drawn-subjects.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

const content = orderedFixture({
	nodes: [
		{
			id: "a",
			name: "Grant endpoint",
			kind: "module",
			responsibility:
				"Authorizes the existing Client and independently approved TPM or initial-only Mac profile context, then commits its key-bound grant.",
		},
		{ id: "b", name: "Store", kind: "module" },
	],
	edges: [],
	flows: [
		{
			id: "f1",
			name: "Grant",
			participants: ["a", "b"],
			steps: [{ id: "s1", from: "a", to: "b", label: "commit", kind: "sync" }],
		},
	],
});

test("a participant card with a responsibility holds its chip in the top corner", () => {
	const card = subjectGroups(renderDataFlow({ policy: DEFAULT_SEMANTIC_POLICY, content }).svg).find(
		(group) => group.id === "a" && group.markup.includes("ab-chip"),
	)!;
	const slab = /<rect x="([\d.]+)" y="([\d.]+)" width="[\d.]+" height="([\d.]+)"/.exec(
		card.markup,
	)!;
	const chip = /class="ab-chip" transform="translate\(([\d.]+),([\d.]+)\)/.exec(card.markup)!;
	const [left, top, height] = slab.slice(1).map(Number);
	const [x, y] = chip.slice(1).map(Number);
	// A tall card, so a centred chip could not pass for a top one.
	expect(height!).toBeGreaterThan(80);
	expect(y! - top!).toBe(x! - left!);
});

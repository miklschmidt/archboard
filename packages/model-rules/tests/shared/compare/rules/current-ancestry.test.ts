// Whether a draft follows Current decides its default base: a draft written on a planning root
// is read against that root, because Current differs from it in everything the root adds.

import { expect, test } from "bun:test";
import { followsCurrent } from "#shared/compare/rules/current-ancestry.ts";

const DRAFTS = [
	{ id: "Root", predecessor: null },
	{ id: "OnRoot", predecessor: "Root" },
	{ id: "OnNow", predecessor: "Now" },
	{ id: "OnOnNow", predecessor: "OnNow" },
	{ id: "OnOld", predecessor: "Old" },
];
const draft = (id: string) => DRAFTS.find((one) => one.id === id)!;

test("a draft follows Current through the drafts between them, and nothing else does", () => {
	expect(followsCurrent(draft("OnNow"), DRAFTS, "Now")).toBe(true);
	expect(followsCurrent(draft("OnOnNow"), DRAFTS, "Now")).toBe(true);
	expect(followsCurrent(draft("OnRoot"), DRAFTS, "Now")).toBe(false);
	expect(followsCurrent(draft("Root"), DRAFTS, "Now")).toBe(false);
	expect(followsCurrent(draft("OnOld"), DRAFTS, "Now")).toBe(false);
	expect(followsCurrent(draft("OnNow"), DRAFTS, undefined)).toBe(false);
});

test("a cycle of drafts ends the walk", () => {
	const loop = [
		{ id: "A", predecessor: "B" },
		{ id: "B", predecessor: "A" },
	];
	expect(followsCurrent(loop[0]!, loop, "Now")).toBe(false);
});

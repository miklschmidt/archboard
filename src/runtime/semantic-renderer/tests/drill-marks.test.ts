// A part that opens another board is marked with which way that board lies,
// read from the part's kind against the level of the board drawn (ADR 0029),
// and the mark takes room beside the name without cutting it.
//
// What is guarded: the direction each part's mark says, in both grammars and
// near and far alike, and a name drawn whole beside its mark. A participant of
// a sequence once kept the room for the mark only when it was painted, so a
// name its card had been widened to hold was cut with an ellipsis.
import { expect, test } from "bun:test";
import type { DiagramGrammar } from "@/shared/semantic-board/index";
import { renderSemanticView } from "@/runtime/semantic-renderer/index";
import { drawnTexts } from "@/runtime/semantic-renderer/tests/drawn-text";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";

const OPENS = { board: "elsewhere", variant: { kind: "current" } };

/** Each part, and the way the board it opens lies from a board at the service level. */
const PARTS = [
	{ id: "whole", name: "The platform as a whole", kind: "system", drill: "up" },
	{ id: "peer", name: "A neighbouring service with a long name", kind: "service", drill: "across" },
	{ id: "inner", name: "A module inside it", kind: "module", drill: "down" },
	{ id: "other", name: "A part of no listed level", kind: "datastore", drill: "elsewhere" },
	{ id: "plain", name: "Opens nothing", kind: "service", drill: undefined },
] as const;

const content = orderedFixture({
	nodes: PARTS.map(({ id, name, kind, drill }) => ({
		id,
		name,
		kind,
		...(drill === undefined ? {} : { drillDown: OPENS }),
	})),
	flows: [
		{
			id: "f",
			name: "Asked along",
			participants: PARTS.map(({ id }) => id),
			steps: PARTS.slice(1).map(({ id }, index) => ({
				id: "s" + String(index),
				from: PARTS[index]!.id,
				to: id,
				label: "asks",
				kind: "sync",
			})),
		},
	],
});

/**
 * The directions the marks drawn for one part say, near and far.
 * @param svg The drawing.
 * @param id The part.
 * @returns Every direction drawn in the groups of the part.
 */
function marksOf(svg: string, id: string): string[] {
	return svg
		.split("data-semantic-id=" + JSON.stringify(id))
		.slice(1)
		.map((group) => group.split("data-semantic-id=")[0]!)
		.flatMap((group) => [...group.matchAll(/data-drill=.([a-z]+)/gu)].map(([, way]) => way!));
}

for (const grammar of ["architecture", "data-flow"] satisfies DiagramGrammar[]) {
	test(
		grammar + " marks each part that opens a board with the way it lies, and draws its name whole",
		async () => {
			const { svg } = await renderSemanticView({
				content,
				grammar,
				theme: "light",
				level: "service",
			});
			const near = drawnTexts(svg);
			for (const { id, name, drill } of PARTS) {
				const marks = marksOf(svg, id);
				if (drill === undefined) expect(marks).toEqual([]);
				else expect(marks).toEqual([drill, drill]);
				const title = near.filter((run) => run.subject.id === id && run.weight !== 400);
				expect(title.map((run) => run.text).join(" ")).toBe(name);
			}
		},
	);
}

// One exchange, and how each of its subjects stands, drawn by the standing tests
// of both grammars.

import { expect } from "bun:test";

import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import type { VariantContent } from "@archboard/board/content";
import { renderDataFlow } from "#runtime/operations/render.ts";
import { type RenderedDiagram } from "#shared/protocol/render-request.ts";
import { type StatedStandings } from "#shared/protocol/render-request.ts";
import { groupOf, type DrawnGroup } from "#tests/runtime/support/drawn-subjects.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

const SEQUENCE: VariantContent = orderedFixture({
	nodes: [
		{ id: "web", name: "Operator Console", kind: "ui" },
		{ id: "gw", name: "API Gateway", kind: "route" },
		{ id: "io", name: "board-io", kind: "module" },
		{ id: "legacy", name: "Legacy Bridge", kind: "module" },
	],
	edges: [],
	flows: [
		{
			id: "f1",
			name: "Agent edit",
			summary: "One write, start to finish",
			participants: ["web", "gw", "io", "legacy"],
			steps: [
				{ id: "s1", from: "web", to: "gw", label: "edit", kind: "sync" },
				{ id: "s2", from: "gw", to: "io", label: "claim", kind: "sync" },
				{ id: "s3", from: "gw", to: "legacy", label: "mirror", kind: "async" },
				{ id: "s4", from: "io", to: "gw", label: "version", kind: "return" },
			],
		},
	],
});

/** The same four cases again, over the sequence grammar's own subjects. */
const SEQUENCE_STANDING: StatedStandings = {
	s2: "added",
	s4: "changed",
	s3: "removed",
	legacy: "removed",
	io: "added",
	f1: "changed",
};

/** Every way a subject can stand. */
const STANDINGS = ["added", "removed", "changed", "unchanged"] as const;

/**
 * Draw the sequence, with or without a statement of how it stands.
 * @param standing What the caller says, when it says anything.
 * @returns The rendered sequence.
 */
function drawnSequence(standing?: StatedStandings): RenderedDiagram {
	return renderDataFlow({ policy: DEFAULT_SEMANTIC_POLICY, content: SEQUENCE, standing });
}

/**
 * One subject's group, insisting it was drawn at all.
 * @param rendered The rendered picture.
 * @param kind What sort of subject.
 * @param id Its semantic id.
 * @returns The group.
 */
function subject(rendered: RenderedDiagram, kind: string, id: string): DrawnGroup {
	const group = groupOf(rendered.svg, kind, id);
	expect(group, `${kind} ${id} was not drawn`).toBeDefined();
	return group!;
}

export { SEQUENCE, SEQUENCE_STANDING, STANDINGS, drawnSequence, subject };

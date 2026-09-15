// A flow drawn on the board it lives on: the architecture reading draws each
// message between two participants as a step line unless an authored
// relationship already joins them, a self step draws nothing, and a standing
// keyed by the step's id lands on its line.

import { describe, expect, test } from "bun:test";
import { VariantContentSchema, type VariantContent } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { routeEnds } from "@/runtime/semantic-renderer/tests/drawn-routes";

const NODES = [
	{ id: "sh", name: "Shell", kind: "external", responsibility: "Invokes the command" },
	{ id: "grp", name: "FlaskGroup", kind: "module", responsibility: "Dispatches the command" },
	{ id: "run", name: "run_command", kind: "function", responsibility: "Starts the server" },
	{ id: "info", name: "ScriptInfo", kind: "module", responsibility: "Imports the app" },
];
const FLOW = {
	id: "f1",
	name: "flask run",
	participants: ["sh", "grp", "run", "info"],
	steps: [
		{ id: "s1", from: "sh", to: "grp", label: "flask run" },
		{ id: "s2", from: "grp", to: "run", label: "invoke" },
		{ id: "s3", from: "run", to: "info", label: "load_app" },
		{ id: "s4", from: "info", to: "info", label: "import", kind: "self", repeat: 2 },
		{ id: "s5", from: "info", to: "run", label: "Flask app", kind: "return" },
		{ id: "s6", from: "run", to: "info", label: "again" },
	],
};

/**
 * A board holding one exchange and the given relationships.
 * @param edges The authored relationships.
 * @returns The content.
 */
function board(edges: readonly unknown[] = []): VariantContent {
	return VariantContentSchema.parse({ nodes: NODES, edges, flows: [FLOW] });
}

/**
 * The drawn line groups of one subject kind, by id.
 * @param svg The document.
 * @param kind The subject kind.
 * @returns The ids drawn as that kind.
 */
function drawnIds(svg: string, kind: "edge" | "step"): string[] {
	return [
		...svg.matchAll(new RegExp(`data-semantic-kind="${kind}" data-semantic-id="([^"]+)"`, "gu")),
	]
		.map((match) => match[1] ?? "")
		.filter((id, index, all) => all.indexOf(id) === index);
}

describe("a flow drawn on its board", () => {
	test("each message between two participants is a dashed, open-headed step line; a self step and a repeated pair draw nothing more", async () => {
		const rendered = await renderArchitecture({ content: board(), theme: "light" });
		expect(drawnIds(rendered.svg, "step")).toEqual(["s1", "s2", "s3", "s5"]);
		expect(drawnIds(rendered.svg, "edge")).toEqual([]);
		expect([...routeEnds(rendered.svg, "step").keys()].toSorted()).toEqual([
			"s1",
			"s2",
			"s3",
			"s5",
		]);
		const line = rendered.svg.match(
			/<g data-semantic-kind="step" data-semantic-id="s1"[^>]*>/u,
		)?.[0];
		expect(line).toContain('data-line-dash="dashed"');
		expect(line).toContain('data-arrowhead="open"');
		expect(rendered.atlas.edges["s1"]).toBeDefined();
	});

	test("an authored relationship over the same pair in the same direction suppresses the step line", async () => {
		const rendered = await renderArchitecture({
			content: board([{ id: "e1", from: "grp", to: "run", kind: "call", label: "invoke" }]),
			theme: "light",
		});
		expect(drawnIds(rendered.svg, "edge")).toEqual(["e1"]);
		expect(drawnIds(rendered.svg, "step")).toEqual(["s1", "s3", "s5"]);
	});

	test("a standing keyed by the step's id lands on its line", async () => {
		const rendered = await renderArchitecture({
			content: board(),
			theme: "light",
			standing: { s3: "added" },
		});
		expect(rendered.svg).toContain(
			'data-semantic-kind="step" data-semantic-id="s3" data-semantic-standing="added"',
		);
	});
});

test("a step to a part drawn with children draws nothing: the container receives no line", async () => {
	const content = VariantContentSchema.parse({
		nodes: [
			...NODES,
			{ id: "inner", name: "load_app", kind: "function", parent: "info", responsibility: "Loads" },
		],
		edges: [],
		flows: [FLOW],
	});
	const rendered = await renderArchitecture({ content, theme: "light" });
	expect(drawnIds(rendered.svg, "step")).toEqual(["s1", "s2"]);
});

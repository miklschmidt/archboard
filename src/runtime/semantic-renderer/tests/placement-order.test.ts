import { expect, test } from "bun:test";
import input from "@/runtime/semantic-renderer/tests/placement-order-graph.json";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { VariantContentSchema, type VariantContent } from "@/shared/semantic-board/index";

const CONTENT = VariantContentSchema.parse(input);

async function cardBoxes(content: VariantContent) {
	const drawing = await renderArchitecture({ content, theme: "light" });
	return drawing.atlas.nodes;
}

async function edgeBoxes(content: VariantContent) {
	const drawing = await renderArchitecture({ content, theme: "light" });
	return drawing.atlas.edges;
}

test("replacing every subject identity leaves card and relationship geometry in place", async () => {
	const nodeIds = new Map(
		CONTENT.nodes.map((node, index) => [
			node.id,
			`N${String(CONTENT.nodes.length - index).padStart(7, "0")}`,
		]),
	);
	const edgeIds = new Map(
		CONTENT.edges.map((edge, index) => [
			edge.id,
			`E${String(CONTENT.edges.length - index).padStart(7, "0")}`,
		]),
	);
	const renamed: VariantContent = {
		...CONTENT,
		nodes: CONTENT.nodes.map((node) => ({
			...node,
			id: nodeIds.get(node.id)!,
			...(node.parent === undefined ? {} : { parent: nodeIds.get(node.parent)! }),
		})),
		edges: CONTENT.edges.map((edge) => ({
			...edge,
			id: edgeIds.get(edge.id)!,
			from: nodeIds.get(edge.from)!,
			to: nodeIds.get(edge.to)!,
		})),
	};
	const original = await renderArchitecture({ content: CONTENT, theme: "light" });
	const replacement = await renderArchitecture({ content: renamed, theme: "light" });
	for (const [before, after] of nodeIds)
		expect(replacement.atlas.nodes[after]).toEqual(original.atlas.nodes[before]);
	for (const [before, after] of edgeIds)
		expect(replacement.atlas.edges[after]).toEqual(original.atlas.edges[before]);
});

test("document array order does not place architecture cards", async () => {
	const reordered = {
		...CONTENT,
		nodes: CONTENT.nodes.toReversed(),
		edges: CONTENT.edges.toReversed(),
	};
	expect(await cardBoxes(reordered)).toEqual(await cardBoxes(CONTENT));
	expect(await edgeBoxes(reordered)).toEqual(await edgeBoxes(CONTENT));
});

test("authored order determines sibling positions and relationship paint order", async () => {
	const content: VariantContent = {
		...CONTENT,
		nodes: [
			{ id: "first", order: 2000, name: "Peer", kind: "service", responsibility: "Same job" },
			{ id: "second", order: 1000, name: "Peer", kind: "service", responsibility: "Same job" },
		],
		edges: [
			{ id: "later", order: 2000, from: "first", to: "second", kind: "call", emphasis: "normal" },
			{ id: "earlier", order: 1000, from: "second", to: "first", kind: "call", emphasis: "normal" },
		],
	};
	const rendered = await renderArchitecture({ content, theme: "light" });
	expect(rendered.svg.indexOf('data-semantic-kind="edge" data-semantic-id="earlier"')).toBeLessThan(
		rendered.svg.indexOf('data-semantic-kind="edge" data-semantic-id="later"'),
	);
	const swapped = {
		...content,
		nodes: content.nodes.map((node) =>
			Object.assign({}, node, { order: node.order === 1000 ? 2000 : 1000 }),
		),
	};
	const changed = await renderArchitecture({ content: swapped, theme: "light" });
	expect(changed.atlas.nodes["second"]).not.toEqual(rendered.atlas.nodes["second"]);
});

// A drawing's key holds a digest, moves with everything the core reads, and
// holds still through an edit the drawing does not read.
import { expect, test } from "bun:test";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/model/policy";
import { drawingKey, interfaceContent } from "#shared/render/rules/drawing-key.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";

const whole = orderedFixture({
	nodes: [
		{ id: "client", name: "Client", kind: "service" },
		{ id: "other", name: "Other", kind: "service", description: "Outside the scope." },
		{ id: "svc", name: "Service", kind: "service" },
		{ id: "api", name: "API", kind: "module", parent: "svc" },
		{ id: "job", name: "Job", kind: "module", parent: "svc" },
	],
	edges: [
		{ id: "call", from: "client", to: "api", kind: "call" },
		{ id: "tick", from: "job", to: "api", kind: "call" },
	],
});

/**
 * The key of the scope's drawing, as the reader prepares it.
 * @param variant The whole variant.
 * @param overrides Any other input of the request.
 * @returns The key.
 */
function keyOf(variant: typeof whole, overrides: Partial<Parameters<typeof drawingKey>[0]> = {}) {
	const scoped = variant.nodes.filter((node) => node.parent === "svc");
	return drawingKey({
		grammar: "architecture",
		content: { ...variant, nodes: scoped, edges: [] },
		variant: interfaceContent(variant),
		policy: DEFAULT_SEMANTIC_POLICY,
		...overrides,
	});
}

test("a key is a bounded digest, whatever the size of the model", () => {
	const large = {
		...whole,
		nodes: [
			...whole.nodes,
			...Array.from({ length: 1000 }, (_, index) => ({ ...whole.nodes[0]!, id: `n${index}` })),
		],
	};
	expect(keyOf(large).length).toBeLessThan(48);
});

test("an edit outside the scope that no interface reads keeps the key", () => {
	const edited = {
		...whole,
		nodes: whole.nodes.map((node) =>
			node.id === "other" ? { ...node, name: "Renamed", description: "Edited." } : node,
		),
	};
	expect(keyOf(edited)).toBe(keyOf(whole));
});

test("every fact the drawing depends on moves the key", () => {
	const key = keyOf(whole);
	const reached = {
		...whole,
		edges: [...whole.edges, { ...whole.edges[0]!, id: "new", from: "other", to: "job" }],
	};
	expect(keyOf(reached)).not.toBe(key);
	const moved = {
		...whole,
		nodes: whole.nodes.map((node) => (node.id === "other" ? { ...node, parent: "svc" } : node)),
	};
	expect(keyOf(moved)).not.toBe(key);
	const named = {
		...whole,
		nodes: whole.nodes.map((node) => (node.id === "api" ? { ...node, name: "Gate" } : node)),
	};
	expect(keyOf(named)).not.toBe(key);
	expect(keyOf(whole, { grammar: "sequence" })).not.toBe(key);
	expect(keyOf(whole, { standing: { api: "changed" } })).not.toBe(key);
	expect(keyOf(whole, { unsettled: ["api"] })).not.toBe(key);
	expect(keyOf(whole, { held: whole })).not.toBe(key);
	expect(
		keyOf(whole, {
			policy: { ...DEFAULT_SEMANTIC_POLICY, groups: { g: { name: "G", color: "red" } } },
		}),
	).not.toBe(key);
});

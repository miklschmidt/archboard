// The three design questions of one variant (ADR 0044, ADR 0057): which entry
// points only pass one call on, which containers have no hidden part and which
// have no entry point. Each result names a container and the parts behind it.

import { describe, expect, test } from "bun:test";
import { passThroughEntryPoints } from "#shared/rules/inspect/container-interface.ts";
import { designQuestions } from "#shared/rules/inspect/design-questions.ts";
import { VariantContentSchema, type VariantContent } from "#shared/schemas/content.ts";
import { withFixtureOrders } from "#tests/shared/support/fixture-orders.ts";

/**
 * A variant's content as a document holds it.
 * @param stated What is on it.
 * @returns The content.
 */
const content = (stated: Record<string, unknown>): VariantContent =>
	VariantContentSchema.parse(withFixtureOrders(stated));

/**
 * A node, the id being its name in lower case.
 * @param name What it is called.
 * @param parent The id of its container, when it has one.
 * @returns The node as the document states it.
 */
const node = (name: string, parent?: string) => ({
	id: name.toLowerCase(),
	name,
	kind: "module",
	...(parent === undefined ? {} : { parent }),
});

let edgeCount = 0;

/**
 * A relationship with an id of its own.
 * @param from The source's id.
 * @param to The target's id.
 * @param kind What the relationship is.
 * @returns The relationship as the document states it.
 */
const edge = (from: string, to: string, kind = "call") => ({
	id: `e${++edgeCount}`,
	from,
	to,
	kind,
});

/**
 * Each result as its container's id and its parts' ids.
 * @param results One question's results.
 * @returns The ids, in order.
 */
const ids = (
	results: readonly {
		readonly container: { readonly id: string };
		readonly parts: readonly { readonly id: string }[];
	}[],
) => results.map((one) => [one.container.id, one.parts.map((part) => part.id)]);

describe("the design questions of a variant", () => {
	// Shop has two parts that Web reaches, and the first passes the call on.
	// Vault has two parts that nothing outside reaches. Mixed has one of each.
	// Disk has no children, so it has no interface.
	const shop = content({
		nodes: [
			node("Shop"),
			node("Cart", "shop"),
			node("Checkout", "shop"),
			node("Vault"),
			node("Keys", "vault"),
			node("Locks", "vault"),
			node("Mixed"),
			node("Door", "mixed"),
			node("Cellar", "mixed"),
			node("Web"),
			node("Disk"),
		],
		edges: [
			edge("web", "cart"),
			edge("web", "checkout"),
			edge("cart", "disk"),
			edge("web", "door"),
		],
	});

	test("an entry point that sends one call of the kind it receives is listed under its container", () => {
		expect(ids(designQuestions(shop).passThroughEntryPoints)).toEqual([["shop", ["cart"]]]);
	});

	test("the pass-through question names what the existing derivation names", () => {
		const named = passThroughEntryPoints(shop).map((one) => [one.container.id, one.part.id]);
		const listed = designQuestions(shop).passThroughEntryPoints.flatMap((one) =>
			one.parts.map((part) => [one.container.id, part.id]),
		);
		expect(listed).toEqual(named);
	});

	test("a container whose every child is reached has no hidden part, and its entry points are the parts", () => {
		expect(ids(designQuestions(shop).containersWithNoHiddenPart)).toEqual([
			["shop", ["cart", "checkout"]],
		]);
	});

	test("a container that no relationship from outside reaches has no entry point, and its parts are hidden", () => {
		expect(ids(designQuestions(shop).containersWithNoEntryPoint)).toEqual([
			["vault", ["keys", "locks"]],
		]);
	});

	test("a container with an entry point and a hidden part is in neither list, and a node with no children is in none", () => {
		const found = designQuestions(shop);
		const listed = [found.containersWithNoHiddenPart, found.containersWithNoEntryPoint].flatMap(
			(results) => results.map((one) => one.container.id),
		);
		expect(listed).not.toContain("mixed");
		expect(listed).not.toContain("disk");
		expect(listed).not.toContain("web");
	});

	test("an entry point that changes the kind of call is not a pass-through", () => {
		const adapted = content({
			nodes: [node("Shop"), node("Cart", "shop"), node("Web"), node("Disk")],
			edges: [edge("web", "cart", "http"), edge("cart", "disk", "call")],
		});
		expect(designQuestions(adapted).passThroughEntryPoints).toEqual([]);
	});

	test("a variant with no container asks nothing", () => {
		const flat = content({ nodes: [node("Web"), node("Disk")], edges: [edge("web", "disk")] });
		expect(designQuestions(flat)).toEqual({
			passThroughEntryPoints: [],
			containersWithNoHiddenPart: [],
			containersWithNoEntryPoint: [],
		});
	});
});

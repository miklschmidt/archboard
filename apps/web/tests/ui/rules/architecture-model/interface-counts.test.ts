// What each count of the interface line selects, which the picture has to be able to show.

import { expect, test } from "bun:test";
import { inspectContainer } from "@archboard/model/container-interface";
import type { VariantContent } from "@archboard/model/content";
import { interfaceCounts } from "#ui/rules/architecture-model/interface-counts.ts";

type Node = VariantContent["nodes"][number];

/**
 * One module.
 * @param id Its identity.
 * @param parent What holds it.
 * @returns The module.
 */
function module(id: string, parent?: string): Node {
	return { id, name: id, kind: "module", order: 1, ...(parent === undefined ? {} : { parent }) };
}

/**
 * One relationship.
 * @param from Where it starts.
 * @param to Where it ends.
 * @returns The relationship.
 */
function call(from: string, to: string): VariantContent["edges"][number] {
	return { id: `${from}-${to}`, from, to, kind: "call", order: 1, emphasis: "normal" };
}

/**
 * The counts of a module, by key.
 * @param id The module.
 * @param edges The relationships of the model.
 * @param open The modules that the reading draws open.
 * @returns Each count with what it selects.
 */
function countsOf(id: string, edges: VariantContent["edges"], open?: ReadonlySet<string | null>) {
	const nodes = [
		module("hub"),
		module("used", "hub"),
		module("alone", "hub"),
		module("far"),
		module("near", "far"),
		module("deep", "near"),
	];
	const inspection = inspectContainer({ nodes, edges, flows: [], walkthroughs: [] }, module(id));
	if (!inspection.holdsParts) throw new Error(`${id} holds no parts.`);
	return new Map(interfaceCounts(inspection, nodes, open).map((count) => [count.key, count]));
}

test("a caller inside another module is selected as the door that the picture draws", () => {
	const counts = countsOf("hub", [call("deep", "used")]);
	expect(counts.get("callers")).toMatchObject({ count: 1, subjects: ["far"] });
	expect(counts.get("entryPoints")).toMatchObject({ count: 1, subjects: ["used"] });
	expect(counts.get("hiddenParts")).toMatchObject({ count: 1, subjects: ["alone"] });
});

test("a caller in a module open beside this one is selected as its own card", () => {
	const edges = [call("deep", "used")];
	const open = new Set(["hub", "far"]);
	expect(countsOf("hub", edges, open).get("callers")?.subjects).toEqual(["near"]);
	expect(countsOf("far", [call("used", "deep")], open).get("callers")?.subjects).toEqual(["used"]);
});

test("a module that the reading does not open keeps the cards of its own picture", () => {
	const counts = countsOf("hub", [call("deep", "used")], new Set(["far"]));
	expect(counts.get("callers")?.subjects).toEqual(["far"]);
});

test("the callers that reach a module itself are counted once each, and only when there are any", () => {
	expect(countsOf("hub", [call("deep", "used")]).has("wholeModule")).toBe(false);
	const counts = countsOf("hub", [call("deep", "hub"), call("deep", "hub"), call("near", "hub")]);
	expect(counts.get("wholeModule")).toMatchObject({ count: 2, subjects: ["far"] });
	expect(counts.get("entryPoints")).toMatchObject({ count: 0, subjects: [] });
});

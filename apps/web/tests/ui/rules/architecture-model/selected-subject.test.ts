import { expect, test } from "bun:test";
import { projectModel, type Model } from "@archboard/board/content";
import { linesOf, relationshipsOf } from "#ui/rules/architecture-model/selected-subject.ts";
import { SHOP } from "#tests/ui/support/architecture-model/scene.ts";

/** A relationship between parts of the two roots, each way, and one from the root that holds them. */
const TWO_WAY: Model = {
	...SHOP,
	relationships: [
		{ id: "out", from: "Shop#Handler", to: "Shop#Queue", kind: "call", order: 0 },
		{ id: "own", from: "Shop#Gateway", to: "Shop#Worker", kind: "data", order: 1 },
		{ id: "in", from: "Shop#Queue", to: "Shop#Decode", kind: "event", order: 2 },
	] as unknown as Model["relationships"],
};

/**
 * The relationships of each of a list's lines.
 * @param lines The lines.
 * @returns Their identities.
 */
function joinsOf(lines: ReturnType<typeof linesOf>["sends"]): readonly string[][] {
	return lines.map(({ joins }) => joins.map((edge) => edge.id));
}

test("a two-way line stands in both directions, each with what runs that way", () => {
	const projection = projectModel(TWO_WAY);
	expect(projection.connections.map(({ line }) => line.twoWay)).toEqual([true]);
	const gateway = linesOf(projection, "Shop#Gateway");
	expect(joinsOf(gateway.sends)).toEqual([["out", "own"]]);
	expect(joinsOf(gateway.receives)).toEqual([["in"]]);
	const worker = linesOf(projection, "Shop#Worker");
	expect(joinsOf(worker.sends)).toEqual([["in"]]);
	expect(joinsOf(worker.receives)).toEqual([["out", "own"]]);
});

test("a module's relationships keep their direction across a two-way line", () => {
	const { outgoing, incoming } = relationshipsOf(TWO_WAY, projectModel(TWO_WAY), "Shop#Worker");
	expect(outgoing.map((edge) => edge.id)).toEqual(["in"]);
	expect(incoming.map((edge) => edge.id)).toEqual(["own", "out"]);
});

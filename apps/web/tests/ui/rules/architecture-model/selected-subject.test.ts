import { expect, test } from "bun:test";
import { projectModel, type Model } from "@archboard/model/content";
import {
	isDoor,
	isOpenDoor,
	linesOf,
	relationshipsOf,
} from "#ui/rules/architecture-model/selected-subject.ts";
import { SHOP } from "#tests/ui/support/architecture-model/scene.ts";

/**
 * A relationship.
 * @param id Its identity.
 * @param from Where it starts.
 * @param to Where it ends.
 * @param order Its place.
 * @returns The relationship.
 */
function relationship(
	id: string,
	from: string,
	to: string,
	order: number,
): Model["relationships"][number] {
	return { id, from, to, order, kind: "call", emphasis: "normal" };
}

/** A relationship between parts of the two roots, each way, and one from the root that holds them. */
const TWO_WAY: Model = {
	...SHOP,
	relationships: [
		relationship("out", "Shop#Handler", "Shop#Queue", 0),
		relationship("own", "Shop#Gateway", "Shop#Worker", 1),
		relationship("in", "Shop#Queue", "Shop#Decode", 2),
	],
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

test("a door opens at one click while its state holds its module", () => {
	const line = relationship("line", "Shop#Handler", "Shop#Worker", 0);
	const open = projectModel({ ...SHOP, relationships: [line] }, "Shop#Gateway");
	expect(isOpenDoor(open, "Shop#Worker")).toBe(true);
	expect(isOpenDoor(open, "Shop#Handler")).toBe(false);
	const base: Model = { ...SHOP, relationships: [line] };
	const removed: Model = {
		...SHOP,
		modules: SHOP.modules.filter(({ id }) => !id.includes("Worker")),
	};
	const compared = projectModel(removed, "Shop#Gateway", null, {}, base);
	expect(isDoor(compared, "Shop#Worker")).toBe(true);
	expect(isOpenDoor(compared, "Shop#Worker")).toBe(false);
});

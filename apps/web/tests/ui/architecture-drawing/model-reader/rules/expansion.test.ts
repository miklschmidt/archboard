// What a door's control asks of the address, what the keys walk, and what a trace counts with two
// frames in the picture.

import { expect, test } from "bun:test";
import { projectModel, type Model } from "@archboard/model/content";
import { cardBeside, toggled } from "#ui/architecture-drawing/model-reader/rules/expansion.ts";
import { moduleTree } from "#ui/architecture-drawing/model-reader/rules/module-tree.ts";
import { pictureReach } from "#ui/architecture-drawing/model-reader/reading/rules/picture-reach.ts";
import { SHOP } from "#tests/ui/support/model-reader/scene.ts";

/**
 * One more module of the shop.
 * @param name Its name, which also names its identity.
 * @param order Its authored place.
 * @param parent What holds it.
 * @returns The module.
 */
function added(name: string, order: number, parent?: string): Model["modules"][number] {
	const id = `Shop#${name}`;
	return {
		schemaVersion: 1,
		id,
		name,
		kind: "module",
		order,
		file: `${id}.module.json`,
		outgoing: [],
		...(parent === undefined ? {} : { parent }),
	};
}

/**
 * One relationship of the shop.
 * @param from Where it starts.
 * @param to Where it ends.
 * @returns The relationship.
 */
function call(from: string, to: string): Model["relationships"][number] {
	return { id: `${from}-${to}`, from, to, kind: "call", emphasis: "normal", order: 1 };
}

const MODEL: Model = {
	...SHOP,
	modules: [
		...SHOP.modules,
		added("Store", 7),
		added("Sink", 8, "Shop#Store"),
		added("Drain", 9, "Shop#Worker"),
	],
	relationships: [call("Shop#Decode", "Shop#Queue"), call("Shop#Drain", "Shop#Sink")],
};

/**
 * A live reading of the worker.
 * @param expand What the address opens beside it.
 * @returns The reading.
 */
function reading(...expand: string[]) {
	return projectModel(MODEL, "Shop#Worker", null, { expand, controls: true });
}

test("a door joins what the address holds, and a frame leaves it with what no longer opens", () => {
	expect(toggled(reading(), "Shop#Store")).toEqual(["Shop#Store"]);
	expect(toggled(reading("Shop#Store"), "Shop#Gateway")).toEqual(["Shop#Store", "Shop#Gateway"]);
	expect(toggled(reading("Shop#Store", "Shop#Gone"), "Shop#Store")).toEqual([]);
});

test("a frame answers for the module that a chain folds into it", () => {
	const open = reading("Shop#Gateway");
	expect(open.expanded).toEqual([{ asked: "Shop#Gateway", frame: "Shop#Handler" }]);
	expect(toggled(open, "Shop#Handler")).toEqual([]);
});

test("a subject with no control changes nothing", () => {
	expect(toggled(reading(), "Shop#Queue")).toBeNull();
});

test("the keys walk the parts, then each frame with its parts, then the doors", () => {
	const open = reading("Shop#Store");
	const tree = moduleTree(open.depicted);
	const walked = ["Shop#Queue"];
	for (let at = cardBeside(tree, open, "Shop#Queue", 1); at !== null;) {
		walked.push(at);
		at = cardBeside(tree, open, at, 1);
	}
	expect(walked.slice(0, 4)).toEqual(["Shop#Queue", "Shop#Drain", "Shop#Store", "Shop#Sink"]);
	expect(walked.at(-1)).toBe("Shop#Gateway");
	expect(cardBeside(tree, open, "Shop#Queue", -1)).toBeNull();
});

test("a trace counts the parts it reaches and no frame", () => {
	expect(pictureReach(reading("Shop#Store"), "Shop#Drain", "onward").parts).toBe(1);
});

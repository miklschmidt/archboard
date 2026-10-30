import { expect, test } from "bun:test";
import { projectModel, type Model } from "#shared/rules/model-projection.ts";
import { doorEndpoints } from "#shared/rules/door-endpoints.ts";

const model = {
	modules: [
		{ id: "open", name: "Open", kind: "module", order: 0 },
		{ id: "part", name: "Part", kind: "module", order: 1, parent: "open" },
		{ id: "inner", name: "Inner", kind: "module", order: 2, parent: "part" },
		{ id: "other", name: "Other", kind: "module", order: 3, parent: "open" },
		{ id: "door", name: "Door", kind: "module", order: 4 },
	],
	relationships: [
		{ id: "deep", from: "inner", to: "door", kind: "call", order: 0, emphasis: "normal" },
		{ id: "near", from: "part", to: "door", kind: "http", order: 1, emphasis: "normal" },
		{ id: "back", from: "door", to: "other", kind: "event", order: 2, emphasis: "normal" },
		{ id: "own", from: "open", to: "door", kind: "data", order: 3, emphasis: "normal" },
	],
	collections: [],
} as unknown as Model;

test("a door lists its real endpoints, grouped by the child that reaches them", () => {
	const groups = doorEndpoints(projectModel(model, "open"), "door");
	expect(groups.map(({ part, edges }) => [part, edges.map((edge) => edge.id)])).toEqual([
		["part", ["deep", "near"]],
		["open", ["own"]],
		["other", ["back"]],
	]);
});

test("a door lists a two-way line's relationships under the part that reaches it", () => {
	const twoWay = {
		...model,
		relationships: [
			{ id: "in", from: "door", to: "other", kind: "call", order: 0, emphasis: "normal" },
			{ id: "out", from: "other", to: "door", kind: "call", order: 1, emphasis: "normal" },
		],
	} as unknown as Model;
	const groups = doorEndpoints(projectModel(twoWay, "open"), "door");
	expect(groups.map(({ part, edges }) => [part, edges.map((edge) => edge.id)])).toEqual([
		["other", ["in", "out"]],
	]);
});

test("a module that is no door lists nothing", () => {
	expect(doorEndpoints(projectModel(model, "open"), "part")).toEqual([]);
});

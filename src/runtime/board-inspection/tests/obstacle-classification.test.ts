import { describe, expect, test } from "bun:test";
import { ObstacleRefSchema, inspectBoard } from "../index.js";
import { connector, libraryBody, semanticNode } from "./fixtures/elements.js";

const penetrations = (elements: Record<string, unknown>[]) =>
	inspectBoard([
		connector({
			id: "through",
			x: -10,
			y: 5,
			width: 80,
			points: [
				[0, 0],
				[80, 0],
			],
		}),
		...elements,
	]).findings.filter((f) => f.code === "CONNECTOR_PENETRATES_OBSTACLE");

describe("obstacle classification", () => {
	test("creates a fresh connector for every classification", () => {
		const first = penetrations([libraryBody("fresh")]);
		const second = penetrations([libraryBody("fresh")]);
		expect(first).not.toBe(second);
		expect(first[0]).not.toBe(second[0]);
		expect(first).toEqual(second);
	});

	test("classifies singleton, grouped, and transitive obstacles", () => {
		const singleton = penetrations([libraryBody("body")])[0]?.obstacles[0];
		expect(singleton).toMatchObject({ kind: "library-component", elementIds: ["body"] });
		expect(ObstacleRefSchema.safeParse(singleton).success).toBe(true);
		const grouped = penetrations([
			{ ...libraryBody("b", 20, ["g"]), customData: undefined },
			{ ...libraryBody("a", 0, ["g"]), customData: undefined },
		])[0]?.obstacles[0];
		expect(grouped).toMatchObject({
			id: "obstacle:a,b",
			kind: "grouped-component",
			elementIds: ["a", "b"],
		});
		const transitive = penetrations([
			{ ...libraryBody("a", 0, ["one"]), customData: undefined },
			{ ...libraryBody("b", 20, ["one", "two"]), customData: undefined },
			{ ...libraryBody("c", 40, ["two"]), customData: undefined },
		])[0]?.obstacles[0];
		expect(transitive?.id).toBe("obstacle:a,b,c");
	});

	test("uses canonical escaping under input reversal", () => {
		for (const [ids, expected] of [
			[["id,part", "plain"], "obstacle:id\\,part,plain"],
			[["id\\part", "plain"], "obstacle:id\\\\part,plain"],
			[["id\\,part", "plain"], "obstacle:id\\\\\\,part,plain"],
			[["\ud800", "plain"], "obstacle:plain,\ud800"],
		] as const) {
			for (const order of [ids, ids.toReversed()]) {
				const obstacle = penetrations(
					order.map((id, index) =>
						Object.assign(libraryBody(id, index * 20, ["g"]), { customData: undefined }),
					),
				)[0]?.obstacles[0];
				expect(obstacle?.id).toBe(expected);
			}
		}
	});

	test("excludes decorations, singleton groups, endpoint ancestors, and promoted nodes", () => {
		const cases = [
			[{ ...libraryBody("plain"), customData: undefined, groupIds: [] }],
			[{ ...libraryBody("single"), customData: undefined, groupIds: ["g"] }],
			[semanticNode("a", { groupIds: ["g"] }), semanticNode("b", { x: 20, groupIds: ["g"] })],
		];
		for (const elements of cases) expect(penetrations(elements)).toHaveLength(0);
	});
});

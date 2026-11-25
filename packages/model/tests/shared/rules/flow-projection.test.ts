import { describe, expect, test } from "bun:test";
import { defaultSemanticPolicy } from "#shared/schemas/semantic-policy.ts";
import { projectModel, type Model } from "#shared/rules/model-projection.ts";
import { projectFlow } from "#shared/rules/model-flow-projection.ts";

describe("projectFlow synthetic participants", () => {
	test("draws both canonical modules and transient participants for temporary flows", () => {
		const model = {
			success: true,
			manifest: { schemaVersion: 1, id: "Shop", name: "Shop", summary: "Fixture" },
			policy: defaultSemanticPolicy(),
			revision: { digest: "a".repeat(64), files: [] },
			modules: [
				{
					schemaVersion: 1,
					id: "Shop#auth",
					order: 0,
					name: "Auth",
					kind: "service",
					outgoing: [],
				},
			],
			relationships: [],
			collections: [],
			walkthroughs: [],
			proposals: [],
		} as unknown as Model;
		const architecture = projectModel(model, null, null);
		const projected = projectFlow(
			architecture,
			{
				id: "eph#f1",
				name: "Returning auth",
				participants: ["eph#p1", "Shop#auth"],
				steps: [
					{
						id: "eph#s1",
						kind: "sync",
						from: "eph#p1",
						to: "Shop#auth",
						label: "Resume session",
					},
				],
			},
			[{ id: "eph#p1", name: "Returning User" }],
		);
		expect(projected.content.nodes.map((node) => [node.id, node.name])).toEqual([
			["eph#p1", "Returning User"],
			["Shop#auth", "Auth"],
		]);
		expect(projected.content.flows).toHaveLength(1);
		expect(projected.depicted.nodes.map((node) => node.id)).toEqual(["Shop#auth"]);
	});
});

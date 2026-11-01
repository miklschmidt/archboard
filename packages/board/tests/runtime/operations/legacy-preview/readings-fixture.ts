import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { previewFixture } from "#tests/runtime/operations/legacy-preview/fixture.ts";

function narrativeFixture() {
	const fixture = previewFixture();
	const { board, vault } = fixture;
	const original = {
		...board,
		views: [
			{ id: "Whole", name: "Whole shop", grammar: "architecture", scope: { kind: "all" } },
			{
				id: "Entry",
				name: "Entry",
				grammar: "architecture",
				scope: { kind: "selection", nodes: ["Api"], edges: ["Save"], flows: [] },
			},
			{
				id: "Order",
				name: "Order",
				grammar: "sequence",
				scope: { kind: "selection", nodes: [], edges: [], flows: ["Buy"] },
			},
			{
				id: "Unused",
				name: "Storage",
				summary: "Inspect storage",
				grammar: "architecture",
				scope: { kind: "selection", nodes: ["Db"], edges: [], flows: [] },
			},
		],
		variants: [
			{
				...board.variants[0]!,
				content: {
					...board.variants[0]!.content,
					walkthroughs: [
						{
							id: "Tour",
							name: "Buying",
							summary: "How a purchase lands",
							beats: [
								{
									id: "Start",
									heading: "Entry",
									body: "Accept the request",
									subjects: ["Api", "Save"],
									view: "Entry",
								},
								{
									id: "Call",
									heading: "Save",
									body: "Follow the purchase",
									subjects: ["Ask"],
									view: "Order",
								},
								{
									id: "End",
									heading: "Whole shop",
									body: "Return to the whole shop",
									subjects: [],
									view: "Whole",
								},
							],
						},
					],
				},
			},
		],
	};
	writeFileSync(join(vault, "Shop.semantic.json"), JSON.stringify(original));
	return { ...fixture, original };
}

export { narrativeFixture };

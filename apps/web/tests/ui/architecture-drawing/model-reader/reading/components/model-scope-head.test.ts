import { expect, test } from "bun:test";
import { projectModel, type Model } from "@archboard/model/content";
import { SHOP } from "#tests/ui/support/model-reader/scene.ts";
import { scopeHead } from "#ui/architecture-drawing/model-reader/reading/components/ModelAbout.tsx";
import { moduleTree } from "#ui/architecture-drawing/model-reader/rules/module-tree.ts";

/**
 * The head of a reading's root, with nothing open and no flow on screen.
 * @param model The reading.
 * @returns The head that the right panel and About show.
 */
function rootHead(model: Model) {
	const projection = projectModel(model);
	return scopeHead({ model, scope: null, tree: moduleTree(projection.depicted), projection });
}

test("the root of a proposal is named for the proposal, over the proposal's own summary", () => {
	const proposal: Model = {
		...SHOP,
		selectedState: {
			id: "Checkout",
			name: "Split checkout",
			lifecycle: "draft",
			summary: "Checkout leaves the storefront.",
		},
	};
	expect(rootHead(proposal)).toEqual({
		name: "Split checkout",
		lead: "Checkout leaves the storefront.",
	});
});

test("the root of the current state is named for the model", () => {
	expect(rootHead(SHOP).name).toBe(SHOP.manifest.name);
});

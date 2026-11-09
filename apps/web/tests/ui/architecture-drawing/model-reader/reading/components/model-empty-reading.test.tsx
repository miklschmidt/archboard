import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { projectModel, type Model } from "@archboard/model/content";
import { SHOP, shopRequest } from "#tests/ui/support/model-reader/scene.ts";
import { EMPTY_DRAWING, nextScene } from "#ui/architecture-drawing/model-reader/rules/scene.ts";
import { ModelEmptyReading } from "#ui/architecture-drawing/model-reader/reading/components/ModelEmptyReading.tsx";

const PLAN: Model["proposals"][number] = {
	schemaVersion: 1,
	id: "Draft",
	name: "Plan",
	lifecycle: "draft",
	predecessor: null,
	predecessorRevision: SHOP.revision.digest,
	baseline: "b".repeat(40),
	changes: [],
	file: "draft.proposal.json",
};

test.each([false, true])(
	"an empty snapshot offers no live reader action (proposal: %s)",
	(withPlan) => {
		const model: Model = {
			...SHOP,
			manifest: { ...SHOP.manifest, current: null },
			selectedState: null,
			modules: [],
			roots: [],
			proposals: withPlan ? [PLAN] : [],
		};
		const request = { ...shopRequest(), model, projection: projectModel(model) };
		const scene = nextScene(null, request, EMPTY_DRAWING, new Set());
		if (scene === null) throw new Error("An empty reading must settle.");
		const html = renderToStaticMarkup(
			createElement(ModelEmptyReading, {
				scene,
				pending: false,
				onWholeScope: undefined,
				onOpenState: undefined,
			}),
		);
		expect(html).toContain('data-slot="model-planned"');
		expect(html).not.toContain("<button");
	},
);

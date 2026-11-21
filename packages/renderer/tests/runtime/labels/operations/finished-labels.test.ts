// Every relationship's label is drawn on its line. A routing pass once left
// one of Voice coordinator's "Workhorse news" fourteen labels with no run to
// sit on, and the drawing lost it.
// What this catches: an engine's drawing that silently loses a label.

import { expect, test } from "bun:test";
import { defaultSemanticPolicy, modelShape } from "@archboard/model-contract";
import { renderArchitecture } from "#runtime/bun-renderer/operations/render.ts";
import { routeLabels } from "#tests/runtime/support/drawn-routes.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import workhorseNews from "#tests/runtime/support/fixtures/workhorse-news.json";
import { fixtureDocument } from "#tests/runtime/support/model-documents.ts";

test.each(modelShape("layoutEngine").options)(
	"a drawing keeps every relationship's label (%s)",
	async (layout) => {
		const policy = fixtureDocument("semanticPolicy", {
			...defaultSemanticPolicy(),
			groups: { child: { name: "Codex child", color: "indigo" } },
		});
		const content = orderedFixture(workhorseNews);
		const drawing = await renderArchitecture({ content, policy, theme: "light", layout });
		const labelled = content.edges.filter(({ label }) => label !== undefined).map(({ id }) => id);
		expect([...routeLabels(drawing.svg).keys()].toSorted()).toEqual(labelled.toSorted());
	},
);

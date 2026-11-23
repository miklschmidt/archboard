// Every relationship's label is drawn on its line. A routing pass once left
// one of Voice coordinator's "Workhorse news" fourteen labels with no run to
// sit on, and the drawing lost it.
// What this catches: a drawing that silently loses a label.

import { expect, test } from "bun:test";
import { defaultSemanticPolicy, semanticPolicySchema } from "@archboard/model/policy";
import { renderArchitecture } from "#runtime/bun-renderer/operations/render.ts";
import { routeLabels } from "#tests/runtime/support/drawn-routes.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import workhorseNews from "#tests/runtime/support/fixtures/workhorse-news.json";

test("a drawing keeps every relationship's label", async () => {
	const policy = semanticPolicySchema().parse({
		...defaultSemanticPolicy(),
		groups: { child: { name: "Codex child", color: "indigo" } },
	});
	const content = orderedFixture(workhorseNews);
	const drawing = await renderArchitecture({ content, policy, theme: "light" });
	const labelled = content.edges.filter(({ label }) => label !== undefined).map(({ id }) => id);
	expect([...routeLabels(drawing.svg).keys()].toSorted()).toEqual(labelled.toSorted());
});

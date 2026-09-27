// A finishing pass routes a settled placement once more, with the labels it
// settled with. A routing that leaves a label with no run to sit on is
// refused, since the drawing would lose the label: the hook pass through
// Voice coordinator's "Workhorse news" dropped one of its fourteen.
// What this catches: a finished Graphviz drawing that silently loses a label.

import { expect, test } from "bun:test";
import { DEFAULT_SEMANTIC_POLICY, SemanticPolicySchema } from "@/shared/semantic-policy/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { routeLabels } from "@/runtime/semantic-renderer/tests/drawn-routes";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import workhorseNews from "./workhorse-news.json";

test("a finished drawing keeps every relationship's label", async () => {
	const policy = SemanticPolicySchema.parse({
		...DEFAULT_SEMANTIC_POLICY,
		groups: { child: { name: "Codex child", color: "indigo" } },
	});
	const content = orderedFixture(workhorseNews);
	const drawing = await renderArchitecture({ content, policy, theme: "light", layout: "graphviz" });
	const labelled = content.edges.filter(({ label }) => label !== undefined).map(({ id }) => id);
	expect([...routeLabels(drawing.svg).keys()].toSorted()).toEqual(labelled.toSorted());
});

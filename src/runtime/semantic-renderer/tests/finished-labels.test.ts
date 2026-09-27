// Every relationship's label is drawn on its line. A routing pass once left
// one of Voice coordinator's "Workhorse news" fourteen labels with no run to
// sit on, and the drawing lost it.
// What this catches: an engine's drawing that silently loses a label.

import { expect, test } from "bun:test";
import { LayoutEngineSchema } from "@/shared/semantic-board/index";
import { DEFAULT_SEMANTIC_POLICY, SemanticPolicySchema } from "@/shared/semantic-policy/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { routeLabels } from "@/runtime/semantic-renderer/tests/drawn-routes";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import workhorseNews from "./workhorse-news.json";

test.each(LayoutEngineSchema.options)(
	"a drawing keeps every relationship's label (%s)",
	async (layout) => {
		const policy = SemanticPolicySchema.parse({
			...DEFAULT_SEMANTIC_POLICY,
			groups: { child: { name: "Codex child", color: "indigo" } },
		});
		const content = orderedFixture(workhorseNews);
		const drawing = await renderArchitecture({ content, policy, theme: "light", layout });
		const labelled = content.edges.filter(({ label }) => label !== undefined).map(({ id }) => id);
		expect([...routeLabels(drawing.svg).keys()].toSorted()).toEqual(labelled.toSorted());
	},
);

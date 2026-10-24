import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { overdrawnRun } from "#tests/runtime/support/drawn-ink.ts";
import { routePoints } from "#tests/runtime/support/drawn-routes.ts";
import fixture from "#tests/runtime/support/fixtures/facing-trunks.json";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

test.each(["http", "data"])(
	"Blocks keeps opposing traffic separate between facing ports (%s)",
	async (kind) => {
		const content = orderedFixture(fixture);
		content.edges.find((edge) => edge.id === "PRXBb3Zi")!.kind = kind;
		const drawing = await renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content,
			theme: "light",
			layout: "blocks",
		});
		const routes = routePoints(drawing.svg);
		for (const id of ["lsOwWQvq", "PRXBb3Zi"]) expect(routes.has(id), id).toBe(true);
		expect(overdrawnRun(drawing, ["lsOwWQvq", "PRXBb3Zi"])).toBe(0);
	},
);

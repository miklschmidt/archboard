// Removed cards remain comparison context, so the routes to a replacement
// must clear them even though the complete comparison is laid out afresh.
import { expect, test } from "bun:test";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { routeCrosses, routePoints } from "@/runtime/semantic-renderer/tests/drawn-routes";

/**
 * One card with words on it.
 * @param id Its identity.
 * @param name Its name.
 * @param responsibility What it is for.
 * @returns The node.
 */
function card(id: string, name: string, responsibility: string) {
	return { id, name, kind: "module", responsibility };
}

/** Flask 2.1's contexts pushed onto two stacks. */
const stacks = VariantContentSchema.parse({
	nodes: [
		card("appctx", "App context", "Binds current_app and g for one unit of work"),
		card("reqctx", "Request context", "Binds request and session for one request"),
		card("appstack", "App context stack", "werkzeug LocalStack holding pushed app contexts"),
		card(
			"reqstack",
			"Request context stack",
			"werkzeug LocalStack holding pushed request contexts",
		),
	],
	edges: [
		{ id: "e1", from: "appctx", to: "appstack", kind: "data", label: "push / pop" },
		{ id: "e2", from: "reqctx", to: "reqstack", kind: "data", label: "push / pop" },
		{
			id: "e3",
			from: "reqctx",
			to: "appctx",
			kind: "call",
			label: "pushes an app context when none is active",
		},
	],
});

/** The proposal as it is drawn: the stacks kept as removed context, one new card. */
const proposal = VariantContentSchema.parse({
	nodes: [
		...stacks.nodes,
		card("cv", "Context variables", "_cv_app and _cv_request hold the active contexts"),
	],
	edges: [
		...stacks.edges,
		{ id: "e4", from: "appctx", to: "cv", kind: "data", label: "set / reset" },
		{ id: "e5", from: "reqctx", to: "cv", kind: "data", label: "set / reset" },
	],
});

test("relationships added to a new card do not run through the cards the proposal removed", async () => {
	const drawing = await renderArchitecture({
		content: proposal,
		standing: {
			appstack: "removed",
			reqstack: "removed",
			cv: "added",
			e1: "removed",
			e2: "removed",
			e4: "added",
			e5: "added",
		},
		theme: "light",
	});
	const routes = routePoints(drawing.svg);
	for (const edge of proposal.edges) {
		const route = routes.get(edge.id)!;
		for (const [id, box] of Object.entries(drawing.atlas.nodes)) {
			if (id === edge.from || id === edge.to) continue;
			expect(routeCrosses(route, box), `${edge.id} through ${id}`).toBe(false);
		}
	}
});

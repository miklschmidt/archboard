// A relationship between a frame and a part inside it is the frame's own: it
// leaves the frame's top face down into the part, or the part's bottom down
// onto the frame's bottom face, and never sets out from the frame's outer
// flank as though it came from somewhere else on the page.
import { expect, test } from "bun:test";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { routePoints } from "@/runtime/semantic-renderer/tests/drawn-routes";

const application = VariantContentSchema.parse({
	nodes: [
		{ id: "app", name: "Flask app", kind: "app", responsibility: "The WSGI application object" },
		{
			id: "dispatch",
			name: "Dispatch",
			kind: "function",
			parent: "app",
			responsibility: "full_dispatch_request through finalize_request",
		},
		{ id: "cli", name: "CLI", kind: "module", responsibility: "The flask command group" },
		{
			id: "run",
			name: "Run command",
			kind: "function",
			parent: "cli",
			responsibility: "flask run: load the app and serve it",
		},
	],
	edges: [
		{ id: "d", from: "app", to: "dispatch", kind: "call", label: "dispatches" },
		{ id: "l", from: "run", to: "app", kind: "call", label: "loads the app" },
	],
});

/** The same board read through a view that keeps the frame, its part and a sibling. */
const overview = VariantContentSchema.parse({
	nodes: application.nodes.filter((node) => node.id !== "run"),
	edges: application.edges.filter((edge) => edge.id === "d"),
});

test.each([
	["the whole board", application],
	["a selection view", overview],
])("a frame's call into its own part starts on the frame's top face, in %s", async (_, content) => {
	const drawing = await renderArchitecture({ content, theme: "light" });
	const app = drawing.atlas.nodes["app"]!;
	const part = drawing.atlas.nodes["dispatch"]!;
	const route = routePoints(drawing.svg).get("d")!;
	const start = route[0]!;
	const end = route.at(-1)!;
	expect(start.y).toBeCloseTo(app.y, 1);
	expect(start.x).toBeGreaterThan(app.x);
	expect(start.x).toBeLessThan(app.x + app.width);
	expect(end.y).toBeCloseTo(part.y, 1);
	for (const point of route) {
		expect(point.x).toBeGreaterThanOrEqual(app.x);
		expect(point.x).toBeLessThanOrEqual(app.x + app.width);
	}
});

test("a part's call up to its own frame ends on the frame's bottom face", async () => {
	const content = VariantContentSchema.parse({
		nodes: [
			{ id: "app", name: "Flask app", kind: "app", responsibility: "The application" },
			{ id: "hook", name: "Hook", kind: "function", parent: "app", responsibility: "Runs first" },
		],
		edges: [{ id: "up", from: "hook", to: "app", kind: "call", label: "registers" }],
	});
	const drawing = await renderArchitecture({ content, theme: "light" });
	const app = drawing.atlas.nodes["app"]!;
	const part = drawing.atlas.nodes["hook"]!;
	const route = routePoints(drawing.svg).get("up")!;
	expect(route[0]!.y).toBeCloseTo(part.y + part.height, 1);
	expect(route.at(-1)!.y).toBeCloseTo(app.y + app.height, 1);
	for (const point of route) {
		expect(point.x).toBeGreaterThanOrEqual(app.x);
		expect(point.x).toBeLessThanOrEqual(app.x + app.width);
	}
});

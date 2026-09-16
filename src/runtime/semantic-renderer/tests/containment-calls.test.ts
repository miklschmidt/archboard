// A relationship between a frame and a part inside it is the frame's own: it
// leaves the frame's back edge past the title band into the part, or the
// part's front onto the frame's front edge, whichever way the page reads,
// and never sets out from the frame's outer flank as though it came from
// somewhere else on the page, and never through the title.
import { expect, test } from "bun:test";
import { VariantContentSchema, type VariantContent } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { along, depth, faceOf, readingOf } from "@/runtime/semantic-renderer/tests/drawn-reading";
import { routePoints } from "@/runtime/semantic-renderer/tests/drawn-routes";
import { drawnTexts } from "@/runtime/semantic-renderer/tests/drawn-text";

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

/**
 * The same frame with enough parts fanned inside it that the board reads
 * left to right, so the frame's own call has to come in past the title band
 * from the frame's left edge rather than down through it.
 */
const wide = VariantContentSchema.parse({
	nodes: [
		...application.nodes.filter((node) => node.id !== "run" && node.id !== "cli"),
		...Array.from({ length: 14 }, (_, index) => ({
			id: `p${index}`,
			name: `Request hook number ${index + 1}`,
			kind: "function",
			parent: "app",
		})),
	],
	edges: [
		application.edges[0]!,
		...Array.from({ length: 14 }, (_, index) => ({
			id: `h${index}`,
			from: "dispatch",
			to: `p${index}`,
			kind: "call",
		})),
	],
});

/**
 * Whether a point lies past a frame's title band: below every heading the
 * frame draws, so a line from there cannot run across the title.
 * @param point The point.
 * @param drawing The rendered board.
 * @param frame The frame's id.
 * @returns True when the point is below the title.
 */
function pastTitle(point: { y: number }, drawing: { svg: string }, frame: string): boolean {
	const headings = drawnTexts(drawing.svg).filter((text) => text.subject.id === frame);
	expect(headings.length).toBeGreaterThan(0);
	return headings.every((heading) => point.y >= heading.y);
}

test.each([
	["the whole board", application],
	["a selection view", overview],
	["a board that reads left to right", wide],
])(
	"a frame's call into its own part leaves the frame's back edge past the title band, inside the frame, in %s",
	async (_, content: VariantContent) => {
		const drawing = await renderArchitecture({ content, theme: "light" });
		const direction = readingOf(drawing);
		const app = drawing.atlas.nodes["app"]!;
		const part = drawing.atlas.nodes["dispatch"]!;
		const route = routePoints(drawing.svg).get("d")!;
		const start = route[0]!;
		const end = route.at(-1)!;
		// The line leaves past the frame's title and never its outer front edge or
		// a flank, so it cannot read as arriving from outside the frame.
		expect(pastTitle(start, drawing, "app")).toBe(true);
		expect(along(start, direction)).toBeGreaterThanOrEqual(along(app, direction));
		expect(along(start, direction)).toBeLessThan(along(part, direction));
		expect(faceOf(end, part, direction)).toBe("behind");
		// And the whole of it stays inside the frame.
		for (const point of route) {
			expect(point.x).toBeGreaterThanOrEqual(app.x);
			expect(point.x).toBeLessThanOrEqual(app.x + app.width);
			expect(point.y).toBeGreaterThanOrEqual(app.y);
			expect(point.y).toBeLessThanOrEqual(app.y + app.height);
		}
	},
);

test("a part's call up to its own frame ends on the frame's front edge", async () => {
	const content = VariantContentSchema.parse({
		nodes: [
			{ id: "app", name: "Flask app", kind: "app", responsibility: "The application" },
			{ id: "hook", name: "Hook", kind: "function", parent: "app", responsibility: "Runs first" },
		],
		edges: [{ id: "up", from: "hook", to: "app", kind: "call", label: "registers" }],
	});
	const drawing = await renderArchitecture({ content, theme: "light" });
	const direction = readingOf(drawing);
	const app = drawing.atlas.nodes["app"]!;
	const part = drawing.atlas.nodes["hook"]!;
	const route = routePoints(drawing.svg).get("up")!;
	expect(faceOf(route[0]!, part, direction)).toBe("ahead");
	expect(along(route.at(-1)!, direction)).toBeCloseTo(
		along(app, direction) + depth(app, direction),
		1,
	);
	for (const point of route) {
		expect(point.x).toBeGreaterThanOrEqual(app.x);
		expect(point.x).toBeLessThanOrEqual(app.x + app.width);
	}
});

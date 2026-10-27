import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { type RenderedDiagram } from "#shared/protocol/render-request.ts";
import { SemanticPolicySchema } from "@archboard/board/policy";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import reroutedRegion from "#tests/runtime/support/fixtures/rerouted-region.json";
import settledWall from "#tests/runtime/support/fixtures/settled-wall.json";
import { wallHugs } from "#tests/runtime/support/drawn-checks.ts";

/** The vocabulary the fixture draws with, its groups in the dogfood vault's order. */
const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: {
		service: { name: "Service", icon: "RiServerLine", color: "blue" },
		module: { name: "Module", icon: "RiBox3Line", color: "violet" },
		function: { name: "Function", icon: "RiCodeLine", color: "cyan" },
	},
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		event: { name: "Event", color: "fuchsia", dash: "dashed", arrowhead: "open" },
		data: { name: "Data", color: "teal", dash: "solid", arrowhead: "filled" },
	},
	groups: {
		writes: { name: "Board writes", color: "orange" },
		checks: { name: "Vault checks", color: "pink" },
	},
});

/** A drawn rectangle. */
interface Rect {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

/**
 * Every rectangle the drawn groups of one kind open with.
 * @param drawing The rendered board.
 * @param group The pattern of the group's opening tag.
 * @returns The rectangles.
 */
function rectsOf(drawing: RenderedDiagram, group: string): Rect[] {
	const pattern = new RegExp(
		`${group}[^>]*>\\s*(?:<rect class="ab-halo"[^>]*>\\s*)?<rect x="([\\d.]+)" y="([\\d.]+)" width="([\\d.]+)" height="([\\d.]+)"`,
		"gu",
	);
	return [...drawing.svg.matchAll(pattern)].map(([, x, y, width, height]) => ({
		x: Number(x),
		y: Number(y),
		width: Number(width),
		height: Number(height),
	}));
}

test("settling a region's ports keeps its routes clear of its wall", async () => {
	const drawing = await renderArchitecture({
		content: orderedFixture(settledWall.content),
		policy: SemanticPolicySchema.parse(settledWall.policy),
		theme: "light",
		layout: "track",
	});
	expect(wallHugs(drawing)).toEqual([]);
});

test("a container holds a group region routed again inside it", async () => {
	const content = orderedFixture(reroutedRegion);
	const drawing = await renderArchitecture({ content, theme: "light", layout: "track", policy });
	const containers = rectsOf(
		drawing,
		'<g data-semantic-kind="region"[^>]*data-depiction="container"',
	);
	const regions = rectsOf(drawing, '<g data-semantic-kind="group-region"');
	const nested = regions.flatMap((region) =>
		containers
			.filter(
				(box) =>
					region.x > box.x &&
					region.x < box.x + box.width &&
					region.y > box.y &&
					region.y < box.y + box.height,
			)
			.map((box) => box.y + box.height - (region.y + region.height)),
	);
	expect(nested.length).toBeGreaterThan(0);
	for (const room of nested) expect(room).toBeGreaterThanOrEqual(0);
});

// A block packed inside another is routed again once its parent settles its
// ports, and can grow when its channels need more room. Its parent, routed
// again after it, kept the block's first size: the container round the block
// closed above the block's foot, and the parent's lines ran across the part
// that hung out (Board persistence, reduced).
// What this catches: a group region packed as a block of its own drawn past
// the bottom of the container it stands in.

import { expect, test } from "bun:test";
import { renderArchitecture, type RenderedDiagram } from "@/runtime/semantic-renderer/index";
import { SemanticPolicySchema } from "@archboard/board/policy";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import reroutedRegion from "./rerouted-region.json";

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

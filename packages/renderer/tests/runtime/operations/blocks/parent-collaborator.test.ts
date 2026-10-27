import { expect, test } from "bun:test";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { expectDrawingIntact } from "#tests/runtime/support/drawing-integrity.ts";

test.each([undefined, "draw the SVG"])(
	"a nested parent keeps an exclusive collaborator beside its caller (label %s)",
	async (label) => {
		const content = orderedFixture({
			nodes: [
				{ id: "raster", name: "Rasterizing", kind: "module" },
				{ id: "command", name: "Rasterize command", kind: "service", parent: "raster" },
				{ id: "engine", name: "Rasterizer", kind: "module", parent: "raster" },
				{ id: "runner", name: "Raster session", kind: "function", parent: "engine" },
				{ id: "ready", name: "Page readiness", kind: "function", parent: "engine" },
				{ id: "server", name: "Archboard server", kind: "service" },
			],
			edges: [
				{ id: "run", from: "command", to: "runner", kind: "call", label: "one SVG and a region" },
				{ id: "prepare", from: "runner", to: "ready", kind: "call" },
				{ id: "svg", from: "command", to: "server", kind: "call", label },
			],
		});
		const drawing = await renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content,
			theme: "light",
			layout: "track",
		});
		expectDrawingIntact(drawing, content, "track");
		const caller = drawing.atlas.nodes["command"]!,
			server = drawing.atlas.nodes["server"]!;
		expect(Math.abs(caller.y + caller.height / 2 - server.y - server.height / 2)).toBeLessThan(1);
	},
);

import { expect, test } from "bun:test";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { expectDrawingIntact } from "#tests/runtime/support/drawing-integrity.ts";
import { headerCards } from "#tests/runtime/support/drawn-parents.ts";

test.each([false, true])(
	"a caller and its feedback stay beside their parent's header (outside worker %s)",
	async (worker) => {
		const content = orderedFixture({
			nodes: [
				{ id: "tools", name: "Tool calls", kind: "module", parent: "scope" },
				...(worker ? [{ id: "worker", name: "Worker", kind: "module" }] : []),
				{ id: "session", name: "Session", kind: "module" },
				{ id: "homes", name: "Turn homes", kind: "module", parent: "scope" },
				{ id: "scope", name: "Service tools", kind: "module" },
			],
			edges: [
				{ id: "event", from: "session", to: "tools", kind: "event", label: "a tool call" },
				...(worker
					? [{ id: "work", from: "tools", to: "worker", kind: "call", label: "give the work" }]
					: []),
				{ id: "stop", from: "tools", to: "session", kind: "call", label: "stop the work" },
				{ id: "start", from: "session", to: "homes", kind: "call", label: "note a turn start" },
			],
		});
		const drawing = await renderArchitecture({
			content,
			policy: DEFAULT_SEMANTIC_POLICY,
			layout: "track",
			theme: "light",
		});
		expectDrawingIntact(drawing, content, "track");
		const caller = drawing.atlas.nodes["session"]!,
			header = headerCards(drawing).get("scope")!;
		expect(caller.y).toBeGreaterThanOrEqual(drawing.atlas.nodes["scope"]!.y);
		expect(caller.y).toBeLessThan(header.y + header.height);
	},
);

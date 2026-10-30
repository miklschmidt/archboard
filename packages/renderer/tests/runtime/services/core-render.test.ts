import { describe, expect, test } from "bun:test";
import { DEFAULT_LAYOUT_ENGINE, type LayoutEngineName } from "@archboard/board/render-reply";
import { loadCore } from "#runtime/services/core.ts";
import type { RenderHost } from "#shared/protocol/generated/core/archboard_renderer_wasm.js";

/** One reading that draws without a layout worker when read as a sequence. */
function request(
	grammar: "sequence" | "architecture" = "sequence",
	layout: LayoutEngineName = DEFAULT_LAYOUT_ENGINE,
): string {
	return JSON.stringify({
		grammar,
		layout,
		content: {
			nodes: [{ id: "a", order: 0, name: "A", kind: "service" }],
			flows: [
				{
					id: "f",
					name: "F",
					participants: ["a"],
					steps: [{ id: "s", kind: "self", from: "a", to: "a", label: "again" }],
				},
			],
		},
		policy: { levels: [], nodeKinds: {}, relationshipKinds: {} },
		clock: { farViewSwapMs: 100, trafficSpeed: 100, cycleCapMs: 1000 },
	});
}

/** A host whose unused solver fails if a sequence asks for one. */
function host(changes: Partial<RenderHost> = {}): RenderHost {
	return {
		solve: () => Promise.reject(new Error("unexpected solve")),
		icons: () => ({}),
		...changes,
	};
}

describe("the core render failure boundary", () => {
	// Track sends this small architecture to the host solver; Blocks can place it directly.
	test("rejects a synchronous solve failure and tries that layout again", async () => {
		const core = loadCore();
		const failure = new Error("host solve failed");
		let called = 0;
		const solving = host({
			solve: () => {
				called++;
				throw failure;
			},
		});
		await expect(core.render(request("architecture", "track"), solving)).rejects.toThrow(
			failure.message,
		);
		const before = called;
		await expect(core.render(request("architecture", "track"), solving)).rejects.toThrow(
			failure.message,
		);
		expect(called).toBeGreaterThan(before);
		await expect(core.render(request(), host())).resolves.toHaveProperty("svg");
	});

	test("rejects an asynchronous solve failure", async () => {
		const failure = new Error("host solve rejected");
		await expect(
			loadCore().render(
				request("architecture", "track"),
				host({
					solve: () => Promise.reject(failure),
				}),
			),
		).rejects.toThrow(failure.message);
	});

	test("rejects an unreadable solve answer", async () => {
		await expect(
			loadCore().render(
				request("architecture", "track"),
				host({
					solve: () => Promise.resolve("not JSON"),
				}),
			),
		).rejects.toBeInstanceOf(Error);
	});

	test("rejects an icon callback failure and still draws the next request", async () => {
		const core = loadCore();
		const failure = new Error("host icons failed");
		await expect(
			core.render(
				request(),
				host({
					icons: () => {
						throw failure;
					},
				}),
			),
		).rejects.toThrow(failure.message);
		await expect(core.render(request(), host())).resolves.toHaveProperty("svg");
	});

	test("rejects a failure while reading the icon map", async () => {
		const failure = new Error("icon getter failed");
		const icons = Object.defineProperty({}, "RiQuestionLine", {
			enumerable: true,
			get() {
				throw failure;
			},
		});
		await expect(loadCore().render(request(), host({ icons: () => icons }))).rejects.toThrow(
			failure.message,
		);
	});

	test.each(["null", '{"RiQuestionLine":[42]}', '{"RiQuestionLine":"path"}'])(
		"rejects malformed icon data: %s",
		async (icons) => {
			await expect(
				loadCore().render(request(), host({ icons: () => JSON.parse(icons) })),
			).rejects.toBeInstanceOf(Error);
		},
	);
});

import { describe, expect, test } from "bun:test";
import { CoreBuildError, loadCore } from "#runtime/services/core.ts";
import { coreSourceHash } from "#runtime/store/core-sources.ts";
import { engineAborted } from "#shared/rules/engine/engine-pool.ts";

describe("the renderer core under Bun", () => {
	test("loads the build of the checkout's sources and answers from it", () => {
		expect(loadCore().sourceHash()).toBe(coreSourceHash());
	});

	test("refuses a build of other sources", () => {
		let refused: unknown;
		try {
			loadCore("0000000000000000");
		} catch (error) {
			refused = error;
		}
		expect(refused).toBeInstanceOf(CoreBuildError);
		expect((refused as CoreBuildError).code).toBe("CORE_BUILD_STALE");
	});

	test.each([false, true])(
		"keeps a Graphviz error's identity and fatal state (trap: %s)",
		(trap) => {
			const failure = trap
				? new WebAssembly.RuntimeError("unreachable")
				: new Error("invalid graph");
			const graph = JSON.stringify({
				id: "board",
				children: [
					{ id: "a", width: 10, height: 10 },
					{ id: "b", width: 10, height: 10 },
				],
				edges: [{ id: "e", sources: ["a"], targets: ["b"] }],
			});
			let refused: unknown;
			try {
				loadCore().layOutBoard(graph, {
					render: () => {
						throw failure;
					},
				});
			} catch (error) {
				refused = error;
			}
			expect(engineAborted(refused)).toBe(trap);
			expect(refused).toBe(failure);
		},
	);
});

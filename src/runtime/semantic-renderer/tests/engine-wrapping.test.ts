// Why a folded reading uses ELK's single-edge wrapping. In ELK 0.12 the
// multi-edge strategy throws inside the engine on a real board: the fixture
// is the solve flask-map-2 made when folded, with its reserved labels as
// label nodes. This owner calls the engine directly, so an upgrade that fixes
// the failure fails this test and the choice can be measured again
// (docs/design/layout-rules.md section 17).

import { expect, test } from "bun:test";
import ELK from "elkjs/lib/elk-api.js";
import type { ElkNode, LayoutOptions } from "elkjs/lib/elk-api";
import failing from "./wrapping-failure.json";

/**
 * Lay the captured graph out with one wrapping strategy.
 * @param strategy The engine's wrapping strategy.
 * @returns The engine's failure, or undefined when it laid the graph out.
 */
async function failureOf(strategy: string): Promise<unknown> {
	// A real worker, as the layout owner uses: under Bun the vendor's fake
	// worker mistakes the main thread for a worker scope.
	const worker = new Worker(import.meta.resolve("elkjs/lib/elk-worker.js"));
	const engine = new ELK({ algorithms: ["layered"], workerFactory: () => worker });
	const graph = structuredClone(failing.graph) as ElkNode;
	graph.layoutOptions = { ...graph.layoutOptions, "elk.layered.wrapping.strategy": strategy };
	try {
		await engine.layout(graph, { layoutOptions: failing.layoutOptions as LayoutOptions });
		return undefined;
	} catch (error) {
		return error;
	} finally {
		worker.terminate();
	}
}

test("multi-edge wrapping still throws on a folded real board, and single-edge does not", async () => {
	const multi = await failureOf("MULTI_EDGE");
	expect(
		multi,
		"multi-edge wrapping no longer fails: measure it against single-edge again",
	).toBeDefined();
	expect(String(multi)).toContain("getDefault");
	expect(await failureOf("SINGLE_EDGE")).toBeUndefined();
});

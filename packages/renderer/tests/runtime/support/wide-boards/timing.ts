// Times rendering each wide-board fixture and each reading of this repository's
// current model (items.ts), the way a pane's first picture of it is drawn: the engine warmed on
// another document, no predecessor. Prints the first render, which lays the document
// out, and the median of the renders after it, which reuse that layout, so a
// layout change that spends time is seen beside the scorecard that measure.ts
// prints. Layout tasks record the numbers this script prints. A first
// render early in a run can land on workers the engine has not warmed yet.
//
// Run from the repository root:
//   bun packages/renderer/tests/runtime/support/wide-boards/timing.ts [runs]
import { defaultLayoutEngine, defaultSemanticPolicy } from "@archboard/model-contract";
import { renderArchitecture } from "@archboard/renderer/bun";
import { orderedFixture } from "../ordered-fixture.ts";
import { wideBoardItems } from "./items.ts";

const runs = Number(process.argv[2] ?? 5);
console.log(`Layout: ${defaultLayoutEngine()}`);

const items = await wideBoardItems(false);

// Warm the engine and the measurement caches once, on a document measured nowhere below.
await renderArchitecture({
	policy: defaultSemanticPolicy(),
	content: orderedFixture({
		nodes: ["warm-a", "warm-b", "warm-c"].map((id) => ({ id, name: id, kind: "module" })),
		edges: [
			{ id: "warm-ab", from: "warm-a", to: "warm-b", kind: "call", label: "warms" },
			{ id: "warm-bc", from: "warm-b", to: "warm-c", kind: "call" },
		],
	}),
	theme: "light",
});

let slowest = { name: "", ms: 0 };
for (const item of items) {
	const { content } = item;
	// A layout is remembered by its content, so only the first render lays
	// it out; the rest are the same picture painted again, in the other theme.
	const started = performance.now();
	await renderArchitecture({ policy: item.policy, content, theme: "light" });
	const first = performance.now() - started;
	const again: number[] = [];
	for (let run = 1; run < runs; run += 1) {
		const repeated = performance.now();
		await renderArchitecture({
			policy: item.policy,
			content,
			theme: run % 2 === 0 ? "light" : "dark",
		});
		again.push(performance.now() - repeated);
	}
	const median = again.toSorted((a, b) => a - b)[Math.floor(again.length / 2)] ?? 0;
	if (first > slowest.ms) slowest = { name: `${item.name} ${item.variant}`, ms: first };
	console.log(
		`${`${item.name} ${item.variant}`.padEnd(32)} first ${Math.round(first).toString().padStart(5)} ms  again ${Math.round(median).toString().padStart(4)} ms`,
	);
}
console.log(`slowest first render: ${slowest.name} ${Math.round(slowest.ms)} ms`);
process.exit(0);

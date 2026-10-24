// Times rendering the current variant of every vault board and each wide-board
// fixture, the way a pane's first picture of it is drawn: the engine warmed on
// another board, no predecessor. Prints the first render, which lays the board
// out, and the median of the renders after it, which reuse that layout, so a
// layout change that spends time is seen beside the scorecard that measure.ts
// prints. The numbers in docs/design/layout-rules.md come from here. A first
// render early in a run can land on workers the engine has not warmed yet.
//
// Run from the repository root:
//   bun docs/design/wide-board-layout-fixtures/timing.ts [runs]
import fs from "node:fs";
import path from "node:path";
import { parseSemanticBoard } from "@archboard/board/document";
import { renderArchitecture } from "@archboard/renderer/bun";
import { orderedFixture } from "../../../packages/renderer/tests/runtime/support/ordered-fixture.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

const fixtures = "docs/design/wide-board-layout-fixtures";
const vault = ".archboard/vault";
const runs = Number(process.argv[2] ?? 5);

const items: { name: string; content: unknown }[] = [];
for (const file of fs
	.readdirSync(fixtures)
	.filter((name) => name.endsWith(".content.json"))
	.toSorted()) {
	items.push({
		name: file.replace(".content.json", ""),
		content: JSON.parse(fs.readFileSync(path.join(fixtures, file), "utf8")),
	});
}
for (const file of fs
	.readdirSync(vault)
	.filter((name) => name.endsWith(".semantic.json"))
	.toSorted()) {
	const parsed = parseSemanticBoard(JSON.parse(fs.readFileSync(path.join(vault, file), "utf8")));
	if (!parsed.ok) continue;
	const current = parsed.board.variants.find((variant) => variant.id === parsed.board.current);
	if (current !== undefined) items.push({ name: parsed.board.name, content: current.content });
}

// Warm the engine and the measurement caches once, on a board measured nowhere below.
await renderArchitecture({
	policy: DEFAULT_SEMANTIC_POLICY,
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
	// A fixture authored before subjects carried an order is given one by position.
	const content = orderedFixture(item.content);
	// A layout is remembered by its content, so only the first render lays
	// it out; the rest are the same picture painted again, in the other theme.
	const started = performance.now();
	await renderArchitecture({ policy: DEFAULT_SEMANTIC_POLICY, content, theme: "light" });
	const first = performance.now() - started;
	const again: number[] = [];
	for (let run = 1; run < runs; run += 1) {
		const repeated = performance.now();
		await renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content,
			theme: run % 2 === 0 ? "light" : "dark",
		});
		again.push(performance.now() - repeated);
	}
	const median = again.toSorted((a, b) => a - b)[Math.floor(again.length / 2)] ?? 0;
	if (first > slowest.ms) slowest = { name: item.name, ms: first };
	console.log(
		`${item.name.padEnd(22)} first ${Math.round(first).toString().padStart(5)} ms  again ${Math.round(median).toString().padStart(4)} ms`,
	);
}
console.log(`slowest first render: ${slowest.name} ${Math.round(slowest.ms)} ms`);
process.exit(0);

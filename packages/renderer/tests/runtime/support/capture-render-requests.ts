// Writes the render request of each board `timing.ts` times, with the icons
// the core was given, so that a native build of the core can draw each first
// render again with one worker for each solve and measure its critical path
// (`crates/archboard-render/examples/critical_path.rs`,
// docs/design/first-render-critical-path.md). Only this host writes a request:
// it reads the vault and its policy.
//
// Run from the repository root, inside `nix develop`, after `bun run build:core`:
//   bun packages/renderer/tests/runtime/support/capture-render-requests.ts <out> [board ...]

import fs from "node:fs";
import path from "node:path";
import { parseSemanticBoard } from "@archboard/board/document";
import { DEFAULT_SEMANTIC_POLICY, type SemanticPolicy } from "@archboard/board/policy";
import { readSemanticBoardConfiguration } from "@archboard/board/vault-policy";
import { renderArchitecture } from "@archboard/renderer/bun";
import { installRendererHost, rendererHost } from "#shared/rules/render/host.ts";
import { orderedFixture } from "./ordered-fixture.ts";

const out = process.argv[2];
if (out === undefined) throw new Error("Name the directory to write to.");
const only = new Set(process.argv.slice(3));
fs.mkdirSync(out, { recursive: true });

const fixtures = "docs/design/wide-board-layout-fixtures";
const vault = ".archboard/vault";
const items: { name: string; content: unknown; policy: SemanticPolicy }[] = [];
for (const file of fs
	.readdirSync(fixtures)
	.filter((name) => name.endsWith(".content.json"))
	.toSorted()) {
	items.push({
		name: file.replace(".content.json", ""),
		content: JSON.parse(fs.readFileSync(path.join(fixtures, file), "utf8")),
		policy: DEFAULT_SEMANTIC_POLICY,
	});
}
const { configuration: policy } = readSemanticBoardConfiguration(vault);
for (const file of fs
	.readdirSync(vault)
	.filter((name) => name.endsWith(".semantic.json"))
	.toSorted()) {
	const parsed = parseSemanticBoard(JSON.parse(fs.readFileSync(path.join(vault, file), "utf8")));
	if (!parsed.ok) continue;
	const current = parsed.board.variants.find((variant) => variant.id === parsed.board.current);
	if (current !== undefined)
		items.push({ name: parsed.board.name, content: current.content, policy });
}

// Install the Bun host with a first render, then keep what its core is asked.
await renderArchitecture({
	policy: DEFAULT_SEMANTIC_POLICY,
	content: orderedFixture({
		nodes: ["warm-a", "warm-b"].map((id) => ({ id, name: id, kind: "module" })),
		edges: [{ id: "warm-ab", from: "warm-a", to: "warm-b", kind: "call" }],
	}),
	theme: "light",
});
const bun = rendererHost();
const core = bun.core();
let kept: { request: string; icons: Record<string, readonly string[]> } = {
	request: "",
	icons: {},
};
installRendererHost({
	...bun,
	core: () => ({
		render: (request, host) => {
			kept.request = request;
			return core.render(request, {
				...host,
				icons: (names) => {
					const given = host.icons(names);
					Object.assign(kept.icons, given);
					return given;
				},
			});
		},
	}),
});

for (const item of items) {
	if (only.size > 0 && !only.has(item.name)) continue;
	kept = { request: "", icons: {} };
	await renderArchitecture({
		policy: item.policy,
		content: orderedFixture(item.content),
		theme: "light",
	});
	fs.writeFileSync(
		path.join(out, `${item.name.replaceAll(/[^\w-]+/gu, "-")}.json`),
		JSON.stringify({ name: item.name, ...kept }),
	);
	process.stdout.write(`${item.name}\n`);
}
process.exit(0);

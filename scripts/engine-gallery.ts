// Every drawing of a vault under every layout engine, side by side (TASK-348).
//
// Draws the canonical model, recursive module scopes, and independent flows,
// with every registered engine, and writes the SVGs, a JSON summary of each
// drawing's layout time, page size and fit to the reference pane, and one page
// that shows the engines next to each other. It uses the public coherent reader, so
// the vault is never touched.
//
// Run from the repository root:
//   bun scripts/engine-gallery.ts [vault] [out] [engine,engine] [state]
// The vault defaults to the tracked dogfood vault, the output to a temporary
// folder, and the engines to every registered one.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { LayoutEngineSchema } from "@archboard/board/render-reply";
import { readArchitectureModel } from "@archboard/board/store-read";
import { projectModel, projectFlow } from "@archboard/board/content";
import { renderArchitecture } from "@archboard/renderer/bun";
import { fitIn } from "@archboard/renderer/shell-geometry";
/** One drawing under one engine. */
interface Drawn {
	readonly engine: string;
	readonly file: string;
	readonly ms: number;
	readonly width: number;
	readonly height: number;
	readonly fit: number;
}

/** One drawing: a board whole or through one view, under every engine. */
interface Drawing {
	readonly board: string;
	readonly view: string | undefined;
	readonly drawn: readonly Drawn[];
}

const vault = process.argv[2] ?? ".archboard/vault";
const out = process.argv[3] ?? mkdtempSync(join(tmpdir(), "archboard-engine-gallery-"));
const engines = z
	.array(LayoutEngineSchema)
	.parse(process.argv[4]?.split(",") ?? LayoutEngineSchema.options);
mkdirSync(out, { recursive: true });

/**
 * A file name for one drawing under one engine.
 * @param board The board.
 * @param view The view, if any.
 * @param engine The engine.
 * @returns The name.
 */
function fileOf(board: string, view: string | undefined, engine: string): string {
	return `${[board, view ?? "whole", engine].join("--").replaceAll(/[^\w-]+/gu, "_")}.svg`;
}

const model = await readArchitectureModel(vault, undefined, undefined, { state: process.argv[5] });
if (!model.success) throw new Error(JSON.stringify(model));
const scopes = [
	null,
	...model.modules
		.filter((module) => model.modules.some((child) => child.parent === module.id))
		.map((module) => module.id),
];
const readings: {
	name: string;
	grammar: "architecture" | "sequence" | "flowchart";
	content: ReturnType<typeof projectModel>["content"];
}[] = scopes.map((scope) => ({
	name: scope ?? "whole",
	grammar: "architecture" as const,
	content: projectModel(model, scope, null).content,
}));
for (const flow of model.collections.flatMap((collection) => collection.flows)) {
	const projected = projectFlow(projectModel(model, null, null), flow);
	for (const grammar of ["sequence", "flowchart"] as const)
		readings.push({ name: `${flow.id}-${grammar}`, grammar, content: projected.content });
}
const drawings: Drawing[] = [];
for (const reading of readings) {
	const drawn: Drawn[] = [];
	for (const engine of engines) {
		const started = performance.now();
		// oxlint-disable-next-line no-await-in-loop -- each engine measurement owns its complete draw
		const { svg, width, height } = await renderArchitecture({
			content: reading.content,
			grammar: reading.grammar,
			policy: model.policy,
			fonts: "embedded",
			theme: "light",
			layout: engine,
		});
		const file = fileOf(model.manifest.name, reading.name, engine);
		writeFileSync(join(out, file), svg);
		drawn.push({
			engine,
			file,
			ms: Math.round(performance.now() - started),
			width,
			height,
			fit: fitIn({ width, height }),
		});
	}
	drawings.push({ board: model.manifest.name, view: reading.name, drawn });
}
writeFileSync(join(out, "gallery.json"), JSON.stringify(drawings, null, "\t"));
const rows = drawings.map(
	({ board, view, drawn }) =>
		`<section><h2>${board}${view === undefined ? "" : ` · ${view}`}</h2><div class="row">${drawn
			.map(
				(one) =>
					`<figure><figcaption>${one.engine} · ${one.ms} ms · ${Math.round(one.width)}×${Math.round(one.height)} · fit ${one.fit.toFixed(2)}</figcaption><img loading="lazy" src="${one.file}"></figure>`,
			)
			.join("")}</div></section>`,
);
writeFileSync(
	join(out, "index.html"),
	`<!doctype html><meta charset="utf-8"><title>Engine gallery</title><style>body{font:14px system-ui;margin:24px;background:#fafaf9}h2{font-size:15px;margin:28px 0 8px}.row{display:grid;grid-template-columns:repeat(${engines.length},1fr);gap:16px}figure{margin:0;background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:8px}img{width:100%;height:auto}figcaption{color:#666;margin-bottom:6px}</style>${rows.join("")}`,
);
console.log(`gallery: ${join(out, "index.html")}`);
process.exit(0);

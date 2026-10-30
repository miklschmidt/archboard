// Every drawing of a vault under every layout engine, side by side (TASK-348).
//
// Draws each board's current variant, whole and through each of its views,
// with every registered engine, and writes the SVGs, a JSON summary of each
// drawing's layout time, page size and fit to the reference pane, and one page
// that shows the engines next to each other. It reads a copy of the vault, so
// the vault is never touched.
//
// Run from the repository root:
//   bun scripts/engine-gallery.ts [vault] [out] [engine,engine]
// The vault defaults to the tracked dogfood vault, the output to a temporary
// folder, and the engines to every registered one.
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { LayoutEngineSchema } from "@archboard/board/render-reply";
import type { SemanticBoard } from "@archboard/board/document";
import { fitIn } from "@archboard/renderer/shell-geometry";
import { locateSemanticBoard } from "@archboard/board/address";
import { readSemanticBoardAt } from "@archboard/board/store-read";
import { readSemanticBoardConfiguration } from "@archboard/board/vault-policy";
import { renderBoard } from "@archboard/renderer/bun";

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
 * Every board of the vault, read from a copy of it, and the vault's policy.
 * @returns The boards and the policy.
 */
function readVault(): {
	boards: SemanticBoard[];
	policy: ReturnType<typeof readSemanticBoardConfiguration>["configuration"];
} {
	const copy = mkdtempSync(join(tmpdir(), "archboard-gallery-vault-"));
	try {
		mkdirSync(join(copy, ".archboard"), { recursive: true });
		copyFileSync(join(vault, ".archboard", "config.yaml"), join(copy, ".archboard", "config.yaml"));
		const configured = readSemanticBoardConfiguration(copy);
		const boards = readdirSync(vault)
			.filter((file) => file.endsWith(".semantic.json"))
			.toSorted()
			.flatMap((file) => {
				copyFileSync(join(vault, file), join(copy, file));
				const read = readSemanticBoardAt(
					copy,
					locateSemanticBoard(file.slice(0, -".semantic.json".length), copy),
					configured,
				);
				return read.ok ? [read.board] : [];
			});
		return { boards, policy: configured.configuration };
	} finally {
		rmSync(copy, { recursive: true, force: true });
	}
}

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

const { boards, policy } = readVault();
const drawings: Drawing[] = [];
for (const board of boards) {
	for (const view of [undefined, ...board.views.map(({ name }) => name)]) {
		const drawn: Drawn[] = [];
		for (const engine of engines) {
			const started = performance.now();
			// oxlint-disable-next-line no-await-in-loop -- one drawing at a time, so each time is its own
			const outcome = await renderBoard(
				board,
				{
					...(view === undefined ? {} : { view }),
					theme: "light",
					layout: engine,
				},
				policy,
			);
			const ms = Math.round(performance.now() - started);
			if (!outcome.ok || !("svg" in outcome.reply)) continue;
			const { svg, width, height } = outcome.reply;
			const file = fileOf(board.name, view, engine);
			writeFileSync(join(out, file), svg);
			drawn.push({ engine, file, ms, width, height, fit: fitIn({ width, height }) });
		}
		drawings.push({ board: board.name, view, drawn });
		console.log(
			[board.name, view ?? "whole", ...drawn.map((one) => `${one.engine} ${one.ms} ms`)].join("  "),
		);
	}
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

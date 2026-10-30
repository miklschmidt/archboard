// A board render's recipe as a file carries it (ADR 0057): an SVG drawn for a
// file holds it in its metadata element and a PNG in a text chunk, a reader
// gets it back from the bytes alone, and the picture digest is of the SVG the
// renderer drew before the recipe went in. The fingerprint's behaviour under
// real writes is the system owner's (tests/system/semantic-boards/render-recipe);
// this owner holds that a code citation, which nothing draws, is not in it.

import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";
import type { SemanticBoard } from "@archboard/board/document";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { renderBoard } from "#runtime/operations/render.ts";
import { readPngDimensions } from "#runtime/operations/rasterizer/png.ts";
import { embedRecipeInPng } from "#runtime/operations/recipe/png-recipe.ts";
import { readRenderRecipe, replaceRenderRecipe } from "#runtime/operations/recipe/read-recipe.ts";
import { embedRecipeInSvg } from "#runtime/operations/recipe/svg-recipe.ts";
import type { RenderRecipe } from "#runtime/operations/recipe/schema.ts";
import { EXPORT_BOARD } from "#tests/runtime/support/export-board.ts";

/**
 * The SVG of a board's draft, with or without its recipe.
 * @param recipe Whether the render carries one.
 * @param board The board; the export board when absent.
 * @param view The view drawn.
 * @returns The document.
 */
async function drawnSvg(recipe: boolean, board = EXPORT_BOARD, view = "intake"): Promise<string> {
	const outcome = await renderBoard(
		board,
		{ theme: "light", fonts: "embedded", variant: "draft", view, legend: "vertical" },
		DEFAULT_SEMANTIC_POLICY,
		recipe ? { vault: { repo: "github.com/example/vault" } } : undefined,
	);
	if (!outcome.ok || !("svg" in outcome.reply)) throw new Error("Expected a drawn board");
	return outcome.reply.svg;
}

/**
 * The recipe a file carries, failing the test when it carries none.
 * @param bytes The file.
 * @returns The recipe.
 */
function recipeIn(bytes: Uint8Array): RenderRecipe {
	const read = readRenderRecipe(bytes);
	if (read.kind !== "recipe" || !("board" in read.recipe))
		throw new Error(`Expected a recipe, read ${JSON.stringify(read)}`);
	return read.recipe;
}

/**
 * One PNG chunk with its length and CRC.
 * @param type The chunk type.
 * @param data Its data.
 * @returns The bytes.
 */
function pngChunk(type: string, data: Uint8Array): Buffer {
	const typed = Buffer.concat([Buffer.from(type, "latin1"), data]);
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(typed));
	return Buffer.concat([length, typed, crc]);
}

/** A 2×1 greyscale PNG, as small as a valid one gets. */
const PNG = Buffer.concat([
	Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
	pngChunk("IHDR", Buffer.from([0, 0, 0, 2, 0, 0, 0, 1, 8, 0, 0, 0, 0])),
	pngChunk("IDAT", deflateSync(Buffer.from([0, 0x40, 0xc0]))),
	pngChunk("IEND", Buffer.alloc(0)),
]);

/**
 * Each chunk of a PNG, with whether its CRC holds.
 * @param png The file.
 * @returns Type and CRC verdict, in file order.
 */
function chunkList(png: Uint8Array): { type: string; crc: boolean }[] {
	const bytes = Buffer.from(png);
	const list: { type: string; crc: boolean }[] = [];
	for (let at = 8; at < bytes.length;) {
		const length = bytes.readUInt32BE(at);
		const typed = bytes.subarray(at + 4, at + 8 + length);
		list.push({
			type: typed.subarray(0, 4).toString("latin1"),
			crc: bytes.readUInt32BE(at + 8 + length) === crc32(typed),
		});
		at += 12 + length;
	}
	return list;
}

test("an SVG drawn for a file reads back as its recipe, and its picture digest is of the SVG without it", async () => {
	const plain = await drawnSvg(false);
	const carried = await drawnSvg(true);
	const recipe = recipeIn(Buffer.from(carried, "utf8"));
	expect(recipe).toMatchObject({
		recipe: 1,
		board: { id: EXPORT_BOARD.id, name: EXPORT_BOARD.name },
		vault: { repo: "github.com/example/vault" },
		variant: { id: "draft" },
		view: { id: "intake" },
		comparison: "on",
		theme: "light",
		layout: null,
		title: null,
		legend: { layout: "vertical", alone: false },
	});
	expect(recipe.raster).toBeUndefined();
	expect(recipe.picture).toBe(`sha256:${createHash("sha256").update(plain).digest("hex")}`);
	// A render that draws no file carries none.
	expect(readRenderRecipe(Buffer.from(plain, "utf8"))).toEqual({ kind: "absent" });
	expect(carried.startsWith("<svg")).toBe(true);
});

test("a recipe stays readable after a serializer renames its prefix and escapes its quotes", async () => {
	const carried = await drawnSvg(true);
	const rewritten = carried
		.replaceAll("archboard:render-recipe", "ns0:render-recipe")
		.replaceAll("xmlns:archboard=", "xmlns:ns0=")
		.replace(
			/(<ns0:render-recipe[^>]*>)([^<]*)/u,
			(_whole, open: string, text: string) => `${open}${text.replaceAll('"', "&quot;")}`,
		);
	expect(recipeIn(Buffer.from(rewritten, "utf8"))).toEqual(recipeIn(Buffer.from(carried, "utf8")));
});

test("a recipe's text reads back as written whichever way a serializer spells its characters", async () => {
	const recipe: RenderRecipe = {
		...recipeIn(Buffer.from(await drawnSvg(true), "utf8")),
		board: { id: EXPORT_BOARD.id, name: "R&D <core> &lt; ]]>" },
	};
	const carried = embedRecipeInSvg("<svg><g/>\n</svg>", recipe);
	const json = JSON.stringify(recipe);
	const spellings = [
		carried,
		carried.replaceAll("&amp;", "&#38;").replaceAll("&lt;", "&#x3C;"),
		carried.replace(
			/(<archboard:render-recipe[^>]*>)[^<]*/u,
			(_whole, open: string) => `${open}<![CDATA[${json.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`,
		),
	];
	for (const spelled of spellings) expect(recipeIn(Buffer.from(spelled, "utf8"))).toEqual(recipe);
});

test("a PNG carries the recipe in a text chunk after its header, and stays a valid PNG", async () => {
	const svgRecipe = recipeIn(Buffer.from(await drawnSvg(true), "utf8"));
	const recipe: RenderRecipe = {
		...svgRecipe,
		board: { ...svgRecipe.board, name: "Ingest — ünïcode" },
		raster: { scale: 2, region: { x: 0, y: 0, width: 1, height: 1 } },
	};
	const carried = embedRecipeInPng(PNG, recipe);
	expect(recipeIn(carried)).toEqual(recipe);
	expect(chunkList(carried)).toEqual([
		{ type: "IHDR", crc: true },
		{ type: "iTXt", crc: true },
		{ type: "IDAT", crc: true },
		{ type: "IEND", crc: true },
	]);
	expect(readPngDimensions(carried)).toEqual({ width: 2, height: 1 });
	// A decoder ignores what follows the end chunk, and so does the reader.
	expect(recipeIn(Buffer.concat([carried, Buffer.from("appended")]))).toEqual(recipe);
	expect(readRenderRecipe(PNG)).toEqual({ kind: "absent" });
});

/**
 * An SVG without the metadata element that holds its recipe.
 * @param svg The document.
 * @returns The rest of it.
 */
function withoutMetadata(svg: string): string {
	return svg.replace(/<metadata>[\s\S]*<\/metadata>/u, "");
}

test("a recipe replaced in a file leaves every other byte as it was, and a PNG carries one recipe", async () => {
	const carried = await drawnSvg(true);
	const recipe = recipeIn(Buffer.from(carried, "utf8"));
	const newer: RenderRecipe = { ...recipe, fingerprint: `sha256:${"1".repeat(64)}` };
	// A post-processor's work around the recipe stays.
	const processed = carried.replace("<svg", "<!-- subset --><svg").replace("</svg>", "<g/></svg>");
	const replaced = replaceRenderRecipe(Buffer.from(processed, "utf8"), newer);
	expect(recipeIn(replaced)).toEqual(newer);
	expect(withoutMetadata(Buffer.from(replaced).toString("utf8"))).toBe(withoutMetadata(processed));
	const png = embedRecipeInPng(PNG, { ...recipe, raster: { scale: 1, region: null } });
	const bitmap = { ...newer, raster: { scale: 1, region: null } };
	const again = replaceRenderRecipe(png, bitmap);
	expect(recipeIn(again)).toEqual(bitmap);
	expect(chunkList(again).map((one) => one.type)).toEqual(["IHDR", "iTXt", "IDAT", "IEND"]);
	expect(() => replaceRenderRecipe(Buffer.from("<svg/>", "utf8"), newer)).toThrow();
});

test("a recipe that cannot be read is said to be unreadable, not absent", async () => {
	const carried = await drawnSvg(true);
	const newer = carried.replace('"recipe":1', '"recipe":2');
	const broken = carried.replace('"recipe":1', '"recipe":');
	// A bitmap holds one ground, so a PNG recipe in the auto theme is not one.
	const auto = embedRecipeInPng(PNG, {
		...recipeIn(Buffer.from(carried, "utf8")),
		theme: "auto",
		raster: { scale: 1, region: null },
	});
	for (const bytes of [Buffer.from(newer), Buffer.from(broken), auto]) {
		expect(readRenderRecipe(bytes).kind).toBe("unreadable");
	}
});

test("a code citation on a relationship or a step moves neither the picture nor its fingerprint", async () => {
	const anchor = { repo: "github.com/example/app", path: "src/queue.ts", symbol: "enqueue" };
	const cited: SemanticBoard = {
		...EXPORT_BOARD,
		variants: EXPORT_BOARD.variants.map((variant) => ({
			...variant,
			content: {
				...variant.content,
				edges: variant.content.edges.map((edge) => ({ ...edge, anchor })),
				flows: variant.content.flows.map((flow) => ({
					...flow,
					steps: flow.steps.map((step) => ({ ...step, anchor })),
				})),
			},
		})),
	};
	for (const view of ["intake", "exchange"]) {
		const plain = recipeIn(Buffer.from(await drawnSvg(true, EXPORT_BOARD, view), "utf8"));
		const citing = recipeIn(Buffer.from(await drawnSvg(true, cited, view), "utf8"));
		expect(citing.picture).toBe(plain.picture);
		expect(citing.fingerprint).toBe(plain.fingerprint);
	}
});

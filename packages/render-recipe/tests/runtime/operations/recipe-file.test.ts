// A picture's recipe as a file carries it (ADR 0057): an SVG holds it in its
// metadata element and a PNG in a text chunk, and a reader gets it back from
// the bytes alone, whichever way a serializer spelled it. A recipe written by
// an older Archboard for a board, before the model, still reads.

import { expect, test } from "bun:test";
import { crc32, deflateSync } from "node:zlib";
import { readPngDimensions } from "#runtime/operations/png.ts";
import { readRenderRecipe, replaceRenderRecipe } from "#runtime/operations/read-recipe.ts";
import { embedRecipeInSvg } from "#runtime/operations/svg-recipe.ts";
import type { RenderRecipe } from "#runtime/operations/schema.ts";

/** A board's recipe, as an older Archboard wrote it into an SVG drawn for a file. */
const BOARD_RECIPE: RenderRecipe = {
	recipe: 1,
	board: { id: "document", name: "Ingest" },
	vault: { repo: "github.com/example/vault" },
	variant: { id: "draft" },
	view: { id: "intake" },
	comparison: "on",
	theme: "light",
	layout: null,
	title: null,
	legend: { layout: "vertical", alone: false },
	fingerprint: `sha256:${"0".repeat(64)}`,
	picture: `sha256:${"a".repeat(64)}`,
};

/** An SVG drawn for a file, carrying the board's recipe. */
const CARRIED = embedRecipeInSvg(
	'<svg xmlns="http://www.w3.org/2000/svg"><g/>\n</svg>',
	BOARD_RECIPE,
);

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

test("an SVG reads back as the recipe it carries, and one without a recipe as none", () => {
	expect(recipeIn(Buffer.from(CARRIED, "utf8"))).toEqual(BOARD_RECIPE);
	expect(readRenderRecipe(Buffer.from("<svg><g/></svg>", "utf8"))).toEqual({ kind: "absent" });
});

test("a recipe stays readable after a serializer renames its prefix and escapes its quotes", () => {
	const rewritten = CARRIED.replaceAll("archboard:render-recipe", "ns0:render-recipe")
		.replaceAll("xmlns:archboard=", "xmlns:ns0=")
		.replace(
			/(<ns0:render-recipe[^>]*>)([^<]*)/u,
			(_whole, open: string, text: string) => `${open}${text.replaceAll('"', "&quot;")}`,
		);
	expect(recipeIn(Buffer.from(rewritten, "utf8"))).toEqual(BOARD_RECIPE);
});

test("a recipe's text reads back as written whichever way a serializer spells its characters", () => {
	const recipe: RenderRecipe = {
		...BOARD_RECIPE,
		board: { id: "document", name: "R&D <core> &lt; ]]>" },
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

test("a PNG carries the recipe in a text chunk after its header, and stays a valid PNG", () => {
	const recipe: RenderRecipe = {
		...BOARD_RECIPE,
		board: { ...BOARD_RECIPE.board, name: "Ingest — ünïcode" },
		raster: { scale: 2, region: { x: 0, y: 0, width: 1, height: 1 } },
	};
	const carried = replaceRenderRecipe(PNG, recipe);
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

test("a recipe replaced in a file leaves every other byte as it was, and a PNG carries one recipe", () => {
	const newer: RenderRecipe = { ...BOARD_RECIPE, fingerprint: `sha256:${"1".repeat(64)}` };
	// A post-processor's work around the recipe stays.
	const processed = CARRIED.replace("<svg", "<!-- subset --><svg").replace("</svg>", "<g/></svg>");
	const replaced = replaceRenderRecipe(Buffer.from(processed, "utf8"), newer);
	expect(recipeIn(replaced)).toEqual(newer);
	expect(withoutMetadata(Buffer.from(replaced).toString("utf8"))).toBe(withoutMetadata(processed));
	const png = replaceRenderRecipe(PNG, { ...BOARD_RECIPE, raster: { scale: 1, region: null } });
	const bitmap = { ...newer, raster: { scale: 1, region: null } };
	const again = replaceRenderRecipe(png, bitmap);
	expect(recipeIn(again)).toEqual(bitmap);
	expect(chunkList(again).map((one) => one.type)).toEqual(["IHDR", "iTXt", "IDAT", "IEND"]);
	expect(() => replaceRenderRecipe(Buffer.from("<svg/>", "utf8"), newer)).toThrow();
});

test("a recipe that cannot be read is said to be unreadable, not absent", () => {
	const newer = CARRIED.replace('"recipe":1', '"recipe":2');
	const broken = CARRIED.replace('"recipe":1', '"recipe":');
	// A bitmap holds one ground, so a PNG recipe in the auto theme is not one.
	const auto = replaceRenderRecipe(PNG, {
		...BOARD_RECIPE,
		theme: "auto",
		raster: { scale: 1, region: null },
	});
	for (const bytes of [Buffer.from(newer), Buffer.from(broken), auto]) {
		expect(readRenderRecipe(bytes).kind).toBe("unreadable");
	}
});

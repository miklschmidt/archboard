// The render recipe in a PNG: one international text chunk (iTXt), right
// after the header, holding the recipe as UTF-8 JSON. iTXt rather than tEXt,
// because tEXt is Latin-1 and a board's name need not be.

import { crc32 } from "node:zlib";
import { readPngDimensions } from "#runtime/operations/rasterizer/png.ts";
import { RENDER_RECIPE_MARK, type AnyRenderRecipe } from "#runtime/operations/recipe/schema.ts";

/** The PNG signature's length, where the first chunk starts. */
const SIGNATURE_LENGTH = 8;
/** A chunk's length and type before its data, and its CRC after. */
const CHUNK_HEAD = 8;
const CHUNK_TAIL = 4;
const ITXT = "iTXt";

/** One chunk as the file holds it. */
interface Chunk {
	readonly type: string;
	readonly data: Uint8Array;
	/** Where the chunk starts and where the next one does. */
	readonly start: number;
	readonly end: number;
}

/**
 * Every chunk of a PNG, in file order, up to its end chunk: a decoder ignores
 * whatever a tool appended after it.
 * @param png The file.
 * @returns Its chunks.
 * @throws {Error} When a chunk runs past the end of the file.
 */
function chunksOf(png: Uint8Array): Chunk[] {
	const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
	const chunks: Chunk[] = [];
	for (let start = SIGNATURE_LENGTH; start < png.length;) {
		if (start + CHUNK_HEAD > png.length) throw new Error("A PNG chunk runs past the end.");
		const length = view.getUint32(start);
		const end = start + CHUNK_HEAD + length + CHUNK_TAIL;
		if (end > png.length) throw new Error("A PNG chunk runs past the end.");
		const type = Buffer.from(png.subarray(start + 4, start + CHUNK_HEAD)).toString("latin1");
		chunks.push({ type, data: png.subarray(start + CHUNK_HEAD, end - CHUNK_TAIL), start, end });
		if (type === "IEND") break;
		start = end;
	}
	return chunks;
}

/**
 * One chunk, framed with its length and CRC.
 * @param type The chunk type.
 * @param data Its data.
 * @returns The bytes.
 */
function chunk(type: string, data: Uint8Array): Uint8Array {
	const typed = Buffer.concat([Buffer.from(type, "latin1"), data]);
	const framed = Buffer.alloc(CHUNK_HEAD + data.length + CHUNK_TAIL);
	framed.writeUInt32BE(data.length, 0);
	typed.copy(framed, 4);
	framed.writeUInt32BE(crc32(typed), CHUNK_HEAD - 4 + typed.length);
	return framed;
}

/** The keyword that starts the recipe's chunk, with the zero that ends it. */
const RECIPE_KEYWORD = Buffer.from(`${RENDER_RECIPE_MARK}\0`, "latin1");

/**
 * Whether a chunk is the one that carries the recipe.
 * @param one The chunk.
 * @returns True for an iTXt chunk under the recipe's keyword.
 */
function isRecipeChunk(one: Chunk): boolean {
	return (
		one.type === ITXT &&
		Buffer.from(one.data.subarray(0, RECIPE_KEYWORD.length)).equals(RECIPE_KEYWORD)
	);
}

/**
 * The PNG with its recipe in an iTXt chunk right after the header. A recipe
 * the PNG carried already is left out, so the bitmap carries one recipe.
 * @param png The bitmap the rasterizer captured, or one that carries a recipe.
 * @param recipe Its recipe.
 * @returns The bitmap that carries it.
 * @throws {Error} When the bytes are not a PNG.
 */
function embedRecipeInPng(png: Uint8Array, recipe: AnyRenderRecipe): Uint8Array {
	readPngDimensions(png);
	const [header, ...rest] = chunksOf(png);
	if (header === undefined) throw new Error("The capture is not a PNG file.");
	// Keyword, then no compression, no language tag and no translated keyword.
	const data = Buffer.concat([
		Buffer.from(RENDER_RECIPE_MARK, "latin1"),
		Buffer.from([0, 0, 0, 0, 0]),
		Buffer.from(JSON.stringify(recipe), "utf8"),
	]);
	const end = rest.at(-1)?.end ?? header.end;
	return Buffer.concat([
		png.subarray(0, header.end),
		chunk(ITXT, data),
		...rest.filter((one) => !isRecipeChunk(one)).map((one) => png.subarray(one.start, one.end)),
		png.subarray(end),
	]);
}

/**
 * The recipe text a PNG carries.
 * @param png The file.
 * @returns The recipe's JSON text, or undefined when the file carries none.
 * @throws {Error} When the chunk that carries it cannot be read.
 */
function pngRecipeText(png: Uint8Array): string | undefined {
	const found = chunksOf(png).find(isRecipeChunk);
	if (found === undefined) return undefined;
	const rest = found.data.subarray(RECIPE_KEYWORD.length);
	if (rest[0] !== 0) throw new Error("The recipe's text chunk is compressed.");
	// The flag and method, then the language tag and the translated keyword, each ended by a zero.
	const language = rest.indexOf(0, 2);
	const translated = language < 0 ? -1 : rest.indexOf(0, language + 1);
	if (translated < 0) throw new Error("The recipe's text chunk is cut short.");
	return Buffer.from(rest.subarray(translated + 1)).toString("utf8");
}

export { embedRecipeInPng, pngRecipeText };

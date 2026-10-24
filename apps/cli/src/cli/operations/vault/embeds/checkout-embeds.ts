// The embeds of a checkout (ADR 0057): each file that Git tracks there, is an
// SVG document or a PNG, and carries a render recipe. A file Git ignores is no
// embed, and neither is an SVG inside an HTML, Markdown or MDX page, because
// `--fix` rewrites a whole file. Only the files whose extension can name an
// embed are read, so a large checkout costs one listing and those reads.

import fs from "node:fs";
import path from "node:path";
import { readRenderRecipe, type RenderRecipe } from "@archboard/renderer/recipe";
import { gitOutput } from "#cli/clients/git/git-output.ts";

/** One tracked file that carries a render recipe, readable or not. */
interface CheckoutEmbed {
	/** The file as Git names it in the checkout. */
	readonly file: string;
	/**
	 * The repository identity of a tracked embed of another repository, read
	 * from that repository's checkout; absent for a file of the vault's checkout.
	 */
	readonly repo?: string;
	/** The file on disk. */
	readonly path: string;
	readonly bytes: Uint8Array;
	readonly kind: "svg" | "png";
	/** Its recipe, or why it cannot be read. */
	readonly recipe:
		| { readonly ok: true; readonly recipe: RenderRecipe }
		| { readonly ok: false; readonly problem: string };
}

/** The eight bytes every PNG starts with. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * What may stand before an SVG's root element: a byte order mark, white
 * space, an XML declaration, comments and a document type.
 */
const SVG_DOCUMENT_START =
	/^﻿?\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:(?:<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)\s*)*<svg[\s/>]/u;

/**
 * What kind of embed a file's bytes can be, by what they hold rather than by
 * what the file is called.
 * @param file The file as Git names it.
 * @param bytes Its bytes.
 * @returns `svg` for an SVG document, `png` for a PNG, or null for anything else.
 */
function embedKind(file: string, bytes: Uint8Array): "svg" | "png" | null {
	const extension = path.extname(file).toLowerCase();
	if (extension === ".png") {
		return Buffer.from(bytes.subarray(0, PNG_SIGNATURE.length)).equals(PNG_SIGNATURE)
			? "png"
			: null;
	}
	if (extension !== ".svg") return null;
	// The root element is near the start, and a recipe is read from the whole file after.
	return SVG_DOCUMENT_START.test(Buffer.from(bytes.subarray(0, 4096)).toString("utf8"))
		? "svg"
		: null;
}

/**
 * The files Git tracks in a checkout whose extension can name an embed.
 * @param checkout The checkout's root.
 * @param signal Cancels the listing.
 * @returns Each file as Git names it, in Git's order.
 * @throws {Error} When Git cannot list what the checkout tracks.
 */
async function candidateFiles(checkout: string, signal: AbortSignal): Promise<string[]> {
	const listed = await gitOutput(
		checkout,
		["ls-files", "-z", "--cached", "--", ":(icase)*.svg", ":(icase)*.png"],
		signal,
	);
	if (listed === undefined) {
		throw new Error(`Git could not list the files that ${checkout} tracks.`);
	}
	return listed
		.toString("utf8")
		.split("\0")
		.filter((file) => file !== "");
}

/**
 * The bytes of a tracked file, when it is on disk: a file deleted and not yet
 * committed is tracked and is not there. A file reached through a symbolic
 * link is no embed, whether the link is the file or a directory above it: Git
 * tracks the link and not what it points at, the target can be outside the
 * checkout, and `--fix` would write there.
 * @param file The file, joined to the checkout's real root.
 * @returns Its bytes, or undefined when it is not a file of its own on disk.
 */
function bytesOf(file: string): Uint8Array | undefined {
	try {
		return fs.realpathSync(file) === file && fs.statSync(file).isFile()
			? fs.readFileSync(file)
			: undefined;
	} catch {
		return undefined;
	}
}

/**
 * The embed a tracked file is, if it is one.
 * @param checkout The checkout's root.
 * @param file The file as Git names it.
 * @returns The embed, or undefined for a file that is not on disk, is no SVG
 * document or PNG, or carries no recipe.
 */
function embedAt(checkout: string, file: string): CheckoutEmbed | undefined {
	const at = path.join(checkout, file);
	const bytes = bytesOf(at);
	const kind = bytes === undefined ? null : embedKind(file, bytes);
	if (bytes === undefined || kind === null) return undefined;
	const read = readRenderRecipe(bytes);
	if (read.kind === "absent") return undefined;
	const recipe =
		read.kind === "recipe"
			? { ok: true as const, recipe: read.recipe }
			: { ok: false as const, problem: read.problem };
	return { file, path: at, bytes, kind, recipe };
}

/**
 * Every embed of a checkout, or only those among some files.
 * @param checkout The checkout's root.
 * @param signal Cancels the listing.
 * @param only The files to read, as Git names them; every candidate when absent.
 * @returns The embeds, in Git's order.
 */
async function checkoutEmbeds(
	checkout: string,
	signal: AbortSignal,
	only?: ReadonlySet<string>,
): Promise<CheckoutEmbed[]> {
	const root = fs.realpathSync(checkout);
	return (await candidateFiles(checkout, signal)).flatMap((file) =>
		only === undefined || only.has(file) ? (embedAt(root, file) ?? []) : [],
	);
}

export { checkoutEmbeds, type CheckoutEmbed };

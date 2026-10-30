// The render recipe in an SVG: one element of Archboard's namespace in the
// document's `<metadata>`, holding the recipe as JSON text.
//
// A namespaced element survives the post-processors an embed meets: a font
// subsetter keeps it, and SVGO keeps elements of a foreign namespace once
// `removeMetadata` is off. The reader therefore finds the element by its
// local name and decodes whatever entities a serializer wrote.

import {
	RENDER_RECIPE_MARK,
	RENDER_RECIPE_NAMESPACE,
	type AnyRenderRecipe,
} from "#runtime/operations/recipe/schema.ts";

/** The recipe element's prefix and local name, from its qualified name. */
const PREFIX = RENDER_RECIPE_MARK.slice(0, RENDER_RECIPE_MARK.indexOf(":"));
const LOCAL_NAME = RENDER_RECIPE_MARK.slice(PREFIX.length + 1);

/** The root element's end tag, which every SVG the renderer draws ends with. */
const ROOT_END = "</svg>";

/** The recipe element with any prefix, and its text. */
const RECIPE_ELEMENT = new RegExp(
	`<(?:[\\w.-]+:)?${LOCAL_NAME}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${LOCAL_NAME}\\s*>`,
	"u",
);

/**
 * Text as XML element content.
 * @param text The text.
 * @returns It with the three characters escaped that element content cannot hold.
 */
function escapeText(text: string): string {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** The five entities XML predefines, by name. */
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	amp: "&",
};

/** A character section, a character reference, or a predefined entity. */
const ESCAPE = /<!\[CDATA\[([\s\S]*?)\]\]>|&#x([0-9a-fA-F]+);|&#(\d+);|&(lt|gt|quot|apos|amp);/gu;

/**
 * Element content as text, with the entities and character sections that any
 * XML serializer may write, each read once, so text a reference spells is
 * never read as another reference.
 * @param content The element content.
 * @returns The text.
 */
function decodeText(content: string): string {
	return content.replaceAll(
		ESCAPE,
		(_whole, data?: string, hex?: string, decimal?: string, named?: string) => {
			if (data !== undefined) return data;
			if (hex !== undefined) return String.fromCodePoint(Number.parseInt(hex, 16));
			if (decimal !== undefined) return String.fromCodePoint(Number.parseInt(decimal, 10));
			return NAMED_ENTITIES[named ?? ""] ?? "";
		},
	);
}

/**
 * The SVG with its recipe, in a `<metadata>` element that closes the document.
 * Last rather than first, because an HTML reader such as `HTMLRewriter` loses
 * the root's children after a `<metadata>` element, and the accessible
 * description that a clipboard copy reads comes before it.
 * @param svg The document the renderer drew.
 * @param recipe Its recipe.
 * @returns The document that carries it.
 * @throws {Error} When the text is not a document the renderer drew.
 */
function embedRecipeInSvg(svg: string, recipe: AnyRenderRecipe): string {
	const end = svg.lastIndexOf(ROOT_END);
	if (!svg.startsWith("<svg") || end < 0) throw new Error("The picture is not an SVG document.");
	const element =
		`<metadata><${PREFIX}:${LOCAL_NAME} xmlns:${PREFIX}="${RENDER_RECIPE_NAMESPACE}">` +
		`${escapeText(JSON.stringify(recipe))}</${PREFIX}:${LOCAL_NAME}></metadata>`;
	return `${svg.slice(0, end)}${element}\n${svg.slice(end)}`;
}

/** The recipe element in three parts: its start tag, its text and its end tag. */
const RECIPE_ELEMENT_PARTS = new RegExp(
	`(<(?:[\\w.-]+:)?${LOCAL_NAME}\\b[^>]*>)[\\s\\S]*?(</(?:[\\w.-]+:)?${LOCAL_NAME}\\s*>)`,
	"u",
);

/**
 * The SVG with another recipe in the element that holds its recipe. Only the
 * element's text changes, so whatever a post-processor did to the rest of the
 * document stays as it did it.
 * @param svg A document that carries a recipe.
 * @param recipe The recipe it carries from now on.
 * @returns The document.
 * @throws {Error} When the document carries no recipe element.
 */
function replaceRecipeInSvg(svg: string, recipe: AnyRenderRecipe): string {
	if (!RECIPE_ELEMENT_PARTS.test(svg)) throw new Error("The document carries no render recipe.");
	return svg.replace(
		RECIPE_ELEMENT_PARTS,
		(_whole, start: string, end: string) => `${start}${escapeText(JSON.stringify(recipe))}${end}`,
	);
}

/**
 * The recipe text an SVG carries.
 * @param svg The document.
 * @returns The recipe's JSON text, or undefined when the document carries none.
 */
function svgRecipeText(svg: string): string | undefined {
	const found = RECIPE_ELEMENT.exec(svg)?.[1];
	return found === undefined ? undefined : decodeText(found).trim();
}

export { embedRecipeInSvg, replaceRecipeInSvg, svgRecipeText };

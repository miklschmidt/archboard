// A curated palette colour as the page paints it: the diagram's own colour
// tokens, so a key or a chip in the sidebar is the colour the picture draws.

import { PaletteColorSchema } from "@archboard/model/policy";

/**
 * Resolve a curated colour name, keeping a neutral fallback.
 * @param color The colour's name, or anything else for none.
 * @param fallback The token for a subject with no colour.
 * @returns A CSS colour.
 */
function paletteInk(color: string | undefined, fallback = "--muted-foreground"): string {
	const parsed = PaletteColorSchema.safeParse(color);
	return parsed.success ? `var(--semantic-${parsed.data})` : `var(${fallback})`;
}

/**
 * The bright colour a group's tag is cut from, which it sets as `--tag` for the `group-tag` utility.
 * @param color The colour's name, or anything else for none.
 * @returns A CSS colour.
 */
function paletteTag(color: string | undefined): string {
	const parsed = PaletteColorSchema.safeParse(color);
	return `var(--bright-${parsed.success ? parsed.data : "neutral"})`;
}

export { paletteInk, paletteTag };

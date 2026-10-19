// A curated palette colour as the page paints it: the diagram's own colour
// tokens, so a key or a chip in the sidebar is the colour the picture draws.

import { PaletteColorSchema } from "@archboard/board/policy";

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

export { paletteInk };

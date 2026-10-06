import type { PaletteColor } from "@/shared/semantic-policy/index";
import type { NodeAppearance } from "@/transformers/semantic-renderer/lib/semantic-appearance";
import { token, type Palette } from "@/transformers/semantic-renderer/lib/theme";
import {
	BAND_RADIUS,
	CARD_THICKNESS,
	CHIP_THICKNESS,
	ICON_CHIP_SIZE,
	ICON_CHIP_RADIUS,
	PLINTH_STEP,
	PLINTH_THICKNESS,
	SLAB_RADIUS,
} from "@/transformers/semantic-renderer/lib/design";
import { lightDark, mixed } from "@/transformers/semantic-renderer/lib/svg/colour";
import { glyphGroup } from "@/transformers/semantic-renderer/lib/svg/icons";
import { type Attributes } from "@/transformers/semantic-renderer/lib/svg/primitives";
import {
	slab,
	slabShadow,
	tinted,
	type Share,
	type SlabLook,
} from "@/transformers/semantic-renderer/lib/svg/slab";

/**
 * One named palette color, as the page's token for it.
 * @param color Configured color name.
 * @returns Its ink, or no color.
 */
function semanticInk(color: PaletteColor | undefined): string | undefined {
	return color === undefined ? undefined : token(`--semantic-${color}`);
}

/**
 * How much of its group's colour a card's face and front edge carry. The dark
 * ground takes more on the face and less on the edge, so the edge stays darker
 * than the face it is the side of.
 */
const CARD_FACE: Share = { light: 0.06, dark: 0.09 };
const CARD_EDGE: Share = { light: 0.5, dark: 0.14 };

/**
 * How much of its kind's colour a container's plinth carries: half a card's,
 * so the cards standing on it, tinted by their own groups, read over it.
 */
const PLINTH_FACE: Share = { light: 0.03, dark: 0.035 };
const PLINTH_EDGE: Share = { light: 0.14, dark: 0.06 };

/**
 * How far each plinth nested in another rises toward a card's face, a step
 * nearer the light, and the furthest any rises.
 */
const PLINTH_RISE = 0.3;
const PLINTH_RISE_MAX = 0.6;

/** How much of its type's colour an icon chip's face and edge carry. */
const CHIP_FACE: Share = { light: 0.14, dark: 0.2 };
const CHIP_EDGE: Share = { light: 0.45, dark: 0.2 };

/**
 * How far a glyph's ink leans toward the text colour on the light ground, so
 * every type's glyph clears 3:1 on its own tinted tile; on the dark ground the
 * ink already does.
 */
const GLYPH_DEPTH = 0.3;

/**
 * A card's slab: its face tinted and its front edge toned by the group it is
 * placed with (ADR 0038), a warm grey for a card in no group.
 * @param appearance Resolved channels.
 * @param palette Selected theme.
 * @returns The slab's look.
 */
function cardLook(appearance: NodeAppearance, palette: Palette): SlabLook {
	const ink = semanticInk(appearance.bodyColor);
	return {
		face: tinted(palette.slabFace, ink, CARD_FACE),
		edge: tinted(palette.slabEdge, ink, CARD_EDGE),
		thickness: CARD_THICKNESS,
		radius: SLAB_RADIUS,
		sheen: true,
	};
}

/**
 * A container's plinth: a low, wide block, quietly tinted by the colour of its
 * own kind, with its heading printed on a band of its face. Each plinth nested
 * in another stands on it a step thinner, down to a card's thickness, and a
 * step lighter.
 * @param appearance Resolved channels.
 * @param palette Selected theme.
 * @param depth How many containers it stands in.
 * @param headerHeight How deep its heading is.
 * @returns The plinth's look.
 */
function plinthLook(
	appearance: NodeAppearance,
	palette: Palette,
	depth: number,
	headerHeight: number,
): SlabLook {
	const ink = semanticInk(appearance.bodyColor);
	const rise = Math.min(PLINTH_RISE_MAX, depth * PLINTH_RISE);
	/**
	 * One tone of the plinth, risen and tinted.
	 * @param base The tone at the top level.
	 * @returns The tone.
	 */
	const toned = (base: string): string =>
		tinted(mixed(base, palette.slabFace, rise), ink, PLINTH_FACE);
	return {
		face: toned(palette.plinthFace),
		edge: tinted(palette.plinthEdge, ink, PLINTH_EDGE),
		thickness: Math.max(CARD_THICKNESS, PLINTH_THICKNESS - depth * PLINTH_STEP),
		radius: BAND_RADIUS,
		sheen: false,
		header: { height: headerHeight, face: toned(palette.plinthHead) },
	};
}

/**
 * Applied channels for browser inspection of the actual drawing.
 * @param appearance Resolved channels.
 * @returns Inspector metadata.
 */
function appearanceAttributes(appearance: NodeAppearance): Attributes {
	return {
		"data-depiction": appearance.container ? "container" : "card",
		"data-body-color": appearance.bodyColor ?? "neutral",
		"data-group": appearance.group,
		"data-type-color": appearance.typeColor ?? "neutral",
		"data-type-name": appearance.typeName,
		"data-type-kind": appearance.typeKind,
	};
}

/**
 * Paint one type chip, a small tile raised off the face it sits on with a thin
 * front edge of its own; cards and container headers use the same geometry.
 * @param x Chip left.
 * @param y Chip top.
 * @param appearance Resolved type channels.
 * @param palette Selected theme.
 * @returns Tile and configured icon.
 */
function typeChip(x: number, y: number, appearance: NodeAppearance, palette: Palette): string {
	const ink = semanticInk(appearance.typeColor) ?? palette.glyph;
	const box = { x, y, width: ICON_CHIP_SIZE, height: ICON_CHIP_SIZE };
	const look: SlabLook = {
		face: tinted(palette.slabFace, ink, CHIP_FACE),
		edge: tinted(palette.slabEdge, ink, CHIP_EDGE),
		thickness: CHIP_THICKNESS,
		radius: ICON_CHIP_RADIUS,
		sheen: true,
	};
	return (
		slabShadow(box, ICON_CHIP_RADIUS, "chip", palette) +
		slab(box, look, palette) +
		// On the tile's face, above its edge.
		glyphGroup(
			appearance.icon,
			x + ICON_CHIP_SIZE / 2,
			y + (ICON_CHIP_SIZE - CHIP_THICKNESS) / 2,
			lightDark(mixed(ink, palette.foreground, GLYPH_DEPTH), ink),
		)
	);
}

export { semanticInk, cardLook, plinthLook, appearanceAttributes, typeChip };

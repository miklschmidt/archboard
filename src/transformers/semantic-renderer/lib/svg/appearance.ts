import type { PaletteColor } from "@/shared/semantic-policy/index";
import { themeColor } from "@/transformers/semantic-renderer/lib/host";
import type { NodeAppearance } from "@/transformers/semantic-renderer/lib/semantic-appearance";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import { ICON_CHIP_SIZE, ICON_CHIP_RADIUS } from "@/transformers/semantic-renderer/lib/design";
import { coord } from "@/transformers/semantic-renderer/lib/geometry";
import { glyphGroup } from "@/transformers/semantic-renderer/lib/svg/icons";
import { tag, type Attributes } from "@/transformers/semantic-renderer/lib/svg/primitives";

/**
 * Resolve one named palette color on the selected ground.
 * @param color Configured color name.
 * @param palette Selected theme.
 * @returns Literal ink or no color.
 */
function semanticInk(color: PaletteColor | undefined, palette: Palette): string | undefined {
	return color === undefined ? undefined : themeColor(palette.ground, `--semantic-${color}`);
}

/**
 * The body's restrained tint and border, without touching comparison or type.
 * @param appearance Resolved channels.
 * @param palette Selected theme.
 * @returns Translucent body fill and opaque border.
 */
function bodyAttributes(appearance: NodeAppearance, palette: Palette): Attributes {
	const ink = semanticInk(appearance.bodyColor, palette);
	return ink === undefined ? {} : { stroke: ink, fill: ink, "fill-opacity": 0.07 };
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
		"data-color-scope": appearance.scope,
		"data-type-color": appearance.typeColor ?? "neutral",
		"data-type-name": appearance.typeName,
		"data-type-kind": appearance.typeKind,
	};
}

/**
 * Paint one type chip; cards and container headers use the same geometry.
 * @param x Chip left.
 * @param y Chip top.
 * @param appearance Resolved type channels.
 * @param palette Selected theme.
 * @returns Tile and configured icon.
 */
function typeChip(x: number, y: number, appearance: NodeAppearance, palette: Palette): string {
	const ink = semanticInk(appearance.typeColor, palette) ?? palette.glyph;
	return (
		tag("rect", {
			x: coord(x),
			y: coord(y),
			width: ICON_CHIP_SIZE,
			height: ICON_CHIP_SIZE,
			rx: ICON_CHIP_RADIUS,
			fill: ink,
			"fill-opacity": 0.14,
			stroke: ink,
			"stroke-width": 1,
			"stroke-opacity": 0.45,
		}) + glyphGroup(appearance.icon, x + ICON_CHIP_SIZE / 2, y + ICON_CHIP_SIZE / 2, ink)
	);
}

export { semanticInk, bodyAttributes, appearanceAttributes, typeChip };

import { SEMANTIC_PALETTE, type PaletteColor } from "@/shared/semantic-policy/index";
import type { NodeAppearance } from "@/runtime/semantic-renderer/lib/semantic-appearance";
import type { Palette } from "@/runtime/semantic-renderer/lib/theme";
import { ICON_CHIP_SIZE, ICON_CHIP_RADIUS } from "@/runtime/semantic-renderer/lib/design";
import { coord } from "@/runtime/semantic-renderer/lib/geometry";
import { glyphGroup } from "@/runtime/semantic-renderer/lib/svg/icons";
import { tag, type Attributes } from "@/runtime/semantic-renderer/lib/svg/primitives";

/**
 * Resolve one named palette color on the selected ground.
 * @param color Configured color name.
 * @param palette Selected theme.
 * @returns Literal ink or no color.
 */
function semanticInk(color: PaletteColor | undefined, palette: Palette): string | undefined {
	return color === undefined ? undefined : SEMANTIC_PALETTE[color][palette.ground];
}

/**
 * The body's restrained tint and border, without touching comparison or type.
 * @param appearance Resolved channels.
 * @param palette Selected theme.
 * @returns Opaque body appearance.
 */
function bodyAttributes(appearance: NodeAppearance, palette: Palette): Attributes {
	const ink = semanticInk(appearance.bodyColor, palette);
	return ink === undefined ? {} : { stroke: ink, fill: tinted(ink, palette.card) };
}

/**
 * Mix a restrained semantic tint into an opaque card surface.
 * @param ink Semantic color.
 * @param ground Opaque theme surface.
 * @returns Six-digit hex fill, hiding routes underneath cards.
 */
function tinted(ink: string, ground: string): string {
	return (
		"#" +
		[1, 3, 5]
			.map((at) =>
				Math.round(
					Number.parseInt(ink.slice(at, at + 2), 16) * 0.07 +
						Number.parseInt(ground.slice(at, at + 2), 16) * 0.93,
				)
					.toString(16)
					.padStart(2, "0"),
			)
			.join("")
	);
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

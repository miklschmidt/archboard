import type { PaletteColor } from "@/shared/semantic-policy/index";
import type { NodeAppearance } from "@/transformers/semantic-renderer/lib/semantic-appearance";
import { token, type Palette } from "@/transformers/semantic-renderer/lib/theme";
import {
	CARD_THICKNESS,
	CHIP_THICKNESS,
	ICON_CHIP_SIZE,
	ICON_CHIP_RADIUS,
	PILL_RADIUS,
	PILL_THICKNESS,
	SLAB_RADIUS,
} from "@/transformers/semantic-renderer/lib/design";
import {
	lightDark,
	mixed,
	toned,
	type Tone,
} from "@/transformers/semantic-renderer/lib/svg/colour";
import { glyphGroup } from "@/transformers/semantic-renderer/lib/svg/icons";
import { tag, type Attributes } from "@/transformers/semantic-renderer/lib/svg/primitives";
import {
	ghostFace,
	slab,
	slabShadow,
	tinted,
	washed,
	type Share,
	type SlabLook,
} from "@/transformers/semantic-renderer/lib/svg/slab";
import {
	standingInk,
	type SubjectStanding,
} from "@/transformers/semantic-renderer/lib/svg/standing";
import type { TrayLook } from "@/transformers/semantic-renderer/lib/svg/tray";

/**
 * One named palette color, as the page's token for it.
 * @param color Configured color name.
 * @returns Its ink, or no color.
 */
function semanticInk(color: PaletteColor | undefined): string | undefined {
	return color === undefined ? undefined : token(`--semantic-${color}`);
}

/**
 * A card's face in its group's colour, and how much of the colour its front
 * edge carries over the shade it is mixed into (`--slab-deep`): the colour of
 * the edge and the face together are what say which concern a card serves, on
 * either ground. The face is a tone of the group's own hue (`toned`), a step
 * lighter than the mat it stands on and as quiet as a tint, so its words keep
 * 4.5:1, a standing's wash over it included. On the light ground the edge is
 * a lighter tint of the colour, a step from the face rather than a bar under it.
 */
const CARD_FACE: Tone = {
	light: { lightness: 0.955, chroma: 0.18 },
	dark: { lightness: 0.31, chroma: 0.27 },
};
const CARD_EDGE: Share = { light: 0.32, dark: 0.3 };

/**
 * How far each tray nested in another sinks toward `--tray-sink`, a step
 * deeper, and the furthest any sinks: two steps, so a third level down lies as
 * deep as the second.
 */
const TRAY_SINK: Share = { light: 0.4, dark: 0.4 };
const TRAY_SINK_MAX: Share = { light: 0.8, dark: 0.8 };

/**
 * How far a tray's walls are shaded from its floor, before its kind tints the
 * floor, toward `--slab-deep`. The top wall turns away from the light above,
 * as far from the floor as a card's front edge is from its face; the side walls
 * are only grazed by it, and are half as far.
 */
const TOP_WALL: Share = { light: 0.8, dark: 0.45 };
const SIDE_WALL: Share = { light: 0.4, dark: 0.28 };

/**
 * How much of its kind's colour a container carries: on its floor a calm
 * tint, so the cards standing on it, tinted by their own groups, read over it;
 * and on its nameplate a related tone a step stronger, so the header belongs
 * to the floor rather than standing out of it, and on the nameplate's front
 * edge. Its walls carry none: they are shades of the floor under the light.
 */
const TRAY_FLOOR: Share = { light: 0.045, dark: 0.12 };
const PLATE_FACE: Share = { light: 0.08, dark: 0.15 };
const PLATE_EDGE: Share = { light: 0.3, dark: 0.3 };

/** How far a label's front edge is shaded from its face toward `--slab-deep`. */
const LABEL_EDGE = 0.6;
/** How much of its standing's ink a marked label's front edge carries. */
const LABEL_STANDING_EDGE: Share = { light: 0.75, dark: 0.55 };

/** How much of its type's colour an icon chip's face and edge carry. */
const CHIP_FACE: Share = { light: 0.14, dark: 0.2 };
const CHIP_EDGE: Share = { light: 0.32, dark: 0.2 };

/**
 * How far a glyph's ink leans toward the text colour on the light ground, so
 * every type's glyph clears 3:1 on its own tinted tile; on the dark ground the
 * ink already does.
 */
const GLYPH_DEPTH = 0.3;

/**
 * A front edge in an ink: mixed into a light edge tone on the light ground,
 * and into the deep shade on the dark one, so it is darker than the face it
 * carries on either.
 * @param light The edge's tone on the light ground.
 * @param ink The ink.
 * @param share How much of it, on each ground.
 * @param palette Selected theme.
 * @returns The edge.
 */
function inkedEdge(light: string, ink: string, share: Share, palette: Palette): string {
	return lightDark(mixed(light, ink, share.light), mixed(palette.slabDeep, ink, share.dark));
}

/**
 * A card's slab: its face tinted and its front edge toned by the group it is
 * placed with (ADR 0038), a grey for a card in no group.
 * @param appearance Resolved channels.
 * @param palette Selected theme.
 * @returns The slab's look.
 */
function cardLook(appearance: NodeAppearance, palette: Palette): SlabLook {
	const ink = semanticInk(appearance.bodyColor);
	return {
		face: ink === undefined ? palette.slabFace : toned(ink, CARD_FACE),
		ground: palette.slabFace,
		edge: ink === undefined ? palette.slabEdge : tinted(palette.slabDeep, ink, CARD_EDGE),
		thickness: CARD_THICKNESS,
		radius: SLAB_RADIUS,
		sheen: true,
		hatch: true,
	};
}

/**
 * A relationship's or a message's label: a low tile like a chip, its face the
 * opaque plate its words are read on, its front edge a shade of that face. A
 * label has no group, so a standing takes its front edge as well as its face.
 * @param palette Selected theme.
 * @param standing How its relationship stands, when this is a proposal.
 * @returns The label's look.
 */
function labelLook(palette: Palette, standing?: SubjectStanding): SlabLook {
	const ink = standing === undefined ? undefined : standingInk(standing, palette);
	return {
		face: palette.pill,
		edge:
			ink === undefined
				? mixed(palette.pill, palette.slabDeep, LABEL_EDGE)
				: inkedEdge(palette.pill, ink, LABEL_STANDING_EDGE, palette),
		thickness: PILL_THICKNESS,
		radius: PILL_RADIUS,
		sheen: false,
	};
}

/**
 * A container's tray: its floor quietly tinted by the colour of the
 * container's own kind, with a nameplate a step stronger in that colour and a
 * front edge of it, and walls in neutral shades of the floor. A container of
 * no kind's colour is neutral. Each tray nested in another is cut a step
 * deeper into that one's floor, its walls with it.
 * @param ink The colour of its kind, or none.
 * @param palette Selected theme.
 * @param depth How many containers it is nested in.
 * @param plateHeight How far its nameplate reaches down its box.
 * @returns The tray's look.
 */
function trayLook(
	ink: string | undefined,
	palette: Palette,
	depth: number,
	plateHeight: number,
): TrayLook {
	const sink: Share = {
		light: Math.min(TRAY_SINK_MAX.light, depth * TRAY_SINK.light),
		dark: Math.min(TRAY_SINK_MAX.dark, depth * TRAY_SINK.dark),
	};
	const ground = tinted(palette.trayFloor, palette.traySink, sink);
	const walls = {
		top: tinted(ground, palette.slabDeep, TOP_WALL),
		side: tinted(ground, palette.slabDeep, SIDE_WALL),
	};
	return {
		floor: washed(ground, ink, TRAY_FLOOR, palette),
		ground,
		walls,
		nameplate: {
			height: plateHeight,
			face: washed(palette.trayPlate, ink, PLATE_FACE, palette),
			edge: tinted(walls.top, ink, PLATE_EDGE),
		},
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
 * On a part a proposal removed the tile has lost its thickness with the rest
 * of the part: a flat, see-through tile under its glyph.
 * @param x Chip left.
 * @param y Chip top.
 * @param appearance Resolved type channels.
 * @param palette Selected theme.
 * @param standing How the part stands, when this is a proposal.
 * @returns Tile and configured icon.
 */
function typeChip(
	x: number,
	y: number,
	appearance: NodeAppearance,
	palette: Palette,
	standing?: SubjectStanding,
): string {
	const ink = semanticInk(appearance.typeColor) ?? palette.glyph;
	const box = { x, y, width: ICON_CHIP_SIZE, height: ICON_CHIP_SIZE };
	const glyph = glyphGroup(
		appearance.icon,
		x + ICON_CHIP_SIZE / 2,
		y + (ICON_CHIP_SIZE - CHIP_THICKNESS) / 2,
		lightDark(mixed(ink, palette.foreground, GLYPH_DEPTH), ink),
	);
	if (standing === "removed") {
		return (
			tag("rect", {
				x,
				y,
				width: ICON_CHIP_SIZE,
				height: ICON_CHIP_SIZE,
				rx: ICON_CHIP_RADIUS,
				...ghostFace(palette),
			}) + glyph
		);
	}
	const look: SlabLook = {
		face: tinted(palette.slabFace, ink, CHIP_FACE),
		edge: tinted(palette.slabEdge, ink, CHIP_EDGE),
		thickness: CHIP_THICKNESS,
		radius: ICON_CHIP_RADIUS,
		sheen: true,
	};
	// On the tile's face, above its edge.
	return slabShadow(box, ICON_CHIP_RADIUS, "chip", palette) + slab(box, look, palette) + glyph;
}

export { semanticInk, cardLook, labelLook, trayLook, appearanceAttributes, typeChip };

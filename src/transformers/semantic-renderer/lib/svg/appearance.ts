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
	inkedOver,
	mixed,
	toned,
	type Inked,
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
import type { SubjectStanding } from "@/transformers/semantic-renderer/lib/svg/standing";
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
 * A card's face in its group's colour, and its front edge: the colour of the
 * edge and the face together are what say which concern a card serves, on
 * either ground. The face is a tone of the group's own hue (`toned`), as quiet
 * as a tint, so its words keep 4.5:1. On the light ground it is a clean tint
 * with its hue in plain sight, an orange face a peach. Every colour has one
 * lightness, and as much chroma as sRGB has room for at that lightness in its
 * hue (`FACE_CHROMA`), so no colour is clipped into another hue. The front
 * edge is the same material turned from the light: the group's hue in shade,
 * darker than the face and quieter than the group's own colour, so it reads as
 * the foot of the card and not as a bright strip. On the dark ground it is as
 * far below its face as a neutral card's edge is below its own (`--slab-edge`
 * under `--slab-face`), with the group's hue still in it.
 */
const CARD_FACE: Tone = {
	light: { lightness: 0.93, chroma: 1 },
	dark: { lightness: 0.31, chroma: 0.27 },
};
const CARD_EDGE: Tone = {
	light: { lightness: 0.78, chroma: 0.7 },
	dark: { lightness: 0.212, chroma: 0.35 },
};

/**
 * How much chroma a grouped card's face takes on the light ground, by colour:
 * nine tenths of what sRGB holds at the face's lightness in the colour's hue,
 * and no more than 0.055, so the hues with room to spare (lime to teal) do not
 * outshout the ones without (red, blue, violet). Yellow, the gold, takes less,
 * so its face is a warm gold-white and not an apricot.
 */
const FACE_CHROMA: Readonly<Record<PaletteColor, number>> = {
	red: 0.033,
	orange: 0.035,
	amber: 0.043,
	yellow: 0.042,
	lime: 0.055,
	green: 0.055,
	emerald: 0.055,
	teal: 0.055,
	cyan: 0.046,
	sky: 0.034,
	blue: 0.031,
	indigo: 0.031,
	violet: 0.034,
	purple: 0.039,
	fuchsia: 0.052,
	pink: 0.037,
	rose: 0.033,
};

/**
 * A grouped card's face: a tone of its group's colour, as much chroma as its
 * hue holds on the light ground ({@link FACE_CHROMA}).
 * @param color The group's colour.
 * @returns The face.
 */
function faceIn(color: PaletteColor): string {
	return toned(token(`--semantic-${color}`), {
		...CARD_FACE,
		light: { ...CARD_FACE.light, cap: FACE_CHROMA[color] },
	});
}

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

/**
 * How much of its type's colour an icon chip's face and edge carry. On the
 * light ground the face is a light, clean tone of the colour, light enough that
 * the glyph, drawn in the colour itself, clears 3:1 on it; the edge is that
 * tone in shade, like a card's.
 */
const CHIP_FACE: Inked = { light: { lightness: 0.945, chroma: 0.21 }, dark: 0.2 };
const CHIP_EDGE: Inked = { light: { lightness: 0.78, chroma: 0.5 }, dark: 0.2 };

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
		face: appearance.bodyColor === undefined ? palette.slabFace : faceIn(appearance.bodyColor),
		ground: palette.slabFace,
		edge: ink === undefined ? palette.slabEdge : toned(ink, CARD_EDGE),
		thickness: CARD_THICKNESS,
		radius: SLAB_RADIUS,
		sheen: true,
	};
}

/**
 * A relationship's or a message's label: a low tile like a chip, its face the
 * opaque plate its words are read on, its front edge a shade of that face. A
 * standing borders its face as it does a card's (`slab`).
 * @param palette Selected theme.
 * @returns The label's look.
 */
function labelLook(palette: Palette): SlabLook {
	return {
		face: palette.pill,
		edge: mixed(palette.pill, palette.slabDeep, LABEL_EDGE),
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
		ink,
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
		face: inkedOver(palette.slabFace, ink, CHIP_FACE),
		edge: inkedOver(palette.slabEdge, ink, CHIP_EDGE),
		thickness: CHIP_THICKNESS,
		radius: ICON_CHIP_RADIUS,
		sheen: true,
	};
	// On the tile's face, above its edge.
	return slabShadow(box, ICON_CHIP_RADIUS, "chip", palette) + slab(box, look, palette) + glyph;
}

export { semanticInk, cardLook, labelLook, trayLook, appearanceAttributes, typeChip };

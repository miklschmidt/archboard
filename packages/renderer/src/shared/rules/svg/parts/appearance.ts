import type { NodeAppearance, PaletteColor } from "#shared/rules/render/semantic-appearance.ts";
import type { Box } from "#shared/rules/geometry.ts";
import { token, type Palette } from "#shared/rules/svg/page/theme.ts";
import {
	CARD_THICKNESS,
	CHIP_THICKNESS,
	ICON_CHIP_SIZE,
	ICON_CHIP_RADIUS,
	PILL_RADIUS,
	PILL_THICKNESS,
	SLAB_RADIUS,
} from "#shared/constants/design.ts";
import {
	inkedOver,
	mixed,
	toned,
	type Inked,
	type Tone,
	type ToneStep,
} from "#shared/rules/svg/page/colour.ts";
import { glyphGroup } from "#shared/rules/svg/page/icons.ts";
import { tag, type Attributes } from "#shared/rules/svg/page/primitives.ts";
import {
	ghostFace,
	slab,
	slabShadow,
	tinted,
	type Share,
	type SlabLook,
} from "#shared/rules/svg/parts/slab.ts";
import type { SubjectStanding } from "#shared/rules/svg/parts/standing.ts";
import type { TrayLook } from "#shared/rules/svg/parts/tray.ts";

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
 * either ground. The face is a tone of the group's own hue (`toned`): a
 * clearly coloured card whose words keep their APCA level. On the light ground each
 * colour has a tone of its own (`LIGHT_FACE`), so no colour is clipped into
 * another hue. The front edge is the same material turned from the light: the
 * group's hue in shade, darker than the face, so it reads as the foot of the
 * card and not as a bright strip. On the dark ground it is as far below its
 * face as a neutral card's edge is below its own (`--slab-edge` under
 * `--slab-face`), with the group's hue still in it.
 */
const DARK_FACE: ToneStep = { lightness: 0.31, chroma: 0.4 };
const CARD_EDGE: Tone = {
	light: { lightness: 0.78, chroma: 0.8 },
	dark: { lightness: 0.212, chroma: 0.45 },
};

/**
 * A grouped card's face on the light ground, by colour: its lightness and its
 * chroma. sRGB holds far less chroma near white in some hues than in others,
 * so the colours that hold little (red to amber, cyan to rose) sit at 0.89 and
 * the ones that hold much (yellow to teal) at 0.92. Each takes nine tenths of
 * the chroma its hue holds there, and no more than 0.07, so no colour goes
 * neon. Yellow, the gold, takes less, a pale gold.
 */
const LIGHT_FACE: Readonly<Record<PaletteColor, readonly [lightness: number, chroma: number]>> = {
	red: [0.89, 0.053],
	orange: [0.89, 0.057],
	amber: [0.89, 0.069],
	yellow: [0.92, 0.055],
	lime: [0.92, 0.07],
	green: [0.92, 0.07],
	emerald: [0.92, 0.07],
	teal: [0.92, 0.07],
	cyan: [0.89, 0.07],
	sky: [0.89, 0.055],
	blue: [0.89, 0.049],
	indigo: [0.89, 0.05],
	violet: [0.89, 0.054],
	purple: [0.89, 0.062],
	fuchsia: [0.89, 0.07],
	pink: [0.89, 0.06],
	rose: [0.89, 0.053],
};

/**
 * A grouped card's face: a tone of its group's colour ({@link LIGHT_FACE} on
 * the light ground).
 * @param color The group's colour.
 * @returns The face.
 */
function faceIn(color: PaletteColor): string {
	const [lightness, chroma] = LIGHT_FACE[color];
	return toned(token(`--semantic-${color}`), {
		light: { lightness, chroma: 1, cap: chroma },
		dark: DARK_FACE,
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
 * How far a tray's walls are shaded from its floor toward `--slab-deep`. The
 * top wall turns away from the light above,
 * as far from the floor as a card's front edge is from its face; the side walls
 * are only grazed by it, and are half as far.
 */
const TOP_WALL: Share = { light: 0.8, dark: 0.45 };
const SIDE_WALL: Share = { light: 0.4, dark: 0.28 };

/** How far a label's front edge is shaded from its face toward `--slab-deep`. */
const LABEL_EDGE = 0.6;

/**
 * How much of its type's colour an icon chip's face and edge carry. On the
 * light ground the face is a light, clean tone of the colour, light enough that
 * the glyph, drawn in the colour itself, keeps APCA Lc 30 or more on it, the
 * floor for a mark; the edge is that
 * tone in shade, like a card's.
 */
const CHIP_FACE: Inked = { light: { lightness: 0.955, chroma: 0.17 }, dark: 0.2 };
const CHIP_EDGE: Inked = { light: { lightness: 0.78, chroma: 0.5 }, dark: 0.2 };

/**
 * A card's slab: its face tinted and its front edge toned by the group it is
 * placed with (ADR 0038), a grey for a card in no group.
 * @param appearance Resolved channels.
 * @param palette Selected theme.
 * @returns The slab's look.
 */
function cardLook(appearance: Pick<NodeAppearance, "bodyColor">, palette: Palette): SlabLook {
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
 * The floor of a tray nested in some containers: a step deeper for each.
 * @param depth How many containers the tray is nested in.
 * @param palette Selected theme.
 * @returns The floor's colour.
 */
function floorAt(depth: number, palette: Palette): string {
	const sink: Share = {
		light: Math.min(TRAY_SINK_MAX.light, depth * TRAY_SINK.light),
		dark: Math.min(TRAY_SINK_MAX.dark, depth * TRAY_SINK.dark),
	};
	return tinted(palette.trayFloor, palette.traySink, sink);
}

/**
 * A container's tray: a neutral well, its floor only just darker than what
 * holds it and its walls shades of that floor, with a header slab standing on
 * the floor. The header rises to the level of what the tray is cut into and is
 * made of it: its face is the page's colour, or the colour of the floor of the
 * tray around it, and its front edge is that colour turned from the light, as
 * the top wall is. So it reads as the head of the well and not as one more
 * card, and no group tints it: the region of the group that places the
 * container says the group (TASK-474). Each tray nested in another is cut a
 * step deeper into that one's floor, its walls with it.
 * @param header The header slab's box.
 * @param palette Selected theme.
 * @param depth How many containers it is nested in.
 * @returns The tray's look.
 */
function trayLook(header: Box, palette: Palette, depth: number): TrayLook {
	const floor = floorAt(depth, palette);
	const ground = depth === 0 ? palette.background : floorAt(depth - 1, palette);
	return {
		floor,
		walls: {
			top: tinted(floor, palette.slabDeep, TOP_WALL),
			side: tinted(floor, palette.slabDeep, SIDE_WALL),
		},
		header: {
			box: header,
			look: {
				face: ground,
				edge: tinted(ground, palette.slabDeep, TOP_WALL),
				thickness: CARD_THICKNESS,
				radius: SLAB_RADIUS,
				sheen: false,
			},
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
	// On the tile's face, above its edge.
	return chipTile(box, ink, palette) + glyph;
}

/**
 * A type chip's tile without its glyph: a small slab tinted by its type's
 * colour, and the shadow it casts.
 * @param box Where the tile stands.
 * @param ink The type's colour, or the glyph's neutral ink.
 * @param palette Selected theme.
 * @returns The tile.
 */
function chipTile(box: Box, ink: string, palette: Palette): string {
	const look: SlabLook = {
		face: inkedOver(palette.slabFace, ink, CHIP_FACE),
		edge: inkedOver(palette.slabEdge, ink, CHIP_EDGE),
		thickness: CHIP_THICKNESS,
		radius: ICON_CHIP_RADIUS,
		sheen: true,
	};
	return slabShadow(box, ICON_CHIP_RADIUS, "chip", palette) + slab(box, look, palette);
}

export { semanticInk, cardLook, labelLook, trayLook, appearanceAttributes, typeChip, chipTile };

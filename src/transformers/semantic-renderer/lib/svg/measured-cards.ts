// Paint measured cards and frames: the words at supplied baselines, near and far.
import {
	ARCHITECTURE_CARD_PADDING,
	ARCHITECTURE_HEADER_PADDING,
} from "@/transformers/semantic-renderer/config";
import {
	BAND_RADIUS,
	ICON_CHIP_SIZE,
	PLATE_THICKNESS,
	SLAB_RADIUS,
} from "@/transformers/semantic-renderer/lib/design";
import type { DrawingNode } from "@/transformers/semantic-renderer/lib/drawing";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import type { NodeAppearance } from "@/transformers/semantic-renderer/lib/semantic-appearance";
import {
	appearanceAttributes,
	cardLook,
	plinthLook,
	semanticInk,
	typeChip,
} from "@/transformers/semantic-renderer/lib/svg/appearance";
import { halo } from "@/transformers/semantic-renderer/lib/svg/cards";
import { cornerDrillMark } from "@/transformers/semantic-renderer/lib/svg/drill-mark";
import { paintFarCard } from "@/transformers/semantic-renderer/lib/svg/far-card";
import { nearLayer } from "@/transformers/semantic-renderer/lib/svg/far-view";
import { lines, wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";
import { slab, slabSeat, slabShadow } from "@/transformers/semantic-renderer/lib/svg/slab";
import { stylesFor } from "@/transformers/semantic-renderer/lib/svg/styles";
import { paintTextRuns } from "@/transformers/semantic-renderer/lib/svg/text-runs";
import {
	PART_ATTRIBUTE,
	standingPalette,
	standingPin,
	subjectGroup,
	warningBadge,
	type SubjectStanding,
} from "@/transformers/semantic-renderer/lib/svg/standing";

/**
 * A frame's header as it is drawn from far away: as a card is, on the face of
 * its nameplate, with its kind's tile grown to the plate, its name and the
 * start of what it is responsible for, clear of its far mark.
 * @param placed The frame's geometry, name and responsibility.
 * @param look Its type chip's colour and glyph, and the selected theme.
 * @param look.appearance Its type chip's colour and glyph.
 * @param look.palette The selected theme.
 * @param unsettled Whether the frame wears the warning badge.
 * @returns The far layer.
 */
function paintFarHeader(
	placed: DrawingNode,
	look: { appearance: NodeAppearance; palette: Palette },
	unsettled: boolean,
): string {
	// The nameplate's face: the header above the plate's own front edge.
	const plate = { ...placed.box, height: placed.measured.headerHeight - PLATE_THICKNESS };
	return paintFarCard(placed.measured.node, plate, look, unsettled);
}

/**
 * The mark of a part that opens another board, in the corner opposite its
 * chip and level with it; nothing for a part that opens none.
 * @param box The part's box, or its header's.
 * @param box.x Its left edge.
 * @param box.y Its top edge.
 * @param box.width Its width.
 * @param padding How far in its chip sits.
 * @param appearance Its channels, which say whether it opens a board and which way.
 * @param palette The selected theme.
 * @returns The mark, or nothing.
 */
function drillCorner(
	box: { readonly x: number; readonly y: number; readonly width: number },
	padding: number,
	appearance: NodeAppearance,
	palette: Palette,
): string {
	return appearance.drill === null
		? ""
		: cornerDrillMark(box, padding, padding + ICON_CHIP_SIZE / 2, appearance.drill, palette.glyph);
}

/**
 * Paint one measured card with its kind glyph and semantic change treatment.
 * @param placed Final card geometry and prepared text.
 * @param palette The selected theme.
 * @param standing How it stands against the variant it is read against.
 * @param unsettled Whether its architecture needs reconciliation.
 * @param appearance Resolved containment and type channels.
 * @returns The card group.
 */
function paintMeasuredCard(
	placed: DrawingNode,
	palette: Palette,
	standing: SubjectStanding | undefined,
	unsettled: boolean,
	appearance: NodeAppearance,
): string {
	const { measured, box } = placed;
	const styles = stylesFor(palette);
	const words = standingPalette(palette, standing);
	const chipX = box.x + ARCHITECTURE_CARD_PADDING;
	const chipY = box.y + ARCHITECTURE_CARD_PADDING;
	return wrap(
		"g",
		{
			...subjectGroup("node", measured.node.id, standing),
			...appearanceAttributes(appearance),
		},
		lines([
			slabSeat(box, SLAB_RADIUS),
			slabShadow(box, SLAB_RADIUS, "card", palette, standing),
			halo(box, SLAB_RADIUS, styles, standing),
			slab(box, cardLook(appearance, palette), palette, standing),
			nearLayer(
				typeChip(chipX, chipY, appearance, palette, standing) +
					paintTextRuns(measured.runs, box, words) +
					drillCorner(box, ARCHITECTURE_CARD_PADDING, appearance, palette),
			),
			paintFarCard(measured.node, box, { appearance, palette: words }, unsettled),
			standingPin(box, standing, palette),
			warningBadge(box, unsettled, palette),
		]),
	);
}

/**
 * Paint a containing frame below its children and all connections: a plinth
 * its children stand on, with a nameplate across its top that its heading is
 * printed on. What the frame itself relates to leaves from the foot of the
 * nameplate's front edge, so such a line has a visible origin inside the frame.
 * @param placed Final frame geometry.
 * @param palette The selected theme.
 * @param standing Its architectural change.
 * @param appearance Resolved containment and type channels.
 * @returns The frame group.
 */
function paintMeasuredFrame(
	placed: DrawingNode,
	palette: Palette,
	standing: SubjectStanding | undefined,
	appearance: NodeAppearance,
): string {
	const { measured, box, depth } = placed;
	const styles = stylesFor(palette);
	const ink = semanticInk(appearance.bodyColor);
	const look = plinthLook(ink, palette, depth, measured.headerHeight);
	return wrap(
		"g",
		{
			...subjectGroup("region", measured.node.id, standing),
			...appearanceAttributes(appearance),
		},
		lines([
			slabSeat(box, BAND_RADIUS),
			slabShadow(box, BAND_RADIUS, "plinth", palette, standing),
			halo(box, BAND_RADIUS, styles, standing),
			slab(box, look, palette, standing),
			standingPin(box, standing, palette),
		]),
	);
}

/**
 * Paint the prepared frame heading above the connection layer.
 * @param placed Final frame and header geometry.
 * @param palette The selected theme.
 * @param standing Its architectural change.
 * @param unsettled Whether its architecture needs reconciliation.
 * @param appearance Resolved containment and type channels.
 * @returns The header group.
 */
function paintMeasuredHeader(
	placed: DrawingNode,
	palette: Palette,
	standing: SubjectStanding | undefined,
	unsettled: boolean,
	appearance: NodeAppearance,
): string {
	const words = standingPalette(palette, standing);
	return wrap(
		"g",
		{
			...subjectGroup("region", placed.measured.node.id, standing),
			...appearanceAttributes(appearance),
			[PART_ATTRIBUTE]: "header",
		},
		lines([
			nearLayer(
				typeChip(
					placed.box.x + ARCHITECTURE_HEADER_PADDING,
					placed.box.y + ARCHITECTURE_HEADER_PADDING,
					appearance,
					palette,
					standing,
				) +
					paintTextRuns(placed.measured.runs, placed.box, words) +
					drillCorner(placed.box, ARCHITECTURE_HEADER_PADDING, appearance, palette),
			),
			paintFarHeader(placed, { appearance, palette: words }, unsettled),
			warningBadge(placed.box, unsettled, palette),
		]),
	);
}

export { paintMeasuredCard, paintMeasuredFrame, paintMeasuredHeader };

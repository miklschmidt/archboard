// Paint measured cards and frames: the words at supplied baselines, near and far.
import {
	ARCHITECTURE_CARD_PADDING,
	ARCHITECTURE_HEADER_PADDING,
} from "@/transformers/semantic-renderer/config";
import {
	BAND_RADIUS,
	ICON_CHIP_SIZE,
	SLAB_RADIUS,
} from "@/transformers/semantic-renderer/lib/design";
import { farSizeOf } from "@/transformers/semantic-renderer/lib/measurement";
import type { DrawingNode } from "@/transformers/semantic-renderer/lib/drawing";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import type { NodeAppearance } from "@/transformers/semantic-renderer/lib/semantic-appearance";
import {
	appearanceAttributes,
	cardLook,
	plinthLook,
	typeChip,
} from "@/transformers/semantic-renderer/lib/svg/appearance";
import { halo } from "@/transformers/semantic-renderer/lib/svg/cards";
import { cornerDrillMark } from "@/transformers/semantic-renderer/lib/svg/drill-mark";
import { paintFarCard } from "@/transformers/semantic-renderer/lib/svg/far-card";
import { nearLayer, paintFarTitle } from "@/transformers/semantic-renderer/lib/svg/far-view";
import { lines, wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";
import { slab, slabSeat, slabShadow } from "@/transformers/semantic-renderer/lib/svg/slab";
import { stylesFor } from "@/transformers/semantic-renderer/lib/svg/styles";
import { paintTextRuns } from "@/transformers/semantic-renderer/lib/svg/text-runs";
import {
	PART_ATTRIBUTE,
	standingPin,
	subjectGroup,
	warningBadge,
	type SubjectStanding,
} from "@/transformers/semantic-renderer/lib/svg/standing";

/**
 * A frame's name and chip as they are drawn from far away: at its header's
 * start, as large as the picture's cards' names, or as its header holds.
 * @param placed The frame's geometry and name.
 * @param farSize The size of the picture's cards' names from far away.
 * @param look Its type chip's colour and glyph, and the selected theme.
 * @param look.appearance Its type chip's colour and glyph.
 * @param look.palette The selected theme.
 * @param unsettled Whether the frame wears the warning badge.
 * @returns The far layer.
 */
function paintFarHeader(
	placed: DrawingNode,
	farSize: number,
	look: { appearance: NodeAppearance; palette: Palette },
	unsettled: boolean,
): string {
	const { name } = placed.measured.node;
	// The name is sized and broken clear of the frame's far mark, as its near name is.
	const header = {
		...placed.box,
		height: placed.measured.headerHeight,
		mark: look.appearance.drill !== null,
	};
	const size = Math.min(farSize, farSizeOf(name, header));
	return paintFarTitle(name, header, { size, align: "start" }, look, unsettled);
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
			slabShadow(box, SLAB_RADIUS, "card", palette),
			halo(box, SLAB_RADIUS, styles),
			slab(box, cardLook(appearance, palette), palette, standing),
			nearLayer(
				typeChip(chipX, chipY, appearance, palette) +
					paintTextRuns(measured.runs, box, palette) +
					drillCorner(box, ARCHITECTURE_CARD_PADDING, appearance, palette),
			),
			paintFarCard(measured.node, box, { appearance, palette }, unsettled),
			standingPin(box, standing, palette),
			warningBadge(box, unsettled, palette),
		]),
	);
}

/**
 * Paint a containing frame below its children and all connections: a plinth
 * its children stand on, its heading printed on a band of its face. What the
 * frame itself relates to leaves from the band's lower edge, so such a line has
 * a visible origin inside the frame.
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
	const look = plinthLook(appearance, palette, depth, measured.headerHeight);
	return wrap(
		"g",
		{
			...subjectGroup("region", measured.node.id, standing),
			...appearanceAttributes(appearance),
		},
		lines([
			slabSeat(box, BAND_RADIUS),
			slabShadow(box, BAND_RADIUS, "plinth", palette),
			halo(box, BAND_RADIUS, styles),
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
 * @param farSize The size of the picture's cards' names from far away.
 * @returns The header group.
 */
function paintMeasuredHeader(
	placed: DrawingNode,
	palette: Palette,
	standing: SubjectStanding | undefined,
	unsettled: boolean,
	appearance: NodeAppearance,
	farSize: number,
): string {
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
				) +
					paintTextRuns(placed.measured.runs, placed.box, palette) +
					drillCorner(placed.box, ARCHITECTURE_HEADER_PADDING, appearance, palette),
			),
			paintFarHeader(placed, farSize, { appearance, palette }, unsettled),
			warningBadge(placed.box, unsettled, palette),
		]),
	);
}

export { paintMeasuredCard, paintMeasuredFrame, paintMeasuredHeader };

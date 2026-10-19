// Paint measured cards and frames: the words at supplied baselines, near and far.
import { ARCHITECTURE_CARD_PADDING } from "#shared/constants/spacing.ts";
import { BAND_RADIUS, CARD_THICKNESS, SLAB_RADIUS } from "#shared/constants/design.ts";
import type { DrawingNode } from "#shared/rules/render/drawing.ts";
import type { Palette } from "#shared/rules/svg/page/theme.ts";
import type { NodeAppearance } from "#shared/rules/render/semantic-appearance.ts";
import {
	appearanceAttributes,
	cardLook,
	trayLook,
	typeChip,
} from "#shared/rules/svg/parts/appearance.ts";
import { halo } from "#shared/rules/svg/sequence/cards.ts";
import { paintCardViews, wordsOf } from "#shared/rules/svg/parts/far-card.ts";
import { lines, wrap } from "#shared/rules/svg/page/primitives.ts";
import { slab, slabSeat, slabShadow } from "#shared/rules/svg/parts/slab.ts";
import { stylesFor } from "#shared/rules/svg/page/styles.ts";
import { headerOf, tray } from "#shared/rules/svg/parts/tray.ts";
import type { Port } from "#shared/rules/svg/parts/ports.ts";
import {
	PART_ATTRIBUTE,
	standingPalette,
	standingPin,
	subjectGroup,
	warningBadge,
	type SubjectStanding,
} from "#shared/rules/svg/parts/standing.ts";

/**
 * Paint one measured card with its kind glyph and semantic change treatment.
 * @param placed Final card geometry and prepared text.
 * @param palette The selected theme.
 * @param standing How it stands against the variant it is read against.
 * @param unsettled Whether its architecture needs reconciliation.
 * @param appearance Resolved containment and type channels.
 * @param ports Its ports, cut through its front edge, and the clip that cuts them (`ports.ts`).
 * @param ports.slots Its slots.
 * @param ports.id The id of the clip.
 * @param kind What subject the card is: a part, or a flowchart's message step.
 * @returns The card group.
 */
function paintMeasuredCard(
	placed: DrawingNode,
	palette: Palette,
	standing: SubjectStanding | undefined,
	unsettled: boolean,
	appearance: NodeAppearance,
	ports?: { readonly slots: readonly Port[]; readonly id: string },
	kind: "node" | "step" = "node",
): string {
	const { measured, box } = placed;
	const styles = stylesFor(palette);
	const words = standingPalette(palette, standing);
	const look = cardLook(appearance, palette);
	const chipX = box.x + ARCHITECTURE_CARD_PADDING;
	const chipY = box.y + ARCHITECTURE_CARD_PADDING;
	return wrap(
		"g",
		{
			...subjectGroup(kind, measured.node.id, standing),
			...appearanceAttributes(appearance),
		},
		lines([
			slabSeat(box, SLAB_RADIUS),
			// A removed card's ghost; a card's shadow lies under the lines and the cards (`shadowUnder`).
			standing === "removed" ? slabShadow(box, SLAB_RADIUS, "card", palette, standing) : "",
			halo(box, SLAB_RADIUS, styles, standing),
			slab(box, look, palette, standing, ports?.id),
			paintCardViews(
				measured.node,
				box,
				{ appearance, palette: words },
				{
					chip: { markup: typeChip(0, 0, appearance, palette, standing), x: chipX, y: chipY },
					words: wordsOf(measured.runs, box, words),
				},
			),
			standingPin(box, standing, palette),
			warningBadge(box, unsettled, palette),
		]),
	);
}

/**
 * Paint a containing frame below its children and all connections: a neutral
 * well its children stand in, with a header slab standing on its floor that
 * its heading is printed on, made of what the well is cut into (`trayLook`).
 * What the frame itself relates to leaves from the foot of the slab's front
 * edge, so such a line has a visible origin inside the frame.
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
	const look = trayLook(headerOf(box, measured.headerHeight), palette, depth);
	return wrap(
		"g",
		{
			...subjectGroup("region", measured.node.id, standing),
			...appearanceAttributes(appearance),
		},
		lines([
			slabSeat(box, BAND_RADIUS),
			slabShadow(box, BAND_RADIUS, "tray", palette, standing),
			halo(box, BAND_RADIUS, styles, standing),
			tray(box, look, palette, standing),
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
	// The words stand on the header slab as a card's stand on its own. From far
	// away they stand on the slab's face, above its front edge, as a card's do.
	const header = headerOf(placed.box, placed.measured.headerHeight);
	const face = { ...header, height: header.height - CARD_THICKNESS };
	return wrap(
		"g",
		{
			...subjectGroup("region", placed.measured.node.id, standing),
			...appearanceAttributes(appearance),
			[PART_ATTRIBUTE]: "header",
		},
		lines([
			paintCardViews(
				placed.measured.node,
				face,
				{ appearance, palette: words },
				{
					chip: {
						markup: typeChip(0, 0, appearance, palette, standing),
						x: header.x + ARCHITECTURE_CARD_PADDING,
						y: header.y + ARCHITECTURE_CARD_PADDING,
					},
					words: wordsOf(placed.measured.runs, placed.box, words),
				},
			),
			warningBadge(header, unsettled, palette),
		]),
	);
}

export { paintMeasuredCard, paintMeasuredFrame, paintMeasuredHeader };

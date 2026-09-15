// Paint the measured words at supplied baselines. No fitting happens here.
import { CARD_RADIUS, BAND_RADIUS } from "@/runtime/semantic-renderer/lib/design";
import type { DrawingNode, TextRun } from "@/runtime/semantic-renderer/lib/drawing";
import { coord, type Box } from "@/runtime/semantic-renderer/lib/geometry";
import { fontAttributes } from "@/runtime/semantic-renderer/lib/fonts";
import type { Palette } from "@/runtime/semantic-renderer/lib/theme";
import type { NodeAppearance } from "@/runtime/semantic-renderer/lib/semantic-appearance";
import {
	bodyAttributes,
	appearanceAttributes,
	typeChip,
} from "@/runtime/semantic-renderer/lib/svg/appearance";
import { halo } from "@/runtime/semantic-renderer/lib/svg/cards";
import { lines, tag, textNode, wrap } from "@/runtime/semantic-renderer/lib/svg/primitives";
import { stylesFor } from "@/runtime/semantic-renderer/lib/svg/styles";
import {
	standingOutline,
	standingPin,
	subjectGroup,
	warningBadge,
	type SubjectStanding,
} from "@/runtime/semantic-renderer/lib/svg/standing";

/**
 * Emit measured lines without changing their content, font or placement.
 * @param runs The prepared lines and local baselines.
 * @param box The box their coordinates are relative to.
 * @param palette The selected theme.
 * @returns SVG text elements.
 */
function paintTextRuns(runs: readonly TextRun[], box: Box, palette: Palette): string {
	return lines(
		runs.map((run) =>
			textNode(
				{
					"xml:space": "preserve",
					x: coord(box.x + run.x),
					y: coord(box.y + run.y),
					fill:
						run.role === "title"
							? palette.foreground
							: run.role === "label"
								? palette.pillText
								: palette.muted,
					...fontAttributes(run.font),
					"font-size": run.fontSize,
				},
				run.text,
			),
		),
	);
}

/**
 * Paint one measured card with its kind glyph and semantic change treatment.
 * @param placed Final card geometry and prepared text.
 * @param palette The selected theme.
 * @param standing Its change relative to the predecessor.
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
	const chipX = box.x + 16;
	const chipY = box.y + 16;
	return wrap(
		"g",
		{ ...subjectGroup("node", measured.node.id, standing), ...appearanceAttributes(appearance) },
		lines([
			halo(box, CARD_RADIUS, styles),
			tag("rect", {
				x: coord(box.x),
				y: coord(box.y),
				width: coord(box.width),
				height: coord(box.height),
				rx: CARD_RADIUS,
				...styles.card,
				...bodyAttributes(appearance, palette),
				...standingOutline(standing, palette),
			}),
			typeChip(chipX, chipY, appearance, palette),
			paintTextRuns(measured.runs, box, palette),
			standingPin(box, standing, palette),
			warningBadge(box, unsettled, palette),
		]),
	);
}

/**
 * Paint a containing frame below its children and all connections.
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
	const { measured, box } = placed;
	const styles = stylesFor(palette);
	return wrap(
		"g",
		{ ...subjectGroup("region", measured.node.id, standing), ...appearanceAttributes(appearance) },
		lines([
			halo(box, BAND_RADIUS, styles),
			tag("rect", {
				x: coord(box.x),
				y: coord(box.y),
				width: coord(box.width),
				height: coord(box.height),
				rx: BAND_RADIUS,
				...styles.band,
				...bodyAttributes(appearance, palette),
				...standingOutline(standing, palette),
			}),
			// The rule under the title: what the frame itself relates to leaves from
			// here, so such a line has a visible origin inside the frame.
			tag("line", {
				x1: coord(box.x),
				y1: coord(box.y + measured.headerHeight),
				x2: coord(box.x + box.width),
				y2: coord(box.y + measured.headerHeight),
				stroke: bodyAttributes(appearance, palette)["stroke"] ?? styles.band.stroke,
				"stroke-width": 1,
			}),
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
	return wrap(
		"g",
		{
			...subjectGroup("region", placed.measured.node.id, standing),
			...appearanceAttributes(appearance),
		},
		lines([
			typeChip(placed.box.x + 20, placed.box.y + 20, appearance, palette),
			paintTextRuns(placed.measured.runs, placed.box, palette),
			warningBadge(placed.box, unsettled, palette),
		]),
	);
}

export { paintTextRuns, paintMeasuredCard, paintMeasuredFrame, paintMeasuredHeader };

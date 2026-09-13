// Paint the measured words at supplied baselines. No fitting happens here.
import {
	CARD_RADIUS,
	BAND_RADIUS,
	ICON_CHIP_SIZE,
	ICON_CHIP_RADIUS,
} from "@/runtime/semantic-renderer/lib/design";
import type { DrawingNode, TextRun } from "@/runtime/semantic-renderer/lib/drawing";
import { coord, type Box } from "@/runtime/semantic-renderer/lib/geometry";
import { fontAttributes } from "@/runtime/semantic-renderer/lib/fonts";
import type { Palette } from "@/runtime/semantic-renderer/lib/theme";
import { iconColour } from "@/runtime/semantic-renderer/lib/group-colour";
import { halo } from "@/runtime/semantic-renderer/lib/svg/cards";
import { glyphGroup } from "@/runtime/semantic-renderer/lib/svg/icons";
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
 * @returns The card group.
 */
function paintMeasuredCard(
	placed: DrawingNode,
	palette: Palette,
	standing: SubjectStanding | undefined,
	unsettled: boolean,
): string {
	const { measured, box } = placed;
	const styles = stylesFor(palette);
	const ink = iconColour(measured.node, palette.ground);
	const chipX = box.x + 16;
	const chipY = box.y + 16;
	return wrap(
		"g",
		subjectGroup("node", measured.node.id, standing),
		lines([
			halo(box, CARD_RADIUS, styles),
			tag("rect", {
				x: coord(box.x),
				y: coord(box.y),
				width: coord(box.width),
				height: coord(box.height),
				rx: CARD_RADIUS,
				...styles.card,
				...standingOutline(standing, palette),
			}),
			tag("rect", {
				x: coord(chipX),
				y: coord(chipY),
				width: ICON_CHIP_SIZE,
				height: ICON_CHIP_SIZE,
				rx: ICON_CHIP_RADIUS,
				fill: ink,
				"fill-opacity": 0.14,
				stroke: ink,
				"stroke-width": 1,
				"stroke-opacity": 0.45,
			}),
			glyphGroup(
				measured.node.kind,
				chipX + ICON_CHIP_SIZE / 2,
				chipY + ICON_CHIP_SIZE / 2,
				styles,
				ink,
			),
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
 * @returns The frame group.
 */
function paintMeasuredFrame(
	placed: DrawingNode,
	palette: Palette,
	standing: SubjectStanding | undefined,
): string {
	const { measured, box } = placed;
	const styles = stylesFor(palette);
	return wrap(
		"g",
		subjectGroup("region", measured.node.id, standing),
		lines([
			halo(box, BAND_RADIUS, styles),
			tag("rect", {
				x: coord(box.x),
				y: coord(box.y),
				width: coord(box.width),
				height: coord(box.height),
				rx: BAND_RADIUS,
				...styles.band,
				...standingOutline(standing, palette),
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
 * @returns The header group.
 */
function paintMeasuredHeader(
	placed: DrawingNode,
	palette: Palette,
	standing: SubjectStanding | undefined,
	unsettled: boolean,
): string {
	return wrap(
		"g",
		subjectGroup("region", placed.measured.node.id, standing),
		lines([
			paintTextRuns(placed.measured.runs, placed.box, palette),
			warningBadge(placed.box, unsettled, palette),
		]),
	);
}

export { paintTextRuns, paintMeasuredCard, paintMeasuredFrame, paintMeasuredHeader };

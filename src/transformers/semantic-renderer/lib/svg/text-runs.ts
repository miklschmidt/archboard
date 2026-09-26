// Measured lines painted where measurement placed them. No fitting happens here.
import type { TextRun } from "@/transformers/semantic-renderer/lib/drawing";
import { coord, type Box } from "@/transformers/semantic-renderer/lib/geometry";
import { fontAttributes } from "@/transformers/semantic-renderer/lib/fonts";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import { lines, textNode } from "@/transformers/semantic-renderer/lib/svg/primitives";

/**
 * Emit measured lines without changing their content, font or placement.
 * @param runs The prepared lines and local baselines.
 * @param box The box their coordinates are relative to.
 * @param palette The selected theme.
 * @param fill An ink for every line in place of its role's, if any.
 * @returns SVG text elements.
 */
function paintTextRuns(
	runs: readonly TextRun[],
	box: Box,
	palette: Palette,
	fill?: string,
): string {
	return lines(
		runs.map((run) =>
			textNode(
				{
					"xml:space": "preserve",
					x: coord(box.x + run.x),
					y: coord(box.y + run.y),
					fill: fill ?? inkOf(run, palette),
					...fontAttributes(run.font),
					"font-size": run.fontSize,
				},
				run.text,
			),
		),
	);
}

/**
 * The ink a measured line takes by its role.
 * @param run The line.
 * @param palette The selected theme.
 * @returns A title's, a label's or a note's ink.
 */
function inkOf(run: TextRun, palette: Palette): string {
	if (run.role === "title") return palette.foreground;
	return run.role === "label" ? palette.pillText : palette.muted;
}

export { paintTextRuns };

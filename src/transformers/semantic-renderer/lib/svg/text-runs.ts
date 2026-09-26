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

export { paintTextRuns };

// The warnings of the last code pass, drawn on the picture on screen.
//
// Only warnings. Information changes no exit status, puts no dot on the bell,
// and the canvas draws nothing for it (ADR 0045, ADR 0046); the selection tab
// lists it.

import { useLayoutEffect, useMemo } from "react";

import type { SemanticDrawing } from "#ui/architecture-drawing/canvas/picture/reads/clients/drawings.ts";
import { useCodeFindings } from "#ui/architecture-drawing/canvas/picture/hooks/use-code-findings.ts";
import type { StagedPicture } from "#ui/architecture-drawing/canvas/picture/transitions/hooks/use-picture-transition.ts";
import { markCodeWarnings } from "#ui/architecture-drawing/canvas/picture/reads/clients/code-marks.ts";

/**
 * Keep the code check's warnings on the picture on screen.
 *
 * Before paint, as the viewer's other marks are, so a picture put up fresh is
 * never seen for a frame without them.
 * @param picture The picture on the surface, or null while there is none.
 * @param drawing What the picture is of.
 */
function useCodeMarks(picture: StagedPicture | null, drawing: SemanticDrawing): void {
	const reading = useCodeFindings({
		model: drawing.model,
		variant: drawing.variant.id,
		version: drawing.version,
	});
	const warned = useMemo(
		() =>
			new Set(
				(reading?.findings ?? [])
					.filter((finding) => finding.severity === "warning")
					.flatMap((finding) => (finding.subject === undefined ? [] : [finding.subject.id])),
			),
		[reading],
	);
	useLayoutEffect(() => {
		if (picture !== null) markCodeWarnings(picture, warned);
	}, [picture, warned]);
}

export { useCodeMarks };

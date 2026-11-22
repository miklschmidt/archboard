// Pointing at a line or a card plays its effect once: the line's own, or that of every line that
// touches the card. Nothing moves until the pointer rests, and nothing moves for a reader who asked
// for no motion; the still marks carry the whole meaning.

import { useEffect } from "react";

import { stageOf } from "#ui/architecture-drawing/canvas/picture/transitions/clients/picture-stage.ts";
import type { StagedPicture } from "#ui/architecture-drawing/canvas/picture/transitions/hooks/use-picture-transition.ts";

/** A drawn line, by its id and its two ends. */
interface PointedLine {
	readonly line: { readonly id: string; readonly from: string; readonly to: string };
}

/**
 * The lines that pointing at a part plays: the line itself, or every line at a card.
 * @param lines The lines the picture draws.
 * @param part The part the pointer rests on.
 * @returns Their ids.
 */
function pointedLines(lines: readonly PointedLine[], part: string): readonly string[] {
	if (lines.some(({ line }) => line.id === part)) return [part];
	return lines.filter(({ line }) => line.from === part || line.to === part).map(({ line }) => line.id);
}

/**
 * Play the effect of what the pointer comes to rest on, once each time it arrives.
 * @param picture The picture on the surface, or null while there is none.
 * @param lines The lines the picture draws.
 * @param resting The part the pointer rests on, or null.
 * @param reducedMotion Whether the reader asked for no motion.
 */
function usePointedEffects(
	picture: StagedPicture | null,
	lines: readonly PointedLine[],
	resting: string | null,
	reducedMotion: boolean,
): void {
	useEffect(() => {
		if (picture === null || resting === null || reducedMotion) return;
		stageOf(picture.surface)?.playEffects(pointedLines(lines, resting));
	}, [picture, lines, resting, reducedMotion]);
}

export { pointedLines, usePointedEffects };

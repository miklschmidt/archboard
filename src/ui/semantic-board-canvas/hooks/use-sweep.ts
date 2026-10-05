// Drawing on the relationships a poke lights, each time the lighting changes.

import { useLayoutEffect, useRef } from "react";

import { EXPLORING_MS } from "@/shared/timing/timing";
import type { StagedPicture } from "@/ui/semantic-board-canvas/hooks/use-picture-transition";
import { sweepLines } from "@/ui/semantic-board-canvas/lib/picture-sweep";

/**
 * The subjects in one set and not in another.
 * @param now The set.
 * @param before The other, or null for none.
 * @returns What is new.
 */
function newIn(now: ReadonlySet<string>, before: ReadonlySet<string> | null): ReadonlySet<string> {
	return before === null ? now : new Set([...now].filter((id) => !before.has(id)));
}

/**
 * Draw on the relationships a picture newly lights, once, when they light, and
 * take the sweep away when the lighting changes or the picture does. What was
 * lit before and still is stays as it is. Before paint, so the first frame of
 * the light is the first of the sweep.
 * @param picture The picture on the surface, or null while there is none.
 * @param light The subjects the picture lights, or null for no lighting.
 * @param reach How many hops beyond the first each subject a trace reached is, or null without one.
 * @param reducedMotion Whether the person asked for no motion, which lights at once.
 */
function useSweep(
	picture: StagedPicture | null,
	light: ReadonlySet<string> | null,
	reach: ReadonlyMap<string, number> | null,
	reducedMotion: boolean,
): void {
	const lastLight = useRef<ReadonlySet<string> | null>(null);
	useLayoutEffect(() => {
		const before = lastLight.current;
		lastLight.current = light;
		if (
			picture === null ||
			light === null ||
			reducedMotion ||
			!(picture.root instanceof SVGElement)
		) {
			return undefined;
		}
		/**
		 * How long a relationship waits: one hop's time for each hop beyond the first.
		 * @param id The relationship.
		 * @returns The wait, in milliseconds.
		 */
		const wait = (id: string): number => ((reach?.get(id) ?? 1) - 1) * EXPLORING_MS.reachHop;
		return sweepLines(picture.root, newIn(light, before), wait);
	}, [picture, light, reach, reducedMotion]);
}

export { useSweep };

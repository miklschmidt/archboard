// The clock a page of exchanges is told on, and the dots that keep it.
//
// Forked from PR Lens's `svg/dataflow.ts` along with the rest of the grammar,
// and pulled out of it because it is the one part that is about time rather
// than about where anything goes: one cycle for the whole drawing, divided into
// as many turns as there are dots to send, each message holding its dot still
// until its own turn comes round.

import { FLOW_PULSE_RAMP } from "@/shared/timing/timing";
import type { PlacedStep } from "@/transformers/semantic-renderer/lib/layout/dataflow";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import { lines } from "@/transformers/semantic-renderer/lib/svg/primitives";
import {
	timedPulse,
	PULSE_RADIUS,
	TRAIN_RADIUS,
} from "@/transformers/semantic-renderer/lib/svg/pulse";
import type { SubjectStanding } from "@/transformers/semantic-renderer/lib/svg/standing";
import { lineColour } from "@/transformers/semantic-renderer/lib/svg/styles";

/**
 * The drawing's clock, which every message on the page shares.
 *
 * One clock, not one per flow: a page of exchanges is read in the order the
 * flows are stated, and a clock each would have them all crossing at once.
 */
interface Crossing {
	/** How long one turn of the whole clock takes, in seconds. */
	readonly cycle: number;
	/** How many turns it is divided into, across every flow drawn. */
	readonly turns: number;
	/**
	 * How the message whose dots these are stands, when it moved.
	 *
	 * Carried with the clock rather than passed beside it because a dot is drawn
	 * in its line's ink and its line's ink is its standing's: one question, asked
	 * in one place.
	 */
	readonly standing?: SubjectStanding | undefined;
}

/**
 * The dots one message sends, each waiting its own turn on the shared clock.
 * @param placed The message and the turn it was given.
 * @param path The line its dots ride.
 * @param palette The theme's colours.
 * @param crossing The drawing's clock.
 * @returns The markup, or nothing when this message sends no dot.
 */
function timedCrossings(
	placed: PlacedStep,
	path: string,
	palette: Palette,
	crossing: Crossing,
): string {
	const { cycle, turns } = crossing;
	if (turns === 0 || placed.slot.count === 0) {
		return "";
	}
	const width = 1 / turns;
	const colour = lineColour(palette, crossing.standing);
	const radius = placed.slot.count > 1 ? TRAIN_RADIUS : PULSE_RADIUS;
	return lines(
		Array.from({ length: placed.slot.count }, (_, index) => {
			const start = (placed.slot.start + index) * width;
			return timedPulse({ path, colour, radius }, cycle, {
				start,
				finish: start + width,
				ramp: width * FLOW_PULSE_RAMP,
			});
		}),
	);
}

export { type Crossing, timedCrossings };

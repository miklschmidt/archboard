// The clock a page of exchanges is told on, and the pulses that keep it.
//
// Forked from PR Lens's `svg/dataflow.ts` along with the rest of the grammar,
// and pulled out of it because it is the one part that is about time rather
// than about where anything goes: one cycle for the whole drawing, in which
// every message takes its turn to send a pulse, and a message waits until the
// one before it has arrived. The pulse is the one an architecture's lines carry
// (`pulse.ts`), and it flies at the same speed on every message, so a long
// message takes longer than a short one, as a long line does.

import { DEFAULT_TRAFFIC_SPEED } from "@/shared/semantic-board/index";
import { FLOW_CYCLE_CAP_MS } from "@/shared/timing/timing";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import { lines } from "@/transformers/semantic-renderer/lib/svg/primitives";
import {
	PULSE_LENGTH,
	crossingPulse,
	pulseLook,
	type Ride,
} from "@/transformers/semantic-renderer/lib/svg/pulse";
import type { SubjectStanding } from "@/transformers/semantic-renderer/lib/svg/standing";
import { PULSE_PACE } from "@/transformers/semantic-renderer/lib/svg/traffic-relay";
import {
	fullLineColour,
	lineColour,
	STROKE_WIDTH,
} from "@/transformers/semantic-renderer/lib/svg/styles";
import { STEP_WEIGHT } from "@/transformers/semantic-renderer/lib/sequence-design";

/**
 * The drawing's clock, which every message on the page shares.
 *
 * One clock, not one per flow: a page of exchanges is read in the order the
 * flows are stated, and a clock each would have them all crossing at once.
 */
interface Crossing {
	/** How long one turn of the whole clock takes, in seconds. */
	readonly cycle: number;
	/** How fast every pulse flies, in diagram units a second. */
	readonly speed: number;
	/**
	 * When each turn's pulse leaves the start of its line, in seconds into the
	 * cycle, in the order the turns are taken.
	 */
	readonly starts: readonly number[];
	/**
	 * How the message whose pulses these are stands, when it moved.
	 *
	 * Carried with the clock rather than passed beside it because a pulse is drawn
	 * in its line's ink and its line's ink is its standing's: one question, asked
	 * in one place.
	 */
	readonly standing?: SubjectStanding | undefined;
}

/**
 * The clock for a drawing whose turns cross lines of some lengths, in the order
 * they are taken. Each pulse flies at the pace of a relationship's default
 * traffic, so a sequence and an architecture move at the same speed, unless
 * that would make the whole exchange take longer than a reader will wait for
 * it to come round again: then every pulse flies faster by the same amount.
 * @param lengths How long the line of each turn is, in the order the turns are taken.
 * @returns The clock, which has no turns for a drawing where nothing crosses.
 */
function exchangeClock(lengths: readonly number[]): Crossing {
	const distance = lengths.reduce((sum, length) => sum + length, 0) + PULSE_LENGTH;
	const speed = Math.max(DEFAULT_TRAFFIC_SPEED * PULSE_PACE, distance / (FLOW_CYCLE_CAP_MS / 1000));
	let along = 0;
	const starts = lengths.map((length) => {
		const start = along / speed;
		along += length;
		return start;
	});
	return { cycle: distance / speed, speed, starts };
}

/**
 * The pulses one message sends, each waiting its own turn on the shared clock.
 * @param turn Which turn of the clock the message's first pulse takes, and how many it sends.
 * @param turn.start The turn of the first.
 * @param turn.count How many pulses it sends.
 * @param ride The line its pulses ride.
 * @param palette The theme's colours.
 * @param crossing The drawing's clock.
 * @returns The markup, or nothing when this message sends no pulse.
 */
function timedCrossings(
	turn: { readonly start: number; readonly count: number },
	ride: Ride,
	palette: Palette,
	crossing: Crossing,
): string {
	const { cycle, speed, starts } = crossing;
	const look = pulseLook(
		fullLineColour(palette, crossing.standing),
		{ lineColour: lineColour(palette, crossing.standing), lineWidth: STROKE_WIDTH[STEP_WEIGHT] },
		palette,
	);
	return lines(
		Array.from({ length: turn.count }, (_, index) =>
			crossingPulse({ look, ride, speed, cycle, start: starts[turn.start + index] ?? 0 }),
		),
	);
}

export { exchangeClock, timedCrossings, type Crossing };

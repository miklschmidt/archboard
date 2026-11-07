// How the orb flies between its homes, as a pure function of where it started,
// where it is going and how far along it is, so the stage only has to ask it once
// per frame.
//
// The orb lifts off, crosses the page and settles. It rises a little above the
// straight line between its homes and is drawn a little larger at the top of the
// flight, so it reads as carried over the picture and not slid across it, and the
// easing is slow to leave and slow to arrive, so neither end is a jolt. A flight
// starts exactly where the orb was and ends exactly on its home, whatever it did
// on the way.

/** Where the orb is: the middle of its holder in the viewport, and how large it is drawn. */
interface Spot {
	readonly x: number;
	readonly y: number;
	/** 1 is the size it has at rest in a home. */
	readonly scale: number;
}

/** How far the orb rises above the line between its homes, as a share of the distance, and at most. */
const LIFT = 0.06;
const LIFT_MAX_PX = 48;
/** How much larger the orb is drawn at the top of the flight. */
const SWELL = 0.1;
/** The easing: slow to leave, quick across, soft to arrive. A cubic Bézier through (0.4, 0) and (0.12, 1). */
const EASE_X1 = 0.4;
const EASE_Y1 = 0;
const EASE_X2 = 0.12;
const EASE_Y2 = 1;
/** How many halvings find where on the curve a moment is: the answer is good to a millionth. */
const SOLVE_STEPS = 20;

/**
 * One coordinate of a cubic Bézier curve from 0 to 1.
 * @param first The first control point's coordinate.
 * @param second The second control point's coordinate.
 * @param along How far along the curve, 0..1.
 * @returns The coordinate there.
 */
function bezier(first: number, second: number, along: number): number {
	const rest = 1 - along;
	return 3 * rest * rest * along * first + 3 * rest * along * along * second + along ** 3;
}

/**
 * How far along the flight the orb has got, for how much of its time has passed.
 * @param time How much of the flight's time has passed, 0..1.
 * @returns How much of the way it has gone, 0..1.
 */
function eased(time: number): number {
	let low = 0;
	let high = 1;
	for (let step = 0; step < SOLVE_STEPS; step += 1) {
		const middle = (low + high) / 2;
		if (bezier(EASE_X1, EASE_X2, middle) < time) low = middle;
		else high = middle;
	}
	return bezier(EASE_Y1, EASE_Y2, (low + high) / 2);
}

/**
 * Where the orb is part of the way through a flight.
 * @param from Where it left.
 * @param to Where its home is now: read again on every frame, so a home that is
 * itself moving is met.
 * @param progress How much of the flight's time has passed. Anything before 0 is the departure
 * and anything past 1 is the arrival, both exactly.
 * @returns The orb's spot.
 */
function flightAt(from: Spot, to: Spot, progress: number): Spot {
	if (progress <= 0) return from;
	if (progress >= 1) return to;
	const way = eased(progress);
	const lift = Math.min(LIFT_MAX_PX, Math.hypot(to.x - from.x, to.y - from.y) * LIFT);
	const rise = Math.sin(Math.PI * way);
	return {
		x: from.x + (to.x - from.x) * way,
		y: from.y + (to.y - from.y) * way - lift * rise,
		scale: from.scale + (to.scale - from.scale) * way + SWELL * rise,
	};
}

export { flightAt, type Spot };

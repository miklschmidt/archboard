// Where a tip stands.
//
// The pointer rests on a part to read it and to see what it touches, so a tip
// belongs against that part and must leave what the part lights in view. Each
// spot round the part is weighed by what it would hide and how far it strays,
// and the cheapest wins. On open ground a tip stands against its part. On a
// dense picture it hides dim parts first, then a stretch of lit line, and it
// strays only so far. The same picture and the same part always give the same
// spot, at any zoom.

/** A box on the screen. */
type ScreenBox = Pick<DOMRectReadOnly, "left" | "top" | "right" | "bottom">;

/** Something drawn that a tip would hide. */
interface TipGround {
	readonly box: ScreenBox;
	/** What hiding all of it costs. */
	readonly worth: number;
}

/** What decides a tip's spot. */
interface TipSpotInputs {
	/** The part the tip is about. */
	readonly part: ScreenBox;
	/** How big the tip is. */
	readonly size: { readonly width: number; readonly height: number };
	/** The pane the tip stands in. */
	readonly pane: ScreenBox;
	/** What the tip would hide. */
	readonly ground: readonly TipGround[];
}

/** The top left corner of a tip, on the screen. */
interface TipSpot {
	readonly left: number;
	readonly top: number;
}

/**
 * What a stray costs: this, times the square of its distance. Against the worths
 * below, a tip strays about 45 px to spare a dim part, about 40 px to spare a
 * short stretch of lit line and about 230 px to spare a lit part.
 */
const STRAY_WORTH = 3;
/** What hiding a part the light leaves standing costs. */
const LIT_WORTH = 160_000;
/** What hiding any other drawn part costs. */
const DIM_WORTH = 6000;
/** What hiding one read along a lit line costs. */
const LINE_WORTH = 5000;
/** How far a tip keeps from its part, even when the pane presses it close. */
const PART_GAP = 10;
/** How far from its part a tip can stand, in steps outward. */
const GAPS = [PART_GAP, 32, 56, 80, 112, 144, 184, 224, 272, 320];
/** Where along a side of its part a tip can stand: 0 is centred, 1 is past the corner. */
const SLIDES = [0, -0.33, 0.33, -0.66, 0.66, -1, 1];
/** How far a tip keeps from the edge of its pane. */
const PANE_INSET = 12;

/**
 * Every spot round a part, nearest first and on the right before the left, below and above.
 * @param part The part.
 * @param size How big the tip is.
 * @returns The spots.
 */
function spotsRound(part: ScreenBox, size: TipSpotInputs["size"]): readonly TipSpot[] {
	const left = (part.left + part.right - size.width) / 2;
	const top = (part.top + part.bottom - size.height) / 2;
	const runX = (part.right - part.left + size.width) / 2;
	const runY = (part.bottom - part.top + size.height) / 2;
	return GAPS.flatMap((gap) =>
		SLIDES.flatMap((slide) => [
			{ left: part.right + gap, top: top + slide * runY },
			{ left: part.left - gap - size.width, top: top + slide * runY },
			{ left: left + slide * runX, top: part.bottom + gap },
			{ left: left + slide * runX, top: part.top - gap - size.height },
		]),
	);
}

/**
 * How a value sits between two limits, with the lower one winning a tip too big for its pane.
 * @param value The value.
 * @param low The lower limit.
 * @param high The upper limit.
 * @returns The value, within them.
 */
function within(value: number, low: number, high: number): number {
	return Math.max(low, Math.min(value, high));
}

/**
 * A spot moved in from the edge of the pane.
 * @param spot The spot.
 * @param inputs The tip's size and its pane.
 * @returns The spot inside the pane.
 */
function inPane(spot: TipSpot, inputs: TipSpotInputs): TipSpot {
	const { size, pane } = inputs;
	return {
		left: within(spot.left, pane.left + PANE_INSET, pane.right - PANE_INSET - size.width),
		top: within(spot.top, pane.top + PANE_INSET, pane.bottom - PANE_INSET - size.height),
	};
}

/**
 * How much of one box another hides.
 * @param tip The box in front.
 * @param box The box behind.
 * @returns The share of it that is hidden, from 0 to 1.
 */
function hiddenShare(tip: ScreenBox, box: ScreenBox): number {
	const width = Math.min(tip.right, box.right) - Math.max(tip.left, box.left);
	const height = Math.min(tip.bottom, box.bottom) - Math.max(tip.top, box.top);
	const area = (box.right - box.left) * (box.bottom - box.top);
	return width > 0 && height > 0 && area > 0 ? (width * height) / area : 0;
}

/**
 * How far apart two boxes stand.
 * @param a One box.
 * @param b The other.
 * @returns The straight distance between their nearest edges.
 */
function apart(a: ScreenBox, b: ScreenBox): number {
	return Math.hypot(
		Math.max(a.left - b.right, b.left - a.right, 0),
		Math.max(a.top - b.bottom, b.top - a.bottom, 0),
	);
}

/**
 * What a spot costs: what it hides, its part and the gap round it at the price of something lit, and how far it strays.
 * @param spot The spot.
 * @param inputs What decides the tip's spot.
 * @returns The cost.
 */
function costOf(spot: TipSpot, inputs: TipSpotInputs): number {
	const { part, size, ground } = inputs;
	const box = {
		...spot,
		right: spot.left + size.width,
		bottom: spot.top + size.height,
	};
	const kept = {
		left: part.left - PART_GAP,
		top: part.top - PART_GAP,
		right: part.right + PART_GAP,
		bottom: part.bottom + PART_GAP,
	};
	const hidden = ground.reduce((sum, one) => sum + one.worth * hiddenShare(box, one.box), 0);
	return hidden + LIT_WORTH * hiddenShare(box, kept) + STRAY_WORTH * apart(box, part) ** 2;
}

/**
 * The cheapest spot for a tip.
 * @param inputs The part, the tip's size, its pane and what it would hide.
 * @returns Where its top left corner stands on the screen.
 */
function tipSpot(inputs: TipSpotInputs): TipSpot {
	const spots = spotsRound(inputs.part, inputs.size).map((spot) => inPane(spot, inputs));
	const costs = spots.map((spot) => costOf(spot, inputs));
	return (
		spots[costs.indexOf(Math.min(...costs))] ?? { left: inputs.pane.left, top: inputs.pane.top }
	);
}

export { DIM_WORTH, LINE_WORTH, LIT_WORTH, tipSpot, type ScreenBox, type TipGround, type TipSpot };

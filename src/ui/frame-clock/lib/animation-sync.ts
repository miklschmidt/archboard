// Standing the browser's own animations where a stepped clock says they are.
//
// An animation is adopted the first time the clock sees it, at the clock's
// time then, which is the frame it began in. From there it is paused and set to
// how far it has run since. Past its end it is finished once, so whatever waits
// for it to finish, a ghost that removes itself, still does. One that never
// ends only ever runs on.

/** An animation the browser runs, as far as the clock drives it. */
type DrivenAnimation = Pick<Animation, "playbackRate" | "currentTime" | "pause" | "finish"> & {
	/** The timeline it runs on, told apart from the document's by identity alone. */
	readonly timeline: object | null;
	readonly effect: Pick<AnimationEffect, "getComputedTiming"> | null;
};

/** A picture's root, as far as the clock drives its own animation clock. */
type DrivenPicture = Pick<SVGSVGElement, "pauseAnimations" | "setCurrentTime"> & {
	/** The picture it is drawn inside, whose clock is its clock; null for an outermost one. */
	readonly ownerSVGElement: object | null;
};

/** Where a picture's clock was last stood, and when. */
interface SvgAdoption {
	/** Where it was stood, in seconds. */
	readonly base: number;
	/** The clock's time then, in milliseconds. */
	readonly at: number;
}

/** What a stepped clock knows about the animations it has seen. */
interface AnimationBook {
	/** The clock's time, in milliseconds. */
	readonly now: number;
	/** The timeline animations must run on to be driven. */
	readonly timeline: object;
	/** When each animation was first seen. */
	readonly animations: WeakMap<DrivenAnimation, number>;
	/** The animations already finished. */
	readonly finished: WeakSet<DrivenAnimation>;
}

/**
 * Where an animation ends, when it ends at all.
 * @param animation The animation.
 * @returns Its end in its own time, in milliseconds, or null for one that runs on.
 */
function endOf(animation: DrivenAnimation): number | null {
	const end = animation.effect?.getComputedTiming().endTime;
	return typeof end === "number" && Number.isFinite(end) ? end : null;
}

/**
 * Stand one animation where the clock says it is.
 * @param animation The animation.
 * @param book What the clock knows.
 * @returns What moved outside the clock, or null.
 */
function syncAnimation(animation: DrivenAnimation, book: AnimationBook): string | null {
	if (book.finished.has(animation)) return null;
	if (animation.timeline !== book.timeline) {
		return "An animation runs on a timeline the frame clock does not drive.";
	}
	const adopted = book.animations.get(animation) ?? book.now;
	book.animations.set(animation, adopted);
	animation.pause();
	const ran = (book.now - adopted) * animation.playbackRate;
	const end = endOf(animation);
	if (end !== null && ran >= end) {
		book.finished.add(animation);
		animation.finish();
		return null;
	}
	animation.currentTime = ran;
	return null;
}

/**
 * Stand a picture's own animation clock where the stepped clock says it is.
 * @param root The picture's root.
 * @param adoption Where its clock was last stood, and when.
 * @param now The clock's time, in milliseconds.
 */
function syncPicture(root: DrivenPicture, adoption: SvgAdoption, now: number): void {
	root.pauseAnimations();
	root.setCurrentTime(adoption.base + (now - adoption.at) / 1000);
}

export { syncAnimation, syncPicture, type DrivenAnimation, type DrivenPicture, type SvgAdoption };

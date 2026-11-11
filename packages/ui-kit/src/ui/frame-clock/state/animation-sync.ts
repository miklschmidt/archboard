// Standing the browser's own animations where a stepped clock says they are.
//
// An animation is adopted the first time the clock sees it, at the clock's
// time then, which is the frame it began in. From there it is paused and set to
// how far it has run since. Past its end it is finished once, so whatever waits
// for it to finish, a ghost that removes itself, still does. One that never
// ends only ever runs on. The first sight is the frame it began in only while the document's
// own timeline stands still, as the recorder holds it; on a running one, an animation can end
// before the clock sees it.

/** An animation the browser runs, as far as the clock drives it. */
type DrivenAnimation = Pick<Animation, "playbackRate" | "currentTime" | "pause" | "finish"> & {
	/** The timeline it runs on, told apart from the document's by identity alone. */
	readonly timeline: object | null;
	readonly effect: Pick<AnimationEffect, "getComputedTiming"> | null;
};

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

/** What a stepped clock says when an animation runs where it cannot stand it. */
const ELSEWHERE = "An animation runs on a timeline the frame clock does not drive.";

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
	if (animation.timeline !== book.timeline) return ELSEWHERE;
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

export { syncAnimation, type DrivenAnimation };

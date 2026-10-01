// Standing the browser's own animations where a stepped clock says they are.
//
// An animation is adopted the first time the clock sees it, at the clock's
// time then, which is the frame it began in. From there it is paused and set to
// how far it has run since. Past its end it is finished once, so whatever waits
// for it to finish, a ghost that removes itself, still does. One that never
// ends only ever runs on.
//
// A picture's traffic runs on its picture's own clock instead, which is carried
// from where it was last stood: a copy of a picture runs on as the one it
// replaced did, rather than starting its traffic again.

/** An element an animation moves, as far as the clock finds the picture it is drawn in. */
interface DrivenElement {
	/** The picture it is drawn inside: null for an outermost picture, absent outside any picture. */
	readonly ownerSVGElement?: DrivenElement | null;
}

/** An animation the browser runs, as far as the clock drives it. */
type DrivenAnimation = Pick<
	Animation,
	"id" | "playbackRate" | "currentTime" | "pause" | "finish"
> & {
	/** The timeline it runs on, told apart from the document's by identity alone. */
	readonly timeline: object | null;
	readonly effect:
		| (Pick<AnimationEffect, "getComputedTiming"> & {
				/** What it moves, when it moves an element. */
				readonly target?: DrivenElement | null;
		  })
		| null;
};

/** Where a picture's clock was last stood, and when. */
interface PictureAdoption {
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
 * The outermost picture an element is drawn in.
 * @param element The element, if any.
 * @returns The picture's root, or null when the element is in no picture.
 */
function pictureOf(element: DrivenElement | null | undefined): DrivenElement | null {
	if (element?.ownerSVGElement === undefined) return null;
	let root = element;
	while (root.ownerSVGElement) root = root.ownerSVGElement;
	return root;
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

/**
 * Stand one animation of a picture's traffic where its picture's clock says it is.
 * @param animation The animation.
 * @param adoption Where its picture's clock was last stood, and when.
 * @param book What the clock knows.
 * @returns What moved outside the clock, or null.
 */
function syncPictureAnimation(
	animation: DrivenAnimation,
	adoption: PictureAdoption,
	book: Pick<AnimationBook, "now" | "timeline">,
): string | null {
	if (animation.timeline !== book.timeline) return ELSEWHERE;
	animation.pause();
	animation.currentTime = adoption.base * 1000 + (book.now - adoption.at);
	return null;
}

export {
	pictureOf,
	syncAnimation,
	syncPictureAnimation,
	type DrivenAnimation,
	type DrivenElement,
	type PictureAdoption,
};

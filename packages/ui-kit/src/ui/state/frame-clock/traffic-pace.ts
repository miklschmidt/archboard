// The pace of a picture's traffic while the camera moves.
//
// Moving traffic paints its lines again on every frame, and a camera that is
// being dragged or eased already asks for every frame, more of them the closer
// it is. So the traffic stands still for as long as the camera moves, and once
// the camera has rested it does not jump back to its speed: it starts as a creep
// and gathers speed, so a line that was still is seen to wake up.
//
// Only what was running stops, and only that runs again, so traffic that had
// finished does not start over and an animation that is not traffic, a picture's
// flight for one, is never touched.

import { PICTURE_CLOCK, frameClock } from "#ui/state/frame-clock/clock.ts";

/** An animation, reduced to what pacing it touches. */
type TrafficAnimation = Pick<Animation, "id" | "playState" | "playbackRate" | "pause" | "play">;

/** An element around pictures, as pacing their traffic reads it. */
interface TrafficHolder {
	readonly getAnimations?: (options?: GetAnimationsOptions) => readonly TrafficAnimation[];
}

/** How the traffic of the pictures in an element is paced. */
interface TrafficPace {
	/** Stand the traffic still, and keep it so until it is resumed. Standing it still again changes nothing. */
	readonly hold: () => void;
	/**
	 * Bring the held traffic back to its speed, from standing still, easing in and
	 * out. Holding it again takes it back from wherever it had got to.
	 * @param ms How long it takes to reach its speed.
	 */
	readonly resume: (ms: number) => void;
	/** Let the held traffic go at its speed at once. */
	readonly release: () => void;
}

/** Do nothing. */
function idle(): void {
	// Where no browser can list animations there is nothing to pace.
}

/** Pacing nothing. */
const NO_PACE: TrafficPace = Object.freeze({
	hold: idle,
	resume: idle,
	release: idle,
});

/**
 * How fast traffic runs, as a share of its speed, a share of the way through
 * coming back: nothing at first, full at the end, and steady at both.
 * @param progress How far through, 0 to 1.
 * @returns The share of its speed.
 */
function paceAt(progress: number): number {
	return progress * progress * (3 - 2 * progress);
}

/**
 * The traffic running in an element.
 * @param root The element around the pictures.
 * @returns It.
 */
function runningTraffic(root: TrafficHolder): readonly TrafficAnimation[] {
	return (root.getAnimations?.({ subtree: true }) ?? []).filter(
		(animation) => animation.id === PICTURE_CLOCK && animation.playState === "running",
	);
}

/**
 * Pace the traffic of the pictures in an element.
 * @param root The element around the pictures.
 * @returns How to hold it still, bring it back and let it go.
 */
function paceTraffic(root: TrafficHolder): TrafficPace {
	if (typeof root.getAnimations !== "function") return NO_PACE;
	// What a hold stopped, kept until it runs at its speed again.
	let held: readonly TrafficAnimation[] = [];
	let holding = false;
	let coming: number | null = null;

	/** Stop bringing the traffic back. */
	const stopComing = (): void => {
		if (coming === null) return;
		frameClock().cancelFrame(coming);
		coming = null;
	};

	/** Run the held traffic at its speed. */
	const letGo = (): void => {
		for (const animation of held) {
			animation.playbackRate = 1;
			if (animation.playState === "paused") animation.play();
		}
		held = [];
	};

	/** Stand the traffic still. */
	const hold = (): void => {
		if (holding) return;
		holding = true;
		stopComing();
		// What runs now, traffic still being brought back included. Read afresh, as
		// the picture may have been put up again since the last hold.
		held = runningTraffic(root);
		for (const animation of held) animation.pause();
	};

	/**
	 * Bring the held traffic back to its speed.
	 * @param ms How long it takes.
	 */
	const resume = (ms: number): void => {
		if (!holding) return;
		holding = false;
		held = held.filter((animation) => animation.playState === "paused");
		const clock = frameClock();
		if (!clock.animates || ms <= 0 || held.length === 0) {
			letGo();
			return;
		}
		for (const animation of held) {
			animation.playbackRate = 0;
			animation.play();
		}
		const began = clock.now();
		/**
		 * Set the pace of one frame, and ask for the next until the traffic is at its speed.
		 * @param now The frame's time.
		 */
		const step = (now: number): void => {
			const progress = Math.min(1, Math.max(0, (now - began) / ms));
			for (const animation of held) animation.playbackRate = paceAt(progress);
			if (progress < 1) {
				coming = clock.requestFrame(step);
				return;
			}
			coming = null;
			held = [];
		};
		coming = clock.requestFrame(step);
	};

	/** Let the traffic go at its speed at once. */
	const release = (): void => {
		stopComing();
		holding = false;
		letGo();
	};

	return { hold, resume, release };
}

export { paceTraffic, type TrafficPace };

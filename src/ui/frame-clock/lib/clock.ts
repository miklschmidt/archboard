// The clock that moves what a board's pane draws over time.
//
// A camera glide, a picture's flight, a subtitle that lingers and a picture's
// traffic all move with time. In the page they run on the browser's clocks. A
// recording renders its picture frame by frame, so there they run on a clock
// the renderer steps one frame at a time, and nothing that moves may read the
// browser's clocks behind its back. This is the one seam: whatever moves asks
// this clock, and a page that renders frames swaps it once, at start, before
// anything is mounted.

/** The clocks a moving picture runs on. */
interface FrameClock {
	/** Whether frames can be asked for at all; without them every move is a cut. */
	readonly animates: boolean;
	/**
	 * The time now.
	 * @returns Milliseconds, on the clock frames are stamped with.
	 */
	readonly now: () => number;
	/**
	 * Ask for the next frame.
	 * @param callback Run once, with the frame's time.
	 * @returns The request, to cancel it by.
	 */
	readonly requestFrame: (callback: (time: number) => void) => number;
	/**
	 * Take back a frame asked for.
	 * @param request The request.
	 */
	readonly cancelFrame: (request: number) => void;
	/**
	 * Run something once a while has passed.
	 * @param ms How long, in milliseconds.
	 * @param callback What to run.
	 * @returns The timer, to cancel it by.
	 */
	readonly after: (ms: number, callback: () => void) => number;
	/**
	 * Take back a timer.
	 * @param timer The timer.
	 */
	readonly cancelAfter: (timer: number) => void;
	/**
	 * Where a picture's own animation clock stands.
	 * @param root The picture's root.
	 * @returns Its time in seconds, or nothing where SVG does not animate.
	 */
	readonly svgTime: (root: SVGSVGElement) => number | undefined;
	/**
	 * Stand a picture's own animation clock somewhere.
	 * @param root The picture's root, in the page.
	 * @param seconds Where.
	 */
	readonly setSvgTime: (root: SVGSVGElement, seconds: number) => void;
}

/** The browser's own clocks, read when they are asked for, so a test can stand in for them. */
const browserClock: FrameClock = {
	/**
	 * Whether this browser can ask for frames.
	 * @returns True when it can.
	 */
	get animates(): boolean {
		return typeof requestAnimationFrame === "function" && typeof performance === "object";
	},
	/**
	 * The browser's time.
	 * @returns Milliseconds since the page began.
	 */
	now: () => performance.now(),
	/**
	 * Ask the browser for its next frame.
	 * @param callback Run with the frame's time.
	 * @returns The request.
	 */
	requestFrame: (callback) => requestAnimationFrame(callback),
	/**
	 * Take back a frame asked for.
	 * @param request The request.
	 */
	cancelFrame: (request) => {
		cancelAnimationFrame(request);
	},
	/**
	 * Run something after a while.
	 * @param ms How long, in milliseconds.
	 * @param callback What to run.
	 * @returns The timer.
	 */
	after: (ms, callback) => window.setTimeout(callback, ms),
	/**
	 * Take back a timer.
	 * @param timer The timer.
	 */
	cancelAfter: (timer) => {
		window.clearTimeout(timer);
	},
	/**
	 * Where a picture's own clock stands.
	 * @param root The picture's root.
	 * @returns Its time in seconds, or nothing where SVG does not animate.
	 */
	svgTime: (root) => ("getCurrentTime" in root ? root.getCurrentTime() : undefined),
	/**
	 * Stand a picture's own clock somewhere.
	 * @param root The picture's root.
	 * @param seconds Where.
	 */
	setSvgTime: (root, seconds) => {
		if ("setCurrentTime" in root) root.setCurrentTime(seconds);
	},
};

let current: FrameClock = browserClock;

/**
 * The clock moving pictures run on now.
 * @returns The clock.
 */
function frameClock(): FrameClock {
	return current;
}

/**
 * Run every moving picture on another clock from now on.
 * @param clock The clock.
 * @returns A way to go back to the clock it replaced.
 */
function driveFramesFrom(clock: FrameClock): () => void {
	const replaced = current;
	current = clock;
	return (): void => {
		current = replaced;
	};
}

export { driveFramesFrom, frameClock, type FrameClock };

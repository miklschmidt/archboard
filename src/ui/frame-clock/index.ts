// The clock that moves what a board's pane draws over time: the browser's own
// in the page, or one a renderer steps, swapped once at start.

export {
	PICTURE_CLOCK,
	driveFramesFrom,
	frameClock,
	holdTraffic,
	type FrameClock,
} from "@/ui/frame-clock/lib/clock";

// The clock that moves what a board's pane draws over time: the browser's own in the page, or a
// stepped clock that a renderer moves frame by frame, swapped once at start.
export { driveFramesFrom, frameClock, PICTURE_CLOCK } from "#ui/state/frame-clock/clock.ts";
export { createSteppedClock } from "#ui/state/frame-clock/stepped-clock.ts";
export type { SteppedClock } from "#ui/state/frame-clock/stepped-clock.ts";
export { paceTraffic } from "#ui/state/frame-clock/traffic-pace.ts";

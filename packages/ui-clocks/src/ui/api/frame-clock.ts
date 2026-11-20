// The clock that moves what a model's pane draws over time: the browser's own in the page, or a
// stepped clock that a renderer moves frame by frame, swapped once at start.
export { driveFramesFrom, frameClock } from "#ui/frame-clock/state/clock.ts";
export { createSteppedClock } from "#ui/frame-clock/state/stepped-clock.ts";
export type { SteppedClock } from "#ui/frame-clock/state/stepped-clock.ts";

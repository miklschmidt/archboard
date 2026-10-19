// The clock that moves what a board's pane draws over time: the browser's own in the page, or one a
// renderer steps, swapped once at start.
export { driveFramesFrom, frameClock, PICTURE_CLOCK } from "#ui/state/frame-clock/clock.ts";
export { paceTraffic } from "#ui/state/frame-clock/traffic-pace.ts";

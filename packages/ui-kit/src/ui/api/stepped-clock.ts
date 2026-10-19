// A clock that moves only when a renderer steps it: the page that renders a recording frame by frame
// drives every moving picture from it.
export { createSteppedClock } from "#ui/state/frame-clock/stepped-clock.ts";
export type { SteppedClock } from "#ui/state/frame-clock/stepped-clock.ts";

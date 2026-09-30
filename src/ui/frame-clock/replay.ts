// A clock that moves only when a renderer steps it, as a second entrypoint of
// the module: the page that renders a recording frame by frame drives every
// moving picture from it.

export {
	createSteppedClock,
	type ClockViolation,
	type SteppedClock,
} from "@/ui/frame-clock/lib/stepped-clock";

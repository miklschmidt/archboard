// The real page's motion, advanced frame by frame without waiting for a display refresh.
import { createSteppedClock } from "@archboard/ui-kit/frame-clock";

const clock = createSteppedClock(performance.now());
const channel = new MessageChannel();
let resume: (() => void) | undefined;
channel.port1.addEventListener("message", (): void => resume?.());
channel.port1.start();
clock.install(window);
Object.defineProperty(performance, "now", { value: () => clock.now(), configurable: true });

/** Yield to React and browser events without the nested timeout's four-millisecond clamp. */
function yieldTask(): Promise<void> {
	return new Promise((resolve) => {
		resume = resolve;
		channel.port2.postMessage(null);
	});
}

Object.assign(globalThis, {
	/**
	 * Advance every requested frame and document animation, with a task boundary between frames.
	 * @param ms The virtual time to advance.
	 * @returns Animations that the clock cannot drive.
	 */
	async __archboardStepMotion(ms: number) {
		const end = clock.now() + ms;
		while (clock.now() < end) {
			clock.syncAnimations(document);
			clock.advanceTo(Math.min(clock.now() + 16, end));
			clock.runFrame();
			await yieldTask();
			clock.syncAnimations(document);
		}
		return clock.violations();
	},
});

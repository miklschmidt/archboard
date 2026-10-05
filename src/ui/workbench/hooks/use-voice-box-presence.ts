// Whether the voice box is on the page. It arrives with the voice and stays mounted
// for as long as it takes to leave, so that it eases away with the flight of the orb
// out of it and is not cut from under it. The wait is on the frame clock, like every
// move over a pane's picture.

import { useEffect, useState } from "react";

import { frameClock } from "@/ui/frame-clock";

/**
 * Whether the box is mounted: from when it is wanted until it has left.
 * @param shown Whether the box is wanted.
 * @param leaveMs How long it takes to leave, which is none for a person who asked for no motion.
 * @returns True while it is on the page.
 */
function useVoiceBoxPresence(shown: boolean, leaveMs: number): boolean {
	const [mounted, setMounted] = useState(shown);
	if (shown && !mounted) setMounted(true);
	useEffect(() => {
		if (shown || !mounted) return undefined;
		const clock = frameClock();
		const timer = clock.after(leaveMs, () => {
			setMounted(false);
		});
		return (): void => {
			clock.cancelAfter(timer);
		};
	}, [shown, mounted, leaveMs]);
	return mounted;
}

export { useVoiceBoxPresence };

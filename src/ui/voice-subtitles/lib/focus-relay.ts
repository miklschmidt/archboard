// Keyboard focus that follows the subtitles control to its other place.
//
// There are two subtitles controls, one in the dock's voice line and one in the voice
// box, and pressing either moves the voice to the other's surface, which removes the
// control that was pressed. A person who pressed it from the keyboard must not be left
// on the page body, so the control that was pressed with focus hands it on, and the one
// that appears in its place takes it.

import { frameClock } from "@/ui/frame-clock";

/** How long a handed-on focus waits for a control to take it. */
const RELAY_MS = 1000;

/** Focus handed on, and the timer that takes it back if nobody takes it. */
const relay: { pending: boolean; timer: number | null } = { pending: false, timer: null };

/** Hand keyboard focus on to the next subtitles control that appears. */
function handFocusOn(): void {
	const clock = frameClock();
	if (relay.timer !== null) clock.cancelAfter(relay.timer);
	relay.pending = true;
	relay.timer = clock.after(RELAY_MS, () => {
		relay.pending = false;
		relay.timer = null;
	});
}

/**
 * Take the focus that was handed on, if any.
 * @returns True when a control with focus was replaced by this one.
 */
function takeFocusHandedOn(): boolean {
	const handed = relay.pending;
	relay.pending = false;
	return handed;
}

export { handFocusOn, takeFocusHandedOn };

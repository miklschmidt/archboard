// The parts of the pane a flight into a card happens on, and what ends it.
//
// While the camera flies into a card the stage draws the board it opens inside
// the card, and the fades of the flight (ADR 0071).

/** Which way the flight goes. */
type DiveWay = "in" | "out";

/** The viewport and the surface a flight happens on. */
interface Stage {
	readonly viewport: HTMLElement;
	readonly surface: HTMLElement;
}

/**
 * One of the parts of the pane that the camera is drawn through.
 * @param area The picture's area.
 * @param slot Which part.
 * @returns The element, or null when the area has none.
 */
function slotIn(area: HTMLElement | null, slot: string): HTMLElement | null {
	return area?.querySelector<HTMLElement>(`[data-slot='${slot}']`) ?? null;
}

/**
 * The viewport and surface of a pane that can be flown over.
 * @param area The picture's area, which holds the viewport.
 * @returns The stage, or null when there is none to fly over.
 */
function stageIn(area: HTMLElement | null): Stage | null {
	const viewport = slotIn(area, "canvas-viewport") ?? slotIn(area, "model-diagram");
	const surface = slotIn(area, "canvas-surface");
	if (viewport === null || surface === null) {
		return null;
	}
	return surface.querySelector(":scope > svg") === null ? null : { viewport, surface };
}

/** The keys that move focus or change what a key means, which a flight leaves to the reader. */
const LEAVES = new Set(["Tab", "Shift", "Control", "Alt", "Meta"]);

/** The inputs that end a flight at its destination. */
const INTERRUPTS = ["pointerdown", "wheel", "keydown"] as const;

/**
 * Let the reader end a flight at its destination with a press, a turn of the
 * wheel or a key, and keep that input from also reaching the picture under it.
 * @param viewport The viewport.
 * @param end Land the flight.
 * @returns Stop listening.
 */
function endOnInput(viewport: HTMLElement, end: () => void): () => void {
	/**
	 * End the flight and swallow the input.
	 * @param event The input.
	 */
	const swallow = (event: Event): void => {
		if (event instanceof KeyboardEvent && LEAVES.has(event.key)) {
			return;
		}
		event.preventDefault();
		event.stopImmediatePropagation();
		end();
	};
	for (const name of INTERRUPTS) viewport.addEventListener(name, swallow, { capture: true });
	return (): void => {
		for (const name of INTERRUPTS) viewport.removeEventListener(name, swallow, { capture: true });
	};
}

export { endOnInput, stageIn, type DiveWay, type Stage };

// A first picture's ink, kept back for a moment while its painter starts, so
// that the painter brings the picture in. A painter that takes longer finds the
// SVG standing, a correct board.

import { PICTURE_MS } from "@archboard/timing";
import { frameClock } from "@archboard/ui-kit/frame-clock";
import type { PictureHand } from "#ui/clients/semantic-board-canvas/picture/picture-stage-forms.ts";

/** The attribute on the surface while a first picture's ink waits for its painter. */
const INK_WAITS_ATTRIBUTE = "data-ink-waits";

/** The ink of a surface's first picture. */
class HeldInk {
	readonly #surface: HTMLElement;
	#timer: number | null = null;
	/** How the painter brings the picture in, while the ink waits for it. */
	arrive: PictureHand | null = null;

	/**
	 * Hold the ink of a surface.
	 * @param surface The surface.
	 */
	constructor(surface: HTMLElement) {
		this.#surface = surface;
	}

	/**
	 * Keep the ink back, for no longer than the grace a painter has.
	 * @param arrive How the painter takes the picture.
	 */
	hold(arrive: PictureHand): void {
		this.arrive = arrive;
		if (this.#timer !== null) return;
		this.#surface.setAttribute(INK_WAITS_ATTRIBUTE, "");
		this.#timer = frameClock().after(PICTURE_MS.painterGrace, this.show);
	}

	/** Let the ink show, or leave the picture to the painter that drew it. */
	readonly show = (): void => {
		if (this.#timer !== null) frameClock().cancelAfter(this.#timer);
		this.#timer = null;
		this.arrive = null;
		this.#surface.removeAttribute(INK_WAITS_ATTRIBUTE);
	};
}

export { HeldInk };

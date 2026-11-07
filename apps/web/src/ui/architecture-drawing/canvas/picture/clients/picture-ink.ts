// A first picture's ink, kept back for a moment while its painter starts, so
// that the painter brings the picture in. A painter that takes longer finds the
// SVG standing, a correct model.

import { PICTURE_MS } from "@archboard/timing";
import { frameClock } from "@archboard/ui-kit/frame-clock";
import type {
	PictureHand,
	StartedPainter,
} from "#ui/architecture-drawing/canvas/picture/clients/picture-stage-forms.ts";

/** The attribute on the surface while a first picture's ink waits for its painter. */
const INK_WAITS_ATTRIBUTE = "data-ink-waits";

/** A removed piece of ink, with the place that it returns to. */
interface RemovedInk {
	readonly node: Element;
	readonly parent: Node;
	readonly next: ChildNode | null;
}

/** The ink of a surface's first picture. */
class HeldInk {
	readonly #surface: HTMLElement;
	#timer: number | null = null;
	#removed: RemovedInk[] = [];
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

	/**
	 * Take the eye's ink out of the page, but keep it for recovery.
	 * @param picture The current picture, before or after it enters the surface.
	 */
	thin(picture: ParentNode): void {
		if (!this.#surface.hasAttribute("data-painter")) return;
		this.#removed = this.#removed.filter(({ parent }) => picture.contains(parent));
		for (const node of picture.querySelectorAll("svg defs, g:has(> use)")) {
			const parent = node.parentNode;
			if (parent === null) continue;
			this.#removed.push({ node, parent, next: node.nextSibling });
			node.remove();
		}
	}

	/**
	 * Restore complete ink when no painter draws the picture.
	 * @param cause Why the painter stopped, if it failed.
	 */
	restore(cause?: unknown): void {
		this.show();
		this.#surface.removeAttribute("data-painter");
		this.#surface.removeAttribute("data-painter-reason");
		if (cause !== undefined) {
			this.#surface.setAttribute(
				"data-painter-reason",
				cause instanceof Error ? cause.message : "The painter failed. Reload the page to retry.",
			);
		}
		for (const { node, parent, next } of this.#removed.toReversed()) {
			if (this.#surface.contains(parent)) parent.insertBefore(node, next);
		}
		this.#removed = [];
	}

	/**
	 * Name the painter that drew this picture and hide the SVG's ink.
	 * @param started The painter at work.
	 */
	painted(started: StartedPainter): void {
		const first = !this.#surface.hasAttribute("data-painter");
		this.#surface.setAttribute("data-painter", started.kind);
		if (first) this.thin(this.#surface);
		if (started.reason === null) this.#surface.removeAttribute("data-painter-reason");
		else this.#surface.setAttribute("data-painter-reason", started.reason);
		this.show();
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

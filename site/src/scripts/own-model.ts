// Archboard's own architecture, painted live by the product's painter (ADR 0071) in a viewport the
// reader scrolls. The viewport scrolls a sheet the size of the drawing, the canvas stays in view
// inside it, and each scroll moves the painter's camera, so a drag, a wheel, a touch and the arrow
// keys all move the drawing the way they move a page.

import { startPainter } from "../../../packages/renderer/src/ui/clients/painter.ts";
import own from "../paintings/own.json";
import paintingUrl from "../paintings/own.painting.json?url";
import { whileVisible } from "./reveal";

/**
 * The middle of the card with the most lines: where the viewport opens.
 * @returns The point, in the picture's units.
 */
function hub(): { x: number; y: number } {
	const card = own.cards.reduce((most, next) => (next.lines > most.lines ? next : most));
	const [x = 0, y = 0, width = 0, height = 0] = card.box;
	return { x: x + width / 2, y: y + height / 2 };
}

/**
 * Paint the model in its viewport.
 * @param viewport The scrolling viewport, which holds the sheet and its canvas.
 * @returns Whether the painter started.
 */
export async function paintOwnModel(viewport: HTMLElement): Promise<boolean> {
	const sheet = viewport.querySelector<HTMLElement>("[data-sheet]");
	const first = sheet?.querySelector("canvas");
	if (!sheet || !first) return false;
	const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
	try {
		const [started, painting] = await Promise.all([
			startPainter(first, true),
			fetch(paintingUrl).then((answer) => answer.text()),
		]);
		const { painter, canvas } = started;
		painter.setFarLine(0, 0);
		painter.setTrafficShown(started.kind === "gpu" && !motion.matches);
		painter.show(painting);

		let visible = false;
		let frame = 0;
		// Frames run while the painter says the next moment looks different: its traffic, or a
		// camera that just moved.
		const loop = (now: number) => {
			frame = visible && painter.frame(now) ? requestAnimationFrame(loop) : 0;
		};
		const wake = () => {
			if (visible && frame === 0) frame = requestAnimationFrame(loop);
		};
		const place = () => {
			const ratio = window.devicePixelRatio || 1;
			const scale = (sheet.clientWidth / own.width) * ratio;
			const [x, y] = [viewport.scrollLeft * ratio, viewport.scrollTop * ratio];
			painter.setCamera(-x, -y, scale, 0, performance.now());
			wake();
		};
		const fit = () => {
			const ratio = window.devicePixelRatio || 1;
			canvas.style.width = `${String(viewport.clientWidth)}px`;
			canvas.style.height = `${String(viewport.clientHeight)}px`;
			canvas.width = Math.round(viewport.clientWidth * ratio);
			canvas.height = Math.round(viewport.clientHeight * ratio);
			painter.resize(canvas.width, canvas.height);
			place();
		};
		fit();
		const { x, y } = hub();
		const scale = sheet.clientWidth / own.width;
		viewport.scrollLeft = x * scale - viewport.clientWidth / 2;
		viewport.scrollTop = y * scale - viewport.clientHeight / 2;
		place();
		viewport.addEventListener("scroll", place, { passive: true });
		new ResizeObserver(fit).observe(viewport);
		motion.addEventListener("change", () => {
			painter.setTrafficShown(started.kind === "gpu" && !motion.matches);
			wake();
		});
		whileVisible(viewport, (onScreen) => {
			visible = onScreen;
			if (onScreen) wake();
			else {
				cancelAnimationFrame(frame);
				frame = 0;
			}
		});
		viewport.classList.add("is-painted");
		return true;
	} catch (cause) {
		console.warn("The model's painter did not start.", cause);
		return false;
	}
}

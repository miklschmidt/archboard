// Archboard's own architecture, painted live by the product's painter (ADR 0071). The whole picture
// fits its frame. Once the frame's foot is in view, the painter brings the picture in with the
// app's own entrance: the cards come out of the middle in a wave, a spark draws each line, each
// label arrives as its spark reaches it, and a line's traffic starts once it is drawn (DESIGN.md,
// the Spark Order Rule). The picture is large, so it moves only where the GPU paints it. On the
// CPU, and with reduced motion, it stands whole.

import { PICTURE_MS } from "@archboard/timing";
import { startPainter } from "../../../packages/renderer/src/ui/clients/painter.ts";
import own from "../paintings/own.json";
import paintingUrl from "../paintings/own.painting.json?url";
import { PHASES } from "./painter-phases";
import { whileVisible } from "./reveal";

/**
 * Paint the model in its frame.
 * @param picture The frame, which holds the canvas.
 * @returns Whether the painter started.
 */
export async function paintOwnModel(picture: HTMLElement): Promise<boolean> {
	const first = picture.querySelector("canvas");
	if (!first) return false;
	const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
	try {
		const [started, painting] = await Promise.all([
			startPainter(first, true),
			fetch(paintingUrl).then((answer) => answer.text()),
		]);
		const { painter, canvas } = started;
		const moves = () => started.kind === "gpu" && !motion.matches;
		painter.setPhases(PHASES);
		painter.setLongestStep(PICTURE_MS.longestStep);
		painter.setFarLine(0, 0);
		painter.setTrafficShown(moves());

		// Frames run while the painter says the next moment looks different, and while the picture
		// is on screen: the painter's clock waits for the frames that show it.
		let visible = false;
		let frame = 0;
		const loop = (now: number) => {
			frame = visible && painter.frame(now) ? requestAnimationFrame(loop) : 0;
		};
		const wake = () => {
			if (visible && frame === 0) frame = requestAnimationFrame(loop);
		};

		// The canvas covers the frame in device pixels, and the camera fits the whole drawing into it.
		const fit = () => {
			const ratio = window.devicePixelRatio || 1;
			const across = Math.max(1, Math.round(picture.clientWidth * ratio));
			const down = Math.max(1, Math.round(picture.clientHeight * ratio));
			// A canvas that takes a size, even its own, loses its picture until the next frame.
			if (canvas.width !== across || canvas.height !== down) {
				canvas.width = across;
				canvas.height = down;
				painter.resize(across, down);
			}
			const scale = Math.min(across / own.width, down / own.height);
			const x = (across - own.width * scale) / 2;
			const y = (down - own.height * scale) / 2;
			painter.setCamera(x, y, scale, 0, performance.now());
			wake();
		};

		// The picture comes in once, when the frame's foot is in view. Where it does not move, it
		// stands whole at once.
		let shown = false;
		const check = () => {
			const box = picture.getBoundingClientRect();
			if (shown || (moves() && box.bottom > window.innerHeight)) return;
			shown = true;
			window.removeEventListener("scroll", check);
			if (moves()) painter.enter(painting, "null", PICTURE_MS.entry, 0, 0, performance.now());
			else painter.show(painting);
			wake();
		};

		fit();
		new ResizeObserver(() => {
			fit();
			check();
		}).observe(picture);
		window.addEventListener("scroll", check, { passive: true });
		motion.addEventListener("change", () => {
			painter.setTrafficShown(moves());
			// A picture on its way in stands whole once motion is reduced.
			if (shown && !moves()) painter.show(painting);
			check();
			wake();
		});
		whileVisible(picture, (onScreen) => {
			visible = onScreen;
			if (onScreen) wake();
			else {
				cancelAnimationFrame(frame);
				frame = 0;
			}
		});
		check();
		return true;
	} catch (cause) {
		console.warn("The model's painter did not start.", cause);
		return false;
	}
}

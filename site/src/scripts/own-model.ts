// Archboard's own architecture, painted live by the product's painter in the app's order: WebGPU,
// then WebGL2, then the CPU (ADR 0071, ADR 0074). The whole picture fits its frame. Once the
// frame's foot is in view, the painter brings the picture in with the app's own entrance: the
// cards come out of the middle in a wave, a spark draws each line, and each label arrives as its
// spark reaches it (DESIGN.md, the Spark Order Rule). The picture is large. A frame of its entrance
// costs about one refresh on WebGL2 and more on the CPU, so it comes in on either GPU and stands
// whole on the CPU. Its traffic keeps a frame running while it is in view, so traffic runs only on
// WebGPU, where such a frame costs the page little. With reduced motion, the picture stands whole.

import { PICTURE_MS } from "@archboard/timing";
import { startPainter } from "../../../packages/renderer/src/ui/clients/painter.ts";
import own from "../paintings/own.json";
import paintingUrl from "../paintings/own.painting.json?url";
import { PHASES } from "./painter-phases";
import { whileVisible } from "./reveal";

/**
 * Paint the model in its frame. Where no painter draws, or a GPU stops at work, the frame shows
 * the SVG of the same reading instead.
 * @param picture The frame, which holds the canvas and the SVG.
 */
export async function paintOwnModel(picture: HTMLElement): Promise<void> {
	const first = picture.querySelector("canvas");
	if (!first) return;
	const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
	try {
		const [started, painting] = await Promise.all([
			startPainter(first, true),
			fetch(paintingUrl).then((answer) => {
				if (!answer.ok) throw new Error(`The painting did not load (HTTP ${answer.status}).`);
				return answer.text();
			}),
		]);
		const { painter, canvas } = started;
		const enters = () => started.kind !== "cpu" && !motion.matches;
		const flows = () => started.kind === "gpu" && !motion.matches;
		painter.setPhases(PHASES);
		painter.setLongestStep(PICTURE_MS.longestStep);
		painter.setFarLine(0, 0);
		painter.setTrafficShown(flows());

		// Frames run while the painter says the next moment looks different, and while the picture
		// is on screen: the painter's clock waits for the frames that show it.
		let visible = false;
		let stopped = false;
		let frame = 0;
		const fallback = (cause: unknown) => {
			if (stopped) return;
			console.warn("The model's painter stopped.", cause);
			stopped = true;
			cancelAnimationFrame(frame);
			frame = 0;
			picture.removeAttribute("data-painting");
		};
		const loop = (now: number) => {
			try {
				frame = visible && !stopped && painter.frame(now) ? requestAnimationFrame(loop) : 0;
			} catch (cause) {
				fallback(cause);
			}
		};
		const wake = () => {
			if (visible && !stopped && frame === 0) frame = requestAnimationFrame(loop);
		};
		// A GPU that stops draws nothing more, and it may not say why.
		started.whenGpuStops?.(fallback);

		// The canvas covers the frame in device pixels, and the camera fits the whole drawing into it.
		const fit = () => {
			if (stopped) return;
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
			if (stopped) return;
			const box = picture.getBoundingClientRect();
			if (shown || (enters() && box.bottom > window.innerHeight)) return;
			shown = true;
			window.removeEventListener("scroll", check);
			if (enters()) painter.enter(painting, "null", PICTURE_MS.entry, 0, 0, performance.now());
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
			if (stopped) return;
			painter.setTrafficShown(flows());
			// A picture on its way in stands whole once motion is reduced.
			if (shown && motion.matches) painter.show(painting);
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
	} catch (cause) {
		console.warn("The model's painter did not start.", cause);
		picture.removeAttribute("data-painting");
	}
}

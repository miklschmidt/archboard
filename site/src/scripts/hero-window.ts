// The hero's window: it scales to its column, it leans back while part of it is below the fold,
// and it stands straight once all of it is in view. Then the agent's commands type out, and when
// its edit lands, the product's painter (ADR 0071) brings the example shop in as the app brings in
// a model: the cards come out of the middle in a wave, a spark draws each line, each label arrives
// as its spark reaches it, and a line's traffic starts once it is drawn (DESIGN.md, the Spark
// Order Rule). The shop is small, so the painter draws it on the CPU, where starting WebGPU can
// hold the page. Without script, with reduced motion, or where the painter does not start, the
// renderer's SVG of the same picture stands whole.

import { PICTURE_MS } from "../../../apps/web/src/ui/architecture-drawing/constants/motion.ts";
import { startCpuPainter } from "../../../packages/renderer/src/ui/clients/painter.ts";
import shop from "../paintings/shop.json";
import paintingUrl from "../paintings/shop.painting.json?url";
import { PHASES } from "./painter-phases";
import { animate, whileVisible } from "./reveal";
import { typeLine } from "./type-line";

/** How far the window leans back while it enters the viewport, in degrees. */
const TILT = 12;

/** How long the window stands in view before the agent starts, in milliseconds. */
const BEAT = 350;

/** How long after the agent's last line the Replay button appears, in milliseconds. */
const REPLAY_AFTER = 2200;

/** The painter of the window's picture, with the shop's painting. */
interface Shop {
	painter: Awaited<ReturnType<typeof startCpuPainter>>["painter"];
	painting: string;
}

/**
 * Start the painter on the window's canvas and fetch the shop's painting.
 * @param canvas The canvas.
 * @returns The painter and the painting, or null when the painter does not start.
 */
async function paintShop(canvas: HTMLCanvasElement): Promise<Shop | null> {
	try {
		const [{ painter }, painting] = await Promise.all([
			startCpuPainter(canvas, true),
			fetch(paintingUrl).then((answer) => {
				if (!answer.ok) throw new Error(`The painting did not load (HTTP ${answer.status}).`);
				return answer.text();
			}),
		]);
		painter.setPhases(PHASES);
		painter.setLongestStep(PICTURE_MS.longestStep);
		painter.setFarLine(0, 0);
		return { painter, painting };
	} catch (cause) {
		console.warn("The window's painter did not start.", cause);
		return null;
	}
}

/** Set up the hero window, if the page has one. */
export function mountHeroWindow(): void {
	const playback = document.querySelector<HTMLElement>("[data-hero-playback]");
	const stage = document.querySelector<HTMLElement>("[data-window-stage]");
	const tilt = document.querySelector<HTMLElement>("[data-window-tilt]");
	const frame = document.querySelector<HTMLElement>("[data-window]");
	const picture = frame?.querySelector<HTMLElement>("[data-picture]");
	const canvas = picture?.querySelector<HTMLCanvasElement>("canvas");
	const replay = document.querySelector<HTMLButtonElement>("[data-replay]");
	if (!playback || !stage || !tilt || !frame || !picture || !canvas || !replay) return;
	const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
	const controller = new AbortController();
	const { signal } = controller;
	const wait = (ms: number) => animate(playback, ms, () => {}, signal);
	let painting: Promise<Shop | null> | undefined;
	let painted: Shop | null = null;

	// Frames run while the painter says the next moment looks different, and while the canvas is
	// on screen: the painter's clock waits for the frames that show it.
	let visible = false;
	let next = 0;
	const loop = (now: number) => {
		next = visible && painted?.painter.frame(now) ? requestAnimationFrame(loop) : 0;
	};
	const wake = () => {
		if (visible && painted && next === 0) next = requestAnimationFrame(loop);
	};

	// The window keeps its laid-out width (narrower on a phone, where only the canvas shows) and
	// scales to the stage. The canvas covers the picture in device pixels, and the painter fits
	// the shop into the picture's padding box as the SVG fills it.
	const fit = () => {
		const scale = stage.clientWidth / frame.offsetWidth;
		stage.style.setProperty("--scale", String(scale));
		if (!painted) return;
		const ratio = (window.devicePixelRatio || 1) * scale;
		const [width, height] = [picture.clientWidth, picture.clientHeight];
		const [across, down] = [Math.round(width * ratio), Math.round(height * ratio)];
		// A canvas that takes a size, even its own, loses its picture until the next frame.
		if (canvas.width !== across || canvas.height !== down) {
			canvas.width = Math.max(1, across);
			canvas.height = Math.max(1, down);
			painted.painter.resize(canvas.width, canvas.height);
		}
		const style = getComputedStyle(picture);
		const [left = 0, right = 0, top = 0, bottom = 0] = [
			style.paddingLeft,
			style.paddingRight,
			style.paddingTop,
			style.paddingBottom,
		].map((value) => Number.parseFloat(value) || 0);
		const [roomX, roomY] = [width - left - right, height - top - bottom];
		const unit = Math.min(roomX / shop.width, roomY / shop.height);
		const x = left + (roomX - shop.width * unit) / 2;
		const y = top + (roomY - shop.height * unit) / 2;
		painted.painter.setCamera(x * ratio, y * ratio, unit * ratio, 0, performance.now());
		wake();
	};
	new ResizeObserver(() => {
		fit();
		lean();
	}).observe(stage);
	fit();

	// The window starts once its foot is in view, where the agent's lines arrive: it stands
	// straight then, and the lean is gone.
	let arrive = () => {};
	const arrived = new Promise<void>((done) => {
		arrive = done;
	});
	const lean = () => {
		const box = stage.getBoundingClientRect();
		const progress = Math.min(1, Math.max(0, (window.innerHeight - box.top) / box.height));
		tilt.style.setProperty(
			"--tilt",
			`${(motion.matches ? 0 : TILT * (1 - progress)).toFixed(2)}deg`,
		);
		if (box.bottom <= window.innerHeight) arrive();
	};
	lean();
	window.addEventListener("scroll", lean, { passive: true });
	window.addEventListener("resize", lean);

	const lines = [...playback.querySelectorAll<HTMLElement>("[data-dock] [data-line]")];

	const reset = () => {
		frame.removeAttribute("data-claimed");
		for (const line of lines) {
			line.classList.add("is-pending");
			line.classList.remove("is-typing");
			const text = line.querySelector<HTMLElement>(".text");
			if (text) text.textContent = "";
		}
		painted?.painter.clear();
		wake();
	};

	/** Do what a line asks of the window once it is typed. */
	const cue = async (name: string | undefined) => {
		if (name === "claim") frame.setAttribute("data-claimed", "");
		if (name === "release") frame.removeAttribute("data-claimed");
		if (name !== "draw") return;
		const ready = await painting;
		signal.throwIfAborted();
		if (!ready) return;
		ready.painter.enter(ready.painting, "null", PICTURE_MS.entry, 0, 0, performance.now());
		wake();
	};

	let playing = false;
	const play = async () => {
		// The hidden replay button can still receive an already-queued click.
		if (playing || motion.matches || signal.aborted) return;
		playing = true;
		replay.hidden = true;
		replay.classList.remove("is-shown");
		reset();
		try {
			let elapsed = 0;
			// The desktop and mobile docks contain copies of the same lines.
			const byTime = new Map<number, HTMLElement[]>();
			for (const line of lines) {
				const at = Number(line.dataset["at"] ?? 0);
				byTime.set(at, [...(byTime.get(at) ?? []), line]);
			}
			for (const [at, group] of [...byTime.entries()].sort((a, b) => a[0] - b[0])) {
				await wait(Math.max(0, at - elapsed));
				elapsed = Math.max(at, elapsed);
				const durations = await Promise.all(group.map((line) => typeLine(line, playback, signal)));
				elapsed += Math.max(...durations);
				await cue(group[0]?.dataset["cue"]);
			}

			await wait(REPLAY_AFTER);
			replay.hidden = false;
			replay.classList.add("is-shown");
		} catch (error) {
			if (!signal.aborted) throw error;
		} finally {
			playing = false;
		}
	};

	// With reduced motion, the SVG stands whole and every line is there.
	const showAll = () => {
		if (!motion.matches) return;
		controller.abort();
		painted = null;
		cancelAnimationFrame(next);
		next = 0;
		picture.removeAttribute("data-painting");
		frame.removeAttribute("data-claimed");
		for (const line of lines) {
			line.classList.remove("is-pending", "is-typing");
			const text = line.querySelector<HTMLElement>(".text");
			if (text) text.textContent = line.dataset["text"] ?? "";
		}
		replay.hidden = true;
		lean();
	};
	motion.addEventListener("change", showAll);
	if (motion.matches) {
		showAll();
		return;
	}

	picture.setAttribute("data-painting", "");
	reset();
	replay.addEventListener("click", () => void play());
	whileVisible(canvas, (onScreen) => {
		visible = onScreen;
		if (onScreen) wake();
		else {
			cancelAnimationFrame(next);
			next = 0;
		}
	});
	void (async () => {
		try {
			await arrived;
			// The painter starts as the agent does, and it is ready long before the edit lands.
			painting = paintShop(canvas).then((ready) => {
				if (signal.aborted) return null;
				painted = ready;
				if (ready) fit();
				else picture.removeAttribute("data-painting");
				return ready;
			});
			await document.fonts.ready;
			await wait(BEAT);
			await play();
		} catch (error) {
			if (!signal.aborted) throw error;
		}
	})();
}

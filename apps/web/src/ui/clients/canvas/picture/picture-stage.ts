// The canvas a picture is painted on, and all that draws on it (ADR 0071).
//
// The painter takes a scene and how it is seen, and a frame comes out. This
// owns the painter of one canvas, hands it what changed, and asks for frames
// from the frame clock only while something moves, so a stepped clock records
// them one by one. Until the painter's first frame the surface shows the SVG
// with its ink, and a painter that cannot start leaves it so: the reader sees
// a correct model either way. The SVG under the canvas keeps its words and its
// marks for search, copy, screen readers and the viewer.

import { PICTURE_MS } from "@archboard/timing";
import { frameClock } from "@archboard/ui-kit/frame-clock";
import type { Departure } from "#ui/clients/canvas/picture/picture-departure.ts";
import { HeldInk } from "#ui/clients/canvas/picture/picture-ink.ts";
import {
	briefPainter,
	fitPainter,
	headingJson,
	marksJson,
	sizeCanvas,
	type Held,
	type StageCamera,
	type StageDive,
	type StageLight,
	type StageMarks,
	type PainterFailure,
	type PictureHand,
	type StageShift,
	type StartedPainter,
} from "#ui/clients/canvas/picture/picture-stage-forms.ts";

/** The attribute on the surface that names the painter drawing it, once one has drawn. */
const PAINTER_ATTRIBUTE = "data-painter";

/** The groups a painter's pick names, by counting them in document order. */
const PICKED = "[data-semantic-id],[data-toggle]";

/** Each surface's stage. */
const stages = new WeakMap<Element, PictureStage>();

/**
 * Whether the page is dark.
 * @returns True on the dark theme.
 */
function pageIsDark(): boolean {
	return document.documentElement.dataset["theme"] === "dark";
}

/** The painter's own interface. */
type Painter = StartedPainter["painter"];

/** The stage of one canvas: all that a client tells it, handed to the painter at work. */
class PictureStage {
	readonly #surface: HTMLElement;
	#canvas: HTMLCanvasElement;
	readonly #held: Held = {
		painting: undefined,
		camera: { x: 0, y: 0, scale: 1 },
		farLine: { scale: 0, ms: 0 },
		awaited: false,
		marks: { selected: new Set(), whole: new Set() },
		light: null,
		trafficShown: true,
		heads: {},
		warned: new Set(),
	};
	readonly #watching: ResizeObserver;
	readonly #theme: MutationObserver;
	#started: StartedPainter | null = null;
	#starting = false;
	/** Stop hearing about the GPU this stage's painter stands on. */
	#stopWatchingGpu: (() => void) | undefined;
	/** When this stage's WebGPU painter last failed at work. */
	#gpuFailedAt = Number.NEGATIVE_INFINITY;
	#disposed = false;
	#frame: number | null = null;
	#rest: number | null = null;
	#groups: readonly Element[] = [];
	#hoveredControl: string | null = null;
	readonly #ink: HeldInk;

	/**
	 * Start the stage of a surface.
	 * @param surface The element the SVG is written into.
	 * @param canvas The canvas behind it.
	 */
	constructor(surface: HTMLElement, canvas: HTMLCanvasElement) {
		this.#surface = surface;
		this.#canvas = canvas;
		this.#ink = new HeldInk(surface);
		this.#watching = new ResizeObserver(this.#invalidate);
		this.#watching.observe(canvas.parentElement ?? canvas);
		this.#theme = new MutationObserver(this.#themeChanged);
		this.#theme.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-theme"],
		});
		surface.parentElement?.addEventListener("pointermove", this.#hoverControl);
		surface.parentElement?.addEventListener("pointerleave", this.#leaveControl);
	}

	/**
	 * Whether a painter is on its way, which a recording waits for.
	 * @returns True while one starts.
	 */
	get starting(): boolean {
		return this.#starting;
	}

	/**
	 * Take what only the eye needs out of a picture once a painter draws it.
	 * Laying out its glyphs and definitions was half of what a new picture cost.
	 * @param picture The picture's parent.
	 */
	thin(picture: ParentNode): void {
		this.#ink.thin(picture);
	}

	/**
	 * Put a picture up in place of what stands there.
	 * @param painting The picture's painting, or nothing when it has none.
	 */
	show(painting: string | undefined): void {
		this.#take(painting, (painter, taken) => {
			painter.show(taken);
		});
	}

	/**
	 * Carry the picture on the stage into the next.
	 * @param painting The next picture's painting, or nothing when it has none.
	 * @param shift How far the cards the two share moved, in the picture's units.
	 */
	carry(painting: string | undefined, shift: StageShift): void {
		this.#take(painting, (painter, taken) => {
			painter.carry(taken, shift.x, shift.y, PICTURE_MS.transition);
		});
	}

	/**
	 * Bring a picture in part by part, what is left of the last finishing over it.
	 * @param painting The picture's painting, or nothing when it has none.
	 * @param heading Where the reader went from the last picture, if somewhere.
	 * @param moved How far the pane moved since the last picture was seen.
	 */
	enter(painting: string | undefined, heading: Departure | null, moved: StageShift): void {
		const ratio = window.devicePixelRatio || 1;
		const [x, y] = [moved.x * ratio, moved.y * ratio];
		/**
		 * Bring the picture in.
		 * @param painter The painter.
		 * @param taken The picture's painting.
		 */
		const arrive: PictureHand = (painter, taken) => {
			painter.enter(taken, headingJson(heading), PICTURE_MS.entry, x, y, frameClock().now());
		};
		this.#take(painting, arrive);
		if (this.#started === null && painting !== undefined && painting !== "") this.#ink.hold(arrive);
	}

	/**
	 * Send the picture on its way out.
	 * @param heading Where the reader went.
	 * @param reducedMotion Whether the person asked for no motion; then it is simply gone.
	 */
	leave(heading: Departure, reducedMotion: boolean): void {
		const ms = reducedMotion ? 0 : PICTURE_MS.exit;
		this.#tell((painter) => {
			painter.leave(headingJson(heading), ms, frameClock().now());
		});
	}

	/** Bring back a picture the reader returned to before anything else arrived. */
	stay(): void {
		this.#tell((painter) => {
			painter.stay();
		});
	}

	/**
	 * Put a model inside its card and start the fades of the flight.
	 * @param painting The model's painting, or nothing when it has none.
	 * @param dive The flight.
	 * @param ms How long the flight takes.
	 */
	dive(painting: string | undefined, dive: StageDive, ms: number): void {
		if (painting === undefined) return;
		this.#tell((painter) => {
			painter.dive(painting, JSON.stringify(dive), ms, frameClock().now());
		});
	}

	/** Take the model inside a card away. */
	endDive(): void {
		this.#tell((painter) => {
			painter.endDive();
		});
	}

	/**
	 * Show the traffic, or hide it from a reader who asked for no motion.
	 * @param shown Whether it shows.
	 */
	setTrafficShown(shown: boolean): void {
		this.#held.trafficShown = shown;
		this.#tell((painter) => {
			painter.setTrafficShown(shown);
		});
	}

	/**
	 * Hold flows' heads in view.
	 * @param heads How far each flow's head is moved down, in the picture's units.
	 */
	setHeads(heads: Readonly<Record<string, number>>): void {
		this.#held.heads = heads;
		this.#tell((painter) => {
			painter.setHeads(JSON.stringify(heads));
		});
	}

	/**
	 * Say which subjects the code check warns about.
	 * @param warned The subjects.
	 */
	setWarnings(warned: ReadonlySet<string>): void {
		this.#held.warned = warned;
		this.#tell((painter) => {
			painter.setWarnings(JSON.stringify([...warned]));
		});
	}

	/**
	 * Draw relationships on along their routes.
	 * @param delays How long each waits, in milliseconds.
	 * @param shortest The shortest a sweep takes, in milliseconds.
	 * @param longest The longest a sweep takes, in milliseconds.
	 */
	sweep(delays: Readonly<Record<string, number>>, shortest: number, longest: number): void {
		this.#tell((painter) => {
			painter.sweep(JSON.stringify(delays), shortest, longest, frameClock().now());
		});
	}

	/** Take the sweep away. */
	clearSweep(): void {
		this.#tell((painter) => {
			painter.clearSweep();
		});
	}

	/**
	 * Note the groups of the picture just written into the surface.
	 * @param root The element that holds them.
	 */
	learnGroups(root: ParentNode): void {
		this.#groups = [...root.querySelectorAll(PICKED)];
	}

	/**
	 * Move the picture.
	 * @param camera Where it goes.
	 * @param ms How long it takes.
	 */
	setCamera(camera: StageCamera, ms: number): void {
		const ratio = window.devicePixelRatio || 1;
		const { x, y, scale } = {
			x: camera.x * ratio,
			y: camera.y * ratio,
			scale: camera.scale * ratio,
		};
		this.#held.camera = { x, y, scale };
		this.#tell((painter) => {
			painter.setCamera(x, y, scale, ms, frameClock().now());
		});
	}

	/**
	 * Say whether the next picture is on its way, so that the one here steps back for it.
	 * @param awaited Whether it is.
	 * @param ms How long the picture here takes to step back or forward.
	 */
	setAwaited(awaited: boolean, ms: number): void {
		this.#held.awaited = awaited;
		this.#tell((painter) => {
			painter.setAwaited(awaited, ms, frameClock().now());
		});
	}

	/**
	 * Say where the far view begins. The painter swaps the views the moment the camera crosses.
	 * @param scale The camera's scale at the line, or 0 for a picture with no far view.
	 * @param ms How long a swap takes.
	 */
	setFarLine(scale: number, ms: number): void {
		this.#held.farLine = { scale: scale * (window.devicePixelRatio || 1), ms };
		const line = this.#held.farLine;
		this.#tell((painter) => {
			painter.setFarLine(line.scale, line.ms);
		});
	}

	/**
	 * Say what is marked.
	 * @param marks The marks.
	 */
	setMarks(marks: StageMarks): void {
		this.#held.marks = marks;
		this.#tell((painter) => {
			painter.setMarks(marksJson(marks));
		});
	}

	/**
	 * Light the picture.
	 * @param light How it stands in the light.
	 */
	setLight(light: StageLight): void {
		this.#held.light = light;
		this.#tell((painter) => {
			painter.setLight(JSON.stringify(light), frameClock().now());
		});
	}

	/**
	 * What lies under a point of the page, the topmost first.
	 * @param x The point's distance from the page's left, in pixels.
	 * @param y Its distance from the top.
	 * @returns The groups, null for a shape in none, or null while no painter draws.
	 */
	elementsAt(x: number, y: number): readonly (Element | null)[] | null {
		const started = this.#started;
		if (started === null || !this.#surface.hasAttribute(PAINTER_ATTRIBUTE)) return null;
		const box = started.canvas.getBoundingClientRect();
		const ratio = window.devicePixelRatio || 1;
		const under = started.painter.pick((x - box.left) * ratio, (y - box.top) * ratio);
		return Array.from(under, (index) => this.#groups[index] ?? null);
	}

	/** Stop asking for frames and let the painter go. */
	dispose(): void {
		this.#disposed = true;
		this.#watching.disconnect();
		this.#theme.disconnect();
		this.#surface.parentElement?.removeEventListener("pointermove", this.#hoverControl);
		this.#surface.parentElement?.removeEventListener("pointerleave", this.#leaveControl);
		this.#retire();
		this.#canvas.remove();
	}

	/**
	 * Release the painter and its scheduled work, and show complete SVG ink.
	 * @param cause Why it failed, if it failed.
	 */
	#retire(cause?: unknown): void {
		if (this.#frame !== null) frameClock().cancelFrame(this.#frame);
		if (this.#rest !== null) frameClock().cancelAfter(this.#rest);
		this.#frame = null;
		this.#rest = null;
		this.#stopWatchingGpu?.();
		this.#stopWatchingGpu = undefined;
		this.#started?.painter.free();
		this.#started = null;
		this.#canvas.style.visibility = "hidden";
		this.#ink.restore(this.#disposed ? undefined : cause);
	}

	/**
	 * Tell the painter at work something, and draw what it changed.
	 * @param change What to tell it.
	 */
	#tell(change: (painter: Painter) => void): void {
		if (this.#disposed || this.#started === null) return;
		try {
			change(this.#started.painter);
			this.#invalidate();
		} catch (cause) {
			this.#replacePainter(cause);
		}
	}

	/**
	 * Hold a picture, start the painter for it, and hand it over.
	 * @param painting The picture's painting, or nothing when it has none.
	 * @param hand How the painter takes it, once one is at work.
	 */
	#take(painting: string | undefined, hand: PictureHand): void {
		const taken = painting === "" ? undefined : painting;
		this.#held.painting = taken;
		this.#ink.show();
		if (taken === undefined) {
			this.#tell((painter) => {
				painter.clear();
			});
			this.#canvas.style.visibility = "hidden";
			this.#ink.restore();
			return;
		}
		void this.#start();
		this.#tell((painter) => {
			hand(painter, taken);
		});
	}

	/** Ask for one more frame, unless one is on its way. */
	readonly #invalidate = (): void => {
		if (!this.#disposed && this.#frame === null && this.#started !== null) {
			this.#frame = frameClock().requestFrame(this.#tick);
		}
	};

	/** Give the painter the page's theme. */
	readonly #themeChanged = (): void => {
		this.#tell((painter) => {
			painter.setTheme(pageIsDark());
		});
	};

	/**
	 * Put a painter to work.
	 * @param next The painter.
	 */
	#employ(next: StartedPainter): void {
		if (this.#disposed) {
			next.painter.free();
			return;
		}
		this.#started = next;
		this.#canvas = next.canvas;
		briefPainter(next.painter, this.#held, this.#ink.arrive, pageIsDark(), frameClock().now());
		this.#invalidate();
		const stopWatchingGpu = next.whenGpuStops?.((reason) => {
			this.#replacePainter(new Error(reason));
		});
		if (this.#started === next) this.#stopWatchingGpu = stopWatchingGpu;
		else stopWatchingGpu?.();
	}

	/**
	 * Replace a painter that failed at work: a WebGPU painter by another, the first time, and by
	 * the next painter down when it fails again soon. A WebGL2 painter gives way to Vello on the CPU.
	 * @param cause What went wrong.
	 */
	#replacePainter(cause: unknown): void {
		const failed = this.#started;
		if (failed === null || this.#disposed) return;
		this.#retire(cause);
		if (failed.kind === "cpu") return;
		const reason = cause instanceof Error ? cause.message : "The GPU painter failed.";
		void this.#start({ painter: failed.kind, reason, retry: this.#retriesGpu(failed.kind) });
	}

	/**
	 * Whether a failed painter gets another try: only WebGPU does, unless it failed soon before.
	 * @param kind The painter that failed.
	 * @returns Whether it gets another try.
	 */
	#retriesGpu(kind: StartedPainter["kind"]): boolean {
		if (kind !== "gpu") return false;
		const now = frameClock().now();
		const retry = now - this.#gpuFailedAt > PICTURE_MS.gpuRetry;
		this.#gpuFailedAt = now;
		return retry;
	}

	/**
	 * Draw the frame of a moment, and ask for the next while something moves.
	 * @param now The frame's time.
	 */
	readonly #tick = (now: number): void => {
		this.#frame = null;
		if (this.#started === null) return;
		const clock = frameClock();
		const began = clock.now();
		try {
			fitPainter(this.#started);
			if (this.#started.painter.frame(now)) this.#nextFrame(now, clock.now() - began);
		} catch (cause) {
			this.#replacePainter(cause);
			return;
		}
		this.#canvas.style.visibility = this.#held.painting === undefined ? "hidden" : "visible";
		if (this.#held.painting !== undefined) this.#ink.painted(this.#started);
	};

	/**
	 * Ask for the next frame. Traffic on a painter that cuts its strips on this thread, on WebGL2
	 * or on the CPU, rests as long as its last frame took, which leaves a reader half of the
	 * thread. A recording's clock stands still, so nothing rests there.
	 * @param now The last frame's time.
	 * @param cost How long the last frame took.
	 */
	#nextFrame(now: number, cost: number): void {
		const started = this.#started;
		const strips = started !== null && started.kind !== "gpu";
		if (strips && cost > 0 && started.painter.trafficAlone(now)) {
			if (this.#rest !== null) frameClock().cancelAfter(this.#rest);
			this.#rest = frameClock().after(cost, () => {
				this.#rest = null;
				this.#invalidate();
			});
			return;
		}
		this.#invalidate();
	}

	/**
	 * Start a painter for the held picture, or replace a failed GPU painter.
	 * @param failure Why the GPU painter stopped, if it stopped.
	 */
	async #start(failure?: PainterFailure): Promise<void> {
		if (this.#disposed || this.#starting || this.#started !== null) return;
		this.#starting = true;
		sizeCanvas(this.#canvas);
		let next: StartedPainter;
		try {
			const { startPainter } = await import("@archboard/renderer/browser");
			next = await startPainter(this.#canvas, pageIsDark(), failure);
		} catch (cause) {
			// No painter at all: the SVG stays, a correct model, and says why.
			this.#retire(cause);
			return;
		} finally {
			this.#starting = false;
		}
		try {
			this.#employ(next);
		} catch (cause) {
			this.#replacePainter(cause);
		}
	}

	/**
	 * Light the control the pointer rests on.
	 * @param subject Whose control it is, or null for none.
	 */
	#lightControl(subject: string | null): void {
		if (subject === this.#hoveredControl) return;
		this.#hoveredControl = subject;
		this.#tell((painter) => {
			painter.setHoveredToggle(subject ?? undefined);
		});
	}

	/**
	 * Find the control under the pointer, which CSS `:hover` found while the
	 * surface took the pointer.
	 * @param event The move.
	 */
	readonly #hoverControl = (event: PointerEvent): void => {
		const control = this.elementsAt(event.clientX, event.clientY)?.[0]?.closest("[data-toggle]");
		const subject = control?.closest("[data-semantic-id]")?.getAttribute("data-semantic-id");
		this.#lightControl(subject ?? null);
	};

	/** The pointer left: no control is under it. */
	readonly #leaveControl = (): void => {
		this.#lightControl(null);
	};
}

/**
 * The stage of a surface, when a canvas stands behind it.
 * @param surface The surface.
 * @returns The stage, or nothing.
 */
function stageOf(surface: Element): PictureStage | undefined {
	return stages.get(surface);
}

/**
 * Give a surface its stage, in a page that can paint.
 * @param surface The surface.
 * @param host The element that holds the stage-owned canvas.
 * @returns Take the stage away.
 */
function attachStage(surface: HTMLElement, host: HTMLElement): () => void {
	if (typeof ResizeObserver === "undefined" || typeof WebAssembly === "undefined") {
		return () => undefined;
	}
	const canvas = document.createElement("canvas");
	canvas.setAttribute("data-slot", "picture-canvas");
	canvas.className = "block size-full";
	canvas.style.visibility = "hidden";
	host.replaceChildren(canvas);
	const stage = new PictureStage(surface, canvas);
	stages.set(surface, stage);
	return () => {
		stage.dispose();
		stages.delete(surface);
	};
}

export {
	attachStage,
	stageOf,
	type StageCamera,
	type StageDive,
	type StageLight,
	type StageMarks,
	type StageShift,
};

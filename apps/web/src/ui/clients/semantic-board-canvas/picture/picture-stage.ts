// The canvas a picture is painted on, and all that draws on it (ADR 0071).
//
// The painter takes a scene and how it is seen, and a frame comes out. This
// owns the painter of one canvas, hands it what changed, and asks for frames
// from the frame clock only while something moves, so a stepped clock records
// them one by one. Until the painter's first frame the surface shows the SVG
// with its ink, and a painter that cannot start leaves it so: the reader sees
// a correct board either way. The SVG under the canvas keeps its words and its
// marks for search, copy, screen readers and the viewer.

import type { StartedPainter } from "@archboard/renderer/browser";
import { PICTURE_MS } from "@archboard/timing";
import { frameClock } from "@archboard/ui-kit/frame-clock";
import type { Departure } from "#ui/clients/semantic-board-canvas/picture/picture-departure.ts";
import {
	PHASES,
	fitPainter,
	headingJson,
	marksJson,
	sizeCanvas,
	type Held,
	type StageCamera,
	type StageDive,
	type StageLight,
	type StageMarks,
	type StageShift,
} from "#ui/clients/semantic-board-canvas/picture/picture-stage-forms.ts";

/** The attribute on the surface that names the painter drawing it, once one has drawn. */
const PAINTER_ATTRIBUTE = "data-painter";

/** The attribute on the surface that says why the GPU does not paint. */
const PAINTER_REASON_ATTRIBUTE = "data-painter-reason";

/** The groups a painter's pick names, by counting them in document order. */
const PICKED = "[data-semantic-id],[data-toggle]";

/** The picture's surface, inside a viewport. */
const SURFACE = "[data-slot='semantic-board-surface']";

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
	readonly #canvas: HTMLCanvasElement;
	readonly #held: Held = {
		painting: undefined,
		camera: { x: 0, y: 0, scale: 1 },
		cameraMs: 0,
		far: false,
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
	#disposed = false;
	#frame: number | null = null;
	#groups: readonly Element[] = [];
	#hoveredControl: string | null = null;

	/**
	 * Start the stage of a surface.
	 * @param surface The element the SVG is written into.
	 * @param canvas The canvas behind it.
	 */
	constructor(surface: HTMLElement, canvas: HTMLCanvasElement) {
		this.#surface = surface;
		this.#canvas = canvas;
		this.#watching = new ResizeObserver(this.#invalidate);
		this.#watching.observe(canvas);
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
			painter.carry(taken, shift.x, shift.y, PICTURE_MS.transition, frameClock().now());
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
		this.#take(painting, (painter, taken) => {
			painter.enter(taken, headingJson(heading), PICTURE_MS.entry, x, y, frameClock().now());
		});
	}

	/** Land whatever flies, at once. */
	land(): void {
		this.#tell((painter) => {
			painter.land();
		});
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
	 * Put a board inside its card and start the fades of the flight.
	 * @param painting The board's painting, or nothing when it has none.
	 * @param dive The flight.
	 * @param ms How long the flight takes.
	 */
	dive(painting: string | undefined, dive: StageDive, ms: number): void {
		if (painting === undefined) return;
		this.#tell((painter) => {
			painter.dive(painting, JSON.stringify(dive), ms, frameClock().now());
		});
	}

	/** Take the board inside a card away. */
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

	/** Stand the traffic still until it is resumed. */
	holdTraffic(): void {
		this.#tell((painter) => {
			painter.holdTraffic();
		});
	}

	/**
	 * Bring held traffic back to its speed, from standing still.
	 * @param ms How long that takes.
	 */
	resumeTraffic(ms: number): void {
		this.#tell((painter) => {
			painter.resumeTraffic(ms, frameClock().now());
		});
	}

	/** Let held traffic go at its speed at once. */
	releaseTraffic(): void {
		this.#tell((painter) => {
			painter.releaseTraffic();
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
		this.#held.cameraMs = ms;
		this.#tell((painter) => {
			painter.setCamera(x, y, scale, ms, frameClock().now());
		});
	}

	/**
	 * Swap between the near and the far view.
	 * @param far Whether the picture is seen from far.
	 * @param ms How long it takes.
	 */
	setFar(far: boolean, ms: number): void {
		this.#held.far = far;
		this.#tell((painter) => {
			painter.setFar(far, ms, frameClock().now());
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
		if (this.#frame !== null) frameClock().cancelFrame(this.#frame);
		this.#started?.painter.free();
		this.#started = null;
	}

	/**
	 * Tell the painter at work something, and draw what it changed.
	 * @param change What to tell it.
	 */
	#tell(change: (painter: Painter) => void): void {
		if (this.#started === null) return;
		change(this.#started.painter);
		this.#invalidate();
	}

	/**
	 * Hold a picture, start the painter for it, and hand it over.
	 * @param painting The picture's painting, or nothing when it has none.
	 * @param hand How the painter takes it, once one is at work.
	 */
	#take(painting: string | undefined, hand: (painter: Painter, taken: string) => void): void {
		const taken = painting === "" ? undefined : painting;
		this.#held.painting = taken;
		if (taken === undefined) {
			this.#started?.painter.clear();
			this.#surface.removeAttribute(PAINTER_ATTRIBUTE);
			return;
		}
		void this.#start();
		this.#tell((painter) => {
			hand(painter, taken);
		});
	}

	/** Ask for one more frame, unless one is on its way. */
	readonly #invalidate = (): void => {
		if (this.#frame === null && this.#started !== null) {
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
	 * Hand a painter everything the page says now.
	 * @param painter The painter.
	 */
	#brief(painter: Painter): void {
		const { camera, far, marks, light, painting, trafficShown, heads, warned } = this.#held;
		const now = frameClock().now();
		painter.setPhases(PHASES);
		painter.setTheme(pageIsDark());
		painter.setTrafficShown(trafficShown);
		painter.setHeads(JSON.stringify(heads));
		painter.setWarnings(JSON.stringify([...warned]));
		painter.setCamera(camera.x, camera.y, camera.scale, 0, now);
		painter.setFar(far, 0, now);
		painter.setMarks(marksJson(marks));
		if (light !== null) painter.setLight(JSON.stringify(light), now);
		if (painting === undefined) painter.clear();
		else painter.show(painting);
	}

	/**
	 * Put a painter to work.
	 * @param next The painter.
	 */
	#employ(next: StartedPainter): void {
		this.#started = next;
		this.#surface.removeAttribute(PAINTER_ATTRIBUTE);
		this.#brief(next.painter);
		this.#invalidate();
	}

	/**
	 * Replace a painter that failed at work with Vello on the CPU.
	 * @param cause What went wrong.
	 */
	async #replacePainter(cause: unknown): Promise<void> {
		const failed = this.#started;
		this.#started = null;
		this.#surface.removeAttribute(PAINTER_ATTRIBUTE);
		if (failed === null || failed.kind === "cpu") return;
		const { fallBackToCpu } = await import("@archboard/renderer/browser");
		if (!this.#disposed) this.#employ(fallBackToCpu(failed.canvas, pageIsDark(), String(cause)));
	}

	/**
	 * Say on the surface which painter drew the frame.
	 * @param started The painter at work.
	 */
	#name(started: StartedPainter): void {
		if (this.#held.painting === undefined) {
			this.#surface.removeAttribute(PAINTER_ATTRIBUTE);
			return;
		}
		this.#surface.setAttribute(PAINTER_ATTRIBUTE, started.kind);
		if (started.reason === null) this.#surface.removeAttribute(PAINTER_REASON_ATTRIBUTE);
		else this.#surface.setAttribute(PAINTER_REASON_ATTRIBUTE, started.reason);
	}

	/**
	 * Draw the frame of a moment, and ask for the next while something moves.
	 * @param now The frame's time.
	 */
	readonly #tick = (now: number): void => {
		this.#frame = null;
		if (this.#started === null) return;
		fitPainter(this.#started);
		try {
			if (this.#started.painter.frame(now)) this.#invalidate();
		} catch (cause) {
			void this.#replacePainter(cause);
			return;
		}
		this.#name(this.#started);
	};

	/** Start the painter, the first time there is something to paint. */
	async #start(): Promise<void> {
		if (this.#starting || this.#started !== null) return;
		this.#starting = true;
		sizeCanvas(this.#canvas);
		try {
			const { startPainter } = await import("@archboard/renderer/browser");
			const next = await startPainter(this.#canvas, pageIsDark());
			if (this.#disposed) next.painter.free();
			else this.#employ(next);
		} catch (cause) {
			// No painter at all: the SVG stays, a correct board, and says why.
			this.#surface.setAttribute(PAINTER_REASON_ATTRIBUTE, String(cause));
		} finally {
			this.#starting = false;
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
 * @param canvas The canvas behind it.
 * @returns Take the stage away.
 */
function attachStage(surface: HTMLElement, canvas: HTMLCanvasElement): () => void {
	if (typeof ResizeObserver === "undefined" || typeof WebAssembly === "undefined") {
		return () => undefined;
	}
	const stage = new PictureStage(surface, canvas);
	stages.set(surface, stage);
	return () => {
		stage.dispose();
		stages.delete(surface);
	};
}

/** A pointer event, as far as a pick reads it. */
interface PointerPlace {
	readonly target: EventTarget | null;
	readonly currentTarget: EventTarget | null;
	readonly clientX: number;
	readonly clientY: number;
}

/**
 * What an event lands on in the picture, the topmost first. With a painter at
 * work the surface takes no pointer, so the painter answers. An event that
 * reached a group of the picture all the same came from no pointer: assistive
 * technology clicks the group it found, and the event says which.
 * @param event The event.
 * @returns The painter's answer, or null while no painter works or the event names its group.
 */
function pickedElements(event: PointerPlace): readonly (Element | null)[] | null {
	const viewport = event.currentTarget;
	const surface = viewport instanceof Element ? viewport.querySelector(SURFACE) : null;
	if (surface === null || namesItsGroup(event, surface)) return null;
	return stageOf(surface)?.elementsAt(event.clientX, event.clientY) ?? null;
}

/**
 * Whether an event reached a group of the picture.
 * @param event The event.
 * @param surface The picture's surface.
 * @returns True when its target is inside the surface.
 */
function namesItsGroup(event: PointerPlace, surface: Element): boolean {
	return event.target instanceof Node && surface.contains(event.target);
}

/**
 * What an event lands on in the picture.
 * @param event The event.
 * @returns The element the painter found, or the event's own target while no painter works.
 */
function pickedTarget(event: PointerPlace): EventTarget | null {
	const picked = pickedElements(event);
	return picked === null ? event.target : (picked[0] ?? null);
}

export {
	PAINTER_ATTRIBUTE,
	attachStage,
	pickedElements,
	pickedTarget,
	stageOf,
	type PictureStage,
	type StageCamera,
	type StageDive,
	type StageLight,
	type StageMarks,
	type StageShift,
};

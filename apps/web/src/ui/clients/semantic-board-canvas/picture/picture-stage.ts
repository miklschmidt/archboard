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
import { frameClock } from "@archboard/ui-kit/frame-clock";

/** The attribute on the surface that names the painter drawing it, once one has drawn. */
const PAINTER_ATTRIBUTE = "data-painter";

/** The attribute on the surface that says why the GPU does not paint. */
const PAINTER_REASON_ATTRIBUTE = "data-painter-reason";

/** The groups a painter's pick names, by counting them in document order. */
const PICKED = "[data-semantic-id],[data-toggle]";

/** The picture's surface, inside a viewport. */
const SURFACE = "[data-slot='semantic-board-surface']";

/** Where the camera puts the picture, in the surface's own pixels. */
interface StageCamera {
	readonly x: number;
	readonly y: number;
	readonly scale: number;
}

/** What is marked on the picture, each by its subject's id. */
interface StageMarks {
	readonly selected: ReadonlySet<string>;
	readonly whole: ReadonlySet<string>;
	readonly stuck: ReadonlySet<string>;
}

/** How the picture stands in the light, in the form the painter reads. */
interface StageLight {
	readonly rest: number;
	readonly labels: number;
	readonly subjects: Readonly<Record<string, { readonly opacity: number; readonly delay: number }>>;
	readonly duration: number;
}

/** What a client tells the stage of one canvas. */
interface PictureStage {
	/**
	 * Put a picture up in place of what stands there.
	 * @param painting The picture's painting, or nothing when it has none.
	 */
	readonly show: (painting: string | undefined) => void;
	/**
	 * Note the groups of the picture just written into the surface.
	 * @param root The element that holds them.
	 */
	readonly learnGroups: (root: ParentNode) => void;
	/**
	 * Move the picture.
	 * @param camera Where it goes.
	 * @param ms How long it takes.
	 */
	readonly setCamera: (camera: StageCamera, ms: number) => void;
	/**
	 * Swap between the near and the far view.
	 * @param far Whether the picture is seen from far.
	 * @param ms How long it takes.
	 */
	readonly setFar: (far: boolean, ms: number) => void;
	/**
	 * Say what is marked.
	 * @param marks The marks.
	 */
	readonly setMarks: (marks: StageMarks) => void;
	/**
	 * Light the picture.
	 * @param light How it stands in the light.
	 */
	readonly setLight: (light: StageLight) => void;
	/**
	 * What lies under a point on screen, the topmost first.
	 * @param x The point's distance from the screen's left.
	 * @param y The point's distance from the screen's top.
	 * @returns The picture's groups, a null for a shape in none, or null while no painter works.
	 */
	readonly elementsAt: (x: number, y: number) => readonly (Element | null)[] | null;
	/** Stop asking for frames and let the painter go. */
	readonly dispose: () => void;
}

/** What the stage holds for a painter that has not started or is replaced. */
interface Held {
	painting: string | undefined;
	camera: StageCamera;
	cameraMs: number;
	far: boolean;
	marks: StageMarks;
	light: StageLight | null;
}

/** Each surface's stage. */
const stages = new WeakMap<Element, PictureStage>();

/**
 * Whether the page is dark.
 * @returns True on the dark theme.
 */
function pageIsDark(): boolean {
	return document.documentElement.dataset["theme"] === "dark";
}

/**
 * The marks as the painter reads them.
 * @param marks The marks.
 * @returns JSON.
 */
function marksJson(marks: StageMarks): string {
	return JSON.stringify({
		selected: [...marks.selected],
		whole: [...marks.whole],
		stuck: [...marks.stuck],
	});
}

/**
 * Size a canvas to its box, in device pixels.
 * @param canvas The canvas.
 * @returns Whether its size changed.
 */
function sizeCanvas(canvas: HTMLCanvasElement): boolean {
	const ratio = window.devicePixelRatio || 1;
	const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
	const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
	if (canvas.width === width && canvas.height === height) return false;
	canvas.width = width;
	canvas.height = height;
	return true;
}

/**
 * Start the stage of a surface.
 * @param surface The element the SVG is written into.
 * @param canvas The canvas behind it.
 * @returns The stage.
 */
function createStage(surface: HTMLElement, canvas: HTMLCanvasElement): PictureStage {
	const held: Held = {
		painting: undefined,
		camera: { x: 0, y: 0, scale: 1 },
		cameraMs: 0,
		far: false,
		marks: { selected: new Set(), whole: new Set(), stuck: new Set() },
		light: null,
	};
	let started: StartedPainter | null = null;
	let starting = false;
	let disposed = false;
	let frame: number | null = null;
	let groups: readonly Element[] = [];

	/** Ask for one more frame, unless one is on its way. */
	function invalidate(): void {
		if (frame === null && started !== null) frame = frameClock().requestFrame(tick);
	}

	/**
	 * Hand a painter everything the page says now.
	 * @param painter The painter.
	 */
	function brief({ painter }: StartedPainter): void {
		const now = frameClock().now();
		painter.setTheme(pageIsDark());
		painter.setCamera(held.camera.x, held.camera.y, held.camera.scale, 0, now);
		painter.setFar(held.far, 0, now);
		painter.setMarks(marksJson(held.marks));
		if (held.light !== null) painter.setLight(JSON.stringify(held.light), now);
		if (held.painting === undefined) painter.clear();
		else painter.show(held.painting);
	}

	/**
	 * Put a painter to work.
	 * @param next The painter.
	 */
	function employ(next: StartedPainter): void {
		started = next;
		surface.removeAttribute(PAINTER_ATTRIBUTE);
		brief(next);
		invalidate();
	}

	/**
	 * Replace a painter that failed at work with Vello on the CPU.
	 * @param cause What went wrong.
	 */
	async function replacePainter(cause: unknown): Promise<void> {
		const failed = started;
		started = null;
		surface.removeAttribute(PAINTER_ATTRIBUTE);
		if (failed === null || failed.kind === "cpu") return;
		const { fallBackToCpu } = await import("@archboard/renderer/browser");
		if (!disposed) employ(fallBackToCpu(failed.canvas, pageIsDark(), String(cause)));
	}

	/**
	 * Draw the frame of a moment, and ask for the next while something moves.
	 * @param now The frame's time.
	 */
	function tick(now: number): void {
		frame = null;
		if (started === null) return;
		const { painter, kind, reason } = started;
		sizeCanvasFor(started);
		try {
			if (painter.frame(now)) invalidate();
		} catch (cause) {
			void replacePainter(cause);
			return;
		}
		if (held.painting === undefined) {
			surface.removeAttribute(PAINTER_ATTRIBUTE);
			return;
		}
		surface.setAttribute(PAINTER_ATTRIBUTE, kind);
		if (reason === null) surface.removeAttribute(PAINTER_REASON_ATTRIBUTE);
		else surface.setAttribute(PAINTER_REASON_ATTRIBUTE, reason);
	}

	/**
	 * Keep a painter's size to its canvas.
	 * @param painting The painter at work.
	 */
	function sizeCanvasFor(painting: StartedPainter): void {
		if (sizeCanvas(painting.canvas)) {
			painting.painter.resize(painting.canvas.width, painting.canvas.height);
		}
	}

	/** Start the painter, the first time there is something to paint. */
	function start(): void {
		if (starting || started !== null) return;
		starting = true;
		sizeCanvas(canvas);
		void import("@archboard/renderer/browser")
			.then(({ startPainter }) => startPainter(canvas, pageIsDark()))
			.then((next) => {
				if (disposed) next.painter.free();
				else employ(next);
			});
	}

	const watching = new ResizeObserver(() => {
		invalidate();
	});
	watching.observe(canvas);
	const theme = new MutationObserver(() => {
		started?.painter.setTheme(pageIsDark());
		invalidate();
	});
	theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

	return {
		show(painting) {
			held.painting = painting;
			if (painting === undefined || painting === "") {
				held.painting = undefined;
				started?.painter.clear();
				surface.removeAttribute(PAINTER_ATTRIBUTE);
				return;
			}
			start();
			started?.painter.show(painting);
			invalidate();
		},
		learnGroups(root) {
			groups = [...root.querySelectorAll(PICKED)];
		},
		setCamera(camera, ms) {
			const ratio = window.devicePixelRatio || 1;
			held.camera = { x: camera.x * ratio, y: camera.y * ratio, scale: camera.scale * ratio };
			held.cameraMs = ms;
			const { x, y, scale } = held.camera;
			started?.painter.setCamera(x, y, scale, ms, frameClock().now());
			invalidate();
		},
		setFar(far, ms) {
			held.far = far;
			started?.painter.setFar(far, ms, frameClock().now());
			invalidate();
		},
		setMarks(marks) {
			held.marks = marks;
			started?.painter.setMarks(marksJson(marks));
			invalidate();
		},
		setLight(light) {
			held.light = light;
			started?.painter.setLight(JSON.stringify(light), frameClock().now());
			invalidate();
		},
		elementsAt(x, y) {
			if (started === null || !surface.hasAttribute(PAINTER_ATTRIBUTE)) return null;
			const box = started.canvas.getBoundingClientRect();
			const ratio = window.devicePixelRatio || 1;
			const under = started.painter.pick((x - box.left) * ratio, (y - box.top) * ratio);
			return Array.from(under, (index) => groups[index] ?? null);
		},
		dispose() {
			disposed = true;
			watching.disconnect();
			theme.disconnect();
			if (frame !== null) frameClock().cancelFrame(frame);
			started?.painter.free();
			started = null;
		},
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
	const stage = createStage(surface, canvas);
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
 * work the surface takes no pointer, so the painter answers.
 * @param event The event.
 * @returns The painter's answer, or null while no painter works.
 */
function pickedElements(event: PointerPlace): readonly (Element | null)[] | null {
	const viewport = event.currentTarget;
	const surface = viewport instanceof Element ? viewport.querySelector(SURFACE) : null;
	if (surface === null) return null;
	return stageOf(surface)?.elementsAt(event.clientX, event.clientY) ?? null;
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
	type StageLight,
	type StageMarks,
};

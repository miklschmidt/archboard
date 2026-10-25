// The camera as one pane's state: what it is, and the three ways it moves.
//
// The state lives here rather than in the stage so that a refetch cannot
// disturb it. A new drawing arriving is a new prop, not a new component, and
// this hook holds nothing derived from the drawing's content — so a board that
// changes under somebody leaves them looking exactly where they were. That is
// also why a fit is told the diagram's size rather than remembering it: the
// camera knows where the person is looking and nothing about what they see.
//
// Where the camera is lives in a store of its own rather than in React state
// (`state/semantic-board-canvas/camera-store`). A hand that moves the camera
// keeps it moving until the hand has left it alone for a moment and its ease
// has ended. This hook says when that is (TASK-405).

import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";

import { COLUMN_MS, EXPLORING_MS } from "@archboard/timing";
import { frameClock } from "@archboard/ui-kit/frame-clock";
import { useCameraGlide } from "#ui/hooks/semantic-board-canvas/use-camera-glide.ts";
import {
	useCameraMotion,
	type CameraStage,
} from "#ui/hooks/semantic-board-canvas/use-camera-motion.ts";
import {
	ZOOM_STEP,
	cameraFor,
	panCamera,
	pinchCamera,
	zoomCameraAbout,
	type Camera,
	type Fingers,
	type FitTarget,
	type Size,
} from "#ui/rules/semantic-board-canvas/camera/camera.ts";
import { wheelZoomFactor } from "#ui/rules/semantic-board-canvas/camera/camera-motion.ts";
import {
	createCameraStore,
	type CameraStore,
	type CameraView,
} from "#ui/state/semantic-board-canvas/camera-store.ts";

/** How a person moves the camera, and where it is now. */
interface BoardCamera {
	/**
	 * Where the pane is looking now. A handler or an effect reads it; a component
	 * that draws with it subscribes instead, through `useCameraView`.
	 * @returns The camera and how its last move goes.
	 */
	readonly view: () => CameraView;
	/**
	 * Hear every move of the camera.
	 * @param listener Called after each move.
	 * @returns How to stop hearing them.
	 */
	readonly subscribe: (listener: () => void) => () => void;
	/**
	 * How big the window on the diagram is, or null before the stage has been
	 * laid out. A caller that wants to fit something watches this: the first
	 * paint of a pane can happen before it has a size, and a fit computed then
	 * would be a fit to nothing.
	 */
	readonly room: Size | null;
	/**
	 * How big the window on the diagram is right now. `room` says the same once
	 * the stage has stopped changing size; a flight that must end where a fit
	 * will put the camera asks for this, so it does not plan for a size the stage
	 * has since left.
	 * @returns The size, or null before the stage has been laid out.
	 */
	readonly measure: () => Size | null;
	/** Attach the viewport: the window the diagram is seen through. */
	readonly attachViewport: (element: HTMLElement | null) => void;
	/**
	 * Move the diagram at once, as a pointer dragging it does. It stops any move
	 * the camera was making, so the drag starts from what was seen, and the camera
	 * stays where the drag leaves it.
	 * @param dx How far right, in viewport pixels.
	 * @param dy How far down, in viewport pixels.
	 */
	readonly panBy: (dx: number, dy: number) => void;
	/**
	 * Follow two fingers that pinch, at once and with no ease, as a drag is
	 * followed. It stops any move the camera was making first.
	 * @param before Where the fingers were, in viewport pixels.
	 * @param after Where they are now.
	 */
	readonly pinch: (before: Fingers, after: Fingers) => void;
	/**
	 * Keep the camera's rest where it is until the hold is let go, however the
	 * camera moves meanwhile. A flight holds it, so the far view does not change
	 * in the flight or while the pane takes over from it.
	 * @returns Let the hold go. The rest then follows the camera, unless a hand still moves it.
	 */
	readonly hold: () => () => void;
	/**
	 * Move the diagram by easing it there, as a key does. A move asked for while
	 * another is under way adds to it.
	 * @param dx How far right, in viewport pixels.
	 * @param dy How far down, in viewport pixels.
	 */
	readonly ease: (dx: number, dy: number) => void;
	/**
	 * Stop a zoom or an ease where it is drawn. A glide is not stopped, and the
	 * camera does not count as the person's.
	 */
	readonly stop: () => void;
	/**
	 * Zoom about the middle of the viewport, which is where a keypress means.
	 * @param direction 1 to come closer, -1 to pull back.
	 */
	readonly zoomCentre: (direction: number) => void;
	/**
	 * Show the whole diagram, or one region of it, centred.
	 * @param target What to show: the whole diagram, or a region of it.
	 * @param instant Land at once rather than easing there: a fit the pane makes for a
	 * picture it has only just put up, where an eased move would show the picture sliding into place.
	 * @returns False when the stage has not been laid out yet, and nothing moved.
	 */
	readonly fit: (target: FitTarget, instant?: boolean) => boolean;
	/**
	 * Whether the person has moved the camera themselves since the last fit.
	 *
	 * What it is for: a stage keeps fitting itself while nobody has said where
	 * to look, and stops the moment somebody does. Without it a pane that is
	 * widened would either throw away the person's camera or stay fitted to a
	 * size it no longer has.
	 * @returns True once a pan or a zoom has happened.
	 */
	readonly handled: () => boolean;
	/**
	 * Move with the picture: when the next picture of a board places the cards
	 * the last one shared elsewhere on its page, the camera moves by as much,
	 * at once, so those cards stay where the reader was looking. Nobody moved
	 * the camera, so this hands nothing back and leaves a fit free to happen.
	 * @param shift How far the shared cards moved, in picture units.
	 * @param shift.x Across.
	 * @param shift.y Down.
	 */
	readonly followPicture: (shift: { readonly x: number; readonly y: number }) => void;
	/**
	 * Glide to a fit or to a camera along a path that pulls back to cross a long
	 * distance, and land there. Nobody moved the camera, so a fit stays free to
	 * happen unless the glide is giving a person back the camera they had.
	 * @param to What to show, or the camera to return to.
	 * @param duration How long, in milliseconds; zero lands at once.
	 * @param handledAfter Whether the camera counts as the person's once it lands.
	 * @returns False when the stage has not been laid out yet, and nothing moved.
	 */
	readonly glide: (to: FitTarget | Camera, duration: number, handledAfter?: boolean) => boolean;
	/**
	 * Keep the bottom of the viewport clear of what a fit shows, for something
	 * laid over it there.
	 * @param bottom How many pixels to keep clear; zero for none.
	 */
	readonly reserve: (bottom: number) => void;
}

/**
 * The most of a viewport's height a reserve may keep clear: past this, what the
 * reserve is for would be crowding out the picture it is laid over. Half is what
 * the box of a presented walkthrough may need, in a pane as narrow as one of two,
 * for the longest words a step has had.
 */
const MOST_RESERVED = 0.5;

/**
 * The part of a viewport a fit may use, once the reserve at its bottom is kept clear.
 * @param size The viewport's size, or null.
 * @param bottom The reserve.
 * @returns The usable size, or null before the viewport has one.
 */
function usable(size: Size | null, bottom: number): Size | null {
	if (size === null || bottom <= 0) {
		return size;
	}
	return { width: size.width, height: size.height - Math.min(bottom, size.height * MOST_RESERVED) };
}

/**
 * Where a glide is going: a fit worked out for the room, or a camera as given.
 * @param size The room, or null before there is one.
 * @param to A fit, or a camera.
 * @returns The camera to land at, or null when it cannot be worked out yet.
 */
function destinationIn(size: Size | null, to: FitTarget | Camera): Camera | null {
	if (size === null) {
		return null;
	}
	return "kind" in to ? cameraFor(size, to) : to;
}

/**
 * The element a viewport's camera moves.
 * @param viewport The viewport, or null.
 * @returns The surface, or null when there is none.
 */
function surfaceIn(viewport: HTMLElement | null): HTMLElement | null {
	return viewport?.querySelector<HTMLElement>("[data-slot='semantic-board-surface']") ?? null;
}

/**
 * How big an element is right now, or nothing before it is laid out.
 * @param element The element.
 * @returns Its size, or null when it has none yet.
 */
function sizeOf(element: HTMLElement | null): Size | null {
	if (element === null) {
		return null;
	}
	const box = element.getBoundingClientRect();
	return box.width > 0 && box.height > 0 ? { width: box.width, height: box.height } : null;
}

/**
 * Whether two sizes are the same, so a resize that changed nothing is not news.
 * @param one A size, or none.
 * @param other Another size, or none.
 * @returns True when they are the same size.
 */
function sameSize(one: Size | null, other: Size | null): boolean {
	return one?.width === other?.width && one?.height === other?.height;
}

/**
 * Bring a camera that a hand moved to rest. After a zoom it takes two frames.
 * In the first the camera's own layer goes, and the browser draws the whole
 * picture again at its new size. The rest follows in the next frame, so a swap
 * between the near and the far view that the rest starts (TASK-428) begins in
 * a frame of its own, not in the one that draws the whole picture again. A pan
 * changes no size, so it can start no swap, and it comes to rest at once.
 * @param store The camera's store.
 */
function comeToRest(store: CameraStore): void {
	const { camera, rest } = store.read();
	const clock = frameClock();
	if (camera.scale === rest.scale || !clock.animates) {
		store.settle();
		return;
	}
	const letGo = store.hold();
	store.settle();
	clock.requestFrame(() => {
		letGo();
	});
}

/**
 * Where in the viewport a wheel event happened.
 * @param element The viewport.
 * @param event The event.
 * @returns The point, relative to the viewport's top left.
 */
function pointIn(element: HTMLElement, event: WheelEvent): readonly [number, number] {
	const box = element.getBoundingClientRect();
	return [event.clientX - box.left, event.clientY - box.top];
}

/**
 * The camera for one diagram.
 * @param reducedMotion Whether the person asked for no motion: a zoom or a move then lands at once.
 * @returns The camera and the ways it moves.
 */
function useBoardCamera(reducedMotion = false): BoardCamera {
	const [store] = useState(createCameraStore);
	const { read, write } = store;
	const [viewport, setViewport] = useState<HTMLElement | null>(null);
	const [measured, setRoom] = useState<Size | null>(null);
	const [bottom, setBottom] = useState(0);
	const room = useMemo(() => usable(measured, bottom), [measured, bottom]);
	const flight = useCameraGlide();
	// The timer that brings a camera moved by hand to rest, while it runs.
	const resting = useRef<number | null>(null);
	/** Stop a glide where it is drawn, so whatever moves next starts from what was seen. */
	const settle = useCallback((): void => {
		const stopped = flight.stop();
		if (stopped !== null) {
			write({ ...read(), camera: stopped });
		}
	}, [flight, read, write]);
	const stage = useMemo<CameraStage>(
		() => ({
			/**
			 * Where the camera is drawn.
			 * @returns The camera.
			 */
			read: () => read().camera,
			/**
			 * Draw the camera somewhere, as a hand's move.
			 * @param camera Where.
			 * @param instant Whether the surface lands there at once.
			 */
			draw: (camera, instant) => {
				write({ camera, instant, hand: true });
			},
			/** The ease has ended: the camera is at rest, unless a hand moved it a moment ago. */
			still: () => {
				if (resting.current === null) comeToRest(store);
			},
		}),
		[read, write, store],
	);
	const motion = useCameraMotion(stage, reducedMotion);
	// Whether the person has said where to look since the last fit. A ref rather
	// than state: nothing is drawn from it, and it must be true for the very next
	// gesture rather than for the next render.
	const moved = useRef(false);

	// A hand moved the camera: it comes to rest once the hand has left it alone
	// for a moment and its ease, if it has one, has ended.
	const restLater = useCallback((): void => {
		const clock = frameClock();
		if (resting.current !== null) clock.cancelAfter(resting.current);
		resting.current = clock.after(EXPLORING_MS.cameraRest, () => {
			resting.current = null;
			if (!motion.easing()) comeToRest(store);
		});
	}, [motion, store]);
	// A camera that goes away takes its timer with it.
	useEffect(
		() => () => {
			if (resting.current !== null) frameClock().cancelAfter(resting.current);
			resting.current = null;
		},
		[],
	);

	// A pane can paint before it has been laid out, and a stage that fitted to
	// nothing then would stay unfitted for as long as nobody touched it. So the
	// size is watched rather than read once: the moment the stage has one, the
	// caller's fit can happen.
	// Measured before paint, so a fit made for the first picture lands before it is seen.
	useLayoutEffect(() => {
		const element = viewport;
		if (element === null) {
			return undefined;
		}
		/** Take the viewport's size, when it is a size it did not have before. */
		function measure(): void {
			const next = sizeOf(element);
			setRoom((current) => (sameSize(current, next) ? current : next));
		}
		measure();
		if (typeof ResizeObserver !== "function") {
			return undefined;
		}
		// A size that keeps changing, as a slide beside the pane does, is fitted to once it settles.
		let settling: number | undefined;
		/** Stop waiting for the size to settle. */
		const stopWaiting = (): void => {
			if (settling !== undefined) frameClock().cancelAfter(settling);
		};
		const observer = new ResizeObserver(() => {
			stopWaiting();
			settling = frameClock().after(COLUMN_MS.boardResizeSettle, measure);
		});
		observer.observe(element);
		return (): void => {
			stopWaiting();
			observer.disconnect();
		};
	}, [viewport]);

	const panBy = useCallback(
		(dx: number, dy: number): void => {
			settle();
			motion.halt();
			moved.current = true;
			write({ camera: panCamera(read().camera, dx, dy), instant: false, hand: true });
			restLater();
		},
		[settle, motion, read, write, restLater],
	);

	const pinch = useCallback(
		(before: Fingers, after: Fingers): void => {
			settle();
			motion.halt();
			moved.current = true;
			write({ camera: pinchCamera(read().camera, before, after), instant: true, hand: true });
			restLater();
		},
		[settle, motion, read, write, restLater],
	);

	const ease = useCallback(
		(dx: number, dy: number): void => {
			settle();
			moved.current = true;
			motion.ease(dx, dy);
			restLater();
		},
		[settle, motion, restLater],
	);

	const measure = useCallback(
		(): Size | null => usable(sizeOf(viewport), bottom),
		[viewport, bottom],
	);

	const zoomCentre = useCallback(
		(direction: number): void => {
			const size = measure();
			if (size === null) {
				return;
			}
			settle();
			moved.current = true;
			motion.zoomAt(direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP, {
				x: size.width / 2,
				y: size.height / 2,
			});
			restLater();
		},
		[measure, settle, motion, restLater],
	);

	const fit = useCallback(
		(target: FitTarget, atOnce = false): boolean => {
			const size = measure();
			const fitted = size === null ? null : cameraFor(size, target);
			if (fitted === null) {
				return false;
			}
			flight.stop();
			motion.halt();
			// A fit is the stage saying where to look, so it hands the camera back.
			moved.current = false;
			write({ camera: fitted, instant: atOnce });
			return true;
		},
		[measure, flight, motion, write],
	);

	const glide = useCallback(
		(to: FitTarget | Camera, duration: number, handledAfter = false): boolean => {
			const size = measure();
			const destination = destinationIn(size, to);
			const surface = surfaceIn(viewport);
			if (size === null || destination === null || surface === null) {
				return false;
			}
			motion.halt();
			const from = flight.stop() ?? read().camera;
			moved.current = handledAfter;
			write({ camera: from, instant: true });
			flight.start(from, destination, {
				duration,
				viewport: size,
				surface,
				/**
				 * Commit where the glide landed, once.
				 * @param camera Where it landed.
				 */
				land: (camera) => {
					write({ ...read(), camera });
				},
			});
			return true;
		},
		[viewport, measure, flight, motion, read, write],
	);

	const reserve = useCallback((pixels: number): void => {
		setBottom(Math.max(0, Math.round(pixels)));
	}, []);

	// The wheel is listened for natively because a zoom has to stop the page
	// from scrolling, and React's own wheel listener is passive.
	useEffect(() => {
		const element = viewport;
		if (element === null) {
			return undefined;
		}
		/**
		 * Zoom about the pointer: a turn of the wheel eases there, and a pinch on a
		 * trackpad, which arrives as a wheel with Control held, is followed at once.
		 * @param event The wheel event.
		 */
		function onWheel(event: WheelEvent): void {
			if (element === null) {
				return;
			}
			event.preventDefault();
			settle();
			const [x, y] = pointIn(element, event);
			moved.current = true;
			if (event.ctrlKey) {
				motion.halt();
				const camera = zoomCameraAbout(read().camera, wheelZoomFactor(event), x, y);
				write({ camera, instant: true, hand: true });
			} else {
				motion.zoomAt(wheelZoomFactor(event), { x, y });
			}
			restLater();
		}
		element.addEventListener("wheel", onWheel, { passive: false });
		return (): void => element.removeEventListener("wheel", onWheel);
	}, [viewport, settle, motion, read, write, restLater]);

	const handled = useCallback((): boolean => moved.current, []);
	const followPicture = useCallback(
		(shift: { readonly x: number; readonly y: number }): void => {
			if (shift.x === 0 && shift.y === 0) return;
			motion.halt();
			// Known at once: a glide asked for in the same commit starts from where
			// the camera follows to, not from where it was.
			const current = read().camera;
			const followed = panCamera(current, shift.x * current.scale, shift.y * current.scale);
			write({ camera: followed, instant: true });
		},
		[motion, read, write],
	);
	return useMemo(
		() => ({
			view: read,
			subscribe: store.subscribe,
			room,
			measure,
			attachViewport: setViewport,
			panBy,
			pinch,
			hold: store.hold,
			ease,
			stop: motion.halt,
			zoomCentre,
			fit,
			handled,
			followPicture,
			glide,
			reserve,
		}),
		[
			store,
			read,
			room,
			measure,
			panBy,
			pinch,
			ease,
			motion,
			zoomCentre,
			fit,
			handled,
			followPicture,
			glide,
			reserve,
		],
	);
}

/**
 * Where the camera is, for a component that draws with it: drawn again on every move.
 * @param camera The camera.
 * @returns Where it is, and how its last move goes.
 */
function useCameraView(camera: BoardCamera): CameraView {
	return useSyncExternalStore(camera.subscribe, camera.view, camera.view);
}

/**
 * One thing about where the camera is, for a component that draws with that
 * alone: drawn again only when it changes.
 * @param camera The camera.
 * @param select What to read off it; a value compared by identity.
 * @returns What was read.
 */
function useCameraWith<T>(camera: BoardCamera, select: (view: CameraView) => T): T {
	/**
	 * What is read off the camera now.
	 * @returns It.
	 */
	const read = (): T => select(camera.view());
	return useSyncExternalStore(camera.subscribe, read, read);
}

export { useBoardCamera, useCameraView, useCameraWith, type BoardCamera, type CameraView };

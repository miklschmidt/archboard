// A drawn semantic board, and the two things the browser owns about it: where
// the person is looking, and what they have picked out.
//
// Both are session state. The camera and the selection are never written down,
// never sent to the server and never part of an address; the board on disk is
// the only thing that outlives the tab, and this viewer never writes it
// (ADR 0023). What the server sends is a picture and an atlas, and everything
// below is about putting the two together.

import {
	useCallback,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type JSX,
	type KeyboardEvent,
	type MouseEvent,
	type PointerEvent,
	type ReactNode,
} from "react";

import { PRESENTATION_STEP_MS } from "@/shared/timing/timing";
import type { SemanticDrawing } from "@/ui/semantic-board-canvas/api/semantic-boards";
import {
	STAGE_CLASS,
	StageSpinner,
} from "@/ui/semantic-board-canvas/components/SemanticStageStates";
import type { BoardCamera } from "@/ui/semantic-board-canvas/hooks/use-board-camera";
import {
	usePictureTransition,
	type StagedPicture,
} from "@/ui/semantic-board-canvas/hooks/use-picture-transition";
import { PAN_STEP, cameraTransform, type Size } from "@/ui/semantic-board-canvas/lib/camera";
import {
	leavePicture,
	stayPicture,
	type Departure,
} from "@/ui/semantic-board-canvas/lib/picture-departure";
import { NO_FOCUS, subjectMarks, type BeatFocus } from "@/ui/semantic-board-canvas/lib/narrative";
import {
	markGroupFocus,
	markSubjects,
	subjectAt,
	type GroupMarks,
} from "@/ui/semantic-board-canvas/lib/subjects";

/** Which way each arrow key moves the diagram under the viewport. */
const PAN_KEYS: Readonly<Record<string, readonly [number, number]>> = {
	ArrowUp: [0, 1],
	ArrowDown: [0, -1],
	ArrowLeft: [1, 0],
	ArrowRight: [-1, 0],
};

/** Which way each zoom key goes. Both spellings of each: shifted and not. */
const ZOOM_KEYS: Readonly<Record<string, number>> = { "+": 1, "=": 1, "-": -1, _: -1 };

/** How far a pointer may travel and still be a click rather than a drag. */
const DRAG_SLOP = 4;

/** A gesture in progress: one pointer, from where it began to where it is. */
interface Drag {
	readonly pointerId: number;
	/** Where the press landed. How far the gesture has travelled is measured from here. */
	readonly fromX: number;
	readonly fromY: number;
	/** Where the pointer was last seen, which is what each pan step is measured against. */
	readonly x: number;
	readonly y: number;
	/** The subject the press landed on, decided before anything can move. */
	readonly pressed: string | null;
	/** Whether the viewport has taken the pointer, which it does only to pan. */
	readonly captured: boolean;
}

/**
 * Take or give back a pointer, tolerating a DOM that does not do capture.
 *
 * Pointer capture is what keeps a pan going when the pointer leaves the pane,
 * and it is also the first thing a lightweight DOM leaves out; a viewer that
 * threw without it would be untestable for the sake of an edge of a gesture.
 *
 * It is taken only once a pan is really under way. While an element holds the
 * pointer the browser dispatches the click to that element rather than to what
 * was under the pointer, so capturing on every press would mean every click
 * arriving at the viewport and every pick resolving to nothing.
 * @param element The viewport.
 * @param pointerId The pointer.
 * @param take True to take the pointer, false to give it back.
 */
function capturePointer(element: Element, pointerId: number, take: boolean): void {
	try {
		if (take) {
			element.setPointerCapture(pointerId);
		} else {
			element.releasePointerCapture(pointerId);
		}
	} catch {
		// A DOM without pointer capture still pans; only the gesture's edges differ.
	}
}

/**
 * Whether a gesture has gone far enough to be a pan rather than a press.
 *
 * Measured from where the gesture began, never from the last move: a slow drag
 * of a hundred one-pixel steps has travelled a hundred pixels, and counting
 * each step on its own would call the whole thing a click.
 * @param started The gesture, as it began.
 * @param x Where the pointer is now, across.
 * @param y Where the pointer is now, down.
 * @returns True once it has passed the tolerance.
 */
function hasTravelled(started: Drag, x: number, y: number): boolean {
	return Math.abs(x - started.fromX) + Math.abs(y - started.fromY) > DRAG_SLOP;
}

/**
 * Take the pointer once a press has become a pan, and say whether it is held.
 *
 * A pan should keep tracking after the pointer leaves the pane, which is what
 * capture is for. A press must not be captured at all: while an element holds
 * the pointer the browser sends the click to that element rather than to what
 * was under it, so capturing every press would send every click to the viewport.
 * @param event The move.
 * @param started The gesture, as it began.
 * @param panned Whether this has become a pan.
 * @returns Whether the viewport now holds the pointer.
 */
function takePointerToPan(
	event: PointerEvent<HTMLElement>,
	started: Drag,
	panned: boolean,
): boolean {
	if (panned && !started.captured) {
		capturePointer(event.currentTarget, event.pointerId, true);
	}
	return started.captured || panned;
}

/**
 * Act on a key that moves the camera.
 * @param key The key that was pressed.
 * @param camera The camera.
 * @param content How big the diagram is, for the key that fits it.
 * @returns True when the key was one of the camera's.
 */
function moveCameraByKey(key: string, camera: BoardCamera, content: Size): boolean {
	const pan = PAN_KEYS[key];
	if (pan !== undefined) {
		camera.panBy(pan[0] * PAN_STEP, pan[1] * PAN_STEP);
		return true;
	}
	const zoom = ZOOM_KEYS[key];
	if (zoom !== undefined) {
		camera.zoomCentre(zoom);
		return true;
	}
	if (key === "0") {
		camera.fit({ kind: "whole", content });
		return true;
	}
	return false;
}

/**
 * The surface's classes: a transition for a keyed move or a fit, and none
 * while a drag is in progress, since a pan is meant to track the pointer, nor
 * for a move that follows the picture, which must land in the frame the picture does.
 * @param panning Whether a drag is in progress.
 * @param reducedMotion Whether the person asked for reduced motion.
 * @param following Whether the camera last moved to follow the picture.
 * @returns The class list.
 */
function surfaceClass(panning: boolean, reducedMotion: boolean, following = false): string {
	const base = "absolute top-0 left-0 origin-top-left select-none";
	return panning || reducedMotion || following
		? base
		: `${base} transition-transform duration-100 ease-out motion-reduce:transition-none`;
}

/**
 * What the stage says about itself, for whoever reads it from outside: which
 * board it is about, and whether it is showing that board or waiting for it.
 * @param departure Where the reader went, when the picture is leaving.
 * @param drawing The picture on the surface.
 * @param stale Whether a read since the picture loaded has failed.
 * @returns The section's attributes.
 */
function stageMarks(
	departure: Departure | null,
	drawing: SemanticDrawing,
	stale: boolean,
): { "aria-label": string; "aria-busy"?: true; "data-state": string } {
	if (departure !== null) {
		return {
			"aria-label": `Semantic board ${departure.board}`,
			"aria-busy": true,
			"data-state": "loading",
		};
	}
	return {
		"aria-label": `Semantic board ${drawing.board}`,
		"data-state": stale ? "stale" : "drawn",
	};
}

/**
 * Whether the picture is on its way out.
 * @param departure Where the reader went, or null.
 * @returns True while it leaves.
 */
function isLeaving(departure: Departure | null): boolean {
	return departure !== null;
}

/**
 * What a pane leaving its picture says aloud, and shows once the next is slow.
 * @param props Where the reader went, or null while they stay.
 * @param props.departure Where the reader went.
 * @param props.at Which part: the announcement, or the spinner over the picture.
 * @returns That part, or nothing while the pane stays.
 */
function LeavingPart(props: {
	readonly departure: Departure | null;
	readonly at: "announcement" | "spinner";
}): JSX.Element | null {
	const { departure, at } = props;
	if (departure === null) {
		return null;
	}
	return at === "announcement" ? (
		<p aria-live="polite" className="sr-only">
			Drawing {departure.board}…
		</p>
	) : (
		<StageSpinner className="pointer-events-none absolute inset-0" />
	);
}

/** Inputs for a drawn board. */
interface SemanticDiagramProps {
	/** The stage owns the camera across picture requests. */
	readonly camera: BoardCamera;
	/** The picture and the atlas, as the server drew them. */
	drawing: SemanticDrawing;
	/** The selected semantic id, or null for none. */
	selection: string | null;
	/**
	 * The person picked a subject out, or cleared the selection.
	 * @param id The semantic id, or null.
	 */
	onSelect: (id: string | null) => void;
	/** Whether the person asked for reduced motion; the shell owns the preference. */
	reducedMotion: boolean;
	/**
	 * What is on screen is the last picture that loaded, and a read since then
	 * has failed. The diagram stays; the stage says so.
	 */
	stale?: boolean | undefined;
	/** The disclosure above the diagram, when there is something to disclose. */
	notice?: ReactNode;
	/**
	 * What the beat the person is reading asks of the picture, when a
	 * walkthrough is open beside it.
	 */
	focus?: BeatFocus | undefined;
	/** The group under inspection, or null for none. */
	groupId: string | null;
	/** What that inspection lights, keeps readable and treats as context, or null. */
	groupMarks: GroupMarks | null;
	/**
	 * The picture is on its way out: the reader went to another board, and
	 * this one is kept only to be seen leaving while that one is drawn.
	 */
	departure?: Departure | null | undefined;
	/**
	 * Where the reader went from the picture before this one, while the pane is
	 * arriving from it: the last picture goes that way as this one comes in.
	 */
	heading?: Departure | null | undefined;
	/**
	 * The step of a presented walkthrough on screen, or null while none is
	 * presented. The pane says which step it is showing, lets what the step is
	 * not about recede gradually, and carries a step read through another view
	 * rather than bringing its picture in afresh.
	 */
	presenting?: number | null | undefined;
}

/**
 * The surface's classes and the stage's marks while a walkthrough is presented.
 * @param step The step on screen, or null or undefined while none is presented.
 * @returns The class to add to the surface, and the attribute for the stage.
 */
function presentationMarks(step: number | null | undefined): {
	readonly surface: string;
	readonly stage: { readonly "data-presentation-step"?: number };
} {
	return step === null || step === undefined
		? { surface: "", stage: {} }
		: { surface: " is-presenting", stage: { "data-presentation-step": step } };
}

/**
 * Send the picture on its way out while the pane is leaving it, and bring it
 * back when the reader returns to it before anything else arrived.
 * @param picture The picture on the surface.
 * @param leaving Where the reader went, or null while they stay.
 * @param reducedMotion Whether the person asked for no motion.
 * @returns Where the reader went, or null.
 */
function useLeaving(
	picture: StagedPicture | null,
	leaving: Departure | null | undefined,
	reducedMotion: boolean,
): Departure | null {
	const departure = leaving ?? null;
	useLayoutEffect(() => {
		const root = picture?.root;
		if (!(root instanceof SVGElement)) {
			return;
		}
		if (departure === null) {
			stayPicture(root);
		} else {
			leavePicture(root, departure, reducedMotion);
		}
	}, [picture, departure, reducedMotion]);
	return departure;
}

/**
 * A drawn semantic board: pan, zoom and selection over the server's picture.
 * @param props The drawing, the selection and what to do with a pick.
 * @returns The stage.
 */
function SemanticDiagram(props: SemanticDiagramProps): JSX.Element {
	const { drawing, selection, onSelect, reducedMotion, camera } = props;
	const content = useMemo(
		() => ({ width: drawing.width, height: drawing.height }),
		[drawing.width, drawing.height],
	);
	const { attachViewport } = camera;
	const view = camera.camera;
	const [surface, setSurface] = useState<HTMLDivElement | null>(null);
	const [panning, setPanning] = useState(false);
	const drag = useRef<Drag | null>(null);
	const dragged = useRef(false);
	// What the last press landed on, carried from pointerup to the click that
	// follows it. A click is the only event that means "the person picked this",
	// and it is the one event whose target cannot be trusted to say what. The
	// box is null when no press is waiting to be spent, which is how a
	// synthesised click is told from a real one.
	const pressed = useRef<{ readonly subject: string | null } | null>(null);
	const focus = props.focus ?? NO_FOCUS;

	// The surface stays mounted across pictures and the picture inside it is
	// written by the transition, which carries one picture of a board into the
	// next. What comes back is the picture as it is now on the surface, new
	// each time the markup was written, so the marks below run over the groups
	// that are actually there.
	const picture = usePictureTransition(surface, drawing, {
		reducedMotion,
		keepStill: camera.followPicture,
		heading: props.heading,
		presenting: presentationMarks(props.presenting).surface !== "",
	});
	// After the picture is staged, so a picture that just replaced a leaving one
	// is never mistaken for it.
	const departure = useLeaving(picture, props.departure, reducedMotion);
	// Attention only. What the board says nobody has decided is drawn into the
	// picture by the renderer, from the same reconciliation the sentences above
	// it are written from, so it is legible on a pane with nothing selected and
	// no walkthrough open — and a subject that is both attended and unsettled
	// says both, which it could not while one map held one mark per subject.
	const marked = useMemo(() => subjectMarks(selection, focus), [selection, focus]);
	// Before paint, both: a picture put up fresh — a flight landing, most of all —
	// must never be seen for a frame without its marks, or what they light and
	// veil is seen to switch off and fade back in.
	useLayoutEffect(() => {
		if (picture !== null) {
			markSubjects(picture.root, marked);
		}
	}, [picture, marked]);
	// A group under inspection is its own set of marks, independent of
	// attention: a member the person also picked out says both.
	const { groupMarks } = props;
	useLayoutEffect(() => {
		if (picture !== null) {
			markGroupFocus(picture.surface, groupMarks);
		}
	}, [picture, groupMarks]);

	const onPointerDown = useCallback(
		(event: PointerEvent<HTMLElement>): void => {
			if (event.button !== 0) {
				return;
			}
			// What was pressed is decided here and nowhere else. By the time a click
			// arrives the diagram may have been panned, and the click may have been
			// retargeted by pointer capture; neither can change what was under the
			// pointer when the person pressed.
			drag.current = {
				pointerId: event.pointerId,
				fromX: event.clientX,
				fromY: event.clientY,
				x: event.clientX,
				y: event.clientY,
				pressed: subjectAt(event.target, drawing.atlas),
				captured: false,
			};
			dragged.current = false;
			setPanning(true);
		},
		[drawing.atlas],
	);

	const onPointerMove = useCallback(
		(event: PointerEvent<HTMLElement>): void => {
			const started = drag.current;
			if (started === null || started.pointerId !== event.pointerId) {
				return;
			}
			const panned = dragged.current || hasTravelled(started, event.clientX, event.clientY);
			dragged.current = panned;
			drag.current = {
				...started,
				x: event.clientX,
				y: event.clientY,
				captured: takePointerToPan(event, started, panned),
			};
			camera.panBy(event.clientX - started.x, event.clientY - started.y);
		},
		[camera],
	);

	const onPointerUp = useCallback((event: PointerEvent<HTMLElement>): void => {
		const started = drag.current;
		if (started?.pointerId !== event.pointerId) {
			return;
		}
		pressed.current = { subject: started.pressed };
		drag.current = null;
		setPanning(false);
		if (started.captured) {
			capturePointer(event.currentTarget, event.pointerId, false);
		}
	}, []);

	// A gesture the browser took away never became a pick. Whatever the press
	// landed on is forgotten, so the next click cannot inherit it.
	const onPointerCancel = useCallback((event: PointerEvent<HTMLElement>): void => {
		if (drag.current?.pointerId !== event.pointerId) {
			return;
		}
		drag.current = null;
		dragged.current = false;
		pressed.current = null;
		setPanning(false);
	}, []);

	// A drag that ends on a card is not a pick: the person was moving the
	// diagram and happened to let go over something.
	//
	// The pick is what the press landed on, not what the click reports. A click
	// is retargeted to whichever element holds the pointer, and it arrives after
	// a pan has already moved the diagram under the cursor, so its own target
	// answers a different question from the one being asked.
	const onClick = useCallback(
		(event: MouseEvent<HTMLElement>): void => {
			const landed = pressed.current;
			pressed.current = null;
			if (dragged.current) {
				dragged.current = false;
				return;
			}
			// A click with no press behind it can only have been synthesised; there
			// its own target is the only thing there is to go on.
			onSelect(landed === null ? subjectAt(event.target, drawing.atlas) : landed.subject);
		},
		[onSelect, drawing.atlas],
	);

	const onKeyDown = useCallback(
		(event: KeyboardEvent<HTMLElement>): void => {
			if (moveCameraByKey(event.key, camera, content)) {
				event.preventDefault();
				return;
			}
			if (event.key === "Escape") {
				onSelect(null);
				event.preventDefault();
			}
		},
		[camera, content, onSelect],
	);

	const surfaceStyle = useMemo<CSSProperties>(
		() => ({
			width: drawing.width,
			height: drawing.height,
			transform: cameraTransform(view),
			"--presentation-step-ms": `${PRESENTATION_STEP_MS}ms`,
		}),
		[drawing.width, drawing.height, view],
	);

	return (
		<section
			{...stageMarks(departure, drawing, props.stale === true)}
			data-slot="semantic-board-stage"
			data-board={drawing.board}
			data-variant={drawing.variant.name}
			data-version={drawing.version}
			data-group={props.groupId}
			{...presentationMarks(props.presenting).stage}
			className={STAGE_CLASS}
		>
			{props.notice}
			<LeavingPart departure={departure} at="announcement" />
			<div className="relative flex min-h-0 min-w-0 flex-1">
				{/* The viewport is the tab stop, and it is a plain box on purpose: a
				    pan-and-zoom diagram is a keyboard surface that no native element
				    and no ARIA role describes, and every role that would satisfy the
				    rules below would be a lie about what this is. It still has to be
				    reachable and still has to hear keys — the arrows pan, `+` and `-`
				    zoom, `0` fits and Escape clears the selection — so the two rules
				    are answered with the name on the section around it instead. */}
				{/* oxlint-disable jsx-a11y/no-noninteractive-tabindex */}
				{/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions */}
				<div
					ref={attachViewport}
					data-slot="semantic-board-viewport"
					inert={isLeaving(departure)}
					tabIndex={0}
					onKeyDown={onKeyDown}
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					onPointerCancel={onPointerCancel}
					onClick={onClick}
					className={`relative flex min-h-0 min-w-0 flex-1 overflow-hidden outline-none ${
						panning ? "cursor-grabbing" : "cursor-grab"
					}`}
				>
					{/* The picture inside is the transition's to write, never React's:
					    see `usePictureTransition`. */}
					<div
						ref={setSurface}
						data-slot="semantic-board-surface"
						style={surfaceStyle}
						className={`${surfaceClass(panning, reducedMotion, camera.instant)}${presentationMarks(props.presenting).surface}`}
					/>
				</div>
				{/* oxlint-enable jsx-a11y/no-noninteractive-tabindex */}
				<LeavingPart departure={departure} at="spinner" />
			</div>
		</section>
	);
}

export { SemanticDiagram, moveCameraByKey, surfaceClass, type SemanticDiagramProps };

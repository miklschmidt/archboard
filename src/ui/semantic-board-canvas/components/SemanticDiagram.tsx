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
import { SemanticSubjectTip } from "@/ui/semantic-board-canvas/components/SemanticSubjectTip";
import {
	STAGE_CLASS,
	StageSpinner,
} from "@/ui/semantic-board-canvas/components/SemanticStageStates";
import type { BoardCamera } from "@/ui/semantic-board-canvas/hooks/use-board-camera";
import type { VariantReading } from "@/ui/semantic-board-canvas/lib/board-document";
import { useDrillOpen } from "@/ui/semantic-board-canvas/hooks/use-drill-open";
import {
	usePictureTransition,
	type StagedPicture,
} from "@/ui/semantic-board-canvas/hooks/use-picture-transition";
import { usePresentationArrival } from "@/ui/semantic-board-canvas/hooks/use-presentation-arrival";
import { useSubjectTip } from "@/ui/semantic-board-canvas/hooks/use-subject-tip";
import { useViewerMarks } from "@/ui/semantic-board-canvas/hooks/use-viewer-marks";
import { useStickyHeads } from "@/ui/semantic-board-canvas/hooks/use-sticky-heads";
import {
	FAR_SCALE,
	PAN_STEP,
	cameraTransform,
	type Size,
} from "@/ui/semantic-board-canvas/lib/camera";
import {
	leavePicture,
	stayPicture,
	type Departure,
} from "@/ui/semantic-board-canvas/lib/picture-departure";
import { NO_FOCUS, type BeatFocus } from "@/ui/semantic-board-canvas/lib/narrative";
import {
	capturePointer,
	hasTravelled,
	takePointerToPan,
	type Drag,
} from "@/ui/semantic-board-canvas/lib/pointer-gesture";
import { openableAt } from "@/ui/semantic-board-canvas/lib/subject-tips";
import type { GroupSelection } from "@/ui/semantic-board-canvas/lib/groups";
import { subjectAt, surfaceMarks } from "@/ui/semantic-board-canvas/lib/subjects";

/** Which way each arrow key moves the diagram under the viewport. */
const PAN_KEYS: Readonly<Record<string, readonly [number, number]>> = {
	ArrowUp: [0, 1],
	ArrowDown: [0, -1],
	ArrowLeft: [1, 0],
	ArrowRight: [-1, 0],
};

/** Which way each zoom key goes. Both spellings of each: shifted and not. */
const ZOOM_KEYS: Readonly<Record<string, number>> = { "+": 1, "=": 1, "-": -1, _: -1 };

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
	 * What the board says about the variant the picture draws, which its tips
	 * and double-clicks read; null for a picture on its way out.
	 */
	reading: VariantReading | null;
	/**
	 * Follow a card's drill-down, which a double-click on the card asks for.
	 * @param board The target board.
	 * @param variant The variant to open, by id.
	 */
	onOpenDown?: ((board: string, variant: string) => void) | undefined;
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
	/** The selected group and its members, each marked as attended; null for none. */
	group: GroupSelection | null;
	/** What a presented step's veil leaves standing; null for no veil. */
	veil: ReadonlySet<string> | null;
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
	/** What the surface of a presented step has to come to rest on, or null. */
	arrivalKey?: string | null | undefined;
	/**
	 * The surface came to rest on that key, or moved again (TASK-251).
	 * @param key The key it rests on, or null while it is moving.
	 */
	onSettled?: ((key: string | null) => void) | undefined;
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
 * What the board says about the variant the picture on the surface draws. While
 * another variant is being drawn the last picture stays up, and its tips and
 * double-clicks must not read the variant that has not arrived.
 * @param reading What the board says about the variant asked for, or null.
 * @param drawing The picture on the surface.
 * @returns The reading, when it is of the drawn variant; else null.
 */
function drawnReading(
	reading: VariantReading | null,
	drawing: SemanticDrawing,
): VariantReading | null {
	return reading?.variant?.id === drawing.variant.id ? reading : null;
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
	usePresentationArrival(surface, props.arrivalKey ?? null, props.onSettled);
	// After the picture is staged, so a picture that just replaced a leaving one
	// is never mistaken for it.
	const departure = useLeaving(picture, props.departure, reducedMotion);
	useViewerMarks(picture, { selection, focus, group: props.group, veil: props.veil });
	useStickyHeads(picture, drawing.atlas);
	// Seen from far away, each card's name is drawn larger in place of what it
	// says it does, which nobody reads at that size.
	const far = view.scale < FAR_SCALE;
	const marks = surfaceMarks({ veiled: props.veil !== null, far });
	const tip = useSubjectTip({ drawing, camera: cameraTransform(view) });
	const { dismiss: dismissTip, onHover } = tip;
	const reading = drawnReading(props.reading, drawing);
	const openDown = useDrillOpen(reading, props.onOpenDown);

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
			dismissTip();
		},
		[drawing.atlas, dismissTip],
	);

	const onPointerMove = useCallback(
		(event: PointerEvent<HTMLElement>): void => {
			const started = drag.current;
			if (started === null) {
				onHover(event);
				return;
			}
			if (started.pointerId !== event.pointerId) {
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
		[camera, onHover],
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

	// A double-click on a card, or a container's header, opens the board one
	// level down, when it has one.
	const onDoubleClick = useCallback(
		(event: MouseEvent<HTMLElement>): void => {
			openDown(openableAt(event.target, event.clientY));
		},
		[openDown],
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
			data-group={props.group?.group}
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
					onPointerLeave={dismissTip}
					onWheel={dismissTip}
					onClick={onClick}
					onDoubleClick={onDoubleClick}
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
						className={`${surfaceClass(panning, reducedMotion, camera.instant)}${presentationMarks(props.presenting).surface}${marks}`}
					/>
				</div>
				{/* oxlint-enable jsx-a11y/no-noninteractive-tabindex */}
				<SemanticSubjectTip target={tip.shown} reading={reading} far={far} />
				<LeavingPart departure={departure} at="spinner" />
			</div>
		</section>
	);
}

export { SemanticDiagram, moveCameraByKey, surfaceClass, type SemanticDiagramProps };

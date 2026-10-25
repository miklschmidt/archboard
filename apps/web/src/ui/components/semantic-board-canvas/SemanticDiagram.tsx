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
	useEffect,
	useLayoutEffect,
	useMemo,
	useState,
	type JSX,
	type KeyboardEvent,
	type PointerEvent,
	type ReactNode,
} from "react";

import { EXPLORING_MS } from "@archboard/timing";
import type { SemanticDrawing } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import { CameraSurface } from "#ui/components/semantic-board-canvas/CameraSurface.tsx";
import { SemanticSubjectTip } from "#ui/components/semantic-board-canvas/SemanticSubjectTip.tsx";
import {
	STAGE_CLASS,
	StageSpinner,
} from "#ui/components/semantic-board-canvas/SemanticStageStates.tsx";
import {
	useCameraWith,
	type BoardCamera,
	type CameraView,
} from "#ui/hooks/semantic-board-canvas/use-board-camera.ts";
import type { VariantReading } from "#ui/rules/semantic-board-canvas/board/board-document.ts";
import { useCodeMarks } from "#ui/hooks/semantic-board-canvas/use-code-marks.ts";
import { useDiagramGestures } from "#ui/hooks/semantic-board-canvas/use-diagram-gestures.ts";
import { useDrillOpen } from "#ui/hooks/semantic-board-canvas/use-drill-open.ts";
import { useLighting } from "#ui/hooks/semantic-board-canvas/use-lighting.ts";
import { usePeeked } from "#ui/hooks/semantic-board-canvas/use-peek.ts";
import {
	usePictureTransition,
	type StagedPicture,
} from "#ui/hooks/semantic-board-canvas/use-picture-transition.ts";
import { usePresentationArrival } from "#ui/hooks/semantic-board-canvas/use-presentation-arrival.ts";
import { useSubjectTip } from "#ui/hooks/semantic-board-canvas/use-subject-tip.ts";
import { useViewerMarks } from "#ui/hooks/semantic-board-canvas/use-viewer-marks.ts";
import { useStickyHeads } from "#ui/hooks/semantic-board-canvas/use-sticky-heads.ts";
import { useSweep } from "#ui/hooks/semantic-board-canvas/use-sweep.ts";
import { useTrafficRest } from "#ui/hooks/semantic-board-canvas/use-traffic-rest.ts";
import { FAR_SCALE, PAN_STEP, type Size } from "#ui/rules/semantic-board-canvas/camera/camera.ts";
import {
	leavePicture,
	stayPicture,
	type Departure,
} from "#ui/clients/semantic-board-canvas/picture/picture-departure.ts";
import { NO_FOCUS, type BeatFocus } from "#ui/rules/semantic-board-canvas/walkthrough/narrative.ts";
import type { GroupSelection } from "#ui/rules/semantic-board-canvas/board/groups.ts";
import type { AnswerStep } from "#ui/rules/semantic-board-canvas/board/connections.ts";
import { surfaceMarks } from "#ui/clients/semantic-board-canvas/subjects/subjects.ts";
import type { OpenDown } from "#ui/rules/semantic-board-canvas/drilling/drill-target.ts";

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
 * Act on a key that moves the camera: the arrows ease it, `+` and `-` ease a
 * zoom about the middle, and `0` glides to the whole board.
 * @param key The key that was pressed.
 * @param camera The camera.
 * @param content How big the diagram is, for the key that fits it.
 * @param reducedMotion Whether the person asked for no motion, which makes the fit a cut.
 * @returns True when the key was one of the camera's.
 */
function moveCameraByKey(
	key: string,
	camera: BoardCamera,
	content: Size,
	reducedMotion: boolean,
): boolean {
	const pan = PAN_KEYS[key];
	if (pan !== undefined) {
		camera.ease(pan[0] * PAN_STEP, pan[1] * PAN_STEP);
		return true;
	}
	const zoom = ZOOM_KEYS[key];
	if (zoom !== undefined) {
		camera.zoomCentre(zoom);
		return true;
	}
	if (key === "0") {
		camera.glide({ kind: "whole", content }, reducedMotion ? 0 : EXPLORING_MS.cameraFit);
		return true;
	}
	return false;
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
	onOpenDown?: OpenDown | undefined;
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
	/** Where the person is in the chosen design question's answer, lit while nothing is poked; null for none. */
	answer: AnswerStep | null;
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
	 * This picture is the board a flight arrived at: it takes over from the board
	 * inside its card, in the same place, with no entrance of its own.
	 */
	cut?: boolean | undefined;
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
 * Whether the camera, where it last came to rest, is far enough away to draw
 * each card's name in place of what it says. Read at rest, so a zoom or a
 * flight that crosses the line swaps the two once, when it is over.
 * @param view Where the camera is, and where it last came to rest.
 * @returns True when it is.
 */
function seenFromFar(view: CameraView): boolean {
	return view.rest.scale < FAR_SCALE;
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
	const [surface, setSurface] = useState<HTMLDivElement | null>(null);
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
		cut: props.cut,
	});
	usePresentationArrival(surface, props.arrivalKey ?? null, props.onSettled);
	// After the picture is staged, so a picture that just replaced a leaving one
	// is never mistaken for it.
	const departure = useLeaving(picture, props.departure, reducedMotion);
	const reading = drawnReading(props.reading, drawing);
	// What the picture lights for a poke gives way to what a presented step or a
	// group says the picture is about, and to the picture leaving.
	const peeked = usePeeked();
	const lighting = useLighting({
		reading,
		atlas: drawing.atlas,
		selection,
		peeked,
		veil: props.veil,
		presenting: props.presenting,
		group: props.group,
		answer: props.answer,
		departure,
	});
	// Before the viewer's marks, so a line's group made to hold a warning is
	// there to be lit and veiled with the rest.
	useCodeMarks(picture, drawing);
	useViewerMarks(picture, {
		selection,
		focus,
		group: props.group,
		veil: lighting.standing,
		reach: lighting.reach,
	});
	useSweep(picture, lighting.light, lighting.reach, reducedMotion);
	useStickyHeads(picture, drawing.atlas);
	// Seen from far away, each card's name is drawn larger in place of what it
	// says it does, which nobody reads at that size. Read as a yes or no where the
	// camera rests, so the diagram is drawn again only when it flips, and never in
	// the middle of a move.
	const far = useCameraWith(camera, seenFromFar);
	const marks = surfaceMarks({ veiled: props.veil !== null, far, probing: lighting.mode });
	const tip = useSubjectTip({ drawing, camera });
	const { dismiss: dismissTip, onHover: tipHover } = tip;
	const { onHover: lightHover, release: leave } = lighting;
	const onHover = useCallback(
		(event: PointerEvent<HTMLElement>): void => {
			tipHover(event);
			lightHover(event);
		},
		[tipHover, lightHover],
	);
	const onPointerLeave = useCallback((): void => {
		dismissTip();
		leave();
	}, [dismissTip, leave]);
	const openDown = useDrillOpen(reading, props.onOpenDown);
	const { gesture, pointer } = useDiagramGestures({
		camera,
		atlas: drawing.atlas,
		onSelect,
		onHover,
		dismissTip,
		openDown,
	});
	// A drag moves the picture under the pointer, so what the pointer rested on is no longer there.
	useEffect(() => {
		if (gesture === "dragging") leave();
	}, [gesture, leave]);
	// A drag, a pinch, a wheel or a key draws a frame for every move, and moving
	// traffic paints its lines again in each of them. The traffic stands still until
	// the camera has rested, and then comes back gently.
	useTrafficRest(surface, camera, gesture === "dragging");

	const onKeyDown = useCallback(
		(event: KeyboardEvent<HTMLElement>): void => {
			if (moveCameraByKey(event.key, camera, content, reducedMotion)) {
				event.preventDefault();
				return;
			}
			if (event.key === "Escape") {
				onSelect(null);
				event.preventDefault();
			}
		},
		[camera, content, onSelect, reducedMotion],
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
					{...pointer}
					onPointerLeave={onPointerLeave}
					onWheel={dismissTip}
					className={`relative flex min-h-0 min-w-0 flex-1 touch-none overflow-hidden outline-none ${
						gesture === "idle" ? "cursor-grab" : "cursor-grabbing"
					}`}
				>
					{/* The picture inside is the transition's to write, never React's:
					    see `usePictureTransition`. */}
					<CameraSurface
						camera={camera}
						attach={setSurface}
						size={content}
						gesture={gesture}
						reducedMotion={reducedMotion}
						marks={`${presentationMarks(props.presenting).surface}${marks}`}
					/>
				</div>
				{/* oxlint-enable jsx-a11y/no-noninteractive-tabindex */}
				<SemanticSubjectTip
					target={tip.shown}
					reading={reading}
					far={far}
					overview={drawing.view === null}
				/>
				<LeavingPart departure={departure} at="spinner" />
			</div>
		</section>
	);
}

export { SemanticDiagram, moveCameraByKey, type SemanticDiagramProps };

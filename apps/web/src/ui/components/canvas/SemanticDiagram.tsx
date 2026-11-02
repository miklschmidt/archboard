// A drawn legacy board, and the two things the browser owns about it: where
// the person is looking, and what they have picked out.
//
// Both are session state. The camera and the selection are never written down,
// never sent to the server and never part of an address; the model on disk is
// the only thing that outlives the tab, and this viewer never writes it
// (ADR 0023). What the server sends is a picture and an atlas, and everything
// below is about putting the two together.

import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	type JSX,
	type KeyboardEvent,
	type PointerEvent,
	type ReactNode,
} from "react";

import { moveCameraByKey } from "#ui/clients/canvas/picture/camera-keys.ts";
import type { SemanticDrawing } from "#ui/clients/canvas/reads/drawings.ts";
import { CameraSurface } from "#ui/components/canvas/CameraSurface.tsx";
import { LeavingPart } from "#ui/components/canvas/LeavingPart.tsx";
import { SemanticSubjectTip, TipPlace } from "#ui/components/canvas/SemanticSubjectTip.tsx";
import { STAGE_CLASS } from "#ui/components/canvas/SemanticStageStates.tsx";
import { useCameraWith, type PictureCamera } from "#ui/hooks/canvas/use-picture-camera.ts";
import type { VariantReading } from "#ui/rules/canvas/reading/document.ts";
import { useCodeMarks } from "#ui/hooks/canvas/use-code-marks.ts";
import { useDiagramGestures } from "#ui/hooks/canvas/use-diagram-gestures.ts";
import { useDrillOpen } from "#ui/hooks/canvas/use-drill-open.ts";
import { useLeaving } from "#ui/hooks/canvas/use-leaving.ts";
import { useLighting } from "#ui/hooks/canvas/use-lighting.ts";
import { usePeeked } from "#ui/hooks/canvas/use-peek.ts";
import { usePictureTransition } from "#ui/hooks/canvas/use-picture-transition.ts";
import { usePresentationArrival } from "#ui/hooks/canvas/use-presentation-arrival.ts";
import { seenFromFar } from "#ui/rules/canvas/camera/camera.ts";
import { useStageLook } from "#ui/hooks/canvas/use-stage-look.ts";
import { useSubjectTip } from "#ui/hooks/canvas/use-subject-tip.ts";
import { useViewerMarks } from "#ui/hooks/canvas/use-viewer-marks.ts";
import { useStickyHeads } from "#ui/hooks/canvas/use-sticky-heads.ts";
import { useSweep } from "#ui/hooks/canvas/use-sweep.ts";
import type { Departure } from "#ui/clients/canvas/picture/picture-departure.ts";
import { NO_FOCUS, subjectMarks, type BeatFocus } from "#ui/rules/canvas/walkthrough/narrative.ts";
import type { GroupSelection } from "#ui/rules/canvas/reading/groups.ts";
import { surfaceMarks } from "#ui/clients/canvas/subjects/subjects.ts";
import type { OpenDown } from "#ui/rules/canvas/drilling/drill-target.ts";

/**
 * What the stage says about itself, for whoever reads it from outside: which
 * model it is about, and whether it is showing that model or waiting for it.
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
			"aria-label": `Picture of ${departure.model}`,
			"aria-busy": true,
			"data-state": "loading",
		};
	}
	return {
		"aria-label": `Picture of ${drawing.model}`,
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

/** Inputs for a drawn model. */
interface SemanticDiagramProps {
	/** The stage owns the camera across picture requests. */
	readonly camera: PictureCamera;
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
	 * What the model says about the variant the picture draws, which its tips
	 * and double-clicks read; null for a picture on its way out.
	 */
	reading: VariantReading | null;
	/**
	 * Follow a card's drill-down, which a double-click on the card asks for.
	 * @param board The target model.
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
	/** What a presented step's veil leaves standing; null for no veil. */
	veil: ReadonlySet<string> | null;
	/** How many hops from a presented step's cards what they touch stands. */
	reach?: ReadonlyMap<string, number> | null;
	/**
	 * The picture is on its way out: the reader went to another model, and
	 * this one is kept only to be seen leaving while that one is drawn.
	 */
	departure?: Departure | null | undefined;
	/**
	 * Where the reader went from the picture before this one, while the pane is
	 * arriving from it: the last picture goes that way as this one comes in.
	 */
	heading?: Departure | null | undefined;
	/**
	 * This picture is the model a flight arrived at: it takes over from the model
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
 * What the model says about the variant the picture on the surface draws. While
 * another variant is being drawn the last picture stays up, and its tips and
 * double-clicks must not read the variant that has not arrived.
 * @param reading What the model says about the variant asked for, or null.
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
 * A drawn legacy board: pan, zoom and selection over the server's picture.
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
	// written by the transition, which carries one picture of a model into the
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
	const lightingInput = useMemo(
		() => ({
			content: reading?.variant?.content ?? null,
			atlas: drawing.atlas,
			selection,
			peeked,
			veil: props.veil,
			enabled: props.presenting == null && props.group === null && departure === null,
		}),
		[
			reading,
			drawing.atlas,
			selection,
			peeked,
			props.veil,
			props.presenting,
			props.group,
			departure,
		],
	);
	const lighting = useLighting(lightingInput);
	// Before the viewer's marks, so a line's group made to hold a warning is
	// there to be lit and veiled with the rest.
	useCodeMarks(picture, drawing);
	const attended = useMemo(
		() => subjectMarks(selection, focus, props.group?.members),
		[selection, focus, props.group],
	);
	const reach = props.reach ?? lighting.reach;
	useViewerMarks(picture, { attended, veil: lighting.standing, reach });
	useSweep(picture, lighting.light, lighting.reach, reducedMotion);
	useStickyHeads(picture, drawing.atlas);
	// Seen from far away, each card's name is drawn larger in place of what it
	// says it does, which nobody reads at that size. Read as a yes or no where the
	// camera rests, so the diagram is drawn again only when it flips, and never in
	// the middle of a move.
	const far = useCameraWith(camera, seenFromFar);
	const marks = surfaceMarks({ veiled: props.veil !== null, far, probing: lighting.mode });
	useStageLook(
		picture,
		{
			probing: lighting.mode,
			veiled: props.veil !== null,
			presenting: props.presenting != null,
			standing: lighting.standing,
			reach,
			reducedMotion,
		},
		true,
		false,
	);
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
	const { gesture, pointer, cursor } = useDiagramGestures({
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
			data-slot="canvas-stage"
			data-model={drawing.model}
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
					data-slot="canvas-viewport"
					inert={isLeaving(departure)}
					tabIndex={0}
					onKeyDown={onKeyDown}
					{...pointer}
					onPointerLeave={onPointerLeave}
					onWheel={dismissTip}
					className={`relative flex min-h-0 min-w-0 flex-1 touch-none overflow-hidden outline-none ${cursor}`}
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
				<TipPlace tip={tip} standing={lighting.standing}>
					<SemanticSubjectTip
						target={tip.shown}
						appearance={drawing.appearances.find((one) => one.id === tip.shown?.id)}
						reading={reading}
						far={far}
						overview={drawing.view === null}
					/>
				</TipPlace>
				<LeavingPart departure={departure} at="spinner" />
			</div>
		</section>
	);
}

export { SemanticDiagram, type SemanticDiagramProps };

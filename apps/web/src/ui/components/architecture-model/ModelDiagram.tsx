import { useAutoFit } from "#ui/hooks/semantic-board-canvas/use-auto-fit.ts";
import { beatFocus, subjectMarks } from "#ui/rules/semantic-board-canvas/walkthrough/narrative.ts";
import { moveCameraByKey } from "#ui/clients/semantic-board-canvas/picture/camera-keys.ts";
import { useLighting } from "#ui/hooks/semantic-board-canvas/use-lighting.ts";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useState,
	type JSX,
	type KeyboardEvent,
	type PointerEvent,
} from "react";
import type { DiagramBox } from "@archboard/board/render-reply";
import type { projectModel } from "@archboard/board/content";
import { CameraSurface } from "#ui/components/semantic-board-canvas/CameraSurface.tsx";
import { LeavingPart } from "#ui/components/semantic-board-canvas/LeavingPart.tsx";
import {
	useCameraWith,
	type BoardCamera,
} from "#ui/hooks/semantic-board-canvas/use-board-camera.ts";
import { seenFromFar, type FitTarget } from "#ui/rules/semantic-board-canvas/camera/camera.ts";
import { ModelDoorTip } from "#ui/components/architecture-model/ModelDoorTip.tsx";
import { ModelEmptyReading } from "#ui/components/architecture-model/ModelEmptyReading.tsx";
import { ModelLineTip } from "#ui/components/architecture-model/ModelLineTip.tsx";
import { useDiagramGestures } from "#ui/hooks/semantic-board-canvas/use-diagram-gestures.ts";
import { useLeaving } from "#ui/hooks/semantic-board-canvas/use-leaving.ts";
import { usePeeked } from "#ui/hooks/semantic-board-canvas/use-peek.ts";
import type { Trace } from "#ui/components/semantic-board-canvas/Peek.tsx";
import { pictureReach } from "#ui/rules/architecture-model/picture-reach.ts";
import { usePictureTransition } from "#ui/hooks/semantic-board-canvas/use-picture-transition.ts";
import { useReveal } from "#ui/hooks/semantic-board-canvas/use-reveal.ts";
import { useStageLook } from "#ui/hooks/semantic-board-canvas/use-stage-look.ts";
import { useStickyHeads } from "#ui/hooks/semantic-board-canvas/use-sticky-heads.ts";
import { useSweep } from "#ui/hooks/semantic-board-canvas/use-sweep.ts";
import { useTrafficRest } from "#ui/hooks/semantic-board-canvas/use-traffic-rest.ts";
import { useViewerMarks } from "#ui/hooks/semantic-board-canvas/use-viewer-marks.ts";
import { markCodeWarnings } from "#ui/clients/semantic-board-canvas/subjects/code-marks.ts";
import { surfaceMarks } from "#ui/clients/semantic-board-canvas/subjects/subjects.ts";
import { usePresentationArrival } from "#ui/hooks/semantic-board-canvas/use-presentation-arrival.ts";
import { useCameraHandover } from "#ui/hooks/architecture-model/use-camera-handover.ts";
import { useSubjectTip } from "#ui/hooks/semantic-board-canvas/use-subject-tip.ts";
import { SubjectTipBox } from "#ui/components/semantic-board-canvas/SemanticSubjectTip.tsx";
import {
	subjectTip,
	type TipTarget,
} from "#ui/clients/semantic-board-canvas/subjects/subject-tips.ts";
import { useAreaSelection } from "#ui/hooks/architecture-model/use-area-selection.ts";
import { useCameraMemory } from "#ui/hooks/architecture-model/use-camera-memory.ts";
import { useDoorPick } from "#ui/hooks/architecture-model/use-door-pick.ts";
import type { Departure } from "#ui/clients/semantic-board-canvas/picture/picture-departure.ts";
import { useGradientsWhileShown } from "#ui/hooks/semantic-board-canvas/use-gradients-while-shown.ts";
import { sceneFit, type AcceptedScene } from "#ui/rules/architecture-model/scene.ts";
import { isDoor } from "#ui/rules/architecture-model/selected-subject.ts";

/**
 * Whether a picture has a far view. A flowchart's shapes keep their words at any distance, so one
 * would only hide what its cards say.
 * @param scene The picture.
 * @returns True for every grammar but the flowchart.
 */
function hasFarView(scene: AcceptedScene): boolean {
	return scene.reading.grammar !== "flowchart";
}

interface ModelDiagramProps {
	scene: AcceptedScene;
	camera: BoardCamera;
	/** Whether another reading is on its way to this surface. */
	pending: boolean;
	/** Where the reader went, while the next picture is too far off to keep this one on screen. */
	leaving: Departure | null;
	/** Whether this picture took over from a flight that already put the camera in place. */
	cut?: boolean | undefined;
	reducedMotion: boolean;
	reserve?: number;
	onPresentation?: ((picture: { key: string; arrived: boolean } | null) => void) | undefined;
	selected: ReadonlySet<string>;
	warnings?: ReadonlySet<string>;
	onSelect: (id: string | null, toggle?: boolean) => void;
	onSelectMany: (ids: readonly string[], toggle?: boolean) => void;
	onOpen: (id: string | null) => void;
	/** Expand a door or collapse a frame, in a reading that offers it. */
	onToggle?: ((id: string) => void) | undefined;
	/** The reader's attention rests on a subject, which they may open next. */
	onAttention?: ((id: string) => void) | undefined;
	/** Lift the focus and filters of a reading they left empty. */
	onWholeScope?: (() => void) | undefined;
	/** Read another state of the model, where a planning model offers its plan. */
	onOpenState?: ((state: string) => void) | undefined;
}

/**
 * One mounted surface. Each accepted scene arrives as a new prop, so the surface,
 * its gestures and its camera outlive every reading.
 * @param props The accepted scene and the pane's presentation state.
 * @returns A selectable, pannable diagram.
 */
function ModelDiagram(props: ModelDiagramProps): JSX.Element {
	const { scene, camera, selected, onSelect, onSelectMany, onOpen, reducedMotion } = props;
	const { picture: drawing, projection, model } = scene;
	const presenting = scene.presentation !== undefined;
	const { reserve: reserveBottom } = camera;
	useLayoutEffect(() => reserveBottom(props.reserve ?? 0), [reserveBottom, props.reserve]);
	const [surface, setSurface] = useState<HTMLDivElement | null>(null);
	useGradientsWhileShown(surface);
	const attachViewport = useCallback(
		(element: HTMLElement | null): void => camera.attachViewport(element),
		[camera],
	);
	const open = useCallback(
		(id: string | null): void => {
			if (id !== null && model.modules.some((module) => module.id === id)) onOpen(id);
		},
		[model.modules, onOpen],
	);
	const focus = useSceneFocus(scene);
	const veil = useMemo(
		() => (focus.drawn.length === 0 ? null : new Set(focus.drawn)),
		[focus.drawn],
	);
	// Before the picture moves, so the memory holds the camera that the reader left.
	const recall = useCameraMemory(camera, scene);
	const staged = usePictureTransition(surface, drawing, {
		reducedMotion,
		keepStill: camera.followPicture,
		heading: scene.heading,
		presenting,
		cut: props.cut,
	});
	const leaving = useLeaving(staged, props.leaving, reducedMotion);
	const flowReading = scene.reading.grammar !== "architecture";
	const resting = useMemo<FitTarget>(
		() => ({
			kind: flowReading ? "flow" : "landing",
			content: { width: drawing.width, height: drawing.height },
		}),
		[flowReading, drawing.width, drawing.height],
	);
	useAutoFit(camera, hasPicture(drawing), focus, {
		picture: sceneFit(scene),
		presenting,
		resting,
		reducedMotion,
		cut: props.cut,
		recall,
	});
	useCameraHandover(camera, drawing.board, reducedMotion);
	const { lighting, single } = useSceneLighting(scene, selected, leaving !== null);
	const tip = useSceneTip(drawing, camera, lighting);
	const selectArea = useAreaSelection(scene, camera, onSelectMany);
	const far = useCameraWith(camera, seenFromFar) && hasFarView(scene);
	const onPick = useReveal({
		camera,
		atlas: drawing.atlas,
		edges: projection.content.edges,
		selection: single,
		off: presenting,
		reducedMotion,
		onPick: onSelect,
	});
	const { pick, openDown } = useDoorPick(scene, open, onPick, props.onToggle);
	const { pointer, gesture, rectangle, keyboard } = useDiagramGestures({
		camera,
		atlas: drawing.atlas,
		onSelect: pick,
		onSelectArea: selectArea,
		onHover: tip.onHover,
		dismissTip: tip.dismiss,
		openDown,
	});
	const onKeyDown = useCallback(
		(event: KeyboardEvent<HTMLElement>): void => {
			keyboard.onKeyDown?.(event);
			if (event.defaultPrevented) return;
			if (moveCameraByKey(event.key, camera, drawing, reducedMotion)) {
				event.preventDefault();
				lighting.release();
			}
		},
		[keyboard, camera, drawing, reducedMotion, lighting],
	);
	useSceneMarks(staged, scene, { selected, warnings: props.warnings, focus, veil, lighting });
	useSweep(staged, lighting.light, lighting.reach, reducedMotion);
	useRelease(gesture === "dragging", lighting.release);
	useStickyHeads(staged, drawing.atlas);
	useStageLook(
		staged,
		{
			probing: lighting.mode,
			veiled: veil !== null,
			presenting,
			standing: veil ?? lighting.standing,
			reach: lighting.reach,
			reducedMotion,
		},
		far,
	);
	useTrafficRest(surface, camera, gesture === "dragging");
	useSceneArrival(surface, scene.presentation, props.onPresentation);
	useAttention(lighting.resting, single, props.onAttention);
	// Like the retained diagram, this pan-and-zoom surface needs a tab stop and
	// camera keys. No interactive ARIA role describes it. Keep its section name
	// without falsely declaring a button, grid, or other standard widget.
	/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
	return (
		<section
			data-slot="model-diagram"
			data-revision={model.revision.digest}
			data-scene={drawing.board}
			aria-busy={props.pending}
			tabIndex={0}
			aria-label="Module diagram"
			className={diagramClass(leaving)}
			ref={attachViewport}
			{...pointer}
			onPointerLeave={tip.leave}
			onWheel={tip.dismiss}
			onKeyDown={onKeyDown}
		>
			<LeavingPart departure={leaving} at="announcement" />
			{/* The picture inside is the transition's to write, never React's. */}
			<CameraSurface
				camera={camera}
				size={drawing}
				attach={setSurface}
				gesture={gesture}
				reducedMotion={reducedMotion}
				marks={
					surfaceMarks({ veiled: veil !== null, far, probing: lighting.mode }) +
					presentingMark(presenting)
				}
			/>
			<ModelEmptyReading
				scene={scene}
				pending={props.pending}
				onWholeScope={props.onWholeScope}
				onOpenState={props.onOpenState}
			/>
			<ModelSubjectTip target={tip.shown} scene={scene} camera={camera} />
			<ModelLineTip target={tip.shown} model={model} projection={projection} />
			<LeavingPart departure={leaving} at="spinner" />
			{rectangle !== null && <ModelSelectionRectangle rectangle={rectangle} />}
		</section>
	);
	/* oxlint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
}

/**
 * Whether a scene has a picture: an empty coherent reading has none.
 * @param drawing The scene's picture.
 * @returns The picture, or null.
 */
function hasPicture(drawing: AcceptedScene["picture"]): AcceptedScene["picture"] | null {
	return drawing.svg === "" ? null : drawing;
}

/**
 * The surface's mark while a walkthrough is presented.
 * @param presenting Whether one is.
 * @returns The class, with the space before it, or nothing.
 */
function presentingMark(presenting: boolean): string {
	return presenting ? " is-presenting" : "";
}

/**
 * The diagram's classes. A picture on its way out takes no pick, and the tab stop stays.
 * @param leaving Where the reader went, or null while they stay.
 * @returns The class list.
 */
function diagramClass(leaving: Departure | null): string {
	const base = "relative min-h-0 min-w-0 flex-1 overflow-hidden outline-none";
	return leaving === null ? base : `${base} pointer-events-none`;
}

/**
 * What a presented beat asks of the picture.
 * @param scene The accepted scene.
 * @returns The beat's focus, or no focus outside a presentation.
 */
function useSceneFocus(scene: AcceptedScene) {
	const { presentation, projection, picture } = scene;
	return useMemo(
		() =>
			beatFocus(
				presentation === undefined
					? null
					: {
							id: presentation.key,
							subjects: [...projectedMarks(new Set(presentation.subjects), projection.connections)],
						},
				picture,
				{ content: projection.content },
			),
		[presentation, projection, picture],
	);
}

/**
 * Light what a person pokes in the picture on screen.
 * @param scene The accepted scene.
 * @param selected The selected identities.
 * @param leaving Whether the picture is on its way out.
 * @returns The lighting, and the one drawn subject that the selection names.
 */
function useSceneLighting(scene: AcceptedScene, selected: ReadonlySet<string>, leaving: boolean) {
	const { projection, picture, reading } = scene;
	const { connections, content } = projection;
	const single = soleSubject(selected, connections);
	const peeked = usePeeked();
	const free = scene.presentation === undefined && !leaving && reading.grammar === "architecture";
	const lightingInput = useMemo(
		() => ({
			content,
			atlas: picture.atlas,
			selection: single,
			several: free && single === null ? projectedMarks(selected, connections) : null,
			peeked: { ...peeked, row: lineOf(peeked.row, connections) },
			veil: null,
			enabled: free && (selected.size === 0 || single !== null),
			/**
			 * Walk a trace over the whole model, and say it as what this picture draws.
			 * @param trace The trace.
			 * @returns How far each card and line is.
			 */
			traced: (trace: Trace) => pictureReach(projection, trace.part, trace.way).hops,
		}),
		[projection, content, connections, picture.atlas, single, peeked, free, selected],
	);
	return { lighting: useLighting(lightingInput), single };
}

/**
 * The tip over what the pointer rests on, moved by the same hand as the light.
 * @param drawing The picture on the surface.
 * @param camera The pane's camera.
 * @param lighting The light on the picture.
 * @returns The open tip, what to do as the pointer moves, and how it closes.
 */
function useSceneTip(
	drawing: AcceptedScene["picture"],
	camera: BoardCamera,
	lighting: ReturnType<typeof useLighting>,
) {
	const { shown, onHover: tipHover, dismiss } = useSubjectTip({ drawing, camera });
	const { onHover: lightHover, release } = lighting;
	const onHover = useCallback(
		(event: PointerEvent<HTMLElement>): void => {
			tipHover(event);
			lightHover(event);
		},
		[tipHover, lightHover],
	);
	const leave = useCallback((): void => {
		dismiss();
		release();
	}, [dismiss, release]);
	return { shown, onHover, dismiss, leave };
}

/**
 * Let go of what the pointer rested on while a drag moves it from under the pointer.
 * @param dragging Whether a drag is under way.
 * @param release Let go.
 */
function useRelease(dragging: boolean, release: () => void): void {
	useEffect(() => {
		if (dragging) release();
	}, [dragging, release]);
}

/**
 * What the tip over a part of the scene says.
 * @param props The part and the scene.
 * @param props.target The part under the pointer, or null.
 * @param props.scene The scene on screen.
 * @param props.camera The pane's camera: a card seen from far says less, and its tip the rest.
 * @returns The tip, or nothing.
 */
function ModelSubjectTip(props: {
	target: TipTarget | null;
	scene: AcceptedScene;
	camera: BoardCamera;
}): JSX.Element {
	const { target, scene } = props;
	const far = useCameraWith(props.camera, seenFromFar) && hasFarView(scene);
	const appearance = scene.picture.appearances.find((one) => one.id === target?.id);
	const tip = target === null ? null : subjectTip(scene.projection, target, appearance, far);
	if (target === null || !isDoor(scene.projection, target.id))
		return <SubjectTipBox target={target} tip={tip} />;
	return <ModelDoorTip target={target} scene={scene} said={tip} appearance={appearance} />;
}

/** What the viewer marks on the picture of a scene. */
interface SceneMarks {
	selected: ReadonlySet<string>;
	warnings: ReadonlySet<string> | undefined;
	focus: ReturnType<typeof useSceneFocus>;
	veil: ReadonlySet<string> | null;
	lighting: ReturnType<typeof useLighting>;
}

/**
 * Keep the viewer's marks on the picture on screen.
 * @param staged The picture on the surface.
 * @param scene The accepted scene.
 * @param marks What to mark.
 */
function useSceneMarks(
	staged: ReturnType<typeof usePictureTransition>,
	scene: AcceptedScene,
	marks: SceneMarks,
): void {
	const { selected, warnings, focus, veil, lighting } = marks;
	const { connections } = scene.projection;
	const warned = useMemo(() => projectedMarks(warnings, connections), [warnings, connections]);
	// Before the viewer's marks, so a line's group made to hold a warning is lit and veiled with the rest.
	useLayoutEffect(() => {
		if (staged !== null) markCodeWarnings(staged, warned);
	}, [staged, warned]);
	const attended = useMemo(
		() => projectedMarks(subjectMarks(null, focus, [...selected]), connections),
		[focus, selected, connections],
	);
	useViewerMarks(staged, { attended, veil: veil ?? lighting.standing, reach: lighting.reach });
}

/**
 * Say which subject the reader's attention rests on.
 * @param resting The subject under the hand, or null.
 * @param selected The selected subject, or null.
 * @param onAttention Told each new subject.
 */
function useAttention(
	resting: string | null,
	selected: string | null,
	onAttention: ModelDiagramProps["onAttention"],
): void {
	const subject = resting ?? selected;
	useEffect(() => {
		if (subject !== null) onAttention?.(subject);
	}, [subject, onAttention]);
}

/**
 * Tell a presentation when the surface has come to rest on its beat.
 * @param surface The surface.
 * @param beat The beat the accepted scene shows, if a presentation is running.
 * @param onPresentation Told whether that beat has arrived.
 */
function useSceneArrival(
	surface: HTMLElement | null,
	beat: AcceptedScene["presentation"],
	onPresentation: ModelDiagramProps["onPresentation"],
): void {
	const key = beat?.key ?? null;
	const [settled, setSettled] = useState<string | null>(null);
	usePresentationArrival(surface, key, setSettled);
	useEffect(() => {
		if (surface === null || key === null) return undefined;
		onPresentation?.({ key, arrived: settled === key });
		return () => onPresentation?.(null);
	}, [onPresentation, key, settled, surface]);
}

/**
 * The drawn line that carries a subject.
 * @param id A canonical identity, or nothing.
 * @param connections The scene's relationship groups.
 * @returns The line that joins a relationship, or what it was given.
 */
function lineOf<Subject extends string | null>(
	id: Subject,
	connections: ReturnType<typeof projectModel>["connections"],
): Subject | string {
	return connections.find(({ joins }) => joins.some((edge) => edge.id === id))?.line.id ?? id;
}

/**
 * The one drawn subject a selection names. Picking a joined line selects each of its relationships.
 * @param selected The selected canonical identities.
 * @param connections The scene's relationship groups.
 * @returns The subject, or null for no selection or for several subjects.
 */
function soleSubject(
	selected: ReadonlySet<string>,
	connections: ReturnType<typeof projectModel>["connections"],
): string | null {
	const drawn = new Set([...selected].map((id) => lineOf(id, connections)));
	return drawn.size === 1 ? ([...drawn][0] ?? null) : null;
}

/**
 * An aggregate line carries marks from every authored relationship that it represents.
 * @param subjects The selected or warned canonical identities.
 * @param connections The current projection's relationship groups.
 * @returns Authored identities plus their visible aggregate lines.
 */
function projectedMarks(
	subjects: ReadonlySet<string> | undefined,
	connections: ReturnType<typeof projectModel>["connections"],
): Set<string> {
	const marked = new Set(subjects);
	for (const { line, joins } of connections) {
		if (joins.some((edge) => subjects?.has(edge.id))) marked.add(line.id);
	}
	return marked;
}

/**
 * Draw immediate selection feedback in viewport coordinates.
 * @param props The current pointer rectangle.
 * @param props.rectangle Its bounds in CSS pixels.
 * @returns A noninteractive overlay independent from scene layout.
 */
function ModelSelectionRectangle(props: { rectangle: DiagramBox }): JSX.Element {
	const { rectangle } = props;
	const style = useMemo(
		() => ({
			left: rectangle.x,
			top: rectangle.y,
			width: rectangle.width,
			height: rectangle.height,
		}),
		[rectangle],
	);
	return (
		<div
			data-slot="model-selection-rectangle"
			aria-hidden="true"
			className="border-primary bg-primary/10 pointer-events-none absolute border"
			style={style}
		/>
	);
}

export { ModelDiagram };

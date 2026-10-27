import { moveCameraByKey } from "#ui/clients/semantic-board-canvas/picture/camera-keys.ts";
import { useLighting } from "#ui/hooks/semantic-board-canvas/use-lighting.ts";
import { NOTHING_PEEKED } from "#ui/components/semantic-board-canvas/Peek.tsx";
import { lightInk } from "#ui/clients/semantic-board-canvas/subjects/lit-ink.ts";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type JSX,
	type KeyboardEvent,
} from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { everyStep } from "@archboard/board/flow";
import type { DiagramGrammar } from "@archboard/board/views";
import type { DiagramBox } from "@archboard/board/render-reply";
import type { prepareContentHere } from "@archboard/renderer/browser";
import { CameraSurface } from "#ui/components/semantic-board-canvas/CameraSurface.tsx";
import {
	useBoardCamera,
	type BoardCamera,
} from "#ui/hooks/semantic-board-canvas/use-board-camera.ts";
import { useDiagramGestures } from "#ui/hooks/semantic-board-canvas/use-diagram-gestures.ts";
import { stagePicture } from "#ui/clients/semantic-board-canvas/picture/picture-transition.ts";
import { clockOf } from "#ui/clients/semantic-board-canvas/picture/picture-clock.ts";
import { stopTraffic } from "#ui/clients/semantic-board-canvas/picture/picture-traffic.ts";
import { markCodeWarnings } from "#ui/clients/semantic-board-canvas/subjects/code-marks.ts";
import {
	markSubjects,
	markVeil,
	surfaceMarks,
} from "#ui/clients/semantic-board-canvas/subjects/subjects.ts";
import type { projectModel, Model } from "@archboard/board/content";
import { usePresentationArrival } from "#ui/hooks/semantic-board-canvas/use-presentation-arrival.ts";
import { modelDrawingQuery } from "#ui/clients/architecture-model/drawing.ts";

type RenderedDiagram = Awaited<ReturnType<ReturnType<typeof prepareContentHere>["draw"]>>;

interface ModelDiagramProps {
	model: Model;
	grammar: DiagramGrammar;
	projection: ReturnType<typeof projectModel>;
	reducedMotion: boolean;
	reserve?: number;
	presentation?: string;
	onPresentation?: (picture: { key: string; arrived: boolean } | null) => void;
	selected: ReadonlySet<string>;
	warnings?: ReadonlySet<string>;
	onSelect: (id: string | null, toggle?: boolean) => void;
	onSelectMany: (ids: readonly string[], toggle?: boolean) => void;
	onOpen: (id: string | null) => void;
}

/**
 * Keep camera gestures independent from asynchronous local layout.
 * @param props The model and transient selection.
 * @returns The current scene or an explicit rendering state.
 */
function ModelDiagram(props: ModelDiagramProps): JSX.Element {
	const { projection, model } = props;
	const drawingOptions = useMemo(
		() => modelDrawingQuery(model, projection, props.grammar),
		[model, projection, props.grammar],
	);
	const drawing = useQuery({
		...drawingOptions,
		...(props.presentation === undefined ? { placeholderData: keepPreviousData } : {}),
	});
	const camera = useBoardCamera(props.reducedMotion);
	const { reserve: reserveBottom } = camera;
	useLayoutEffect(() => reserveBottom(props.reserve ?? 0), [reserveBottom, props.reserve]);
	if (projection.content.nodes.length === 0) return <EmptyDiagram {...props} />;
	if (drawing.isPending)
		return (
			<output className="text-body text-muted-foreground min-w-0 flex-1 p-8">
				Drawing modules…
			</output>
		);
	if (drawing.isError)
		return (
			<output role="alert" className="text-body min-w-0 flex-1 p-8">
				{drawing.error.message}
			</output>
		);
	return (
		<ModelScene
			{...props}
			drawing={drawing.data}
			camera={camera}
			updating={drawing.isPlaceholderData}
		/>
	);
}

/**
 * An empty coherent reading is a finished picture too.
 * @param props The optional presentation identity and its observer.
 * @param props.presentation The requested picture identity.
 * @param props.onPresentation Receives its completed empty picture.
 * @returns The visible empty reading.
 */
function EmptyDiagram({ presentation, onPresentation }: ModelDiagramProps): JSX.Element {
	useEffect(() => {
		if (presentation === undefined) return undefined;
		onPresentation?.({ key: presentation, arrived: true });
		return () => onPresentation?.(null);
	}, [presentation, onPresentation]);
	return (
		<output data-slot="model-empty-diagram" className="text-body text-muted-foreground flex-1 p-8">
			No modules are visible in this reading.
		</output>
	);
}

interface ModelSceneProps extends ModelDiagramProps {
	drawing: RenderedDiagram;
	camera: BoardCamera;
	updating: boolean;
}

/**
 * Reuse the existing atlas, pointer gestures, and camera surface.
 * @param props The accepted picture and presentation state.
 * @returns A selectable, pannable diagram.
 */
function ModelScene(props: ModelSceneProps): JSX.Element {
	const { drawing, camera, selected, onSelect, onSelectMany, onOpen, model } = props;
	const surface = useRef<HTMLDivElement | null>(null);
	const [arrivalSurface, setArrivalSurface] = useState<HTMLDivElement | null>(null);
	const [settled, setSettled] = useState<string | null>(null);
	const installed = useRef<string | null>(null);
	const shownBeat = useRef<string | undefined>(undefined);
	const attach = useCallback((element: HTMLDivElement | null): void => {
		surface.current = element;
		setArrivalSurface(element);
		installed.current = null;
	}, []);
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
	const lightingInput = useMemo(
		() => ({
			content: props.projection.content,
			atlas: drawing.atlas,
			selection: selected.size === 1 ? ([...selected][0] ?? null) : null,
			peeked: NOTHING_PEEKED,
			veil: null,
			enabled:
				props.presentation === undefined && selected.size <= 1 && props.grammar === "architecture",
		}),
		[props.projection.content, drawing.atlas, selected, props.presentation, props.grammar],
	);
	const lighting = useLighting(lightingInput);
	const selectArea = useCallback(
		(rectangle: DiagramBox, toggle: boolean): void => {
			const pose = camera.view().camera;
			const area = {
				x: (rectangle.x - pose.x) / pose.scale,
				y: (rectangle.y - pose.y) / pose.scale,
				width: rectangle.width / pose.scale,
				height: rectangle.height / pose.scale,
			};
			const known = new Set(
				[
					...props.projection.content.nodes,
					...props.projection.content.edges,
					...projectionSteps(props.projection),
				].map((subject) => subject.id),
			);
			const boxes = { ...drawing.atlas.regions, ...drawing.atlas.nodes, ...drawing.atlas.edges };
			const ids = Object.entries(boxes)
				.filter(([id, box]) => known.has(id) && intersects(box, area))
				.map(([id]) => id);
			onSelectMany(ids, toggle);
		},
		[camera, drawing.atlas, onSelectMany, props.projection],
	);
	const { pointer, gesture, rectangle, keyboard } = useDiagramGestures({
		camera,
		atlas: drawing.atlas,
		onSelect,
		onSelectArea: selectArea,
		onHover: lighting.onHover,
		dismissTip: lighting.release,
		openDown: open,
	});
	const onKeyDown = useCallback(
		(event: KeyboardEvent<HTMLElement>): void => {
			keyboard.onKeyDown?.(event);
			if (event.defaultPrevented) return;
			if (moveCameraByKey(event.key, camera, drawing, props.reducedMotion)) {
				event.preventDefault();
				lighting.release();
			}
		},
		[keyboard, camera, drawing, props.reducedMotion, lighting],
	);
	useLayoutEffect(() => {
		const root = surface.current;
		if (root === null) return;
		if (installed.current !== drawing.svg) {
			stagePicture(root, drawing.svg, clockOf(root.querySelector("svg")) ?? 0);
			installed.current = drawing.svg;
		}
		const marked = projectedMarks(selected, props.projection.connections);
		const warned = projectedMarks(props.warnings, props.projection.connections);
		markSubjects(root, marked);
		markCodeWarnings(root, warned);
		markVeil(root, lighting.standing);
		lightInk(root);
	}, [selected, drawing.svg, props.projection.connections, props.warnings, lighting.standing]);
	useLayoutEffect(() => {
		if (camera.room === null) return;
		if (!camera.handled() || shownBeat.current !== props.presentation) {
			camera.fit({ kind: "whole", content: drawing }, true);
			shownBeat.current = props.presentation;
		}
	}, [camera, drawing, props.presentation]);
	useEffect(() => {
		const root = surface.current;
		return () => {
			if (root !== null) stopTraffic(root);
		};
	}, []);
	usePresentationArrival(arrivalSurface, props.presentation ?? null, setSettled);
	const { onPresentation, presentation } = props;
	useEffect(() => {
		if (arrivalSurface === null || presentation === undefined) return undefined;
		onPresentation?.({ key: presentation, arrived: settled === presentation });
		return () => onPresentation?.(null);
	}, [onPresentation, presentation, settled, arrivalSurface]);
	// Like the retained diagram, this pan-and-zoom surface needs a tab stop and
	// camera keys. No interactive ARIA role describes it. Keep its section name
	// without falsely declaring a button, grid, or other standard widget.
	/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
	return (
		<section
			data-slot="model-diagram"
			aria-busy={props.updating}
			tabIndex={0}
			aria-label="Module diagram"
			data-revision={props.model.revision.digest}
			className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
			ref={attachViewport}
			{...pointer}
			onKeyDown={onKeyDown}
		>
			<CameraSurface
				camera={camera}
				size={drawing}
				attach={attach}
				gesture={gesture}
				reducedMotion={props.reducedMotion}
				marks={surfaceMarks({
					veiled: false,
					far: false,
					probing: lighting.mode,
				})}
			/>
			{props.updating && (
				<output className="text-body text-muted-foreground bg-background absolute top-2 right-2 rounded px-2 py-1">
					Updating diagram…
				</output>
			)}
			{rectangle !== null && <ModelSelectionRectangle rectangle={rectangle} />}
		</section>
	);
	/* oxlint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
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
 * Only steps in the complete selected flow are selectable in its diagram.
 * @param projection The reading whose bounds the renderer returns.
 * @returns Canonical step identities, including nested control steps.
 */
function projectionSteps(projection: ReturnType<typeof projectModel>) {
	return projection.content.flows.flatMap((flow) => everyStep(flow.steps));
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

/**
 * Select only subjects whose drawn bounds meet the visible rectangle.
 * @param box The renderer-owned subject bounds.
 * @param area The selection in diagram units.
 * @returns Whether the subject intersects the selection.
 */
function intersects(box: DiagramBox, area: DiagramBox): boolean {
	return (
		box.x <= area.x + area.width &&
		box.x + box.width >= area.x &&
		box.y <= area.y + area.height &&
		box.y + box.height >= area.y
	);
}

export { ModelDiagram };

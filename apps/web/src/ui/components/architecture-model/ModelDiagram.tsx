import { useCallback, useLayoutEffect, useMemo, useRef, type JSX } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { markSubjects } from "#ui/clients/semantic-board-canvas/subjects/subjects.ts";
import type { projectModel, Model } from "#ui/rules/architecture-model/projection.ts";
import { modelDrawingQuery } from "#ui/clients/architecture-model/drawing.ts";

type RenderedDiagram = Awaited<ReturnType<ReturnType<typeof prepareContentHere>["draw"]>>;

interface ModelDiagramProps {
	model: Model;
	grammar: DiagramGrammar;
	projection: ReturnType<typeof projectModel>;
	reducedMotion: boolean;
	selected: ReadonlySet<string>;
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
	const drawing = useQuery(drawingOptions);
	const camera = useBoardCamera(props.reducedMotion);
	if (projection.content.nodes.length === 0)
		return (
			<output
				data-slot="model-empty-diagram"
				className="text-body text-muted-foreground min-w-0 flex-1 p-8"
			>
				No modules are visible in this reading.
			</output>
		);
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
	return <ModelScene {...props} drawing={drawing.data} camera={camera} />;
}

interface ModelSceneProps extends ModelDiagramProps {
	drawing: RenderedDiagram;
	camera: BoardCamera;
}

/**
 * Reuse the existing atlas, pointer gestures, and camera surface.
 * @param props The accepted picture and presentation state.
 * @returns A selectable, pannable diagram.
 */
function ModelScene(props: ModelSceneProps): JSX.Element {
	const { drawing, camera, selected, onSelect, onSelectMany, onOpen, model } = props;
	const surface = useRef<HTMLDivElement | null>(null);
	const installed = useRef<string | null>(null);
	const attach = useCallback((element: HTMLDivElement | null): void => {
		surface.current = element;
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
	const ignore = useCallback((): void => {}, []);
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
		onHover: ignore,
		dismissTip: ignore,
		openDown: open,
	});
	useLayoutEffect(() => {
		const root = surface.current;
		if (root === null) return;
		if (installed.current !== drawing.svg) {
			root.innerHTML = drawing.svg;
			installed.current = drawing.svg;
		}
		const marked = new Set(selected);
		for (const { line, joins } of props.projection.connections) {
			if (joins.some((edge) => selected.has(edge.id))) marked.add(line.id);
		}
		markSubjects(root, marked);
	}, [selected, drawing.svg, props.projection.connections]);
	useLayoutEffect(() => {
		if (camera.room !== null && !camera.handled())
			camera.fit({ kind: "whole", content: drawing }, true);
	}, [camera, drawing]);
	return (
		<section
			data-slot="model-diagram"
			tabIndex={-1}
			aria-label="Module diagram"
			data-revision={props.model.revision.digest}
			className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
			ref={attachViewport}
			{...pointer}
			{...keyboard}
		>
			<CameraSurface
				camera={camera}
				size={drawing}
				attach={attach}
				gesture={gesture}
				reducedMotion={props.reducedMotion}
				marks=""
			/>
			{rectangle !== null && <ModelSelectionRectangle rectangle={rectangle} />}
		</section>
	);
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

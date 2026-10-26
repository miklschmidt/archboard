import { useCallback, useLayoutEffect, useMemo, useRef, type JSX } from "react";
import { useQuery } from "@tanstack/react-query";
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
	projection: ReturnType<typeof projectModel>;
	reducedMotion: boolean;
	selected: string | null;
	onSelect: (id: string | null) => void;
	onOpen: (id: string | null) => void;
}

/**
 * Keep camera gestures independent from asynchronous local layout.
 * @param props The model and transient selection.
 * @returns The current scene or an explicit rendering state.
 */
function ModelDiagram(props: ModelDiagramProps): JSX.Element {
	const { projection, model } = props;
	const drawingOptions = useMemo(() => modelDrawingQuery(model, projection), [model, projection]);
	const drawing = useQuery(drawingOptions);
	const camera = useBoardCamera(props.reducedMotion);
	if (projection.content.nodes.length === 0)
		return (
			<output className="text-body text-muted-foreground p-8">This model has no modules.</output>
		);
	if (drawing.isPending)
		return <output className="text-body text-muted-foreground p-8">Drawing modules…</output>;
	if (drawing.isError)
		return (
			<output role="alert" className="text-body p-8">
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
	const { drawing, camera, selected, onSelect, onOpen, model } = props;
	const surface = useRef<HTMLDivElement | null>(null);
	const installed = useRef<string | null>(null);
	const attach = useCallback((element: HTMLDivElement | null): void => {
		surface.current = element;
		installed.current = null;
	}, []);
	const attachViewport = useCallback(
		(element: HTMLDivElement | null): void => camera.attachViewport(element),
		[camera],
	);
	const open = useCallback(
		(id: string | null): void => {
			if (id !== null && model.modules.some((module) => module.id === id)) onOpen(id);
		},
		[model.modules, onOpen],
	);
	const ignore = useCallback((): void => {}, []);
	const { pointer, gesture } = useDiagramGestures({
		camera,
		atlas: drawing.atlas,
		onSelect,
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
		markSubjects(root, new Set(selected === null ? [] : [selected]));
	}, [selected, drawing.svg]);
	useLayoutEffect(() => {
		if (camera.room !== null && !camera.handled())
			camera.fit({ kind: "whole", content: drawing }, true);
	}, [camera, drawing]);
	return (
		<div
			data-slot="model-diagram"
			data-revision={props.model.revision.digest}
			className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
			ref={attachViewport}
			{...pointer}
		>
			<CameraSurface
				camera={camera}
				size={drawing}
				attach={attach}
				gesture={gesture}
				reducedMotion={props.reducedMotion}
				marks=""
			/>
		</div>
	);
}

export { ModelDiagram };

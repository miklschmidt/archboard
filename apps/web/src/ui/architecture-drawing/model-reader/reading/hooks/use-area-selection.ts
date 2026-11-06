import { useCallback } from "react";
import { everyStep } from "@archboard/model/flow";
import type { DiagramBox } from "@archboard/model/render-reply";
import type { projectModel } from "@archboard/model/content";
import type { PictureCamera } from "#ui/architecture-drawing/canvas/picture/camera/hooks/use-picture-camera.ts";
import type { AcceptedScene } from "#ui/architecture-drawing/model-reader/rules/scene.ts";

/**
 * Only steps in the complete selected flow are selectable in its diagram.
 * @param projection The reading whose bounds the renderer returns.
 * @returns Canonical step identities, including nested control steps.
 */
function projectionSteps(projection: ReturnType<typeof projectModel>) {
	return projection.content.flows.flatMap((flow) => everyStep(flow.steps));
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

/**
 * Select the subjects a rectangle on the viewport meets.
 * @param scene The accepted scene.
 * @param camera The pane's camera.
 * @param onSelectMany Told what the rectangle met.
 * @returns The rectangle's handler.
 */
function useAreaSelection(
	scene: AcceptedScene,
	camera: PictureCamera,
	onSelectMany: (ids: readonly string[], toggle?: boolean) => void,
) {
	const { projection, picture } = scene;
	return useCallback(
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
					...projection.content.nodes,
					...projection.content.edges,
					...projectionSteps(projection),
				].map((subject) => subject.id),
			);
			const boxes = { ...picture.atlas.regions, ...picture.atlas.nodes, ...picture.atlas.edges };
			const ids = Object.entries(boxes)
				.filter(([id, box]) => known.has(id) && intersects(box, area))
				.map(([id]) => id);
			onSelectMany(ids, toggle);
		},
		[camera, picture.atlas, onSelectMany, projection],
	);
}

export { useAreaSelection };

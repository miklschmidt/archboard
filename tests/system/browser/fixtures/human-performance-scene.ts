import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

export const HUMAN_PERFORMANCE_FIXTURE_SIZE = 10_000;

export type HumanPerformanceElement = Pick<
	ExcalidrawElement,
	"id" | "type" | "x" | "y" | "width" | "height" | "backgroundColor" | "fillStyle"
>;

export function humanPerformanceScene(): HumanPerformanceElement[] {
	const elements: HumanPerformanceElement[] = [
		{
			id: "drag",
			type: "rectangle",
			x: 0,
			y: 0,
			width: 180,
			height: 90,
			backgroundColor: "#ffffff",
			fillStyle: "solid",
		},
		{
			id: "resize",
			type: "rectangle",
			x: 260,
			y: 0,
			width: 180,
			height: 90,
			backgroundColor: "#ffffff",
			fillStyle: "solid",
		},
		{
			id: "typing",
			type: "rectangle",
			x: 520,
			y: 0,
			width: 220,
			height: 100,
			backgroundColor: "#ffffff",
			fillStyle: "solid",
		},
	];
	for (let index = elements.length; index < HUMAN_PERFORMANCE_FIXTURE_SIZE; index += 1) {
		elements.push({
			id: `f${index.toString(36)}`,
			type: "rectangle",
			x: (index % 100) * 130,
			y: 300 + Math.floor(index / 100) * 90,
			width: 90,
			height: 50,
			backgroundColor: "#ffffff",
			fillStyle: "solid",
		});
	}
	return elements;
}

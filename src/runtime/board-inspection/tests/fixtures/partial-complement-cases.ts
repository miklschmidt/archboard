import { semanticNode } from "./elements.js";

export function partialComplementLabelBoard(count: number) {
	const labels = Array.from({ length: count }, (_, index) => ({
		id: `partial-label-${count}-${index}`,
		type: "text",
		x: count + 1,
		y: count + 1 + index * 2,
		width: 1,
		height: 1,
		angle: 0,
		fontFamily: 5,
		text: `${index}`,
		containerId: `partial-owner-${count - 1}`,
	}));
	return [
		...Array.from({ length: count }, (_, index) =>
			semanticNode(`partial-owner-${index}`, {
				x: index,
				y: index,
				width: (count - index) * 4,
				height: (count - index) * 4,
				...(index === count - 1
					? { boundElements: labels.map((label) => ({ id: label.id, type: "text" })) }
					: {}),
			}),
		),
		semanticNode(`partial-unrelated-${count}`, {
			x: count,
			y: count * 10,
			width: count * 2,
			height: 1,
		}),
		...labels,
	];
}

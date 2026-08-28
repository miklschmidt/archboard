import { connector, type PackageElement } from "./package-cases.js";

export function performanceBoard(
	nodeCount: number,
	connectorCount: number,
	labelCount: number,
): PackageElement[] {
	const nodes = Array.from({ length: nodeCount }, (_, index) => ({
		id: `n${index}`,
		type: "rectangle",
		x: 0,
		y: index * 20,
		width: 100,
		height: 10,
		angle: 0,
		customData: { archboard: { node: `node-${index}` } },
		boundElements: [] as PackageElement[],
	}));
	const labels = Array.from({ length: labelCount }, (_, index) => ({
		id: `t${index}`,
		type: "text",
		x: 20,
		y: index * 20,
		width: 10,
		height: 5,
		angle: 0,
		fontFamily: 5,
		text: `n${index}`,
		containerId: `n${index}`,
	}));
	const connectors = Array.from({ length: connectorCount }, (_, index) => {
		const start = index % nodeCount;
		const end = (index + 1) % nodeCount;
		const edge = connector({
			id: `e${index}`,
			y: nodeCount * 30 + index,
			startBinding: { elementId: `n${start}`, focus: 0, gap: 0 },
			endBinding: { elementId: `n${end}`, focus: 0, gap: 0 },
		});
		nodes[start]!.boundElements.push({ id: edge.id, type: "arrow" });
		nodes[end]!.boundElements.push({ id: edge.id, type: "arrow" });
		return edge;
	});
	for (let index = 0; index < labelCount; index += 1)
		nodes[index]!.boundElements.push({ id: `t${index}`, type: "text" });
	return [...nodes, ...connectors, ...labels];
}

export function terminalComparisonBoard(): PackageElement[] {
	return [
		...performanceBoard(500, 1_500, 500),
		connector({
			id: "terminal-zero-segments",
			x: 20_000,
			points: Array.from({ length: 10_001 }, () => [0, 0]),
		}),
	];
}

export const inputLimitedScene = (): PackageElement[] => [
	{
		id: "x".repeat(999_985),
		type: "rectangle",
		x: 0,
		y: 0,
		width: 1,
		height: 1,
	},
];

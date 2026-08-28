export type RawElement = Record<string, unknown>;

export function semanticNode(id: string, overrides: RawElement = {}): RawElement {
	return {
		id,
		type: "rectangle",
		x: 0,
		y: 0,
		width: 10,
		height: 10,
		angle: 0,
		customData: { archboard: { node: id } },
		...overrides,
	};
}

export function connector(overrides: RawElement = {}): RawElement {
	return {
		id: "edge",
		type: "arrow",
		x: 0,
		y: 0,
		width: 100,
		height: 0,
		angle: 0,
		points: [
			[0, 0],
			[100, 0],
		],
		...overrides,
	};
}

export function labelContainer(overrides: RawElement = {}): RawElement {
	return {
		id: "svc",
		type: "rectangle",
		x: 0,
		y: 0,
		width: 200,
		height: 80,
		angle: 0,
		boundElements: [{ id: "svc-label", type: "text" }],
		...overrides,
	};
}

export function boundLabel(overrides: RawElement = {}): RawElement {
	return {
		id: "svc-label",
		type: "text",
		containerId: "svc",
		x: 50,
		y: 27,
		width: 100,
		height: 26,
		fontFamily: 5,
		text: "AuthService",
		...overrides,
	};
}

export function libraryBody(id: string, x = 0, groupIds: readonly string[] = []): RawElement {
	return {
		id,
		type: "rectangle",
		x,
		y: 0,
		width: 10,
		height: 10,
		angle: 0,
		groupIds: [...groupIds],
		customData: { library: { itemId: `item-${id}`, source: "catalogue" } },
	};
}

export function crossingConnectors(): [RawElement, RawElement] {
	return [
		connector({ id: "over", type: "line", y: 50, index: "a0" }),
		connector({
			id: "under",
			index: "a1",
			x: 50,
			y: 0,
			width: 0,
			height: 100,
			points: [
				[0, 0],
				[0, 100],
			],
		}),
	];
}

export function duplicateLabelBoard(reverse = false): RawElement[] {
	const labels = [
		boundLabel({ id: "newlbl", containerId: "owner", createdAt: "2026-08-27T02:00:00Z" }),
		boundLabel({ id: "oldlbl", containerId: "owner", createdAt: "2026-08-27T01:00:00Z" }),
	];
	return [
		labelContainer({ id: "owner", boundElements: [] }),
		...(reverse ? labels.toReversed() : labels),
	];
}

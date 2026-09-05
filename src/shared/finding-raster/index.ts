interface FindingFocusBox {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

interface FindingRasterDimensions {
	width: number;
	height: number;
	scale: number;
}

/**
 * The one fixed raster policy used by the browser exporter and the validator.
 * @param box - Readonly finding bounds to fit into the raster budget.
 * @returns Deterministic raster dimensions and scale.
 */
function findingRasterDimensions(box: FindingFocusBox): FindingRasterDimensions {
	const longest = Math.max(box.width, box.height);
	if (!Number.isFinite(longest) || longest <= 0) {
		throw new Error("A finding focus box must have a finite positive extent.");
	}
	const scale = Math.min(4, 1024 / longest);
	return {
		width: Math.max(1, Math.floor(box.width * scale)),
		height: Math.max(1, Math.floor(box.height * scale)),
		scale,
	};
}

export { type FindingFocusBox, type FindingRasterDimensions, findingRasterDimensions };

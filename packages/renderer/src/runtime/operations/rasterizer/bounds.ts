// What one bitmap may be: the diagram's own page at a stated scale, inside
// what a headless Chromium surface will draw in one piece.

/**
 * The longest side a capture may have, in bitmap pixels. Skia's surfaces and
 * Chromium's screenshot path both stop short of 2^14 on a side; a diagram
 * larger than that at scale 1 is refused rather than tiled or shrunk, because
 * a picture somebody did not ask for is worse than none.
 */
const RASTER_MAX_SIDE_PX = 16_384;

/**
 * The most pixels one capture may hold. A bitmap this size is 320 MB of RGBA
 * in the browser before it is encoded; past it a capture stalls the whole
 * renderer and answers nothing useful.
 */
const RASTER_MAX_PIXELS = 80_000_000;

/** The scales a caller may ask for; 1 is native and the default. */
const RASTER_MIN_SCALE = 0.25;
const RASTER_MAX_SCALE = 4;

/** A rectangle of the diagram's page, in CSS pixels. */
interface PageRegion {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

/** What one capture is asked to be, before the browser sees it. */
interface RasterBounds {
	/** The diagram's page width in CSS pixels, as the SVG states it. */
	readonly width: number;
	/** The diagram's page height in CSS pixels, as the SVG states it. */
	readonly height: number;
	/** Bitmap pixels per CSS pixel. */
	readonly scale: number;
	/**
	 * Which part of the page to draw; the whole page when absent. A region is
	 * how a large diagram is given back at native detail in pieces, and never
	 * what a caller asked for as the diagram.
	 */
	readonly region?: PageRegion | undefined;
}

/** The bitmap a valid request produces. */
interface BitmapSize {
	readonly width: number;
	readonly height: number;
}

/**
 * The page rectangle a request draws: its region, or the whole page rounded
 * up to whole CSS pixels (the renderer already states integers; a fractional
 * page rounds up so no edge is clipped).
 * @param bounds What was asked for.
 * @returns The rectangle, in whole CSS pixels.
 */
function regionOf(bounds: RasterBounds): PageRegion {
	if (bounds.region !== undefined) return bounds.region;
	return { x: 0, y: 0, width: Math.ceil(bounds.width), height: Math.ceil(bounds.height) };
}

/**
 * The bitmap size a request produces: its page rectangle times the scale,
 * rounded to whole pixels.
 * @param bounds What was asked for.
 * @returns The bitmap size.
 */
function bitmapSizeOf(bounds: RasterBounds): BitmapSize {
	const region = regionOf(bounds);
	return {
		width: Math.round(region.width * bounds.scale),
		height: Math.round(region.height * bounds.scale),
	};
}

/**
 * Whether a number is a positive, finite size.
 * @param value The number.
 * @returns Whether it is.
 */
function isPositiveSize(value: number): boolean {
	return Number.isFinite(value) && value > 0;
}

/**
 * Why the scale cannot be drawn, or null when it can.
 * @param scale The scale.
 * @returns The refusal text, or null.
 */
function scaleRefusal(scale: number): string | null {
	if (Number.isFinite(scale) && scale >= RASTER_MIN_SCALE && scale <= RASTER_MAX_SCALE) {
		return null;
	}
	return `Scale must be between ${RASTER_MIN_SCALE} and ${RASTER_MAX_SCALE}, not ${scale}.`;
}

/**
 * Why the page rectangle cannot be drawn, or null when it can.
 * @param region The rectangle.
 * @returns The refusal text, or null.
 */
function regionRefusal(region: PageRegion): string | null {
	if (isPositiveSize(region.width) && isPositiveSize(region.height)) return null;
	return `The diagram has no drawable size (${region.width}×${region.height}).`;
}

/**
 * Why the bitmap cannot be drawn in one piece, or null when it can.
 * @param size The bitmap size.
 * @returns The refusal text, or null.
 */
function sizeRefusal(size: BitmapSize): string | null {
	if (!isPositiveSize(size.width) || !isPositiveSize(size.height)) {
		return `The requested scale rounds the bitmap to ${size.width}×${size.height} pixels; increase the scale or draw a larger region.`;
	}
	const advice = "lower the scale or draw a narrower view.";
	if (size.width > RASTER_MAX_SIDE_PX || size.height > RASTER_MAX_SIDE_PX) {
		return `A ${size.width}×${size.height} bitmap exceeds the ${RASTER_MAX_SIDE_PX} px side a capture may have; ${advice}`;
	}
	if (size.width * size.height > RASTER_MAX_PIXELS) {
		return `A ${size.width}×${size.height} bitmap exceeds the ${RASTER_MAX_PIXELS} pixels a capture may hold; ${advice}`;
	}
	return null;
}

/**
 * Why a request cannot be drawn, or null when it can.
 * @param bounds What was asked for.
 * @returns The refusal text, or null.
 */
function boundsRefusal(bounds: RasterBounds): string | null {
	return (
		scaleRefusal(bounds.scale) ??
		regionRefusal(regionOf(bounds)) ??
		sizeRefusal(bitmapSizeOf(bounds))
	);
}

export {
	RASTER_MAX_PIXELS,
	RASTER_MAX_SCALE,
	RASTER_MAX_SIDE_PX,
	RASTER_MIN_SCALE,
	bitmapSizeOf,
	boundsRefusal,
	regionOf,
	type BitmapSize,
	type PageRegion,
	type RasterBounds,
};

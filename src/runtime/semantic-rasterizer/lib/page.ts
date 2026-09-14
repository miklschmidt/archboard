// What the page has to say before and after the shot: that it is the SVG,
// paused at its first frame with every face loaded, and that the bitmap it
// answered is exactly the size the diagram asks for.

import { bitmapSizeOf, type RasterBounds } from "@/runtime/semantic-rasterizer/lib/bounds";
import { isJsonRecord } from "@/runtime/semantic-rasterizer/lib/devtools";
import { readPngDimensions } from "@/runtime/semantic-rasterizer/lib/png";

/** How the page sat before the shot was taken. */
interface PageReadiness {
	readonly width: number;
	readonly height: number;
	readonly fonts: number;
	readonly failedFaces: readonly string[];
}

/** The bytes a shot answered, and their size. */
interface CheckedBitmap {
	readonly png: Uint8Array;
	readonly width: number;
	readonly height: number;
}

/**
 * What the page runs before the shot: pause every SMIL animation at its first
 * frame so the traffic marks sit where the renderer put them at time zero,
 * load every declared face and refuse to go on with a fallback, and read the
 * page size the SVG states.
 */
const READINESS_SCRIPT = `(async () => {
	const root = document.documentElement;
	if (!(root instanceof SVGSVGElement)) {
		throw new Error("The loaded document is not an SVG.");
	}
	root.pauseAnimations();
	root.setCurrentTime(0);
	const faces = [...document.fonts];
	await Promise.all(faces.map((face) => face.load().catch(() => undefined)));
	await document.fonts.ready;
	const failedFaces = faces
		.filter((face) => face.status !== "loaded")
		.map((face) => face.family + " " + face.weight);
	return {
		width: root.width.baseVal.value,
		height: root.height.baseVal.value,
		fonts: faces.length,
		failedFaces,
	};
})()`;

/**
 * Whether a page answer is the readiness record.
 * @param value The answer.
 * @returns Whether it is.
 */
function isPageReadiness(value: unknown): value is PageReadiness {
	return (
		isJsonRecord(value) &&
		typeof value["width"] === "number" &&
		typeof value["height"] === "number" &&
		typeof value["fonts"] === "number" &&
		Array.isArray(value["failedFaces"])
	);
}

/**
 * The readiness the page reported, refused when a face did not load.
 * @param value What the page answered.
 * @returns The readiness.
 */
function checkedReadiness(value: unknown): PageReadiness {
	if (!isPageReadiness(value)) {
		throw new Error("The page did not report its readiness.");
	}
	if (value.failedFaces.length > 0) {
		throw new Error(
			`The document's faces did not load before capture: ${value.failedFaces.join(", ")}.`,
		);
	}
	return value;
}

/**
 * The PNG a screenshot answered, checked to be exactly the size the job asks for.
 * @param shot The DevTools answer.
 * @param bounds What was asked for.
 * @returns The bytes and their size.
 */
function checkedBitmap(shot: unknown, bounds: RasterBounds): CheckedBitmap {
	const data = isJsonRecord(shot) ? shot["data"] : undefined;
	if (typeof data !== "string") {
		throw new Error("Chromium answered the screenshot without image data.");
	}
	const png = Uint8Array.from(Buffer.from(data, "base64"));
	const measured = readPngDimensions(png);
	const size = bitmapSizeOf(bounds);
	if (measured.width !== size.width || measured.height !== size.height) {
		throw new Error(
			`Chromium drew ${measured.width}×${measured.height}, not the ${size.width}×${size.height} the diagram asks for at scale ${bounds.scale}.`,
		);
	}
	return { png, width: measured.width, height: measured.height };
}

export {
	READINESS_SCRIPT,
	checkedBitmap,
	checkedReadiness,
	type CheckedBitmap,
	type PageReadiness,
};

// A camera travelling from one view of a diagram to another, as arithmetic.
//
// A straight interpolation of position and scale is the wrong path for a long
// move: zooming in while crossing a wide board sweeps the destination past the
// reader faster than they can follow, and the middle of the move shows nothing
// they know. The smooth and efficient path of van Wijk and Nuij (2003) pulls
// back as far as the distance needs, crosses, and comes in again, so the start
// and the end are both in sight for as much of the move as they can be. It is
// the path d3-zoom flies; written out here because it is a dozen lines and the
// camera is this module's own.
//
// Pure, like the rest of the camera: a glide is a function from how far through
// it is to where the camera is, and whoever drives it owns the clock.

import type { Camera, Size } from "@/ui/semantic-board-canvas/lib/camera";

/** How much a glide prefers zooming out over panning; the value d3-zoom uses. */
const RHO = Math.SQRT2;

/** Below this distance, in diagram units, a glide only zooms. */
const NEAR = 1e-6;

/** A view of the diagram: the point at the middle of the viewport, and how wide the viewport is in diagram units. */
interface View {
	readonly cx: number;
	readonly cy: number;
	readonly width: number;
}

/**
 * The view a camera shows in a viewport.
 * @param camera The camera.
 * @param viewport The viewport.
 * @returns The view.
 */
function viewOf(camera: Camera, viewport: Size): View {
	return {
		cx: (viewport.width / 2 - camera.x) / camera.scale,
		cy: (viewport.height / 2 - camera.y) / camera.scale,
		width: viewport.width / camera.scale,
	};
}

/**
 * The camera that shows a view in a viewport.
 * @param view The view.
 * @param viewport The viewport.
 * @returns The camera.
 */
function cameraOf(view: View, viewport: Size): Camera {
	const scale = viewport.width / view.width;
	return {
		scale,
		x: viewport.width / 2 - view.cx * scale,
		y: viewport.height / 2 - view.cy * scale,
	};
}

/**
 * A glide that only zooms, for two views centred on the same point.
 * @param from The view it starts at.
 * @param to The view it ends at.
 * @returns The view at each moment.
 */
function zoomOnly(from: View, to: View): (t: number) => View {
	const span = Math.log(to.width / from.width);
	return (t) => ({
		cx: from.cx + (to.cx - from.cx) * t,
		cy: from.cy + (to.cy - from.cy) * t,
		width: from.width * Math.exp(span * t),
	});
}

/**
 * The smooth and efficient path between two views that are apart.
 * @param from The view it starts at.
 * @param to The view it ends at.
 * @param distance How far apart their middles are, in diagram units.
 * @returns The view at each moment.
 */
function flight(from: View, to: View, distance: number): (t: number) => View {
	const rho2 = RHO * RHO;
	const rho4 = rho2 * rho2;
	const w0 = from.width;
	const w1 = to.width;
	const b0 = (w1 * w1 - w0 * w0 + rho4 * distance * distance) / (2 * w0 * rho2 * distance);
	const b1 = (w1 * w1 - w0 * w0 - rho4 * distance * distance) / (2 * w1 * rho2 * distance);
	const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
	const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
	const length = (r1 - r0) / RHO;
	const dx = to.cx - from.cx;
	const dy = to.cy - from.cy;
	return (t) => {
		const s = t * length;
		const coshR0 = Math.cosh(r0);
		const u = (w0 / (rho2 * distance)) * (coshR0 * Math.tanh(RHO * s + r0) - Math.sinh(r0));
		return {
			cx: from.cx + u * dx,
			cy: from.cy + u * dy,
			width: (w0 * coshR0) / Math.cosh(RHO * s + r0),
		};
	};
}

/**
 * The path a camera glides along between two cameras in one viewport.
 * @param from Where the camera is.
 * @param to Where it is going.
 * @param viewport The viewport both are for.
 * @returns The camera at each moment, 0 at the start and 1 at the end; exactly
 * the destination at 1.
 */
function glidePath(from: Camera, to: Camera, viewport: Size): (t: number) => Camera {
	const start = viewOf(from, viewport);
	const end = viewOf(to, viewport);
	const distance = Math.hypot(end.cx - start.cx, end.cy - start.cy);
	const path = distance < NEAR ? zoomOnly(start, end) : flight(start, end, distance);
	return (t) => (t >= 1 ? to : t <= 0 ? from : cameraOf(path(t), viewport));
}

export { glidePath };

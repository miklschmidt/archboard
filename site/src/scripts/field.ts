// The drafting table under the lamp: a grid in perspective, lit by a warm pool of light that
// sits on the table under the pointer, with light travelling along its lines the way traffic
// travels along the relationships of a picture. Without a pointer the lamp rests to the right of
// the words. A table can carry a drawing that the painter draws live: it lies on the paper, the
// lamp lights it, and the card under the lamp lights its lines.

import { runShader } from "./gl";
import type { Region, TableDrawing } from "./table-drawing";

const FRAGMENT = `#version 300 es
precision highp float;
#define CARDS 64
uniform vec2 uRes;
uniform float uTime;
// Where the lamp hangs on the canvas, 0..1 from the bottom left.
uniform vec2 uLamp;
uniform float uScroll;
uniform float uPitch;
uniform float uLift;
uniform float uTraffic;
// 1 draws the table's grid, 0 leaves only the light that travels along it.
uniform float uGrid;
// The drawing, painted at three scales: the whole of it, and two parts nearer the eye, finer.
uniform sampler2D uLevel0;
uniform sampler2D uLevel1;
uniform sampler2D uLevel2;
// The part of the drawing each level holds, 0..1 across and down it; an empty part for none.
uniform vec4 uRegions[3];
// The drawing's sheet on the table: its left edge, its near edge, its width and its depth.
uniform vec4 uSheet;
// How round a card's corners are, in table units.
uniform float uCorner;
// 1 while the table carries a drawing, else 0.
uniform float uInk;
// The drawing's cards as tiles on the table: each one's left, near, right and far edges, and the
// heights of its underside and its face.
uniform vec4 uCards[CARDS];
uniform vec2 uHeights[CARDS];
uniform int uCount;
out vec4 outColor;

const vec3 GROUND = vec3(0.036, 0.031, 0.025);
const vec3 LINE = vec3(0.21, 0.195, 0.17);
const vec3 LAMP = vec3(1.0, 0.85, 0.56);
// How much of a card's tone its tile's body keeps: the theme's slab edge against its face.
const float BODY = 0.55;
// How far the top edge of a tile is rounded off, in table units.
const float BEVEL = 0.009;
// How high the lamp hangs over the table.
const float LAMP_HEIGHT = 1.4;

float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }

vec3 palette(float k) {
	if (k < 0.22) return vec3(0.22, 0.74, 0.97);
	if (k < 0.40) return vec3(0.18, 0.83, 0.75);
	if (k < 0.72) return vec3(0.96, 0.80, 0.42);
	if (k < 0.86) return vec3(0.66, 0.55, 0.98);
	return vec3(0.20, 0.83, 0.60);
}

// A pulse running along one lane: bright at its head, with a tail of light behind it.
float pulse(float s, float lane, float t) {
	float speed = 1.6 + hash(lane * 3.1) * 2.6;
	float period = 34.0 + hash(lane * 7.7) * 40.0;
	float head = mod(t * speed + hash(lane) * period, period) - period * 0.5;
	float d = head - s;
	return d > 0.0 ? exp(-d * 0.55) : exp(d * 12.0);
}

// The camera's ray through one pixel.
vec3 ray(vec2 frag) {
	vec2 uv = (frag - 0.5 * uRes) / uRes.y;
	vec3 rd = normalize(vec3(uv.x, uv.y, 1.25));
	float c = cos(uPitch), s = sin(uPitch);
	return vec3(rd.x, rd.y * c - rd.z * s, rd.y * s + rd.z * c);
}

// A point's distance from a card's rounded footprint on the table, negative inside it.
float footprint(vec2 p, vec4 c) {
	vec2 size = (c.zw - c.xy) * 0.5;
	float r = min(uCorner, min(size.x, size.y));
	vec2 q = abs(p - (c.xy + c.zw) * 0.5) - size + r;
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// A point's distance from a card's tile: its footprint raised between two heights, the top edge
// rounded off.
float tile(vec3 p, vec4 c, vec2 h) {
	float rise = (h.y - h.x) * 0.5;
	float bevel = min(BEVEL, rise);
	vec2 w = vec2(footprint(p.xz, c) + bevel, abs(p.y - (h.x + h.y) * 0.5) - rise + bevel);
	return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - bevel;
}

// The tile's surface direction at a point on it.
vec3 tileNormal(vec3 p, vec4 c, vec2 h) {
	vec2 e = vec2(0.0012, -0.0012);
	return normalize(
		e.xyy * tile(p + e.xyy, c, h) + e.yyx * tile(p + e.yyx, c, h) +
		e.yxy * tile(p + e.yxy, c, h) + e.xxx * tile(p + e.xxx, c, h)
	);
}

// One level of the drawing at a point of its sheet.
vec4 level(sampler2D t, vec4 r, vec2 s, vec2 dx, vec2 dy) {
	vec2 k = 1.0 / (r.zw - r.xy);
	return textureGrad(t, (s - r.xy) * k, dx * k, dy * k);
}

// How far inside a level's part a point stands: 0 at its edge, 1 a little way in.
float within(vec4 r, vec2 s) {
	vec2 a = (s - r.xy) / max(r.zw - r.xy, vec2(1e-5));
	vec2 e = min(a, 1.0 - a);
	return smoothstep(0.0, 0.03, min(e.x, e.y));
}

// The drawing at a point of its sheet, from the finest level that holds it.
vec4 inkAt(vec2 s, vec2 dx, vec2 dy) {
	vec2 edge = step(vec2(0.0), s) * step(s, vec2(1.0));
	vec4 ink = level(uLevel0, uRegions[0], s, dx, dy);
	float one = within(uRegions[1], s);
	if (one > 0.0) ink = mix(ink, level(uLevel1, uRegions[1], s, dx, dy), one);
	float two = within(uRegions[2], s);
	if (two > 0.0) ink = mix(ink, level(uLevel2, uRegions[2], s, dx, dy), two);
	return ink * edge.x * edge.y;
}

// Where a point of the table lies on the drawing's sheet, 0..1 across and down the picture.
vec2 onSheet(vec2 w) {
	return vec2((w.x - uSheet.x) / uSheet.z, 1.0 - (w.y - uSheet.y) / uSheet.w);
}

// How the lamp lights a point of the table: its pool, and the wide glow around it.
vec2 lampAt(vec2 w, vec2 lamp) {
	float d = length((w - lamp) * vec2(1.0, 0.8));
	return vec2(exp(-d * d * 0.28), exp(-d * 0.32));
}

void main() {
	// The table slides toward the eye as the page scrolls: the camera moves over it.
	vec3 ro = vec3(0.0, uLift, uScroll * 1.5);
	vec3 rd = ray(gl_FragCoord.xy);
	// The lamp's ray meets the table where the pointer is. A ray at or above the horizon meets it
	// far away, so the lamp never leaves the table.
	vec3 lampRay = ray(uLamp * uRes);
	vec2 lamp = (ro + lampRay * (-ro.y / min(lampRay.y, -0.04))).xz;

	// Where the ray meets the table, and where that is on the drawing's sheet. The sheet's
	// derivatives are taken here, where every pixel takes them.
	float t = -ro.y / min(rd.y, -0.0005);
	vec2 w = (ro + rd * t).xz;
	vec2 sheet = onSheet(w);
	vec2 sheetDx = dFdx(sheet);
	vec2 sheetDy = dFdy(sheet);

	vec2 q = gl_FragCoord.xy / uRes;
	vec3 col = GROUND;
	if (rd.y < -0.0005) {
		// Engineering paper: a fine grid, and a major line every fifth.
		vec2 g = w * 10.0;
		vec2 fw = max(fwidth(g), vec2(1e-4));
		vec2 a = abs(fract(g + 0.5) - 0.5);
		float minor = max(1.0 - smoothstep(0.0, fw.x, a.x), 1.0 - smoothstep(0.0, fw.y, a.y));
		vec2 G = g / 5.0;
		vec2 FW = fw / 5.0;
		vec2 A = abs(fract(G + 0.5) - 0.5);
		float majorX = 1.0 - smoothstep(0.0, FW.x * 1.1, A.x);
		float majorY = 1.0 - smoothstep(0.0, FW.y * 1.1, A.y);
		float major = max(majorX, majorY);
		float dots = 1.0 - smoothstep(0.9, 2.0, length(A / FW));
		float fine = clamp(1.0 - max(fw.x, fw.y) * 2.5, 0.0, 1.0);
		float coarse = clamp(1.0 - max(FW.x, FW.y) * 2.5, 0.0, 1.0);
		float fog = exp(-t * 0.12);
		vec2 light = lampAt(w, lamp);
		float pool = light.x;
		float wide = light.y;

		col += LAMP * (pool * 0.16 + wide * 0.05);
		col += LINE * minor * fine * fog * (0.035 + pool * 0.55) * uGrid;
		col += LINE * major * coarse * fog * (0.11 + pool * 1.25) * uGrid;
		col += LAMP * dots * coarse * fog * (0.04 + pool * 0.7) * uGrid;

		// Traffic runs on the major lines: light that travels along a line that already stands.
		vec2 lane = floor(G + 0.5);
		float hy = hash(lane.y * 1.7 + 11.0);
		if (hy < 0.32) {
			float p = pulse(G.x * (hy < 0.16 ? 1.0 : -1.0), lane.y, uTime);
			col += palette(hash(lane.y * 5.3)) * p * majorY * coarse * fog * uTraffic * (0.45 + pool * 1.6);
		}
		float hx = hash(lane.x * 2.3 + 37.0);
		if (hx < 0.26) {
			float p = pulse(G.y * (hx < 0.13 ? 1.0 : -1.0), lane.x + 100.0, uTime);
			col += palette(hash(lane.x * 9.1)) * p * majorX * coarse * fog * uTraffic * (0.45 + pool * 1.6);
		}

		if (uInk > 0.0) {
			// Left of the canvas, where the words stand, only the lamp shows the drawing.
			float reveal = max(mix(0.1, 1.0, smoothstep(0.36, 0.7, q.x)), min(0.7, pool * 1.1));

			// The tile the ray meets first, the shade the tiles cast on the table away from the lamp,
			// and the footprints, where the table shows nothing of the drawing.
			int hit = -1;
			vec4 card = vec4(0.0);
			vec2 heights = vec2(0.0);
			vec2 span = vec2(t);
			float shade = 0.0;
			float under = 0.0;
			vec2 away = normalize(w - lamp + vec2(1e-4));
			vec3 inv = 1.0 / rd;
			bool onIt = all(greaterThan(sheet, vec2(-0.08))) && all(lessThan(sheet, vec2(1.08)));
			for (int i = 0; i < CARDS; i++) {
				if (!onIt || i >= uCount) break;
				vec2 h = uHeights[i];
				if (h.y - h.x < 0.0005) continue;
				vec4 c = uCards[i];
				vec3 t0 = (vec3(c.x, h.x, c.y) - ro) * inv;
				vec3 t1 = (vec3(c.z, h.y, c.w) - ro) * inv;
				vec3 tn = min(t0, t1);
				vec3 tf = max(t0, t1);
				float enter = max(max(tn.x, tn.y), tn.z);
				float leave = min(min(tf.x, tf.y), tf.z);
				if (enter < leave && leave > 0.0 && enter < span.x) {
					hit = i;
					card = c;
					heights = h;
					span = vec2(max(enter, 0.0), leave);
				}
				// A higher tile casts a longer, softer shadow.
				float d = footprint(w - away * h.y * 1.6, c);
				shade = max(shade, (1.0 - smoothstep(-h.y * 0.5, h.y * 2.2 + h.x * 3.0, d)) * min(1.0, h.y * 20.0));
				under = max(under, 1.0 - smoothstep(-0.002, 0.002, footprint(w, c)));
			}

			// The table: the drawing's lines and labels, in the tiles' shade.
			vec4 ink = inkAt(sheet, sheetDx, sheetDy) * reveal * (1.0 - under);
			vec3 lit = ink.rgb * (0.55 + pool * 1.2 + wide * 0.35) * mix(vec3(1.0), LAMP * 1.2, pool * 0.35);
			col = mix(col, col * (1.0 - ink.a) + lit, exp(-t * 0.085));
			col *= 1.0 - shade * 0.62 * reveal;

			// The ray marches the rounded tile inside the box it entered.
			if (hit >= 0) {
				float along = span.x;
				bool met = false;
				for (int k = 0; k < 48; k++) {
					float d = tile(ro + rd * along, card, heights);
					if (d < 0.0002) {
						met = true;
						break;
					}
					along += d;
					if (along > span.y) break;
				}
				if (met) {
					vec3 p = ro + rd * along;
					vec3 n = tileNormal(p, card, heights);
					vec2 at = lampAt(p.xz, lamp);
					float glow = 0.55 + at.x * 1.2 + at.y * 0.35;
					vec3 toLamp = normalize(vec3(lamp.x, LAMP_HEIGHT, lamp.y) - p);
					// The top is the card as the painter paints it. The body takes the card's own tone a
					// shade deeper, as the slab's edge does, read just inside its face.
					vec4 face = inkAt(onSheet(p.xz), sheetDx, sheetDy);
					vec2 inward = clamp(p.xz, card.xy + 0.03, card.zw - 0.03);
					vec3 body = inkAt(onSheet(inward), sheetDx, sheetDy).rgb * BODY;
					float top = smoothstep(0.75, 0.97, n.y);
					vec3 tone = mix(body, face.rgb + body * (1.0 - face.a), top);
					float facing = max(dot(n, toLamp), 0.0);
					float shine = pow(max(dot(reflect(-toLamp, n), -rd), 0.0), 28.0) * (1.0 - top);
					vec3 surface = tone * glow * mix(0.7 + facing * 0.6, 1.08, top) * mix(vec3(1.0), LAMP * 1.2, at.x * 0.35);
					surface += LAMP * shine * (0.08 + at.x * 0.5);
					col = mix(col, surface, exp(-along * 0.085) * reveal);
				}
			}
		}
	}

	col *= 0.7 + 0.3 * pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.3);
	col += (hash2(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * 0.014;
	outColor = vec4(col, 1.0);
}`;

export interface FieldPreset {
	pitch: number;
	lift: number;
	traffic: number;
	/** Whether the table shows its grid, or only the light that travels along it. */
	grid: boolean;
}

/** Where the lamp rests without a pointer, on the table: right of the words and up the page. */
const REST = { x: 2.1, z: 5.6 };

/** Where a drawing lies on the table: its left edge, its near edge and its width. */
const SHEET = { left: -0.6, near: 2.2, width: 12 };

/** How thick a card's tile stands, and how high the lamp lifts a card off the table. */
const TILE = { thickness: 0.05, lifted: 0.1 };

/**
 * The parts of the canvas whose table the finer levels of a drawing hold: rows from the bottom and
 * columns from the left, 0..1. Left of the words' edge only the lamp shows the drawing, so the fine
 * levels leave it to the first.
 */
const BANDS = [
	{ rows: [0.1, 0.72], columns: [0.28, 1] },
	{ rows: [0.1, 0.4], columns: [0.28, 1] },
] as const;

/** How many cards stand as tiles: the shader's CARDS. The rest lie flat in the drawing. */
const CARDS = 64;

/**
 * Where a point of the canvas lies on the table, through the shader's camera.
 * @param preset The camera.
 * @param aspect The canvas's width over its height.
 * @param point The point, 0..1 from the bottom left.
 * @param scroll How far the table slid with the page, as the shader reads it.
 * @returns The point on the table.
 */
function onTable(
	preset: FieldPreset,
	aspect: number,
	point: { x: number; y: number },
	scroll: number,
): { x: number; z: number } {
	const [ux, uy] = [(point.x - 0.5) * aspect, point.y - 0.5];
	const length = Math.hypot(ux, uy, 1.25);
	const [c, s] = [Math.cos(preset.pitch), Math.sin(preset.pitch)];
	const [x, y, z] = [ux / length, uy / length, 1.25 / length];
	const t = -preset.lift / Math.min(y * c - z * s, -0.04);
	return { x: x * t, z: (y * s + z * c) * t + scroll * 1.5 };
}

/**
 * Where a point on the table appears on the canvas, through the shader's camera.
 * @param preset The camera.
 * @param aspect The canvas's width over its height.
 * @returns The point on the canvas, 0..1 from the bottom left.
 */
function onCanvas(preset: FieldPreset, aspect: number): { x: number; y: number } {
	const c = Math.cos(preset.pitch);
	const s = Math.sin(preset.pitch);
	const down = -preset.lift;
	const depth = -s * down + c * REST.z;
	return {
		x: (1.25 * REST.x) / depth / aspect + 0.5,
		y: (1.25 * (c * down + s * REST.z)) / depth + 0.5,
	};
}

/** A drawing's texture on one context: made on the first frame, and again after a lost context. */
interface Texture {
	readonly gl: WebGL2RenderingContext;
	readonly texture: WebGLTexture;
}

/**
 * The part of a drawing that a part of the canvas shows on the table.
 * @param preset The camera.
 * @param aspect The canvas's width over its height.
 * @param band The part of the canvas.
 * @param scroll How far the table slid with the page.
 * @param depth The drawing's depth on the table.
 * @returns The part of the drawing, 0..1 across and down it.
 */
function bandRegion(
	preset: FieldPreset,
	aspect: number,
	band: (typeof BANDS)[number],
	scroll: number,
	depth: number,
): Region {
	const [bottom, top] = band.rows;
	const [left, right] = band.columns;
	const corners = [
		{ x: left, y: bottom },
		{ x: right, y: bottom },
		{ x: left, y: top },
		{ x: right, y: top },
	].map((point) => onTable(preset, aspect, point, scroll));
	const across = corners.map((point) => (point.x - SHEET.left) / SHEET.width);
	const down = corners.map((point) => 1 - (point.z - SHEET.near) / depth);
	const clamp = (value: number) => Math.min(1, Math.max(0, value));
	return [
		clamp(Math.min(...across)),
		clamp(Math.min(...down)),
		clamp(Math.max(...across)),
		clamp(Math.max(...down)),
	];
}

/**
 * Make the texture a level of a drawing fills, with every mip level a far table reads.
 * @param gl The context.
 * @param canvas The level's canvas.
 * @param unit The texture unit it is bound to.
 * @returns The texture.
 */
function makeTexture(
	gl: WebGL2RenderingContext,
	canvas: HTMLCanvasElement,
	unit: number,
): Texture | null {
	const texture = gl.createTexture();
	if (!texture) return null;
	const { width, height } = canvas;
	gl.activeTexture(gl.TEXTURE0 + unit);
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texStorage2D(
		gl.TEXTURE_2D,
		Math.floor(Math.log2(Math.max(width, height))) + 1,
		gl.RGBA8,
		width,
		height,
	);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	// The table meets the eye at a low angle, where only anisotropic filtering keeps lines sharp.
	const anisotropic = gl.getExtension("EXT_texture_filter_anisotropic");
	if (anisotropic) {
		const most = gl.getParameter(anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number;
		gl.texParameterf(gl.TEXTURE_2D, anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, most));
	}
	return { gl, texture };
}

/**
 * Light the drafting table on one canvas.
 * @param canvas The canvas, sized by CSS.
 * @param preset The camera and how much traffic runs.
 * @param drawing The drawing the table carries once its painter starts, if any.
 */
export function lightField(
	canvas: HTMLCanvasElement,
	preset: FieldPreset,
	drawing?: Promise<TableDrawing | null>,
): void {
	const host = canvas.parentElement ?? canvas;
	const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
	let lamp: { x: number; y: number } | undefined;
	let pointer: { x: number; y: number } | undefined;
	let previous: number | undefined;
	let scroll = 0;
	host.addEventListener("pointermove", (event) => {
		pointer = { x: event.clientX, y: event.clientY };
	});
	host.addEventListener("pointerleave", () => {
		pointer = undefined;
	});

	let carried: TableDrawing | null = null;
	const textures: (Texture | null)[] = [];
	const redraw = runShader({
		canvas,
		fragment: FRAGMENT,
		maxRatio: 1.25,
		stillTime: 14,
		uniforms: (gl, at, frame) => {
			const still = motion.matches;
			const rest = onCanvas(preset, frame.width / frame.height);
			let target = rest;
			if (still) scroll = 0;
			else {
				const box = host.getBoundingClientRect();
				scroll = Math.min(1, Math.max(0, -box.top / Math.max(1, box.height)));
				// Read the pointer against the canvas each frame, so a scroll keeps the lamp under it.
				const field = canvas.getBoundingClientRect();
				target = pointer
					? {
							x: (pointer.x - field.left) / field.width,
							y: Math.max(-0.2, 1 - (pointer.y - field.top) / field.height),
						}
					: { x: rest.x + Math.sin(frame.time * 0.13) * 0.03, y: rest.y };
			}
			// The lamp follows its target with a short, frame-rate-independent lag.
			const ease =
				lamp && !still ? 1 - Math.exp(-((frame.time - (previous ?? frame.time)) * 7)) : 1;
			previous = frame.time;
			lamp = lamp ?? target;
			lamp = { x: lamp.x + (target.x - lamp.x) * ease, y: lamp.y + (target.y - lamp.y) * ease };
			gl.uniform2f(at("uRes"), frame.width, frame.height);
			gl.uniform1f(at("uTime"), frame.time);
			gl.uniform2f(at("uLamp"), lamp.x, lamp.y);
			gl.uniform1f(at("uScroll"), scroll);
			gl.uniform1f(at("uPitch"), preset.pitch);
			gl.uniform1f(at("uLift"), preset.lift);
			gl.uniform1f(at("uTraffic"), preset.traffic);
			gl.uniform1f(at("uGrid"), preset.grid ? 1 : 0);
			gl.uniform1f(at("uInk"), carried ? 1 : 0);
			if (!carried) return;
			const aspect = frame.width / frame.height;
			const depth = SHEET.width / carried.aspect;
			gl.uniform4f(at("uSheet"), SHEET.left, SHEET.near, SHEET.width, depth);
			gl.uniform1f(at("uCorner"), carried.corner * SHEET.width);
			const now = performance.now();
			const tiles = carried.cards.slice(0, CARDS);
			const pose = carried.pose(now);
			gl.uniform1i(at("uCount"), tiles.length);
			gl.uniform4fv(
				at("uCards"),
				tiles.flatMap(([left, top, right, bottom]) => [
					SHEET.left + left * SHEET.width,
					SHEET.near + (1 - bottom) * depth,
					SHEET.left + right * SHEET.width,
					SHEET.near + (1 - top) * depth,
				]),
			);
			gl.uniform2fv(
				at("uHeights"),
				tiles.flatMap((_, index) => {
					const underside = (pose[index * 2 + 1] ?? 0) * TILE.lifted;
					return [underside, underside + (pose[index * 2] ?? 0) * TILE.thickness];
				}),
			);
			const table = onTable(preset, aspect, lamp, scroll);
			const across = (table.x - SHEET.left) / SHEET.width;
			const down = 1 - (table.z - SHEET.near) / depth;
			const inside = across >= 0 && across <= 1 && down >= 0 && down <= 1;
			carried.focus(pointer && inside ? { x: across, y: down } : null, now);
			// The finer levels follow the part of the table nearest the eye as the page scrolls.
			BANDS.forEach((band, index) => {
				carried?.aim(index + 1, bandRegion(preset, aspect, band, scroll, depth), now);
			});
			const drew = carried.frame(now);
			const regions = [0, 1, 2].flatMap((index) => carried?.levels[index]?.region ?? [0, 0, 0, 0]);
			gl.uniform4fv(at("uRegions"), regions);
			gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
			carried.levels.forEach((level, index) => {
				let held = textures[index];
				const fresh = held?.gl === gl && gl.isTexture(held.texture);
				if (!fresh) {
					held = makeTexture(gl, level.canvas, index);
					textures[index] = held;
				}
				if (!held) return;
				gl.uniform1i(at(`uLevel${String(index)}`), index);
				gl.activeTexture(gl.TEXTURE0 + index);
				gl.bindTexture(gl.TEXTURE_2D, held.texture);
				if (!drew[index] && fresh) return;
				gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, level.canvas);
				gl.generateMipmap(gl.TEXTURE_2D);
			});
		},
	});
	void drawing?.then((ready) => {
		carried = ready;
		redraw?.();
	});
}

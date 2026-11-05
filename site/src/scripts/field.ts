// The drafting table under the lamp: a grid in perspective, lit by a warm pool of light that
// sits on the table under the pointer, with light travelling along its lines the way traffic
// travels along the relationships of a picture. Without a pointer the lamp rests to the right of
// the words.

import { runShader } from "./gl";

const FRAGMENT = `#version 300 es
precision highp float;
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
out vec4 outColor;

const vec3 GROUND = vec3(0.036, 0.031, 0.025);
const vec3 LINE = vec3(0.21, 0.195, 0.17);
const vec3 LAMP = vec3(1.0, 0.85, 0.56);

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

	// Where the ray meets the table.
	float t = -ro.y / min(rd.y, -0.0005);
	vec2 w = (ro + rd * t).xz;

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

/**
 * Light the drafting table on one canvas.
 * @param canvas The canvas, sized by CSS.
 * @param preset The camera and how much traffic runs.
 */
export function lightField(canvas: HTMLCanvasElement, preset: FieldPreset): void {
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

	runShader({
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
			previous = still ? undefined : frame.time;
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
		},
	});
}

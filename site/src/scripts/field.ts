// The drafting table under the lamp: a grid in perspective, lit by a warm pool of light that
// follows the pointer, with light travelling along its lines the way traffic travels along the
// relationships of a picture.

import { runShader } from "./gl";
import { prefersReducedMotion } from "./reveal";

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uLamp;
uniform float uScroll;
uniform float uPitch;
uniform float uLift;
uniform float uTraffic;
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

void main() {
	vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
	vec3 ro = vec3(0.0, uLift, 0.0);
	vec3 rd = normalize(vec3(uv.x, uv.y, 1.25));
	float c = cos(uPitch), s = sin(uPitch);
	rd = vec3(rd.x, rd.y * c - rd.z * s, rd.y * s + rd.z * c);

	vec3 col = GROUND;
	if (rd.y < -0.0005) {
		float t = -ro.y / rd.y;
		vec2 w = (ro + rd * t).xz;
		w.y += uScroll * 1.5;

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

		// The lamp hangs to the right of the words, and the pointer moves it.
		vec2 lamp = vec2(2.1 + uLamp.x * 1.8, 5.6 + uLamp.y * 1.4);
		float ld = length((w - lamp) * vec2(1.0, 0.8));
		float pool = exp(-ld * ld * 0.28);
		float wide = exp(-ld * 0.32);

		col += LAMP * (pool * 0.16 + wide * 0.05);
		col += LINE * minor * fine * fog * (0.035 + pool * 0.55);
		col += LINE * major * coarse * fog * (0.11 + pool * 1.25);
		col += LAMP * dots * coarse * fog * (0.04 + pool * 0.7);

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

	vec2 q = gl_FragCoord.xy / uRes;
	col *= 0.7 + 0.3 * pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.3);
	col += (hash2(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * 0.014;
	outColor = vec4(col, 1.0);
}`;

export interface FieldPreset {
	pitch: number;
	lift: number;
	traffic: number;
}

/**
 * Light the drafting table on one canvas.
 * @param canvas The canvas, sized by CSS.
 * @param preset The camera and how much traffic runs.
 */
export function lightField(canvas: HTMLCanvasElement, preset: FieldPreset): void {
	const host = canvas.parentElement ?? canvas;
	const lamp = { x: 0, y: 0 };
	const target = { x: 0, y: 0 };
	let scroll = 0;
	const still = prefersReducedMotion();

	if (!still) {
		host.addEventListener("pointermove", (event) => {
			const box = host.getBoundingClientRect();
			target.x = ((event.clientX - box.left) / box.width) * 2 - 1;
			target.y = 1 - ((event.clientY - box.top) / box.height) * 2;
		});
		host.addEventListener("pointerleave", () => {
			target.x = 0;
			target.y = 0;
		});
		window.addEventListener(
			"scroll",
			() => {
				const box = host.getBoundingClientRect();
				scroll = Math.min(1, Math.max(0, -box.top / Math.max(1, box.height)));
			},
			{ passive: true },
		);
	}

	runShader({
		canvas,
		fragment: FRAGMENT,
		maxRatio: 1.25,
		stillTime: 14,
		uniforms: (gl, at, frame) => {
			const drift = still ? 0 : Math.sin(frame.time * 0.13) * 0.18;
			lamp.x += (target.x + drift - lamp.x) * 0.035;
			lamp.y += (target.y - lamp.y) * 0.035;
			gl.uniform2f(at("uRes"), frame.width, frame.height);
			gl.uniform1f(at("uTime"), frame.time);
			gl.uniform2f(at("uLamp"), lamp.x, lamp.y);
			gl.uniform1f(at("uScroll"), scroll);
			gl.uniform1f(at("uPitch"), preset.pitch);
			gl.uniform1f(at("uLift"), preset.lift);
			gl.uniform1f(at("uTraffic"), preset.traffic);
		},
	});
}

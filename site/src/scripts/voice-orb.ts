// The voice orb: a ball of the brand's gold whose surface moves while the voice speaks. The
// product draws it on a canvas of its own; this one follows the words of the subtitles.

import { runShader } from "./gl";

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uLevel;
out vec4 outColor;

vec3 hash3(vec3 p) {
	p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
	return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float noise(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	vec3 u = f * f * (3.0 - 2.0 * f);
	return mix(
		mix(mix(dot(hash3(i), f), dot(hash3(i + vec3(1, 0, 0)), f - vec3(1, 0, 0)), u.x),
			mix(dot(hash3(i + vec3(0, 1, 0)), f - vec3(0, 1, 0)), dot(hash3(i + vec3(1, 1, 0)), f - vec3(1, 1, 0)), u.x), u.y),
		mix(mix(dot(hash3(i + vec3(0, 0, 1)), f - vec3(0, 0, 1)), dot(hash3(i + vec3(1, 0, 1)), f - vec3(1, 0, 1)), u.x),
			mix(dot(hash3(i + vec3(0, 1, 1)), f - vec3(0, 1, 1)), dot(hash3(i + vec3(1, 1, 1)), f - vec3(1, 1, 1)), u.x), u.y),
		u.z);
}
float fbm(vec3 p) {
	float a = 0.5;
	float s = 0.0;
	for (int i = 0; i < 4; i++) {
		s += a * noise(p);
		p *= 2.03;
		a *= 0.5;
	}
	return s;
}

void main() {
	vec2 p = (gl_FragCoord.xy * 2.0 - uRes) / min(uRes.x, uRes.y);
	float r = length(p);
	float R = 0.6 + uLevel * 0.07;
	vec3 hi = vec3(0.98, 0.88, 0.58);
	vec3 lo = vec3(0.83, 0.58, 0.2);
	vec3 deep = vec3(0.3, 0.18, 0.05);
	vec3 light = normalize(vec3(-0.35, 0.75, 0.6));
	vec3 col = vec3(0.0);
	float alpha = 0.0;
	if (r < R) {
		float z = sqrt(R * R - r * r);
		vec3 n = normalize(vec3(p, z));
		float f = fbm(n * 2.4 + vec3(0.0, uTime * 0.35, uTime * 0.22) + uLevel * 0.8);
		float bands = 0.5 + 0.5 * sin(f * 10.0 + uTime * (1.0 + uLevel * 2.0));
		vec3 g = mix(lo, hi, clamp(f * 1.5 + 0.5, 0.0, 1.0));
		g = mix(deep, g, 0.5 + 0.5 * bands);
		float diff = clamp(dot(n, light), 0.0, 1.0);
		float spec = pow(clamp(dot(reflect(-light, n), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 28.0);
		float rim = pow(1.0 - n.z, 2.4);
		col = g * (0.38 + 0.8 * diff) + spec * 0.55 + rim * hi * 0.55;
		alpha = smoothstep(R, R - 0.025, r);
		col *= alpha;
	}
	float halo = exp(-max(r - R, 0.0) * 5.0) * (0.12 + uLevel * 0.55) * smoothstep(R - 0.03, R + 0.01, r);
	col += hi * halo;
	alpha = max(alpha, halo);
	outColor = vec4(col, alpha);
}`;

/**
 * Draw the voice orb on a canvas.
 * @param canvas The orb's canvas.
 * @param level How loud the voice is now, from 0 to 1.
 */
export function drawVoiceOrb(canvas: HTMLCanvasElement, level: () => number): void {
	let smooth = 0;
	runShader({
		canvas,
		fragment: FRAGMENT,
		alpha: true,
		maxRatio: 2,
		stillTime: 3,
		uniforms: (gl, at, frame) => {
			smooth += (level() - smooth) * 0.12;
			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT);
			gl.uniform2f(at("uRes"), frame.width, frame.height);
			gl.uniform1f(at("uTime"), frame.time);
			gl.uniform1f(at("uLevel"), smooth);
		},
	});
}

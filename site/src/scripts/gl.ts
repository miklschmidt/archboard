// A small WebGL2 host: one full-screen triangle and one fragment shader, drawn while its canvas
// is on screen. A shader that fails to compile leaves the canvas empty, and the CSS ground shows.

import { prefersReducedMotion, whileVisible } from "./reveal";

const VERTEX = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

export interface Frame {
	/** Seconds since the shader started. */
	time: number;
	/** Canvas size in device pixels. */
	width: number;
	height: number;
}

export interface ShaderOptions {
	canvas: HTMLCanvasElement;
	fragment: string;
	/** The largest device pixel ratio to draw at. */
	maxRatio?: number;
	/** Whether the canvas keeps an alpha channel. */
	alpha?: boolean;
	/** Set the uniforms of one frame. */
	uniforms: (
		gl: WebGL2RenderingContext,
		location: (name: string) => WebGLUniformLocation | null,
		frame: Frame,
	) => void;
	/** The time of the one frame drawn with reduced motion. */
	stillTime?: number;
}

/**
 * Compile one shader stage.
 * @param gl The context.
 * @param type The stage.
 * @param source Its GLSL.
 * @returns The shader, or null when it did not compile.
 */
function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
	const shader = gl.createShader(type);
	if (!shader) return null;
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		console.warn(gl.getShaderInfoLog(shader));
		return null;
	}
	return shader;
}

/**
 * Run a fragment shader over a canvas.
 * @param options The canvas, the shader and its uniforms.
 * @returns Whether the shader runs.
 */
export function runShader(options: ShaderOptions): boolean {
	const { canvas, fragment, uniforms, maxRatio = 1.5, alpha = false, stillTime = 8 } = options;
	const gl = canvas.getContext("webgl2", {
		alpha,
		antialias: false,
		premultipliedAlpha: true,
		powerPreference: "low-power",
	});
	if (!gl) return false;
	const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
	const frag = compile(gl, gl.FRAGMENT_SHADER, fragment);
	const program = gl.createProgram();
	if (!vertex || !frag || !program) return false;
	gl.attachShader(program, vertex);
	gl.attachShader(program, frag);
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
	gl.useProgram(program);

	const buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
	const position = gl.getAttribLocation(program, "position");
	gl.enableVertexAttribArray(position);
	gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

	const locations = new Map<string, WebGLUniformLocation | null>();
	const location = (name: string) => {
		if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name));
		return locations.get(name) ?? null;
	};

	const still = prefersReducedMotion();
	let width = 0;
	let height = 0;
	const resize = () => {
		const ratio = Math.min(window.devicePixelRatio || 1, maxRatio);
		width = Math.max(1, Math.round(canvas.clientWidth * ratio));
		height = Math.max(1, Math.round(canvas.clientHeight * ratio));
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}
		gl.viewport(0, 0, width, height);
	};

	const draw = (time: number) => {
		uniforms(gl, location, { time, width, height });
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	};

	let running = false;
	let frame = 0;
	const start = performance.now();
	const loop = (now: number) => {
		if (!running) return;
		draw((now - start) / 1000);
		frame = requestAnimationFrame(loop);
	};

	new ResizeObserver(() => {
		resize();
		if (still || !running) draw(stillTime);
	}).observe(canvas);
	resize();
	draw(stillTime);
	canvas.classList.add("is-live");

	if (still) return true;
	whileVisible(canvas, (visible) => {
		if (visible === running) return;
		running = visible;
		cancelAnimationFrame(frame);
		if (running) frame = requestAnimationFrame(loop);
	});
	return true;
}

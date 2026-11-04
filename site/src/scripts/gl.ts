// A small WebGL2 host: one full-screen triangle and one fragment shader, drawn while its canvas
// is on screen. A shader that fails to compile leaves the canvas empty, and the CSS ground shows.
// Where the browser compiles shaders in parallel, the page goes on while it does: the host asks
// once a frame whether the program is ready, and draws from the first frame that it is.

import { whileVisible } from "./reveal";

const VERTEX = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

export interface Frame {
	/** Seconds of visible motion. */
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
 * Run a fragment shader over a canvas.
 * @param options The canvas, the shader and its uniforms.
 * @returns Ask for a frame, which a still canvas needs when what it draws changes; null when the
 * browser has no WebGL2.
 */
export function runShader(options: ShaderOptions): (() => void) | null {
	const { canvas, fragment, uniforms, maxRatio = 1.5, alpha = false, stillTime = 8 } = options;
	const gl = canvas.getContext("webgl2", {
		alpha,
		antialias: false,
		premultipliedAlpha: true,
		powerPreference: "low-power",
	});
	if (!gl) return null;
	const parallel = gl.getExtension("KHR_parallel_shader_compile");
	let resources: { program: WebGLProgram; buffer: WebGLBuffer } | undefined;
	let linking: { program: WebGLProgram; shaders: WebGLShader[] } | undefined;
	const locations = new Map<string, WebGLUniformLocation | null>();
	const release = () => {
		if (resources) {
			gl.deleteBuffer(resources.buffer);
			gl.deleteProgram(resources.program);
		}
		if (linking) {
			for (const shader of linking.shaders) gl.deleteShader(shader);
			gl.deleteProgram(linking.program);
		}
		resources = undefined;
		linking = undefined;
		locations.clear();
	};
	/** Compile and link the program, which may finish after this returns. */
	const initialize = () => {
		const program = gl.createProgram();
		if (!program) return;
		const shaders: WebGLShader[] = [];
		for (const [type, source] of [
			[gl.VERTEX_SHADER, VERTEX],
			[gl.FRAGMENT_SHADER, fragment],
		] as const) {
			const shader = gl.createShader(type);
			if (!shader) continue;
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			gl.attachShader(program, shader);
			shaders.push(shader);
		}
		gl.linkProgram(program);
		linking = { program, shaders };
	};
	/**
	 * Take the program once it is linked.
	 * @returns Whether it is ready to draw: false while it still links, and after it failed.
	 */
	const linked = (): boolean => {
		if (resources) return true;
		if (!linking) return false;
		const { program, shaders } = linking;
		if (parallel && !gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)) return false;
		linking = undefined;
		const buffer = gl.getProgramParameter(program, gl.LINK_STATUS) ? gl.createBuffer() : null;
		if (!buffer) {
			for (const shader of shaders) {
				const log = gl.getShaderInfoLog(shader);
				if (log) console.warn(log);
			}
			for (const shader of shaders) gl.deleteShader(shader);
			gl.deleteProgram(program);
			return false;
		}
		for (const shader of shaders) {
			gl.detachShader(program, shader);
			gl.deleteShader(shader);
		}
		gl.useProgram(program);
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
		const position = gl.getAttribLocation(program, "position");
		gl.enableVertexAttribArray(position);
		gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
		resources = { program, buffer };
		return true;
	};
	initialize();
	const location = (name: string) => {
		if (!resources) return null;
		if (!locations.has(name)) locations.set(name, gl.getUniformLocation(resources.program, name));
		return locations.get(name) ?? null;
	};

	const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
	let width = 0;
	let height = 0;
	let visible = false;
	let frame = 0;
	let elapsed = 0;
	let previous: number | undefined;
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
		canvas.classList.add("is-live");
	};
	const loop = (now: number) => {
		elapsed += now - (previous ?? now);
		previous = now;
		draw(elapsed / 1000);
		frame = requestAnimationFrame(loop);
	};
	const update = () => {
		cancelAnimationFrame(frame);
		previous = undefined;
		if (!visible || gl.isContextLost()) return;
		if (!linked()) {
			if (linking) frame = requestAnimationFrame(update);
			return;
		}
		resize();
		if (motion.matches) draw(stillTime);
		else frame = requestAnimationFrame(loop);
	};
	const observer = new ResizeObserver(update);
	observer.observe(canvas);
	const stopWatching = whileVisible(canvas, (onScreen) => {
		visible = onScreen;
		update();
	});
	motion.addEventListener("change", update);
	canvas.addEventListener("webglcontextlost", (event) => {
		event.preventDefault();
		cancelAnimationFrame(frame);
		canvas.classList.remove("is-live");
		resources = undefined;
		linking = undefined;
		locations.clear();
	});
	canvas.addEventListener("webglcontextrestored", () => {
		initialize();
		update();
	});
	window.addEventListener("pagehide", (event) => {
		if (event.persisted) return;
		cancelAnimationFrame(frame);
		observer.disconnect();
		stopWatching();
		motion.removeEventListener("change", update);
		release();
	});
	return () => {
		if (visible && resources && !gl.isContextLost() && motion.matches) draw(stillTime);
	};
}

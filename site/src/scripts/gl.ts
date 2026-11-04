// A small WebGL2 host: one full-screen triangle and one fragment shader, drawn while its canvas
// is on screen. A shader that fails to compile leaves the canvas empty, and the CSS ground shows.

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
		gl.deleteShader(shader);
		return null;
	}
	return shader;
}

/**
 * Run a fragment shader over a canvas.
 * @param options The canvas, the shader and its uniforms.
 * @returns Ask for a frame, which a still canvas needs when what it draws changes; null when the
 * shader does not run.
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
	let resources: { program: WebGLProgram; buffer: WebGLBuffer } | undefined;
	const locations = new Map<string, WebGLUniformLocation | null>();
	const release = () => {
		if (resources) {
			gl.deleteBuffer(resources.buffer);
			gl.deleteProgram(resources.program);
		}
		resources = undefined;
		locations.clear();
	};
	const initialize = () => {
		const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
		const frag = compile(gl, gl.FRAGMENT_SHADER, fragment);
		const program = gl.createProgram();
		if (vertex && frag && program) {
			gl.attachShader(program, vertex);
			gl.attachShader(program, frag);
			gl.linkProgram(program);
		}
		if (vertex) gl.deleteShader(vertex);
		if (frag) gl.deleteShader(frag);
		if (!vertex || !frag || !program || !gl.getProgramParameter(program, gl.LINK_STATUS)) {
			if (program) gl.deleteProgram(program);
			return false;
		}
		const buffer = gl.createBuffer();
		if (!buffer) {
			gl.deleteProgram(program);
			return false;
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
	if (!initialize()) return null;
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
		if (!visible || !resources || gl.isContextLost()) return;
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

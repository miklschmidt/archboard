// A small WebGL2 host: one full-screen triangle and one fragment shader, drawn while its canvas
// is on screen. A shader that fails to compile leaves the canvas empty, and the CSS ground shows.
// Where the browser compiles shaders in parallel, the page goes on while it does: the host asks
// once a frame whether the program is ready, and draws from the first frame that it is.
//
// The host draws at the device's pixel ratio, up to a limit. While frames come slowly, it draws
// fewer pixels. When drawing fewer twice in a row does not make the frames come faster, it stops
// drawing fewer: the pixels are not what holds the frames back, as when a browser saving power
// slows every page. Once is not enough, as the picture itself can grow dearer while the host tries.
// While frames come quickly, it draws more pixels again, a step at a time, up to the full ratio:
// what slowed the frames can pass, as when the page finishes loading. Each time it has to draw
// fewer again, it waits twice as long before the next step up.

import { whileVisible } from "./reveal";

/** How long a frame may take, in milliseconds: when a quarter of them take longer, frames are slow. */
const SLOW = 20;

/** How long the host aims for a frame to take when it draws fewer pixels, in milliseconds. */
const AIM = 12;

/** How many frames one judgement of the frame rate takes. */
const WINDOW = 16;

/** The fewest device pixels the host draws for each CSS pixel. */
const FLOOR = 0.5;

/** How much more of the ratio, at most, the host draws in one step up. */
const RAISE = 1.25;

/** How many quick windows the host first waits before a step up, and the most it comes to wait. */
const PATIENCE = { first: 4, most: 64 };

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
	let parallel = gl.getExtension("KHR_parallel_shader_compile");
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
	const ratio = () => Math.min(window.devicePixelRatio || 1, maxRatio);
	// The share of that ratio the host draws at, and what it judges the frame rate by.
	let share = 1;
	const intervals: number[] = [];
	let slowWindows = 0;
	let trial: { share: number; typical: number } | undefined;
	let failedTrials = 0;
	let settled = false;
	let quickWindows = 0;
	let patience = PATIENCE.first;
	// The share the host last stepped up from, where the frames came quickly.
	let stepped = 0;
	const resize = () => {
		width = Math.max(1, Math.round(canvas.clientWidth * ratio() * share));
		height = Math.max(1, Math.round(canvas.clientHeight * ratio() * share));
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}
		gl.viewport(0, 0, width, height);
	};
	/**
	 * Judge the frame rate by the frames of one window: draw fewer pixels while it is slow, and more
	 * again while it is quick.
	 * @param interval How long the last frame took, in milliseconds.
	 */
	const pace = (interval: number) => {
		if (interval <= 0) return;
		intervals.push(interval);
		if (intervals.length < WINDOW) return;
		// A long task now and then does not count: the slowest two frames of a window are left out.
		// What a frame costs is the mean of the rest. A frame that misses the screen's refresh takes a
		// whole refresh more, so the mean counts how many miss, where one middle frame would make every
		// frame seem to miss or none.
		const kept = intervals.sort((a, b) => a - b).slice(0, WINDOW - 2);
		const typical = kept.reduce((sum, each) => sum + each, 0) / kept.length;
		const slow = (kept[WINDOW * 0.75] ?? 0) > SLOW;
		intervals.length = 0;
		if (trial) {
			// Fewer pixels did not make the frames faster, so the host draws as many as before.
			if (typical > trial.typical * 0.9) {
				share = trial.share;
				failedTrials += 1;
				settled = failedTrials >= 2;
				resize();
			} else {
				failedTrials = 0;
				patience = Math.min(PATIENCE.most, patience * 2);
			}
			trial = undefined;
			return;
		}
		if (!slow) {
			slowWindows = 0;
			quickWindows += 1;
			if (share >= 1 || quickWindows < patience) return;
			quickWindows = 0;
			settled = false;
			failedTrials = 0;
			stepped = share;
			share = Math.min(1, share * RAISE);
			resize();
			return;
		}
		quickWindows = 0;
		if (settled) return;
		// One slow window can be the page loading; two in a row are the GPU.
		slowWindows += 1;
		if (slowWindows < 2 || ratio() * share <= FLOOR) return;
		slowWindows = 0;
		trial = { share, typical };
		// A step up that made the frames slow goes back to where they came quickly, and no lower.
		share = Math.max(FLOOR / ratio(), stepped, share * Math.sqrt(AIM / typical));
		stepped = 0;
		resize();
	};
	const draw = (time: number) => {
		uniforms(gl, location, { time, width, height });
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		canvas.classList.add("is-live");
	};
	const loop = (now: number) => {
		const interval = now - (previous ?? now);
		elapsed += interval;
		previous = now;
		pace(interval);
		draw(elapsed / 1000);
		frame = requestAnimationFrame(loop);
	};
	const update = () => {
		cancelAnimationFrame(frame);
		previous = undefined;
		intervals.length = 0;
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
		parallel = gl.getExtension("KHR_parallel_shader_compile");
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

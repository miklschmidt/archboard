// A small WebGL2 host: one full-screen triangle and one fragment shader, drawn while its canvas
// is on screen. A shader that fails to compile leaves the canvas empty, and the CSS ground shows.
// Where the browser compiles shaders in parallel, the page goes on while it does: the host asks
// once a frame whether the program is ready, and draws from the first frame that it is.
//
// The host starts still, at the device's pixel ratio. Once the picture is ready, it draws the
// finished picture and times one more such frame, from the draw until the GPU is done. If that
// frame, scaled to the pixels the motion draws, fits one refresh at 60 Hz, the host starts the
// motion in the same task, so the still frame never reaches the screen. The motion draws at the
// device's pixel ratio up to a limit. If the frame is slow, as on a phone or a PC without a dedicated GPU,
// the still frame stands. While the motion runs, frames that stay slow stop it, as when a browser
// slows every page to save power. A still canvas draws again only when the page asks for a frame.

import { whileVisible } from "./reveal";

/** How long the GPU may take for a frame of the motion, in milliseconds: one refresh at 60 Hz. */
const BUDGET = 1000 / 60;

/** How long a frame may take, in milliseconds: when a quarter of them take longer, frames are slow. */
const SLOW = 20;

/**
 * How many frames one judgement of the frame rate takes at most, and how long, in milliseconds:
 * on a GPU that takes half a second for a frame, a judgement waits no longer than a second.
 */
const WINDOW = { frames: 16, ms: 1000 };

const VERTEX = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

/**
 * Whether a frame moves. It stands still with reduced motion, and while the GPU is slow, which it
 * is until the timed still frame shows otherwise. A still frame shows the finished state.
 */
export type Motion = "moving" | "reduced" | "slow";

export interface Frame {
	/** Seconds of visible motion. */
	time: number;
	/** Canvas size in device pixels. */
	width: number;
	height: number;
	motion: Motion;
}

export interface ShaderOptions {
	canvas: HTMLCanvasElement;
	fragment: string;
	/** The largest device pixel ratio to draw the motion at. A still frame takes the device's own. */
	maxRatio?: number;
	/** Whether the canvas keeps an alpha channel. */
	alpha?: boolean;
	/** Set the uniforms of one frame. */
	uniforms: (
		gl: WebGL2RenderingContext,
		location: (name: string) => WebGLUniformLocation | null,
		frame: Frame,
	) => void;
	/** The time of the still frame. */
	stillTime?: number;
	/** Whether the still frame shows what the motion costs, so that the host can time it. */
	ready?: () => boolean;
}

/**
 * Run a fragment shader over a canvas.
 * @param options The canvas, the shader and its uniforms.
 * @returns Ask for a frame, which a still canvas needs when what it draws changes, and a moving one
 * ignores; null when the browser has no WebGL2.
 */
export function runShader(options: ShaderOptions): (() => void) | null {
	const {
		canvas,
		fragment,
		uniforms,
		maxRatio = 1.5,
		alpha = false,
		stillTime = 8,
		ready = () => true,
	} = options;
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
	const stillRatio = () => window.devicePixelRatio || 1;
	const movingRatio = () => Math.min(stillRatio(), maxRatio);
	// Whether the host timed its still frame yet, and whether the GPU holds the motion.
	let timed = false;
	let quick = false;
	const intervals: number[] = [];
	let slowWindows = 0;
	const current = (): Motion => (motion.matches ? "reduced" : quick ? "moving" : "slow");
	const resize = () => {
		const ratio = current() === "moving" ? movingRatio() : stillRatio();
		width = Math.max(1, Math.round(canvas.clientWidth * ratio));
		height = Math.max(1, Math.round(canvas.clientHeight * ratio));
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}
		gl.viewport(0, 0, width, height);
	};
	const draw = (time: number) => {
		uniforms(gl, location, { time, width, height, motion: current() });
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		canvas.classList.add("is-live");
	};
	/**
	 * Draw the still frame twice, and time the second from the draw until the GPU is done. Reading
	 * a pixel waits for the GPU. The first frame takes what only the first one costs, such as
	 * bringing the picture's images to the GPU.
	 * @returns How long the second frame took, in milliseconds.
	 */
	const costOfStill = (): number => {
		const pixel = new Uint8Array(4);
		const finish = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
		draw(stillTime);
		finish();
		const start = performance.now();
		draw(stillTime);
		finish();
		return performance.now() - start;
	};
	/**
	 * Judge the frame rate by the frames of one window, and stop the motion when two windows in a
	 * row are slow: one slow window can be the page loading.
	 * @param interval How long the last frame took, in milliseconds.
	 */
	const pace = (interval: number) => {
		if (interval <= 0) return;
		intervals.push(interval);
		const spent = intervals.reduce((sum, each) => sum + each, 0);
		if (intervals.length < WINDOW.frames && spent < WINDOW.ms) return;
		// A long task now and then does not count: the window is slow when a quarter of its frames are.
		const sorted = intervals.sort((a, b) => a - b);
		const slow = (sorted[Math.floor(sorted.length * 0.75)] ?? 0) > SLOW;
		intervals.length = 0;
		slowWindows = slow ? slowWindows + 1 : 0;
		if (slowWindows >= 2) quick = false;
	};
	const loop = (now: number) => {
		const interval = now - (previous ?? now);
		elapsed += interval;
		previous = now;
		pace(interval);
		if (!quick) {
			update();
			return;
		}
		draw(elapsed / 1000);
		frame = requestAnimationFrame(loop);
	};
	const update = () => {
		cancelAnimationFrame(frame);
		previous = undefined;
		intervals.length = 0;
		slowWindows = 0;
		if (!visible || gl.isContextLost()) return;
		if (!linked()) {
			if (linking) frame = requestAnimationFrame(update);
			return;
		}
		resize();
		if (!motion.matches && !timed && ready()) {
			timed = true;
			// What a frame costs grows with its pixels, and the motion may draw fewer.
			quick = costOfStill() * (movingRatio() / stillRatio()) ** 2 <= BUDGET;
			if (!quick) return;
			resize();
		}
		if (current() === "moving") loop(performance.now());
		else draw(stillTime);
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
	// A still canvas draws at most one asked frame for each of the screen's, as a frame can be dear.
	let asked = 0;
	return () => {
		if (current() === "moving" || asked) return;
		asked = requestAnimationFrame(() => {
			asked = 0;
			update();
		});
	};
}

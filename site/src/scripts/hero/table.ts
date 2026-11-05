// The hero's stage: the table, its camera and its light, and the picture on it. Everything that
// moves runs on one clock in the shader: the camera's arrival, the light that draws each line,
// the tiles that rise where it reaches a card, the traffic, and the card under the pointer. The
// painter paints the picture once, so a frame costs the shader alone.

import { runShader } from "../gl";
import type { Level, Part, Region } from "./picture";
import { edges, plan } from "./plan";
import { buildRoutes, ROUTE_TEXELS, SHINE } from "./routes";
import { compose, ENTRY } from "./score";
import { FRAGMENT, LIMITS } from "./shader";

/** How wide the picture lies on the table, in table units. Its middle stands at the origin. */
const WIDTH = 10;
const SHEET = { left: -WIDTH / 2, near: -(WIDTH * plan.height) / plan.width / 2, width: WIDTH };

/**
 * How thick a card's tile stands, how high the pointer lifts it, and how deep a tray sinks. Before
 * it rises, a tile waits below what it stands on, its top this far under it, so that none of it
 * shows until it comes up.
 */
const TILE = { thickness: 0.055, lifted: 0.1, tray: 0.03, waits: 0.012 };

/**
 * Each kind of line's beam: how high it floats, in table units, and how thick it is. A main line
 * floats highest and burns thickest, a dotted line lowest, as beads, so beams that cross pass each
 * other. A beam meets each of its tiles this far up the tile's side.
 */
const BEAM = {
	hero: { height: 0.044, thick: 1.25 },
	normal: { height: 0.038, thick: 1 },
	dotted: { height: 0.032, thick: 0 },
	plug: 0.6,
} as const;

/**
 * How the camera looks at the picture: its turn and its tilt down in radians, its focal length,
 * and how far right of the canvas's middle the picture's middle stands, in canvas widths. Turned
 * to the left, the camera sees the picture run back on a diagonal from its nearest corner to the
 * words, and every part of it stays in view. How far away the camera stands, and how its lens is
 * shifted, follow from the room the words leave.
 */
const LENS = { yaw: -0.23, pitch: 0.61, focal: 1.75, offset: 0.015 };

/**
 * How much of the canvas's width the picture fills at most. A portrait canvas holds only a part
 * of the picture, which runs past its sides, so its cards stay large enough to read.
 */
const ACROSS = { landscape: 0.94, portrait: 4.2 };

/**
 * The arrival: the camera starts higher, farther and square to the picture, and settles to rest
 * as the light draws it, turning the picture onto its diagonal. How the first view differs from
 * the rest; when the camera starts to move, in seconds; and how quickly it settles, per second, as
 * a spring that neither overshoots nor stops short.
 */
const ARRIVAL = { distance: 1.5, yaw: 0.26, pitch: 0.22, x: 0.2, z: 0.5, from: 0.25, rate: 1.5 };

/** The most device pixels the table draws for each CSS pixel. */
const RATIO = 2;

/**
 * How much finer than the canvas shows it the picture is painted, at the densest point each image
 * serves: enough that the camera can come a little nearer as the page scrolls.
 */
const FINER = 1.1;

/** How quickly a card lifts toward the pointer, the rest dims, and the lines light, per second. */
const RATES = { lift: 10, focus: 7, light: 9, look: 3 };

/** How long the pointer rests on a card before it lights: a pointer passing over lights nothing. */
const DWELL = 0.12;

/** The colour of every beam's light. */
const LIGHT = "sky";

interface Camera {
	x: number;
	z: number;
	distance: number;
	yaw: number;
	pitch: number;
	focal: number;
	shiftX: number;
	shiftY: number;
}

/**
 * A colour of the page's tokens, in linear light.
 * @param name The token, such as `teal`.
 * @returns Red, green and blue.
 */
function token(name: string): [number, number, number] {
	// The token is read as a computed colour, which the browser writes in one form: the build's
	// minifier writes the token itself in another, such as oklch(75.35% .139 232.66).
	const probe = document.createElement("i");
	probe.style.color = `var(--${name})`;
	document.body.append(probe);
	const value = getComputedStyle(probe).color;
	probe.remove();
	const [l = 0.8, c = 0, h = 0] = (/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/u.exec(value) ?? [])
		.slice(1)
		.map(Number);
	const [a, b] = [c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)];
	const lms = [
		(l + 0.3963377774 * a + 0.2158037573 * b) ** 3,
		(l - 0.1055613458 * a - 0.0638541728 * b) ** 3,
		(l - 0.0894841775 * a - 1.291485548 * b) ** 3,
	] as const;
	return [
		Math.max(0, 4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2]),
		Math.max(0, -1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2]),
		Math.max(0, -0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2]),
	];
}

const easeOut = (t: number, power = 3) => 1 - (1 - Math.min(1, Math.max(0, t))) ** power;
const smooth = (from: number, to: number, t: number) => {
	const x = Math.min(1, Math.max(0, (t - from) / (to - from)));
	return x * x * (3 - 2 * x);
};

/**
 * Where the eye stands for a camera.
 * @param camera The camera.
 * @returns The eye.
 */
function eyeOf(camera: Camera): { x: number; y: number; z: number } {
	const [cp, sp] = [Math.cos(camera.pitch), Math.sin(camera.pitch)];
	const [cy, sy] = [Math.cos(camera.yaw), Math.sin(camera.yaw)];
	return {
		x: camera.x - camera.distance * cp * sy,
		y: camera.distance * sp,
		z: camera.z - camera.distance * cp * cy,
	};
}

/**
 * The camera's ray through a point of the canvas, as the shader casts it.
 * @param camera The camera.
 * @param aspect The canvas's width over its height.
 * @param point The point, 0..1 from the bottom left.
 * @returns Where the ray meets the table, or null above the horizon.
 */
function onTable(camera: Camera, aspect: number, point: { x: number; y: number }) {
	const [ux, uy] = [(point.x - 0.5) * aspect - camera.shiftX, point.y - 0.5 - camera.shiftY];
	const length = Math.hypot(ux, uy, camera.focal);
	let [x, y, z] = [ux / length, uy / length, camera.focal / length];
	const [cp, sp] = [Math.cos(camera.pitch), Math.sin(camera.pitch)];
	[y, z] = [y * cp - z * sp, y * sp + z * cp];
	const [cy, sy] = [Math.cos(camera.yaw), Math.sin(camera.yaw)];
	[x, z] = [x * cy + z * sy, -x * sy + z * cy];
	if (y > -1e-4) return null;
	const eye = eyeOf(camera);
	const t = -eye.y / y;
	return { x: eye.x + x * t, z: eye.z + z * t };
}

/**
 * Where a point of the table appears on the canvas, as the shader casts it.
 * @param camera The camera.
 * @param aspect The canvas's width over its height.
 * @param x The point, across the table.
 * @param z The point, into it.
 * @returns The point on the canvas, 0..1 from the bottom left.
 */
function project(camera: Camera, aspect: number, x: number, z: number): { x: number; y: number } {
	const eye = eyeOf(camera);
	const [cp, sp] = [Math.cos(camera.pitch), Math.sin(camera.pitch)];
	const [cy, sy] = [Math.cos(camera.yaw), Math.sin(camera.yaw)];
	const v = { x: x - eye.x, y: -eye.y, z: z - eye.z };
	const across = v.x * cy - v.z * sy;
	const up = v.x * sp * sy + v.y * cp + v.z * sp * cy;
	const ahead = v.x * cp * sy - v.y * sp + v.z * cp * cy;
	return {
		x: ((across * camera.focal) / ahead + camera.shiftX) / aspect + 0.5,
		y: (up * camera.focal) / ahead + camera.shiftY + 0.5,
	};
}

/** The room the picture has on its canvas: its foot and its top, 0..1 up the canvas. */
interface Room {
	bottom: number;
	top: number;
}

/**
 * The camera that fits the picture into the room below the words: as large as the room's height
 * and the canvas's width let it stand, and in the middle of the room. The lens shift moves the
 * picture on the canvas without changing how it looks, so the camera's distance sets its size
 * and the shift its place.
 * @param aspect The canvas's width over its height.
 * @param room The room.
 * @returns The camera.
 */
function fit(aspect: number, room: Room): Camera {
	const { offset, ...lens } = LENS;
	const camera: Camera = { x: 0, z: 0, distance: 10, ...lens, shiftX: 0, shiftY: 0 };
	// What must fit is what the picture holds, its cards and trays, not its empty corners.
	const corners = [
		...plan.cards.map((card) => card.box),
		...plan.trays.map((tray) => tray.region),
	].flatMap((box) => {
		const [left, top, right, bottom] = edges(box);
		return [toTable(left, top), toTable(right, top), toTable(left, bottom), toTable(right, bottom)];
	});
	const bounds = () => {
		const points = corners.map(({ x, z }) => project(camera, aspect, x, z));
		const xs = points.map((point) => point.x);
		const ys = points.map((point) => point.y);
		return {
			left: Math.min(...xs),
			right: Math.max(...xs),
			bottom: Math.min(...ys),
			top: Math.max(...ys),
		};
	};
	const widest =
		aspect < 1
			? ACROSS.landscape + (ACROSS.portrait - ACROSS.landscape) * (1 - aspect)
			: ACROSS.landscape;
	// The farther the camera, the smaller the picture.
	let [low, high] = [2, 80];
	for (let step = 0; step < 30; step++) {
		camera.distance = (low + high) / 2;
		const box = bounds();
		const fits = box.top - box.bottom <= room.top - room.bottom && box.right - box.left <= widest;
		if (fits) high = camera.distance;
		else low = camera.distance;
	}
	camera.distance = high;
	const box = bounds();
	camera.shiftX = (0.5 + offset - (box.left + box.right) / 2) * aspect;
	camera.shiftY = (room.top + room.bottom - box.top - box.bottom) / 2;
	return camera;
}

/**
 * Where a point of the picture lies on the table.
 * @param x Across the picture, in its units.
 * @param y Down it.
 * @returns The point on the table.
 */
function toTable(x: number, y: number): { x: number; z: number } {
	const scale = SHEET.width / plan.width;
	return { x: SHEET.left + x * scale, z: SHEET.near + (plan.height - y) * scale };
}

/**
 * A box of the picture as a footprint on the table: left, near, right and far.
 * @param box The box.
 * @returns The footprint.
 */
function footprint(box: readonly number[]): number[] {
	const [left, top, right, bottom] = edges(box);
	const [a, b] = [toTable(left, bottom), toTable(right, top)];
	return [a.x, a.z, b.x, b.z];
}

/**
 * Make a texture of floats that the shader reads texel by texel.
 * @param gl The context.
 * @param unit Its texture unit.
 * @param data Four floats a texel.
 * @param rows How many rows of ROUTE_TEXELS it has.
 * @returns The texture.
 */
function floats(
	gl: WebGL2RenderingContext,
	unit: number,
	data: Float32Array,
	rows: number,
): WebGLTexture | null {
	const texture = gl.createTexture();
	if (!texture) return null;
	gl.activeTexture(gl.TEXTURE0 + unit);
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, ROUTE_TEXELS, rows, 0, gl.RGBA, gl.FLOAT, data);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	return texture;
}

/**
 * Make the texture of one image of the picture, with every mip level a far table reads, its
 * colours decoded to linear light as the shader reads them.
 * @param gl The context.
 * @param unit Its texture unit.
 * @param image The image.
 * @returns The texture.
 */
function picture(
	gl: WebGL2RenderingContext,
	unit: number,
	image: ImageBitmap,
): WebGLTexture | null {
	const texture = gl.createTexture();
	if (!texture) return null;
	const { width, height } = image;
	gl.activeTexture(gl.TEXTURE0 + unit);
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texStorage2D(
		gl.TEXTURE_2D,
		Math.floor(Math.log2(Math.max(width, height))) + 1,
		gl.SRGB8_ALPHA8,
		width,
		height,
	);
	gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
	gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, image);
	gl.generateMipmap(gl.TEXTURE_2D);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	// The table meets the eye at a low angle, where only anisotropic filtering keeps lines sharp.
	const anisotropic = gl.getExtension("EXT_texture_filter_anisotropic");
	if (anisotropic) {
		const most = gl.getParameter(anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number;
		gl.texParameterf(gl.TEXTURE_2D, anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(16, most));
	}
	return texture;
}

/**
 * The box the words fill: what their block's children hold, not the block, which may stand taller.
 * @param words The words.
 * @returns Their box on the page.
 */
function blockOf(words: HTMLElement): { left: number; top: number; right: number; bottom: number } {
	const boxes = [...words.children].map((child) => child.getBoundingClientRect());
	return {
		left: Math.min(...boxes.map((box) => box.left)),
		top: Math.min(...boxes.map((box) => box.top)),
		right: Math.max(...boxes.map((box) => box.right)),
		bottom: Math.max(...boxes.map((box) => box.bottom)),
	};
}

/**
 * The room the words leave on a canvas: from a little above its foot, where the canvas fades into
 * the page, to a little behind the words' foot, where the picture falls into the dark.
 * @param canvas The canvas.
 * @param words The words, or null.
 * @returns The room.
 */
function roomOf(canvas: HTMLCanvasElement, words: HTMLElement | null): Room {
	const field = canvas.getBoundingClientRect();
	if (!words || field.height <= 0 || words.children.length === 0) return { bottom: 0.1, top: 0.55 };
	const under = 1 - (blockOf(words).bottom - field.top) / field.height;
	return { bottom: 0.1, top: Math.min(0.9, under + 0.1) };
}

/**
 * The parts of the picture its images hold, and how finely each is painted: the whole, and the
 * part the lower canvas shows at rest, where the table comes nearest the eye. Each image is as fine
 * as the densest point it serves, as large as the screen lets the canvas grow.
 * @param canvas The canvas the table lights.
 * @param words The words the picture leaves room for.
 * @returns The parts.
 */
export function pictureParts(canvas: HTMLCanvasElement, words: HTMLElement | null): Part[] {
	const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
	const camera = fit(aspect, roomOf(canvas, words));
	const scale = SHEET.width / plan.width;
	/** Where a point of the table lies on the picture, 0..1 across and down it. */
	const onPicture = (point: { x: number; z: number }) => ({
		x: (point.x - SHEET.left) / scale / plan.width,
		y: 1 - (point.z - SHEET.near) / scale / plan.height,
	});
	const corners = [
		{ x: 0.0, y: 0.0 },
		{ x: 1.0, y: 0.0 },
		{ x: 0.0, y: 0.32 },
		{ x: 1.0, y: 0.32 },
	]
		.map((point) => onTable(camera, aspect, point))
		.filter((point) => point !== null)
		.map(onPicture);
	const clamp = (value: number) => Math.min(1, Math.max(0, value));
	const near: Region = [
		clamp(Math.min(...corners.map((point) => point.x)) - 0.03),
		clamp(Math.min(...corners.map((point) => point.y)) - 0.03),
		clamp(Math.max(...corners.map((point) => point.x)) + 0.03),
		clamp(Math.max(...corners.map((point) => point.y)) + 0.03),
	];

	// How much the near image serves a point, as the shader blends the two: all of it inside its
	// part, less within a twenty-fifth of the part from an edge that the picture does not share.
	const nearness = (at: { x: number; y: number }) => {
		const [left, top, right, bottom] = near;
		const [u, v] = [(at.x - left) / (right - left), (at.y - top) / (bottom - top)];
		if (u < 0 || v < 0 || u > 1 || v > 1) return 0;
		const reach = Math.min(
			left > 0 ? u : 1,
			top > 0 ? v : 1,
			right < 1 ? 1 - u : 1,
			bottom < 1 ? 1 - v : 1,
		);
		return Math.min(1, reach / 0.04);
	};
	// How many device pixels a unit of the picture covers, at its densest where each image serves:
	// along the pixel's shorter reach, which anisotropic filtering keeps sharp.
	const ratio = Math.min(window.devicePixelRatio || 1, RATIO);
	const [wide, tall] = [canvas.clientWidth * ratio, canvas.clientHeight * ratio];
	const densest = [0, 0];
	const steps = 40;
	for (let row = 0; row <= steps; row++) {
		for (let column = 0; column <= steps; column++) {
			const point = { x: column / steps, y: row / steps };
			const here = onTable(camera, aspect, point);
			const across = onTable(camera, aspect, { x: point.x + 1 / wide, y: point.y });
			const up = onTable(camera, aspect, { x: point.x, y: point.y + 1 / tall });
			if (!here || !across || !up) continue;
			const at = onPicture(here);
			if (at.x < 0 || at.y < 0 || at.x > 1 || at.y > 1) continue;
			const reach = Math.min(
				Math.hypot(across.x - here.x, across.z - here.z),
				Math.hypot(up.x - here.x, up.z - here.z),
			);
			const served = nearness(at);
			if (served > 0) densest[1] = Math.max(densest[1] ?? 0, scale / reach);
			if (served < 1) densest[0] = Math.max(densest[0] ?? 0, scale / reach);
		}
	}
	const [whole = 1, nearer = whole] = densest;
	return [
		{ region: [0, 0, 1, 1], density: whole * FINER },
		{ region: near, density: Math.max(whole, nearer) * FINER },
	];
}

/** How long the canvas keeps its size before the picture is painted again for it, in milliseconds. */
const SETTLE = 400;

/**
 * Light the hero's table on its canvas.
 * @param canvas The canvas, sized by CSS.
 * @param paint Paint the picture's images, for the parts that a function gives once the painter is
 * ready.
 * @param words The words the picture leaves room for, and lies darker behind.
 */
export function lightTable(
	canvas: HTMLCanvasElement,
	paint: (parts: () => Part[]) => Promise<Level[] | null>,
	words: HTMLElement | null,
): void {
	const host = canvas.parentElement ?? canvas;
	const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
	const score = compose();
	const routes = buildRoutes(plan);
	const light = token(LIGHT);

	// The picture's images, the parts they were painted for, and new images on their way to the
	// table. When the canvas comes to need a finer picture than it has, as when its window grows,
	// or another part of it, the picture is painted again.
	let levels: Level[] | null = null;
	let painted: Part[] = [];
	let arriving: Level[] | null = null;
	let settling = 0;
	let ready: number | undefined;
	let pointer: { x: number; y: number } | undefined;
	host.addEventListener("pointermove", (event) => {
		if (event.pointerType === "mouse" || event.pointerType === "pen")
			pointer = { x: event.clientX, y: event.clientY };
	});
	host.addEventListener("pointerleave", () => {
		pointer = undefined;
		if (motion.matches) redraw?.();
	});

	const lift = new Float32Array(plan.cards.length);
	const cardLit = new Float32Array(plan.cards.length);
	const lineLit = new Float32Array(plan.lines.length);
	let focus = 0;
	let lamp = 0;
	let look = { x: 0.5, y: 0.5 };
	let under: { card: number; since: number } | undefined;
	let focused = -1;
	let previous: number | undefined;
	let rest: { width: number; height: number; camera: Camera; words: number[] } | undefined;
	/**
	 * Where the words stand on the canvas.
	 * @returns Their left, bottom, right and top, 0..1 from the canvas's bottom left.
	 */
	const wordsOf = (): number[] => {
		const field = canvas.getBoundingClientRect();
		if (!words || field.width <= 0 || words.children.length === 0) return [0, 1, 0, 1];
		const block = blockOf(words);
		return [
			(block.left - field.left) / field.width,
			1 - (block.bottom - field.top) / field.height,
			(block.right - field.left) / field.width,
			1 - (block.top - field.top) / field.height,
		];
	};

	// The textures of the picture's images and of the routes. A lost context takes its textures
	// with it, so the table makes them again once the context is back. Asking the context whether
	// a texture lives would make each frame wait for the GPU.
	const textures: Record<"level0" | "level1" | "runs" | "grid", WebGLTexture | null> = {
		level0: null,
		level1: null,
		runs: null,
		grid: null,
	};
	canvas.addEventListener("webglcontextlost", () => {
		textures.level0 = textures.level1 = textures.runs = textures.grid = null;
	});
	const cardBoxes = plan.cards.slice(0, LIMITS.cards).flatMap((card) => footprint(card.box));
	const trayBoxes = plan.trays.slice(0, LIMITS.trays).flatMap((tray) => footprint(tray.box));
	const trayRegions = plan.trays.slice(0, LIMITS.trays).flatMap((tray) => edges(tray.region));
	const labelBoxes = plan.labels.slice(0, LIMITS.labels).flatMap((label) => edges(label.box));
	const lineColours = (moving: boolean) =>
		plan.lines.slice(0, LIMITS.lines).flatMap((line, index) => {
			const [r, g, b] = light;
			const speed = line.traffic && moving ? line.traffic.speed * 1.9 + (index % 3) * 9 : 0;
			return [r, g, b, speed];
		});
	// Still, the traffic's pulses stand where they are, so they do not run at all.
	const colours = { moving: lineColours(true), still: lineColours(false) };
	const scale = SHEET.width / plan.width;

	const redraw = runShader({
		canvas,
		fragment: FRAGMENT,
		maxRatio: RATIO,
		stillTime: 30,
		uniforms: (gl, at, frame) => {
			const still = motion.matches;
			const now = performance.now();
			const step = previous === undefined ? 0 : Math.min(0.1, Math.max(0, frame.time - previous));
			previous = still ? undefined : frame.time;
			const aspect = frame.width / frame.height;

			// Start on the frame after the upload, on the host's visible clock. Reduced motion
			// completes the entry, including when the reader later turns motion back on.
			if (still) ready = -Infinity;
			else if (levels) ready ??= frame.time;
			const t = ready === undefined ? -1 : frame.time - ready;
			const moving = Number.isFinite(t) ? Math.max(0, t - ARRIVAL.from) * ARRIVAL.rate : Infinity;
			const arrived = Number.isFinite(moving) ? 1 - (1 + moving) * Math.exp(-moving) : 1;
			const box = host.getBoundingClientRect();
			const scroll = still ? 0 : Math.min(1, Math.max(0, -box.top / Math.max(1, box.height)));
			const field = canvas.getBoundingClientRect();
			const target = pointer
				? {
						x: (pointer.x - field.left) / field.width,
						y: 1 - (pointer.y - field.top) / field.height,
					}
				: { x: 0.5, y: 0.5 };
			const follow = (rate: number) => (still ? 1 : 1 - Math.exp(-step * rate));
			look = {
				x: look.x + (target.x - look.x) * follow(RATES.look),
				y: look.y + (target.y - look.y) * follow(RATES.look),
			};
			if (!rest || rest.width !== frame.width || rest.height !== frame.height) {
				if (rest) {
					window.clearTimeout(settling);
					settling = window.setTimeout(repaint, SETTLE);
				}
				rest = {
					width: frame.width,
					height: frame.height,
					camera: fit(aspect, roomOf(canvas, words)),
					words: wordsOf(),
				};
			}
			const away = 1 - arrived;
			const camera: Camera = {
				...rest.camera,
				x: rest.camera.x + ARRIVAL.x * away,
				z: rest.camera.z + ARRIVAL.z * away + scroll * 1.2,
				distance: rest.camera.distance * (1 + (ARRIVAL.distance - 1) * away) - scroll * 1.5,
				yaw:
					rest.camera.yaw +
					ARRIVAL.yaw * away +
					(look.x - 0.5) * 0.05 +
					Math.sin(frame.time * 0.09) * 0.012,
				pitch:
					rest.camera.pitch +
					ARRIVAL.pitch * away +
					scroll * 0.1 +
					(look.y - 0.5) * 0.03 +
					Math.sin(frame.time * 0.067 + 1.3) * 0.006,
			};
			const eye = eyeOf(camera);

			// The card under the pointer, once it rests there.
			const ground = pointer ? onTable(camera, aspect, target) : null;
			let hovered = -1;
			if (ground && t > score.end - 1) {
				const x = (ground.x - SHEET.left) / scale;
				const y = plan.height - (ground.z - SHEET.near) / scale;
				hovered = plan.cards.findIndex((card) => {
					const [left, top, right, bottom] = edges(card.box);
					return x >= left && x <= right && y >= top && y <= bottom;
				});
			}
			if (hovered !== under?.card) under = { card: hovered, since: now };
			if (hovered < 0 || now - under.since > DWELL * 1000) focused = hovered;
			const ends = new Set<number>();
			plan.lines.forEach((line, index) => {
				const on = focused >= 0 && (line.from === focused || line.to === focused);
				if (on) ends.add(line.from === focused ? line.to : line.from);
				lineLit[index] =
					(lineLit[index] ?? 0) + ((on ? 1 : 0) - (lineLit[index] ?? 0)) * follow(RATES.light);
			});
			plan.cards.forEach((_, index) => {
				const aim = index === focused ? 1 : ends.has(index) ? 0.35 : 0;
				lift[index] = (lift[index] ?? 0) + (aim - (lift[index] ?? 0)) * follow(RATES.lift);
				const shine = index === focused ? 1 : ends.has(index) ? 0.85 : 0;
				cardLit[index] =
					(cardLit[index] ?? 0) + (shine - (cardLit[index] ?? 0)) * follow(RATES.light);
			});
			focus += ((focused >= 0 ? 1 : 0) - focus) * follow(RATES.focus);
			lamp += ((pointer ? 1 : 0) - lamp) * follow(RATES.focus);

			gl.uniform2f(at("uRes"), frame.width, frame.height);
			gl.uniform1f(at("uTime"), frame.time);
			gl.uniform3f(at("uEye"), eye.x, eye.y, eye.z);
			gl.uniform3f(at("uView"), camera.yaw, camera.pitch, camera.focal);
			gl.uniform2f(at("uShift"), camera.shiftX, camera.shiftY);
			gl.uniform1f(at("uFar"), camera.distance);
			gl.uniform4fv(at("uWords"), rest.words);
			gl.uniform4f(at("uSheet"), SHEET.left, SHEET.near, SHEET.width, plan.height * scale);
			gl.uniform2f(at("uPicture"), plan.width, plan.height);
			gl.uniform1f(at("uExposure"), t < 0 ? 0 : smooth(0.05, 1.5, t));
			gl.uniform1f(at("uFocus"), focus);
			gl.uniform3f(at("uPointer"), ground?.x ?? 0, ground?.z ?? 0, ground ? lamp * 0.6 : 0);

			// The picture's images, once painted, and the routes, once for each context.
			textures.runs ??= floats(gl, 2, routes.runs, routes.runRows);
			textures.grid ??= floats(gl, 3, routes.grid, routes.gridRows);
			if (arriving) {
				for (const texture of [textures.level0, textures.level1]) gl.deleteTexture(texture);
				for (const level of levels ?? []) level.image.close();
				levels = arriving;
				arriving = null;
				textures.level0 = null;
				textures.level1 = null;
			}
			if (levels && !textures.level0) {
				textures.level0 = levels[0] ? picture(gl, 0, levels[0].image) : null;
				textures.level1 = levels[1] ? picture(gl, 1, levels[1].image) : null;
			}
			const bind = (unit: number, texture: WebGLTexture | null, name: string) => {
				gl.activeTexture(gl.TEXTURE0 + unit);
				gl.bindTexture(gl.TEXTURE_2D, texture);
				gl.uniform1i(at(name), unit);
			};
			bind(0, textures.level0, "uLevel0");
			bind(1, textures.level1 ?? textures.level0, "uLevel1");
			bind(2, textures.runs, "uRuns");
			bind(3, textures.grid, "uGrid");
			gl.uniform1i(at("uLevels"), levels?.length ?? 0);
			gl.uniform4fv(
				at("uRegions"),
				[0, 1].flatMap((index) => [...(levels?.[index]?.region ?? [0, 0, 1, 1])]),
			);
			gl.uniform2i(at("uCells"), routes.cells[0], routes.cells[1]);
			gl.uniform1i(at("uCellTexels"), routes.stride);

			// Before the picture arrives, the table holds nothing.
			const live = levels !== null && t >= 0;
			const trays = plan.trays.slice(0, LIMITS.trays).map((_, index) => {
				const open = live ? easeOut((t - (score.trays[index] ?? 0)) / ENTRY.open) : 0;
				return [TILE.tray * open, open];
			});
			gl.uniform1i(at("uTrayCount"), trays.length);
			gl.uniform4fv(at("uTrayBox"), trayBoxes);
			gl.uniform4fv(at("uTrayRegion"), trayRegions);
			gl.uniform2fv(at("uTrayPose"), trays.flat());
			gl.uniform1f(at("uTrayCorner"), 10 * scale);

			const cards = plan.cards.slice(0, LIMITS.cards);
			gl.uniform1i(at("uCardCount"), cards.length);
			gl.uniform4fv(at("uCardBox"), cardBoxes);
			// What each tile stands on: the table or its tray's floor, or the air the pointer lifts it to.
			const floors = cards.map(
				(card, index) =>
					(card.tray >= 0 ? -(trays[card.tray]?.[0] ?? 0) : 0) + (lift[index] ?? 0) * TILE.lifted,
			);
			const poses = cards.map((_, index) => {
				const since = t - (score.cards[index] ?? 0);
				const rise = live ? easeOut(since / ENTRY.rise) : 0;
				const floor = floors[index] ?? 0;
				const foot = floor - (TILE.thickness + TILE.waits) * (1 - rise);
				const face = live ? smooth(0, ENTRY.rise * 0.65, since) : 0;
				const flash = live && since > 0 && Number.isFinite(since) ? Math.exp(-since * 4.5) : 0;
				return rise > 0 ? [foot, foot + TILE.thickness, face, flash] : [floor, floor, face, flash];
			});
			gl.uniform4fv(at("uCardPose"), poses.flat());
			gl.uniform1fv(at("uCardLit"), cardLit.slice(0, LIMITS.cards));
			gl.uniform1f(at("uCorner"), Math.max(...plan.cards.map((card) => card.radius)) * scale);

			const lines = plan.lines.slice(0, LIMITS.lines);
			// A beam meets each of its tiles part of the way up the tile's side, as the tile stands now,
			// and never below what the tile stands on.
			const plug = (card: number) => {
				const [foot = 0, top = 0] = poses[card] ?? [];
				return Math.max(floors[card] ?? 0, foot + (top - foot) * BEAM.plug);
			};
			const beams = lines.map((line) => {
				const kind =
					line.dash === "dotted" ? BEAM.dotted : line.emphasis === "hero" ? BEAM.hero : BEAM.normal;
				return [plug(line.from), plug(line.to), kind.height, kind.thick];
			});
			gl.uniform4fv(at("uLineBeam"), beams.flat());
			// How low and how high the beams' light reaches: a ray meets it only between. Their smoke
			// rises, so below a beam its light is gone by half its reach.
			const heights = beams.flatMap(([from = 0, to = 0, height = 0]) => [from, to, height]);
			gl.uniform2f(
				at("uBeamSpan"),
				Math.min(...heights) - SHINE * scale * 0.5,
				Math.max(...heights) + SHINE * scale,
			);
			gl.uniform4fv(at("uLineColor"), still ? colours.still : colours.moving);
			gl.uniform4fv(
				at("uLineReveal"),
				lines.flatMap((line, index) => {
					const sweep = score.lines[index];
					if (!live || !sweep) return [0, -10, 0, 0];
					const run = Math.min(line.length, Math.max(0, (t - sweep.start) * ENTRY.speed));
					const strength = Number.isFinite(t)
						? smooth(sweep.start, sweep.start + 0.06, t) *
							(1 - smooth(sweep.end, sweep.end + 0.4, t))
						: 0;
					if (t < sweep.start)
						return sweep.forward ? [0, -10, 0, 0] : [line.length + 10, line.length, line.length, 0];
					return sweep.forward
						? [0, run, run, strength]
						: [line.length - run, line.length, line.length - run, -strength];
				}),
			);
			gl.uniform4fv(
				at("uLineLife"),
				lines.flatMap((line, index) => {
					const sweep = score.lines[index];
					const going = still
						? 1
						: sweep
							? smooth(sweep.end + 0.15, sweep.end + ENTRY.traffic, t)
							: 0;
					const strength = line.traffic ? (line.emphasis === "hero" ? 1 : 0.7) : 0;
					return [line.length, lineLit[index] ?? 0, going * strength, 300 + ((index * 53) % 140)];
				}),
			);

			const labels = plan.labels.slice(0, LIMITS.labels);
			gl.uniform1i(at("uLabelCount"), labels.length);
			gl.uniform4fv(at("uLabelBox"), labelBoxes);
			gl.uniform3fv(
				at("uLabelPose"),
				labels.flatMap((label, index) => [
					label.line,
					live ? smooth(score.labels[index] ?? 0, (score.labels[index] ?? 0) + ENTRY.label, t) : 0,
					label.at,
				]),
			);
		},
	});
	/**
	 * Paint the picture for some parts, and bring the images to the table.
	 * @param parts The parts, once the painter is ready.
	 */
	const paintFor = (parts: () => Part[]) => {
		void paint(() => (painted = parts())).then((images) => {
			if (!images) return;
			for (const level of arriving ?? []) level.image.close();
			arriving = images;
			redraw?.();
		});
	};
	/** Paint the picture again when the canvas needs a part finer, or one the images do not hold. */
	function repaint() {
		const needs = pictureParts(canvas, words);
		const holds = (inner: Region, outer: Region) =>
			inner[0] >= outer[0] - 0.02 &&
			inner[1] >= outer[1] - 0.02 &&
			inner[2] <= outer[2] + 0.02 &&
			inner[3] <= outer[3] + 0.02;
		const stale = needs.some((part, index) => {
			const had = painted[index];
			return !had || part.density > had.density * 1.15 || !holds(part.region, had.region);
		});
		if (stale && painted.length > 0) paintFor(() => needs);
	}
	paintFor(() => pictureParts(canvas, words));
	// The words can reflow while the canvas keeps its size, as when their fonts arrive. The table
	// then fits the room they leave again, and paints again if that room needs more.
	if (words)
		new ResizeObserver(() => {
			rest = undefined;
			window.clearTimeout(settling);
			settling = window.setTimeout(repaint, SETTLE);
			redraw?.();
		}).observe(words);
	if (redraw) {
		host.addEventListener("pointermove", () => {
			if (motion.matches) redraw();
		});
	}
}

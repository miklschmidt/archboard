// The hero's stage: the table, its camera and its light, and the picture on it. Everything that
// moves runs on one clock in the shader: the camera's arrival, the light that draws each line,
// the tiles that rise where it reaches a card, the traffic, and the card under the pointer. The
// painter paints the picture once, so a frame costs the shader alone.

import { runShader } from "../gl";
import type { Level } from "./picture";
import { edges, plan } from "./plan";
import { buildRoutes, ROUTE_TEXELS } from "./routes";
import { compose, ENTRY } from "./score";
import { FRAGMENT, LIMITS } from "./shader";

/** How wide the picture lies on the table, in table units. Its middle stands at the origin. */
const WIDTH = 10;
const SHEET = { left: -WIDTH / 2, near: -(WIDTH * plan.height) / plan.width / 2, width: WIDTH };

/** How thick a card's tile stands, how high the pointer lifts it, and how deep a tray sinks. */
const TILE = { thickness: 0.055, lifted: 0.1, tray: 0.03 };

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

/** How quickly a card lifts toward the pointer, the rest dims, and the lines light, per second. */
const RATES = { lift: 10, focus: 7, light: 9, look: 3 };

/** How long the pointer rests on a card before it lights: a pointer passing over lights nothing. */
const DWELL = 0.12;

/** The light of each kind of line, by the colour its kind draws in; a line of no colour is white. */
const COLOURS = ["teal", "pink", "sky", "violet", "blue", "emerald", "cyan", "indigo"] as const;

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
	const value = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`);
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

/** A texture made on one context, made again after the context is lost. */
interface Held {
	readonly gl: WebGL2RenderingContext;
	readonly texture: WebGLTexture;
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
): Held | null {
	const texture = gl.createTexture();
	if (!texture) return null;
	gl.activeTexture(gl.TEXTURE0 + unit);
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, ROUTE_TEXELS, rows, 0, gl.RGBA, gl.FLOAT, data);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	return { gl, texture };
}

/**
 * Make the texture of one image of the picture, with every mip level a far table reads, its
 * colours decoded to linear light as the shader reads them.
 * @param gl The context.
 * @param unit Its texture unit.
 * @param image The image.
 * @returns The texture.
 */
function picture(gl: WebGL2RenderingContext, unit: number, image: ImageBitmap): Held | null {
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
	return { gl, texture };
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
 * The parts of the picture its images hold: the whole, and the part the lower canvas shows at rest,
 * where the table comes nearest the eye.
 * @param canvas The canvas the table lights.
 * @param words The words the picture leaves room for.
 * @returns The parts, 0..1 across and down the picture.
 */
export function pictureRegions(
	canvas: HTMLCanvasElement,
	words: HTMLElement | null,
): [number, number, number, number][] {
	const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
	const camera = fit(aspect, roomOf(canvas, words));
	const corners = [
		{ x: 0.0, y: 0.0 },
		{ x: 1.0, y: 0.0 },
		{ x: 0.0, y: 0.32 },
		{ x: 1.0, y: 0.32 },
	]
		.map((point) => onTable(camera, aspect, point))
		.filter((point) => point !== null);
	const scale = SHEET.width / plan.width;
	const across = corners.map((point) => (point.x - SHEET.left) / scale / plan.width);
	const down = corners.map((point) => 1 - (point.z - SHEET.near) / scale / plan.height);
	const clamp = (value: number) => Math.min(1, Math.max(0, value));
	const near: [number, number, number, number] = [
		clamp(Math.min(...across) - 0.03),
		clamp(Math.min(...down) - 0.03),
		clamp(Math.max(...across) + 0.03),
		clamp(Math.max(...down) + 0.03),
	];
	return [[0, 0, 1, 1], near];
}

/**
 * Light the hero's table on its canvas.
 * @param canvas The canvas, sized by CSS.
 * @param drawing The picture's images, once they are painted.
 * @param words The words the picture leaves room for, and lies darker behind.
 */
export function lightTable(
	canvas: HTMLCanvasElement,
	drawing: Promise<Level[] | null>,
	words: HTMLElement | null,
): void {
	const host = canvas.parentElement ?? canvas;
	const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
	const score = compose();
	const routes = buildRoutes(plan);
	const glowOf = new Map<string, [number, number, number]>(
		COLOURS.map((name) => [name, token(name)] as const),
	);
	const white: [number, number, number] = [0.62, 0.68, 0.78];

	let levels: Level[] | null = null;
	let ready: number | undefined;
	let pointer: { x: number; y: number } | undefined;
	host.addEventListener("pointermove", (event) => {
		if (event.pointerType === "mouse" || event.pointerType === "pen")
			pointer = { x: event.clientX, y: event.clientY };
	});
	host.addEventListener("pointerleave", () => {
		pointer = undefined;
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
	let rest: { aspect: number; camera: Camera; words: number[] } | undefined;
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

	const textures: Record<"level0" | "level1" | "runs" | "grid", Held | null> = {
		level0: null,
		level1: null,
		runs: null,
		grid: null,
	};
	const cardBoxes = plan.cards.slice(0, LIMITS.cards).flatMap((card) => footprint(card.box));
	const trayBoxes = plan.trays.slice(0, LIMITS.trays).flatMap((tray) => footprint(tray.box));
	const trayRegions = plan.trays.slice(0, LIMITS.trays).flatMap((tray) => edges(tray.region));
	const labelBoxes = plan.labels.slice(0, LIMITS.labels).flatMap((label) => edges(label.box));
	const lineColours = (moving: boolean) =>
		plan.lines.slice(0, LIMITS.lines).flatMap((line, index) => {
			const [r, g, b] = (line.color ? glowOf.get(line.color) : undefined) ?? white;
			const speed = line.traffic && moving ? line.traffic.speed * 1.9 + (index % 3) * 9 : 0;
			return [r, g, b, speed];
		});
	// Still, the traffic's pulses stand where they are, so they do not run at all.
	const colours = { moving: lineColours(true), still: lineColours(false) };
	const scale = SHEET.width / plan.width;

	const redraw = runShader({
		canvas,
		fragment: FRAGMENT,
		maxRatio: 1.5,
		stillTime: 30,
		uniforms: (gl, at, frame) => {
			const still = motion.matches;
			const now = performance.now();
			const step = previous === undefined ? 0 : Math.min(0.1, (now - previous) / 1000);
			previous = now;
			const aspect = frame.width / frame.height;

			// The clock of the entry starts when the picture is on the table.
			const t = still ? Infinity : ready === undefined ? -1 : (now - ready) / 1000;
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
			if (!rest || rest.aspect !== aspect)
				rest = { aspect, camera: fit(aspect, roomOf(canvas, words)), words: wordsOf() };
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
			const fresh = (held: Held | null) =>
				held !== null && held.gl === gl && gl.isTexture(held.texture);
			if (!fresh(textures.runs)) textures.runs = floats(gl, 2, routes.runs, routes.runRows);
			if (!fresh(textures.grid)) textures.grid = floats(gl, 3, routes.grid, routes.gridRows);
			if (levels && !fresh(textures.level0)) {
				textures.level0 = levels[0] ? picture(gl, 0, levels[0].image) : null;
				textures.level1 = levels[1] ? picture(gl, 1, levels[1].image) : null;
				// The entry starts on the frame after the upload, so its first moment is not the slow one.
				ready ??= performance.now() + 50;
			}
			const bind = (unit: number, held: Held | null, name: string) => {
				gl.activeTexture(gl.TEXTURE0 + unit);
				gl.bindTexture(gl.TEXTURE_2D, held?.texture ?? null);
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
			gl.uniform4fv(
				at("uCardPose"),
				cards.flatMap((card, index) => {
					const since = t - (score.cards[index] ?? 0);
					const rise = live ? easeOut(since / ENTRY.rise) : 0;
					const base =
						(card.tray >= 0 ? -(trays[card.tray]?.[0] ?? 0) : 0) + (lift[index] ?? 0) * TILE.lifted;
					const face = live ? smooth(0, ENTRY.rise * 0.65, since) : 0;
					const flash = live && since > 0 && Number.isFinite(since) ? Math.exp(-since * 4.5) : 0;
					return [base, base + TILE.thickness * rise, face, flash];
				}),
			);
			gl.uniform1fv(at("uCardLit"), cardLit.slice(0, LIMITS.cards));
			gl.uniform1f(at("uCorner"), Math.max(...plan.cards.map((card) => card.radius)) * scale);

			const lines = plan.lines.slice(0, LIMITS.lines);
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
			gl.uniform2fv(
				at("uLabelPose"),
				labels.flatMap((label, index) => [
					label.line,
					live ? smooth(score.labels[index] ?? 0, (score.labels[index] ?? 0) + ENTRY.label, t) : 0,
				]),
			);
		},
	});
	void drawing.then((painted) => {
		levels = painted;
		redraw?.();
	});
	if (redraw) {
		host.addEventListener("pointermove", () => {
			if (motion.matches) redraw();
		});
	}
}

// Paint the drawings that the site's painter draws live. A painting is the scene that the renderer
// core makes and the painter (ADR 0071) draws on a canvas. It belongs to the painter of the same
// build, so the site's build makes both from one checkout and keeps neither in Git.
//
// The hero draws the site's own model, `site/model`: how an agent, Archboard and its reader work
// together. Its painting has no ground and draws its cards flat, because the hero lays it on a
// table and stands each card up itself. Beside it goes what the hero needs to know of the picture:
// where each card, tray and label lies, and the route of every line, from its source to its target.
//
// The model's viewport shows the whole of `.archboard/vault`, Archboard's own model, as the app
// draws it.
//
// Run from the repository root, inside `nix develop`, after `bun run build:core`:
//   bun site/scripts/paint.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { projectModel } from "@archboard/model/content";
import { readArchitectureModel } from "@archboard/model/store-read";
import { renderArchitecture } from "@archboard/renderer/bun";

const OUT = join(import.meta.dir, "../src/paintings");

/** How many points a bend of a route becomes. */
const BEND_STEPS = 10;

type Point = { x: number; y: number };
type Step =
	| { step: "move" | "line"; to: Point }
	| { step: "across"; x: number }
	| { step: "down"; y: number }
	| { step: "acrossBy"; dx: number }
	| { step: "downBy"; dy: number }
	| { step: "quad"; control: Point; to: Point }
	| { step: "cubic"; first: Point; second: Point; to: Point }
	| { step: "arc"; radius: Point; clockwise: boolean; to: Point }
	| { step: "arcBy"; radius: Point; clockwise: boolean; by: Point }
	| { step: "close" };
interface Item {
	item: string;
	purpose?: string;
	role?: string | { role: string; facts?: Record<string, unknown> };
	subject?: { kind: string; id: string };
	geometry?: { kind: string; rect?: Rect; radius?: number; steps?: Step[] };
	items?: Item[];
}
type Rect = { x: number; y: number; width: number; height: number };

/**
 * Read a model and draw its reading with every container open.
 * @param vault The vault.
 * @param open Whether to open every module that has parts.
 * @returns The model, its reading and the renderer's request for it.
 */
async function read(vault: string, open: boolean) {
	const model = await readArchitectureModel(vault, undefined, undefined, {});
	if (!model.success) throw new Error(`The vault ${vault} did not read: ${JSON.stringify(model)}`);
	const parents = new Set(model.modules.map((module) => module.parent));
	const expand = open ? model.modules.filter(({ id }) => parents.has(id)).map(({ id }) => id) : [];
	const reading = projectModel(model, null, null, { expand }, undefined);
	const request = {
		content: reading.content,
		variant: reading.complete,
		held: reading.held,
		standing: reading.standing,
		unsettled: reading.unsettled,
		grammar: "architecture",
		policy: model.policy,
		theme: "dark",
	} as const;
	return { reading, request };
}

/**
 * The points of a path, each piece apart, bends cut into straight runs.
 * @param steps The path's steps.
 * @returns Its pieces.
 */
function flatten(steps: readonly Step[]): Point[][] {
	const pieces: Point[][] = [];
	let piece: Point[] = [];
	let at: Point = { x: 0, y: 0 };
	let start: Point = at;
	const to = (point: Point) => {
		piece.push(point);
		at = point;
	};
	const arc = (radius: Point, clockwise: boolean, end: Point) => {
		// The shorter arc of a circle, as SVG draws it with its large-arc flag off.
		const r = Math.max(radius.x, radius.y);
		const [mx, my] = [(at.x + end.x) / 2, (at.y + end.y) / 2];
		const [dx, dy] = [end.x - at.x, end.y - at.y];
		const half = Math.hypot(dx, dy) / 2;
		if (half < 1e-6) return;
		const reach = Math.sqrt(Math.max(0, r * r - half * half));
		const side = clockwise ? 1 : -1;
		const centre = {
			x: mx - (side * reach * dy) / (half * 2),
			y: my + (side * reach * dx) / (half * 2),
		};
		const from = Math.atan2(at.y - centre.y, at.x - centre.x);
		let sweep = Math.atan2(end.y - centre.y, end.x - centre.x) - from;
		if (clockwise && sweep < 0) sweep += Math.PI * 2;
		if (!clockwise && sweep > 0) sweep -= Math.PI * 2;
		const radiusUsed = Math.max(r, half);
		for (let i = 1; i <= BEND_STEPS; i++) {
			const angle = from + (sweep * i) / BEND_STEPS;
			to(
				i === BEND_STEPS
					? end
					: {
							x: centre.x + Math.cos(angle) * radiusUsed,
							y: centre.y + Math.sin(angle) * radiusUsed,
						},
			);
		}
	};
	for (const step of steps) {
		switch (step.step) {
			case "move":
				if (piece.length > 1) pieces.push(piece);
				piece = [step.to];
				at = step.to;
				start = step.to;
				break;
			case "line":
				to(step.to);
				break;
			case "across":
				to({ x: step.x, y: at.y });
				break;
			case "down":
				to({ x: at.x, y: step.y });
				break;
			case "acrossBy":
				to({ x: at.x + step.dx, y: at.y });
				break;
			case "downBy":
				to({ x: at.x, y: at.y + step.dy });
				break;
			case "quad": {
				const from = at;
				for (let i = 1; i <= BEND_STEPS; i++) {
					const t = i / BEND_STEPS;
					const u = 1 - t;
					to({
						x: u * u * from.x + 2 * u * t * step.control.x + t * t * step.to.x,
						y: u * u * from.y + 2 * u * t * step.control.y + t * t * step.to.y,
					});
				}
				break;
			}
			case "cubic": {
				const from = at;
				for (let i = 1; i <= BEND_STEPS; i++) {
					const t = i / BEND_STEPS;
					const u = 1 - t;
					const [a, b, c, d] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
					to({
						x: a * from.x + b * step.first.x + c * step.second.x + d * step.to.x,
						y: a * from.y + b * step.first.y + c * step.second.y + d * step.to.y,
					});
				}
				break;
			}
			case "arc":
				arc(step.radius, step.clockwise, step.to);
				break;
			case "arcBy":
				arc(step.radius, step.clockwise, { x: at.x + step.by.x, y: at.y + step.by.y });
				break;
			case "close":
				to(start);
				break;
		}
	}
	if (piece.length > 1) pieces.push(piece);
	return pieces;
}

/**
 * Every group of a painting with a role, with its subject.
 * @param body The painting's body.
 * @returns The groups, in drawing order.
 */
function groups(body: unknown): Item[] {
	const found: Item[] = [];
	const walk = (value: unknown): void => {
		if (Array.isArray(value)) value.forEach(walk);
		else if (value && typeof value === "object") {
			const item = value as Item;
			if (item.item === "group" && item.role && item.subject) found.push(item);
			Object.values(value).forEach(walk);
		}
	};
	walk(body);
	return found;
}

/**
 * The role of a group.
 * @param item The group.
 * @returns Its role's name.
 */
const roleOf = (item: Item) => (typeof item.role === "string" ? item.role : item.role?.role);

/**
 * The first rounded rectangle a group paints itself, with its corner.
 * @param group The group.
 * @param purpose The purpose of the shape.
 * @returns The rectangle and its corner, rounded to a hundredth.
 */
function plateOf(group: Item, purpose = "plate"): { box: number[]; radius: number } {
	const shape = group.items?.find(
		(item) => item.item === "shape" && item.purpose === purpose && item.geometry?.kind === "rect",
	);
	const rect = shape?.geometry?.rect;
	if (!rect)
		throw new Error(`The painting draws no ${purpose} for ${group.subject?.id ?? "a group"}.`);
	const round = (value: number) => Math.round(value * 100) / 100;
	return {
		box: [rect.x, rect.y, rect.width, rect.height].map(round),
		radius: shape.geometry?.radius ?? 0,
	};
}

/**
 * How far a point stands from a box, 0 inside it.
 * @param point The point.
 * @param box The box: left, top, width and height.
 * @returns The distance.
 */
function apart(point: Point, [x = 0, y = 0, width = 0, height = 0]: readonly number[]): number {
	const dx = Math.max(x - point.x, 0, point.x - (x + width));
	const dy = Math.max(y - point.y, 0, point.y - (y + height));
	return Math.hypot(dx, dy);
}

/**
 * The hero's picture: the site model painted flat on no ground, with what the hero needs of it.
 * @returns The painting and its plan.
 */
async function hero() {
	const { reading, request } = await read("site/model", true);
	const drawn = await renderArchitecture({ ...request, relief: "flat" });
	const painting = JSON.parse(drawn.painting) as { scene: { background: unknown; body: unknown } };
	painting.scene.background = { colour: "transparent" };
	const found = groups(painting.scene.body);
	const of = (role: string) => found.filter((group) => roleOf(group) === role);

	// A tray is the well a container's parts stand in, and its region adds the tab of its name.
	const trays = of("frame").map((group) => {
		const id = group.subject?.id ?? "";
		const region = drawn.atlas.regions[id];
		if (!region) throw new Error(`The painting places no region for the tray ${id}.`);
		return { id, ...plateOf(group), region: [region.x, region.y, region.width, region.height] };
	});
	const cards = of("card").map((group) => {
		const plate = plateOf(group);
		const [x = 0, y = 0, width = 0, height = 0] = plate.box;
		const middle = { x: x + width / 2, y: y + height / 2 };
		return {
			id: group.subject?.id ?? "",
			...plate,
			tray: trays.findIndex((tray) => apart(middle, tray.box) === 0),
		};
	});
	const card = (id: string) => cards.findIndex((one) => one.id === id);

	const lines = of("line").map((group) => {
		const id = group.subject?.id ?? "";
		const edge = reading.content.edges.find((one) => one.id === id);
		if (!edge) throw new Error(`The painting draws a line for ${id}, which the reading lacks.`);
		const [from, to] = [card(edge.from), card(edge.to)];
		if (from < 0 || to < 0) throw new Error(`The line ${id} does not join two cards.`);
		const pieces = (group.items ?? [])
			.filter((item) => item.item === "shape" && item.purpose === "line")
			.flatMap((item) => flatten(item.geometry?.steps ?? []));
		// A route runs from its source to its target, so its light travels the way the line points.
		const first = pieces[0]?.[0];
		const last = pieces.at(-1)?.at(-1);
		const target = cards[to]?.box ?? [];
		if (first && last && apart(first, target) < apart(last, target)) {
			pieces.reverse();
			for (const piece of pieces) piece.reverse();
		}
		const facts = (typeof group.role === "object" ? group.role.facts : undefined) as
			| { appearance?: { color?: string; dash?: string } }
			| undefined;
		let length = 0;
		const route = pieces.map((piece) =>
			piece.flatMap((point, index) => {
				const before = piece[index - 1];
				if (before) length += Math.hypot(point.x - before.x, point.y - before.y);
				return [Math.round(point.x * 100) / 100, Math.round(point.y * 100) / 100];
			}),
		);
		return {
			id,
			from,
			to,
			color: facts?.appearance?.color ?? null,
			dash: facts?.appearance?.dash ?? "solid",
			emphasis: edge.emphasis ?? "normal",
			traffic: edge.traffic ?? null,
			route,
			length: Math.round(length * 100) / 100,
		};
	});

	const labels = of("label").map((group) => {
		const line = lines.findIndex((one) => one.id === group.subject?.id);
		const plate = plateOf(group);
		const [x = 0, y = 0, width = 0, height = 0] = plate.box;
		const middle = { x: x + width / 2, y: y + height / 2 };
		// How far along its line the label sits: where the line passes nearest its middle.
		let at = 0;
		let nearest = Infinity;
		let walked = 0;
		for (const piece of lines[line]?.route ?? []) {
			for (let index = 2; index < piece.length; index += 2) {
				const [ax = 0, ay = 0, bx = 0, by = 0] = piece.slice(index - 2, index + 2);
				const span = Math.hypot(bx - ax, by - ay);
				const t =
					span > 0
						? Math.min(
								1,
								Math.max(
									0,
									((middle.x - ax) * (bx - ax) + (middle.y - ay) * (by - ay)) / span ** 2,
								),
							)
						: 0;
				const distance = Math.hypot(ax + (bx - ax) * t - middle.x, ay + (by - ay) * t - middle.y);
				if (distance < nearest) {
					nearest = distance;
					at = walked + span * t;
				}
				walked += span;
			}
		}
		return { line, ...plate, at: Math.round(at * 100) / 100 };
	});

	const plan = { width: drawn.width, height: drawn.height, cards, trays, lines, labels };
	return { painting: JSON.stringify(painting), plan };
}

/**
 * Archboard's own model, as the app draws it, and where its cards stand.
 * @returns The painting and its cards.
 */
async function own() {
	const { reading, request } = await read(".archboard/vault", false);
	const drawn = await renderArchitecture(request);
	const cards = Object.entries(drawn.atlas.nodes).map(([id, box]) => ({
		id,
		box: [box.x, box.y, box.width, box.height],
		lines: reading.content.edges.filter((edge) => edge.from === id || edge.to === id).length,
	}));
	return { painting: drawn.painting, plan: { width: drawn.width, height: drawn.height, cards } };
}

const [table, model] = await Promise.all([hero(), own()]);
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "hero.painting.json"), table.painting);
writeFileSync(join(OUT, "hero.json"), `${JSON.stringify(table.plan)}\n`);
writeFileSync(join(OUT, "own.painting.json"), model.painting);
writeFileSync(join(OUT, "own.json"), `${JSON.stringify(model.plan)}\n`);
console.log(
	`wrote src/paintings: hero (${String(table.plan.width)} × ${String(table.plan.height)}), own (${String(model.plan.width)} × ${String(model.plan.height)})`,
);
process.exit(0);

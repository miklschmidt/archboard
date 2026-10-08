import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
// The broad corpus protects meaning and clearance, independent of a layout
// engine's choice of ranks, shared ports and route shapes. Numeric comparisons
// are reported by docs/design/wide-board-layout-fixtures/measure.ts.

import { expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	DEFAULT_LAYOUT_ENGINE,
	LayoutEngineSchema,
	type VariantContent,
} from "@/shared/semantic-board/index";
import type { SemanticPolicy } from "@/shared/semantic-policy/index";
import { renderArchitecture, type RenderedDiagram } from "@/runtime/semantic-renderer/index";
import {
	locateSemanticBoard,
	readSemanticBoardAt,
	readSemanticBoardConfiguration,
} from "@/runtime/semantic-board-store/index";
import { labelsOffRuns, routesThroughCards } from "@/runtime/semantic-renderer/tests/drawn-ink";
import {
	bodyShift,
	corridorPoints,
	routeLabels,
	routePoints,
} from "@/runtime/semantic-renderer/tests/drawn-routes";
import first from "../../../../docs/design/wide-board-layout-fixtures/flask-map-1.content.json";
import third from "../../../../docs/design/wide-board-layout-fixtures/flask-map-3.content.json";
import systemMap from "../../../../docs/design/wide-board-layout-fixtures/system-map.content.json";

// Fit, route length, bends and shared corridors remain measured by the corpus
// script and recorded in the adoption report. They do not impose one engine's
// routing style on another (TASK-278).
const FIXTURES = [
	{ name: "flask-map-1", content: first },
	{ name: "flask-map-3", content: third },
	{ name: "system-map", content: systemMap },
];

/** The tracked vault's policy and its boards, by name, as their current variant's content. */
function vaultBoards(): {
	readonly policy: SemanticPolicy;
	readonly boards: { readonly name: string; readonly content: VariantContent }[];
} {
	const vault = fileURLToPath(new URL("../../../../.archboard/vault/", import.meta.url));
	const copy = mkdtempSync(join(tmpdir(), "archboard-renderer-vault-"));
	try {
		mkdirSync(join(copy, ".archboard"));
		copyFileSync(join(vault, ".archboard", "config.yaml"), join(copy, ".archboard", "config.yaml"));
		const configured = readSemanticBoardConfiguration(copy);
		const boards = readdirSync(vault)
			.filter((file) => file.endsWith(".semantic.json"))
			.toSorted()
			.map((file) => {
				copyFileSync(join(vault, file), join(copy, file));
				const name = file.slice(0, -".semantic.json".length);
				const read = readSemanticBoardAt(locateSemanticBoard(name, copy), configured);
				if (!read.ok) throw new Error(`the vault board ${file} does not parse`);
				const current = read.board.variants.find(({ id }) => id === read.board.current);
				if (current === undefined)
					throw new Error(`the vault board ${file} has no current variant`);
				return { name: read.board.name, content: current.content };
			});
		return { policy: configured.configuration, boards };
	} finally {
		rmSync(copy, { recursive: true, force: true });
	}
}

/**
 * Every straight run of one route through another relationship's label, where
 * a reader would take the route to end at the label it vanishes under.
 * @param drawing The rendered board.
 * @returns Each such route and label, named.
 */
function runsUnderLabels(drawing: RenderedDiagram): string[] {
	const routes = [...corridorPoints(drawing.svg)];
	const inside = 3;
	return [...routeLabels(drawing.svg)].flatMap(([id, pill]) =>
		routes
			.filter(([other]) => other !== id)
			.filter(([, points]) =>
				points.slice(1).some((end, index) => {
					const start = points[index]!;
					const [low, high] = [pill.x + inside, pill.x + pill.width - inside];
					const [top, bottom] = [pill.y + inside, pill.y + pill.height - inside];
					if (start.x === end.x)
						return (
							start.x > low &&
							start.x < high &&
							Math.max(start.y, end.y) > top &&
							Math.min(start.y, end.y) < bottom
						);
					if (start.y === end.y)
						return (
							start.y > top &&
							start.y < bottom &&
							Math.max(start.x, end.x) > low &&
							Math.min(start.x, end.x) < high
						);
					return false;
				}),
			)
			.map(([other]) => `${other} under ${id}`),
	);
}

/**
 * Semantic completeness and readable labels across the measured corpus.
 * @param drawing The rendered board.
 * @param content Its authored architecture.
 */
function expectIntact(drawing: RenderedDiagram, content: VariantContent) {
	expect(routesThroughCards(drawing, content), "routes through cards").toEqual([]);
	expect(labelsOffRuns(drawing), "labels off their own route").toEqual([]);
	expect(runsUnderLabels(drawing), "routes under another's label").toEqual([]);
	expect(Object.keys(drawing.atlas.nodes).toSorted()).toEqual(
		content.nodes.map(({ id }) => id).toSorted(),
	);
	expect(Object.keys(drawing.atlas.edges).toSorted()).toEqual(
		content.edges.map(({ id }) => id).toSorted(),
	);
}

/** The least distance the track engine keeps between two lines that do not share a trunk. */
const TRACK_LANE = 16;

/** One straight run of a drawn route. */
interface Run {
	readonly edge: string;
	readonly vertical: boolean;
	/** Where it stands across its direction. */
	readonly at: number;
	readonly from: number;
	readonly to: number;
}

/**
 * Every straight run of every drawn route longer than a bend.
 * @param drawing The rendered board.
 * @returns The runs.
 */
function runsOf(drawing: RenderedDiagram): Run[] {
	return [...routePoints(drawing.svg)].flatMap(([edge, points]) =>
		points.slice(1).flatMap((point, index) => {
			const previous = points[index]!;
			const vertical = Math.abs(point.x - previous.x) < 0.01;
			const horizontal = Math.abs(point.y - previous.y) < 0.01;
			if (vertical === horizontal) return [];
			const [one, other] = vertical ? [previous.y, point.y] : [previous.x, point.x];
			if (Math.abs(other - one) < 2 * TRACK_LANE) return [];
			return [
				{
					edge,
					vertical,
					at: vertical ? point.x : point.y,
					from: Math.min(one, other),
					to: Math.max(one, other),
				},
			];
		}),
	);
}

/**
 * Pairs of lines that run side by side closer than a lane without sharing a
 * trunk: the near-coincident lanes the track engine exists to prevent.
 * @param drawing The rendered board.
 * @returns The pairs, by relationship ids and their distance.
 */
function nearLanes(drawing: RenderedDiagram): string[] {
	const runs = runsOf(drawing);
	return runs.flatMap((run, index) =>
		runs.slice(index + 1).flatMap((other) => {
			const gap = Math.abs(run.at - other.at);
			const overlap = Math.min(run.to, other.to) - Math.max(run.from, other.from);
			return run.edge !== other.edge &&
				run.vertical === other.vertical &&
				overlap > TRACK_LANE &&
				gap > 0.5 &&
				gap < TRACK_LANE - 0.5
				? [`${run.edge}/${other.edge} ${gap.toFixed(1)}`]
				: [];
		}),
	);
}

/**
 * Upright runs within half a lane of a frame's or group region's side wall,
 * where a line reads as part of the container's border.
 * @param drawing The rendered board.
 * @returns Each such run's relationship id and the wall's x.
 */
function wallHugs(drawing: RenderedDiagram): string[] {
	const boxes =
		/<g data-semantic-kind="(?:region"[^>]*data-depiction="container|group-region)"[^>]*>\s*(?:<rect class="ab-halo"[^>]*>\s*)?<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/gu;
	// Routes are read on the page, so the walls are moved onto it with them.
	const shift = bodyShift(drawing.svg);
	const walls = [...drawing.svg.matchAll(boxes)].flatMap(([, x, y, width, height]) =>
		[Number(x), Number(x) + Number(width)].map((at) => ({
			at: at + shift.x,
			from: Number(y) + shift.y,
			to: Number(y) + Number(height) + shift.y,
		})),
	);
	return runsOf(drawing)
		.filter(({ vertical }) => vertical)
		.flatMap((run) =>
			walls
				.filter((wall) => {
					const gap = Math.abs(run.at - wall.at);
					const along = Math.min(run.to, wall.to) - Math.max(run.from, wall.from);
					return gap > 0.5 && gap < TRACK_LANE / 2 && along > 2 * TRACK_LANE;
				})
				.map((wall) => `${run.edge} ${wall.at}`),
		);
}

/**
 * The label boxes that stand across a container's edge: over part of a frame
 * or group region without standing wholly inside it, below its top edge.
 * @param drawing The rendered board.
 * @returns Each such label's relationship id and the container's corner.
 */
function labelsAcrossWalls(drawing: RenderedDiagram): string[] {
	const boxes =
		/<g data-semantic-kind="(?:region"[^>]*data-depiction="container|group-region)"[^>]*>\s*(?:<rect class="ab-halo"[^>]*>\s*)?<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/gu;
	// Labels are read on the page, so the containers are moved onto it with them.
	const shift = bodyShift(drawing.svg);
	const containers = [...drawing.svg.matchAll(boxes)].map(([, x, y, width, height]) => ({
		x: Number(x) + shift.x,
		y: Number(y) + shift.y,
		width: Number(width),
		height: Number(height),
	}));
	return [...routeLabels(drawing.svg)].flatMap(([id, label]) =>
		containers
			.filter((box) => {
				const overlaps =
					label.x < box.x + box.width &&
					box.x < label.x + label.width &&
					label.y < box.y + box.height &&
					box.y < label.y + label.height;
				const inside =
					label.x >= box.x &&
					label.x + label.width <= box.x + box.width &&
					label.y > box.y &&
					label.y + label.height <= box.y + box.height;
				return overlaps && !inside;
			})
			.map((box) => `${id} across ${box.x},${box.y}`),
	);
}

/**
 * The routes that run on a slant anywhere longer than a rounded corner: a
 * route is drawn across and down, and a slant is a route that lost its way.
 * @param drawing The rendered board.
 * @returns The slanted routes' relationship ids.
 */
function slants(drawing: RenderedDiagram): string[] {
	return [...routePoints(drawing.svg)].flatMap(([edge, points]) =>
		points.slice(1).some((point, index) => {
			const previous = points[index]!;
			const across = Math.abs(point.x - previous.x);
			const down = Math.abs(point.y - previous.y);
			return across > 0.5 && down > 0.5 && Math.hypot(across, down) > 3 * TRACK_LANE;
		})
			? [edge]
			: [],
	);
}

const { policy, boards } = vaultBoards();

/**
 * Local first layouts keep three times the 1 s render budget (TASK-377).
 * Hosted CI recorded 45.3 s layouts, so both rendering limits allow 60 s
 * there (TASK-451). CI measures completion on a shared runner; the local
 * bound still catches a layout grown several times slower.
 */
const HOSTED_RENDER_TIMEOUT_MS = 60_000;
const LOADED_LAYOUT_BOUND_MS = process.env["CI"] === "true" ? HOSTED_RENDER_TIMEOUT_MS : 3 * 1000;
const RENDER_CASE_TIMEOUT_MS = process.env["CI"] === "true" ? HOSTED_RENDER_TIMEOUT_MS : 20_000;

// Every board on both engines gets the rendering deadline, inside the preload's
// 60 s wall-clock ceiling (docs/agents/test-suite.md).
// The vault's boards are drawn with the vault's policy, so its groups gather.
const cases: {
	name: string;
	content: Parameters<typeof orderedFixture>[0];
	policy: SemanticPolicy | undefined;
}[] = [
	...FIXTURES.map(({ name, content }) => ({ name, content, policy: undefined })),
	...boards.map(({ name, content }) => ({ name, content, policy })),
];
for (const board of cases) {
	for (const layout of LayoutEngineSchema.options) {
		test(`${board.name} (${layout}): complete architecture, clear cards, labels on their own routes`, async () => {
			const content = orderedFixture(board.content);
			// Each case draws content nothing drew before, so this is a first layout.
			const began = performance.now();
			const drawing = await renderArchitecture({
				content,
				theme: "light",
				layout,
				...(board.policy === undefined ? {} : { policy: board.policy }),
			});
			const took = performance.now() - began;
			if (layout === DEFAULT_LAYOUT_ENGINE)
				expect(took, "first layout, ms").toBeLessThan(LOADED_LAYOUT_BOUND_MS);
			expectIntact(drawing, content);
			expect(slants(drawing), "routes on a slant").toEqual([]);
			expect(labelsAcrossWalls(drawing), "labels across a container's edge").toEqual([]);
			if (layout === "track") {
				expect(nearLanes(drawing), "lines closer than a lane").toEqual([]);
				expect(wallHugs(drawing), "lines along a container's wall").toEqual([]);
			}
		}, RENDER_CASE_TIMEOUT_MS);
	}
}

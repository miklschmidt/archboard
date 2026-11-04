// When each part of the picture arrives on the table. Light enters at the cards that start the
// story, the agents, and travels along the real routes at one speed. Each line is drawn by the
// light that runs along it, each card rises from the table when the light reaches it, each tray
// opens when the light first enters it, and each label shows as the light passes it. Everything
// follows from the routes, so the entry needs no hand-placed timing.

import { holds, plan, pointAlong, type PlanLine } from "./plan";

/** The pace of the entry, in seconds and picture units. */
export const ENTRY = {
	/** When the light leaves the first cards. */
	start: 0.45,
	/** How fast the light travels along a route, in the picture's units a second. */
	speed: 720,
	/** How long a card the light reached waits before its own lines light. */
	hop: 0.1,
	/** How long a card takes to rise. */
	rise: 0.7,
	/** How long a tray takes to open. */
	open: 0.6,
	/** How long a label takes to show. */
	label: 0.3,
	/** How long a line's traffic takes to start once the line is drawn. */
	traffic: 1.2,
} as const;

/** When one line is drawn. */
export interface Sweep {
	/** When the light leaves its first end. */
	readonly start: number;
	/** When it reaches the other. */
	readonly end: number;
	/** Whether it runs from the source to the target. */
	readonly forward: boolean;
}

/** The entry: when each part arrives, in seconds from its start. */
export interface Score {
	readonly cards: readonly number[];
	readonly lines: readonly Sweep[];
	readonly trays: readonly number[];
	readonly labels: readonly number[];
	/** When everything has arrived. */
	readonly end: number;
}

/**
 * Where the light starts: the cards that no line points at and that start a main line.
 * @returns Their numbers.
 */
function origins(): number[] {
	const targets = new Set(plan.lines.map((line) => line.to));
	const starts = plan.lines
		.filter((line) => line.emphasis === "hero" && !targets.has(line.from))
		.map((line) => line.from);
	return starts.length > 0 ? [...new Set(starts)] : [0];
}

/**
 * When the light that sweeps a line passes a distance along it.
 * @param sweep The line's sweep.
 * @param line The line.
 * @param along The distance from its source.
 * @returns The time.
 */
function passes(sweep: Sweep, line: PlanLine, along: number): number {
	const travelled = sweep.forward ? along : line.length - along;
	return sweep.start + travelled / ENTRY.speed;
}

/**
 * Compose the entry from the routes.
 * @returns The score.
 */
export function compose(): Score {
	// The light reaches each card first by the quickest way along the routes, in either direction.
	const cards = plan.cards.map(() => Infinity);
	for (const origin of origins()) cards[origin] = ENTRY.start;
	const settled = new Set<number>();
	while (settled.size < cards.length) {
		let next = -1;
		cards.forEach((time, index) => {
			if (!settled.has(index) && (next < 0 || time < (cards[next] ?? Infinity))) next = index;
		});
		if (next < 0 || !Number.isFinite(cards[next] ?? Infinity)) break;
		settled.add(next);
		for (const line of plan.lines) {
			const other = line.from === next ? line.to : line.to === next ? line.from : -1;
			if (other < 0) continue;
			const arrival = (cards[next] ?? 0) + ENTRY.hop + line.length / ENTRY.speed;
			if (arrival < (cards[other] ?? Infinity)) cards[other] = arrival;
		}
	}
	// A card no route reaches arrives with the last.
	const latest = Math.max(ENTRY.start, ...cards.filter(Number.isFinite));
	const reached = cards.map((time) => (Number.isFinite(time) ? time : latest));

	const lines = plan.lines.map((line): Sweep => {
		const [from, to] = [reached[line.from] ?? 0, reached[line.to] ?? 0];
		const forward = from <= to;
		const start = Math.min(from, to) + ENTRY.hop;
		return { start, end: start + line.length / ENTRY.speed, forward };
	});

	// A tray opens when the light first enters it, and before any card in it rises.
	const trays = plan.trays.map((tray, index) => {
		let first = Infinity;
		plan.cards.forEach((card, number) => {
			if (card.tray === index) first = Math.min(first, (reached[number] ?? 0) - ENTRY.open * 0.5);
		});
		plan.lines.forEach((line, number) => {
			const sweep = lines[number];
			if (!sweep) return;
			for (let along = 0; along <= line.length; along += 4) {
				const point = pointAlong(line, sweep.forward ? along : line.length - along);
				if (holds(tray.region, point.x, point.y)) {
					first = Math.min(first, passes(sweep, line, sweep.forward ? along : line.length - along));
					break;
				}
			}
		});
		return Number.isFinite(first) ? Math.max(0, first) : ENTRY.start;
	});

	const labels = plan.labels.map((label) => {
		const line = plan.lines[label.line];
		const sweep = lines[label.line];
		return line && sweep ? passes(sweep, line, label.at) : ENTRY.start;
	});

	const end = Math.max(
		...reached.map((time) => time + ENTRY.rise),
		...lines.map((sweep) => sweep.end),
		...labels.map((time) => time + ENTRY.label),
	);
	return { cards: reached, lines, trays, labels, end };
}

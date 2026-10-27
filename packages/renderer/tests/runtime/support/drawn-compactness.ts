import type { DiagramBox } from "@archboard/board/render-reply";
import { corridorPoints } from "#tests/runtime/support/drawn-routes.ts";

interface FrameMeasure {
	readonly id: string;
	readonly area: number;
	readonly members: number;
	readonly emptyShare: number;
	readonly outsideMemberEnvelope: number;
}

export interface Compactness {
	readonly area: number;
	readonly aspect: number;
	readonly elongation: number;
	readonly frameEmptyShare: number;
	readonly frames: readonly FrameMeasure[];
	readonly routes: readonly {
		readonly id: string;
		readonly length: number;
		readonly detour: number;
	}[];
	readonly longestRoute: { readonly id: string; readonly length: number; readonly detour: number };
}

/** The union area keeps overlapping card faces from inflating occupancy. */
function unionArea(boxes: readonly DiagramBox[]): number {
	const xs = [...new Set(boxes.flatMap((box) => [box.x, box.x + box.width]))].toSorted(
		(a, b) => a - b,
	);
	let area = 0;
	for (let i = 1; i < xs.length; i += 1) {
		const left = xs[i - 1]!,
			right = xs[i]!;
		const spans = boxes
			.filter((box) => box.x < right && box.x + box.width > left)
			.map((box) => [box.y, box.y + box.height] as const)
			.toSorted((a, b) => a[0] - b[0]);
		let high = Number.NEGATIVE_INFINITY,
			covered = 0;
		for (const [low, end] of spans) {
			covered += Math.max(0, end - Math.max(low, high));
			high = Math.max(high, end);
		}
		area += (right - left) * covered;
	}
	return area;
}

/** Painted card and frame faces, rather than shadows, glyphs, or selection halos. */
function faces(svg: string) {
	const cards: DiagramBox[] = [],
		frames: { id: string; box: DiagramBox }[] = [];
	for (const chunk of svg.split(/(?=<g data-semantic-kind=)/u)) {
		const tag = /^<g[^>]*>/u.exec(chunk)?.[0];
		if (tag === undefined || tag.includes("data-semantic-part=")) continue;
		const kind = /data-semantic-kind="([^"]+)"/u.exec(tag)?.[1];
		if (kind !== "node" && kind !== "region") continue;
		const rect =
			/<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"[^>]*pointer-events="all"/u.exec(
				chunk,
			);
		if (rect === null) continue;
		const box = {
			x: Number(rect[1]),
			y: Number(rect[2]),
			width: Number(rect[3]),
			height: Number(rect[4]),
		};
		if (kind === "node") cards.push(box);
		else frames.push({ id: /data-semantic-id="([^"]+)"/u.exec(tag)![1]!, box });
	}
	return { cards, frames };
}

/** Geometry measures, with empty frame area defined by visible member cards. */
export function compactnessOf(svg: string, width: number, height: number): Compactness {
	const { cards, frames } = faces(svg);
	const measured = frames.map(({ id, box }) => {
		const members = cards.filter(
			(card) =>
				card.x >= box.x - 1 &&
				card.y >= box.y - 1 &&
				card.x + card.width <= box.x + box.width + 1 &&
				card.y + card.height <= box.y + box.height + 1,
		);
		const area = box.width * box.height;
		const envelope =
			members.length === 0
				? 0
				: (Math.max(...members.map((card) => card.x + card.width)) -
						Math.min(...members.map((card) => card.x))) *
					(Math.max(...members.map((card) => card.y + card.height)) -
						Math.min(...members.map((card) => card.y)));
		return {
			id,
			area,
			members: members.length,
			emptyShare: 1 - unionArea(members) / area,
			outsideMemberEnvelope: 1 - envelope / area,
		};
	});
	let longestRoute = { id: "", length: 0, detour: 0 };
	const routes: Compactness["routes"][number][] = [];
	for (const [id, points] of corridorPoints(svg)) {
		const length = points
			.slice(1)
			.reduce(
				(sum, end, index) =>
					sum + Math.abs(end.x - points[index]!.x) + Math.abs(end.y - points[index]!.y),
				0,
			);
		const first = points[0],
			last = points.at(-1);
		if (first !== undefined && last !== undefined) {
			const route = {
				id,
				length,
				detour: length - Math.abs(last.x - first.x) - Math.abs(last.y - first.y),
			};
			routes.push(route);
			if (length > longestRoute.length) longestRoute = route;
		}
	}
	const frameArea = measured.reduce((sum, frame) => sum + frame.area, 0);
	return {
		area: width * height,
		aspect: width / height,
		elongation: Math.max(width / height, height / width),
		frameEmptyShare:
			frameArea === 0
				? 0
				: measured.reduce((sum, frame) => sum + frame.emptyShare * frame.area, 0) / frameArea,
		frames: measured,
		routes,
		longestRoute,
	};
}

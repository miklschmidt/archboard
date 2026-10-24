import { runOf, type Station, type Chain } from "#shared/rules/track/routes/chains.ts";
import type { Net } from "#shared/rules/track/channels/channels.ts";
import type { Scene } from "#shared/rules/track/scene/scene.ts";

/** What a stretch's move changes, to put back when part of it cannot move. */
interface Saved {
	readonly lanes: Map<Station, number>;
	readonly boxes: Map<Station, Station["item"]>;
	readonly nets: readonly Net[];
	readonly ends: Float64Array;
}

/**
 * Keep what moving some stations could change.
 * @param scene The scene, for the ports that slide.
 * @param chains Every relationship's chain.
 * @param nets Every net.
 * @param stations The stations.
 * @returns The saved state.
 */
function save(
	scene: Scene,
	chains: readonly Chain[],
	nets: readonly Net[],
	stations: readonly Station[],
): Saved {
	const lanes = savedLanes(chains, stations);
	const boxes = new Map(
		stations
			.filter(({ kind, item }) => kind === "label" || scene.slides.has(item!))
			.map((station) => [station, { ...station.item! }] as const),
	);
	const ends = new Float64Array(2 * nets.length);
	for (let index = 0; index < nets.length; index += 1) {
		ends[2 * index] = nets[index]!.topX;
		ends[2 * index + 1] = nets[index]!.bottomX;
	}
	return { lanes, boxes, nets, ends };
}

/**
 * Keep each lane run once, even when the stretch touches several of its lanes.
 * @param chains Every chain.
 * @param stations The stretch's stations.
 * @returns Each lane's original position.
 */
function savedLanes(chains: readonly Chain[], stations: readonly Station[]): Map<Station, number> {
	const lanes = new Map<Station, number>();
	for (const station of stations) {
		if (lanes.has(station)) continue;
		for (const lane of runOf(chains, station)?.lanes ?? []) lanes.set(lane, lane.x);
	}
	return lanes;
}

/**
 * Put back what a failed stretch moved.
 * @param saved The saved state.
 */
function restore(saved: Saved): void {
	for (const [lane, x] of saved.lanes) lane.x = x;
	for (const [station, item] of saved.boxes) station.item!.box = item!.box;
	for (let index = 0; index < saved.nets.length; index += 1) {
		const net = saved.nets[index]!;
		net.topX = saved.ends[2 * index]!;
		net.bottomX = saved.ends[2 * index + 1]!;
	}
}

export { save, restore };

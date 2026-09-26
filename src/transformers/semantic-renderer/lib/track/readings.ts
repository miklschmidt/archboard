// A labelled line read with its label box on another band (visual polish).
// Graphviz ranks a label on one band of its line, and its only free slot
// there may lie far off the line's column where the band above or below had
// room on it; the relay tries each reading and keeps the cheapest route.
import {
	labelStation,
	type Chain,
	type Station,
} from "@/transformers/semantic-renderer/lib/track/chains";
import type { Item, Scene } from "@/transformers/semantic-renderer/lib/track/scene";

/** A chain's route relaid: its stations, where each stands, and what it costs. */
interface Relaid {
	readonly stations: readonly Station[];
	readonly route: readonly number[];
	readonly cost: number;
}

/**
 * A chain's stations by band.
 * @param stations The stations.
 * @returns Each by its band.
 */
function byBand(stations: readonly Station[]): Map<number, Station> {
	return new Map(stations.map((station) => [station.band, station]));
}

/**
 * A label box moved onto another band, centred on it.
 * @param scene The scene.
 * @param label The box.
 * @param band The band.
 * @returns The box there.
 */
function onBand(scene: Scene, label: Item, band: number): Item {
	const { top, bottom } = scene.bands[band]!;
	return { box: { ...label.box, y: (top + bottom - label.box.height) / 2 }, band };
}

/**
 * The ways a chain's stations may be read: as they stand, and, when it has a
 * label box, with the box on the band above or below between its ends, where
 * that band is tall enough to hold it, and a lane where the box stood. Graphviz ranks a label
 * on one band of its line, and its only free slot there may lie far off the
 * line's column where the band above or below had room on it.
 * @param scene The scene.
 * @param chain The chain.
 * @returns The readings, the standing one first.
 */
function readingsOf(scene: Scene, chain: Chain): (readonly Station[])[] {
	const { stations } = chain;
	const label = stations.find(({ kind }) => kind === "label");
	if (label === undefined) return [stations];
	const item = label.item!;
	const moved = stations.slice(1, -1).filter(({ band }) => {
		const { top, bottom } = scene.bands[band]!;
		return Math.abs(band - label.band) === 1 && item.box.height <= bottom - top;
	});
	return [
		stations,
		...moved.map((lane) =>
			stations.map((station): Station => {
				if (station === lane) return { kind: "label", band: lane.band, item, x: lane.x };
				return station === label ? { kind: "lane", band: label.band, x: label.x } : station;
			}),
		),
	];
}

/**
 * Put a chain on its relaid route: its stations, its label box moved onto
 * its station's band where the reading moved it, and each station between
 * its ends at its x, a label box's moving with it.
 * @param chain The chain; its stations are replaced.
 * @param relaid The route.
 * @param scene The scene, whose bands a moved label box centres on.
 */
function take(chain: Chain, relaid: Relaid, scene: Scene): void {
	const stations = relaid.stations.map((station) =>
		station.kind === "label" && station.item!.band !== station.band
			? moveLabel(scene, station.item!, station.band)
			: station,
	);
	chain.stations.splice(0, chain.stations.length, ...stations);
	stations.slice(1, -1).forEach((station, index) => {
		station.x = relaid.route[index + 1]!;
	});
}

/**
 * Move a label box onto another band, centred on it.
 * @param scene The scene.
 * @param item The box.
 * @param band The band.
 * @returns Its station there.
 */
function moveLabel(scene: Scene, item: Item, band: number): Station {
	item.box = onBand(scene, item, band).box;
	item.band = band;
	return labelStation(item, band);
}

export { byBand, onBand, readingsOf, take, type Relaid };

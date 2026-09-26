// A labelled line read with its label box on another band (visual polish).
// Graphviz ranks a label on one band of its line, and its only free slot
// there may lie far off the line's column where the band above or below had
// room on it; the relay tries each reading and keeps the cheapest route.
import type { Chain, Station } from "@/transformers/semantic-renderer/lib/track/chains";
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
 * label box, with the box on each other band between its ends that is tall
 * enough to hold it and a lane where the box stood. Graphviz ranks a label
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
		return band !== label.band && item.box.height <= bottom - top;
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
 * Put a chain on its relaid route: its stations, each at its x, and its
 * label box on its station's band and column.
 * @param chain The chain; its stations are replaced.
 * @param relaid The route.
 * @param scene The scene, whose bands a moved label box centres on.
 */
function take(chain: Chain, relaid: Relaid, scene: Scene): void {
	chain.stations.splice(0, chain.stations.length, ...relaid.stations);
	chain.stations.forEach((station, index) => {
		station.x = relaid.route[index]!;
		const { item } = station;
		if (item === undefined || station.kind === "card") return;
		const placed = item.band === station.band ? item : onBand(scene, item, station.band);
		item.band = station.band;
		item.box = { ...placed.box, x: station.x - item.box.width / 2 };
	});
}

export { byBand, onBand, readingsOf, take, type Relaid };

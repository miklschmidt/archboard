// A frame's title row as wide as the room its frame gives it (TASK-486).
// Graphviz ranks a title row at the header's least width, where its words
// wrap as narrow as a card's. Once Graphviz has said how wide the frame is
// and where the lines crossing the row stand, the row takes the widest size
// its words can take there: left of the first line or item on the row, so a
// line into the frame still crosses the row beside the words, and inside the
// frame's walls, which never stand closer together than its words reach
// (`sides.ts`). A wider row takes fewer lines, so it stands shorter, and its
// band shrinks with it before the bands are spaced: one layout, no second.
import { ARCHITECTURE_HEADER_PADDING } from "@/transformers/semantic-renderer/lib/design";
import { LANE, type Chain } from "@/transformers/semantic-renderer/lib/track/chains";
import type { Scene } from "@/transformers/semantic-renderer/lib/track/scene";

/**
 * How far a title row's words may reach in from its left edge: inside its
 * frame, and a lane short of the first line or item standing on its band
 * right of where they start.
 * @param scene The scene.
 * @param id The frame.
 * @param lanes Every line's lanes, where Graphviz ran them.
 * @returns The reach.
 */
function roomFor(scene: Scene, id: string, lanes: readonly { band: number; x: number }[]): number {
	const title = scene.titles.get(id)!;
	const { node } = scene.frames.get(id)!;
	const left = title.box.x;
	const right = node.x! + node.width!;
	const items = [
		...scene.cards.values(),
		...scene.labels.values(),
		...scene.titles.values(),
		...scene.regions.map(({ caption }) => caption),
	].filter((item) => item !== title && item.band === title.band);
	const blockers = [
		...lanes.filter(({ band }) => band === title.band).map(({ x }) => x),
		...items.map(({ box }) => box.x),
	].filter((x) => x > left && x < right);
	return Math.min(right - ARCHITECTURE_HEADER_PADDING, ...blockers.map((x) => x - LANE)) - left;
}

/**
 * Give every frame's title row the widest size it has room for, before
 * anything reads its words' reach or its band's height: the lanes under the
 * row keep clear of the words it takes, and the band it stands on stands as
 * tall as its tallest item then.
 * @param scene The placed scene; its title rows, their words, their frames' sizes and their bands change.
 * @param chains Every line's chain, its lanes where Graphviz ran them.
 */
function fitTitleRows(scene: Scene, chains: readonly Chain[]): void {
	const lanes = chains.flatMap(({ stations }) => stations.filter(({ kind }) => kind === "lane"));
	const bands = new Set<number>();
	for (const [id, title] of scene.titles) {
		const steps = scene.steps.get(title)!;
		// A frame laid out as its region stands in from the row by the region's room on each side.
		const inset = 2 * (title.inset ?? 0);
		const index = steps.length < 2 ? 0 : widest(steps, roomFor(scene, id, lanes) - inset);
		if (index === 0) continue;
		const { words, height } = steps[index]!;
		title.box = { ...title.box, height };
		scene.words.set(title, words + inset);
		scene.headers.set(id, index);
		bands.add(title.band);
	}
	for (const band of bands) respan(scene, band);
}

/**
 * The widest size of a title row whose words reach no further than some room.
 * @param steps Its sizes, narrowest first.
 * @param room How far its words may reach.
 * @returns The size's index: its least, when no wider one fits.
 */
function widest(steps: readonly { readonly words: number }[], room: number): number {
	let index = 0;
	while (index + 1 < steps.length && steps[index + 1]!.words <= room) index += 1;
	return index;
}

/**
 * Size a band again round its items, about the centre Graphviz ranked them
 * on, as the scene first did: its cards at its top, its title rows and
 * captions at its foot, its labels where they stand.
 * @param scene The scene; the band and the items on it change.
 * @param index The band.
 */
function respan(scene: Scene, index: number): void {
	const band = scene.bands[index]!;
	const centre = (band.top + band.bottom) / 2;
	const cards = [...scene.cards.values()].filter((item) => item.band === index);
	const heads = [...scene.titles.values(), ...scene.regions.map(({ caption }) => caption)].filter(
		(item) => item.band === index,
	);
	const labels = [...scene.labels.values()].filter((item) => item.band === index);
	const tallest = Math.max(...[...cards, ...heads, ...labels].map(({ box }) => box.height));
	const [top, bottom] = [centre - tallest / 2, centre + tallest / 2];
	scene.bands[index] = { ...band, top, bottom };
	for (const card of cards) card.box = { ...card.box, y: top };
	for (const head of heads) head.box = { ...head.box, y: bottom - head.box.height };
}

export { fitTitleRows };

// A block's placement read back as a scene (TASK-349): cards, label boxes and
// frame title rows as items, grouped into bands by the rank they sit on. The
// placed hierarchy carries each relationship's polyline, each frame's title
// row and every group region in the layout options named here.
import type { ElkExtendedEdge, ElkNode } from "@archboard/elk-rs";
import type { Box } from "@/transformers/semantic-renderer/lib/geometry";
import { z } from "zod";

/** The layout option that carries a relationship's polyline, as `x,y` pairs separated by spaces. */
const TRACK_POLYLINE = "archboard.track.polyline";
/** The layout option on a frame that carries its title row's box, as `x,y,width,height`. */
const TRACK_TITLE = "archboard.track.title";
/** The root layout option that carries every group region, as JSON `PlacedRegion` rows. */
const TRACK_REGIONS = "archboard.track.regions";
/** How far a region's caption sits in from its band's left edge. */
const REGION_CAPTION_INSET = 6;

const BoxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);
/** A group region as placement answers it. */
const PlacedRegionSchema = z.object({
	group: z.string(),
	parent: z.string().optional(),
	members: z.array(z.string()),
	box: BoxSchema,
	caption: BoxSchema,
});

/** Something that sits on a band: a card, a label box or a frame's title row; a label box may slide. */
interface Item {
	box: Box;
	band: number;
}

/** One band: the items on one rank, and where it lies before and after spacing. */
interface Band {
	readonly top: number;
	readonly bottom: number;
	newTop: number;
	/** How far below it the first track of the channel under it runs, once spaced. */
	firstTrack: number;
}

/** A frame: its placed node, its depth and every card or frame inside it. */
interface Frame {
	readonly node: ElkNode;
	readonly depth: number;
	readonly members: string[];
}

/** A group region: Graphviz's cluster box, its caption row and the nodes it gathers. */
interface Region {
	readonly group: string;
	readonly parent: string | undefined;
	readonly members: readonly string[];
	readonly box: { readonly x: number; readonly width: number };
	readonly caption: Item;
}

/** A placed shape, before it is known to have geometry. */
interface Placed {
	readonly x?: number | undefined;
	readonly y?: number | undefined;
	readonly width?: number | undefined;
	readonly height?: number | undefined;
}

/**
 * The box of a placed shape.
 * @param shape The placed shape.
 * @param what What it is, for the refusal.
 * @returns Its box.
 * @throws {Error} When placement left it without a position.
 */
function boxOf(shape: Placed, what: string): Box {
	if (shape.x === undefined || shape.y === undefined)
		throw new Error(`Track placement omitted geometry for ${what}`);
	return { x: shape.x, y: shape.y, width: shape.width ?? 0, height: shape.height ?? 0 };
}

/**
 * The centre height a band groups an item by.
 * @param item The item.
 * @returns Its centre, rounded to half a point.
 */
function centreKey(item: Item): number {
	return Math.round((item.box.y + item.box.height / 2) * 2) / 2;
}

/**
 * An item's horizontal centre.
 * @param item The item.
 * @returns Its centre x.
 */
function centreX(item: Item): number {
	return item.box.x + item.box.width / 2;
}

/** The placed hierarchy read back into items, bands and frames. */
class Scene {
	readonly cards = new Map<string, Item>();
	readonly labels = new Map<string, Item>();
	readonly titles = new Map<string, Item>();
	/** How far each title row's words reach in from its left edge. */
	readonly words = new Map<Item, number>();
	readonly frames = new Map<string, Frame>();
	/** Each band's frame and region walls, once asked for. */
	private readonly walls = new Map<number, ReadonlyMap<string, readonly [number, number]>>();
	readonly regions: Region[] = [];
	readonly bands: Band[] = [];

	/**
	 * Read every placed item and group them into bands by their centres.
	 * @param placed The placed hierarchy.
	 */
	constructor(placed: ElkNode) {
		this.visit(placed.children ?? [], 0, []);
		this.readLabels(placed.edges ?? []);
		this.readRegions(placed);
		const heads = [...this.titles.values(), ...this.regions.map(({ caption }) => caption)];
		this.groupBands([...this.cards.values(), ...this.labels.values(), ...heads]);
		// A title row or caption sits at the foot of its band, on the cards it
		// heads, rather than halfway down a taller card beside it.
		for (const head of heads)
			head.box = { ...head.box, y: this.bands[head.band]!.bottom - head.box.height };
	}

	/**
	 * Read every group region placement wrote on the root.
	 * @param placed The placed hierarchy.
	 */
	readRegions(placed: ElkNode): void {
		const rows = z
			.array(PlacedRegionSchema)
			.parse(JSON.parse(placed.layoutOptions?.[TRACK_REGIONS] ?? "[]"));
		for (const { group, parent, members, box, caption } of rows) {
			const [, y, width, height] = caption;
			// The caption reads from the band's top-left corner, as a frame's title does.
			const x = box[0] + REGION_CAPTION_INSET;
			this.regions.push({
				group,
				parent,
				members,
				box: { x: box[0], width: box[2] },
				caption: { box: { x, y, width, height }, band: -1 },
			});
		}
	}

	/**
	 * Read every relationship's placed label box.
	 * @param edges The placed relationships.
	 */
	readLabels(edges: readonly ElkExtendedEdge[]): void {
		for (const edge of edges) {
			const label = edge.labels?.[0];
			if (label?.x !== undefined)
				this.labels.set(edge.id, { box: boxOf(label, `the label of ${edge.id}`), band: -1 });
		}
	}

	/**
	 * Group items into bands, one per distinct centre height, top to bottom.
	 * @param items Every item.
	 */
	groupBands(items: readonly Item[]): void {
		const centres = [...new Set(items.map(centreKey))].toSorted((one, other) => one - other);
		for (const centre of centres) {
			const on = items.filter((item) => centreKey(item) === centre);
			for (const item of on) item.band = this.bands.length;
			this.bands.push({
				top: Math.min(...on.map(({ box }) => box.y)),
				bottom: Math.max(...on.map(({ box }) => box.y + box.height)),
				newTop: 0,
				firstTrack: 0,
			});
		}
	}

	/**
	 * Read cards, frames and title rows, keeping each frame's members.
	 * @param nodes One level of the hierarchy.
	 * @param depth Its containment depth.
	 * @param frames The frames it sits in, outermost first.
	 */
	visit(nodes: readonly ElkNode[], depth: number, frames: readonly string[]): void {
		for (const node of nodes) {
			for (const frame of frames) this.frames.get(frame)!.members.push(node.id);
			const title = node.layoutOptions?.[TRACK_TITLE];
			if (title === undefined) {
				this.cards.set(node.id, { box: boxOf(node, node.id), band: -1 });
				continue;
			}
			const [x, y, width, height, words] = title.split(",").map(Number);
			const item = { box: { x: x!, y: y!, width: width!, height: height! }, band: -1 };
			this.titles.set(node.id, item);
			this.words.set(item, words!);
			this.frames.set(node.id, { node, depth, members: [] });
			this.visit(node.children ?? [], depth + 1, [...frames, node.id]);
		}
	}

	/**
	 * The item a relationship ends at: a card, or a frame's title row.
	 * @param id The semantic endpoint.
	 * @returns Its item.
	 * @throws {Error} When placement omitted it.
	 */
	endpoint(id: string): Item {
		const item = this.cards.get(id) ?? this.titles.get(id);
		if (item === undefined) throw new Error(`Track placement omitted endpoint ${id}`);
		return item;
	}

	/**
	 * Every title row's and caption's painted words: the band they sit on,
	 * where they start and end, and the walls of the container they head.
	 * @returns The headings.
	 */
	headings(): { band: number; left: number; end: number; walls: readonly [number, number] }[] {
		const titles = [...this.titles].map(([id, item]) => {
			const { node } = this.frames.get(id)!;
			return {
				band: item.band,
				left: item.box.x,
				end: item.box.x + this.words.get(item)!,
				walls: [node.x!, node.x! + node.width!] as const,
			};
		});
		const captions = this.regions.map(({ caption, box }) => ({
			band: caption.band,
			left: caption.box.x,
			end: caption.box.x + caption.box.width,
			walls: [box.x, box.x + box.width] as const,
		}));
		return [...titles, ...captions];
	}

	/**
	 * The last band a frame covers.
	 * @param id The frame.
	 * @returns Its lowest member's band.
	 */
	lastBandOf(id: string): number {
		const { members } = this.frames.get(id)!;
		return Math.max(
			this.titles.get(id)!.band,
			...members.map((member) => (this.cards.get(member) ?? this.titles.get(member))?.band ?? 0),
		);
	}

	/**
	 * The frames and group regions whose body covers an x on a band, as a key a lane must keep.
	 * @param band The band.
	 * @param x The x.
	 * @returns The ids of the frames and regions covering it, joined.
	 */
	framesAt(band: number, x: number): string {
		return [...this.walled(band)]
			.filter(([, [low, high]]) => x > low && x < high)
			.map(([id]) => id)
			.join(",");
	}

	/**
	 * Every frame and group region a band passes through, with its left and right walls.
	 * Routing moves no frame or region sideways, so each band's walls are found once.
	 * @param band The band.
	 * @returns Each one's id and walls.
	 */
	walled(band: number): ReadonlyMap<string, readonly [number, number]> {
		const known = this.walls.get(band);
		if (known !== undefined) return known;
		const walls = new Map([...this.frameWalls(band), ...this.regionWalls(band)]);
		this.walls.set(band, walls);
		return walls;
	}

	/**
	 * Every frame a band passes through, with its walls.
	 * @param band The band.
	 * @returns Each frame's id and walls.
	 */
	frameWalls(band: number): [string, readonly [number, number]][] {
		return [...this.frames]
			.filter(([id]) => band >= this.titles.get(id)!.band && band <= this.lastBandOf(id))
			.map(([id, { node }]) => [id, [node.x!, node.x! + node.width!]]);
	}

	/**
	 * Every group region a band passes through, with its walls.
	 * @param band The band.
	 * @returns Each region's key and walls.
	 */
	regionWalls(band: number): [string, readonly [number, number]][] {
		return this.regions
			.filter((region) => band >= region.caption.band && band <= this.regionLastBand(region))
			.map((region) => [
				`${region.parent ?? ""}|${region.group}`,
				[region.box.x, region.box.x + region.box.width],
			]);
	}

	/**
	 * The last band a region covers: its lowest member's, frames' members included.
	 * @param region The region.
	 * @returns The band.
	 */
	regionLastBand(region: Region): number {
		const nodes = region.members.flatMap((id) => [id, ...(this.frames.get(id)?.members ?? [])]);
		return Math.max(
			region.caption.band,
			...nodes.map((id) => (this.cards.get(id) ?? this.titles.get(id))?.band ?? 0),
		);
	}

	/**
	 * An item's box after its band moved.
	 * @param item The item.
	 * @param left How far every x moves.
	 * @returns Its new box.
	 */
	moved(item: Item, left: number): Box {
		const band = this.bands[item.band]!;
		return {
			x: item.box.x + left,
			y: item.box.y - band.top + band.newTop,
			width: item.box.width,
			height: item.box.height,
		};
	}
}

export {
	Scene,
	TRACK_POLYLINE,
	TRACK_REGIONS,
	TRACK_TITLE,
	centreX,
	type Band,
	type Frame,
	type Item,
	type Region,
};

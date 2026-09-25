// The frames and group regions a track scene draws (TASK-349). Each reaches
// one inset below the lowest thing it holds, the containers inside it
// included, so nested containers never share a bottom edge; and the channel
// below the band a container ends on starts its tracks below that edge, so no
// line runs along the inside of a container it has nothing to do with.
import type { ElkExtendedEdge } from "@archboard/elk-rs";
import { CONTAINER_INSET } from "@/transformers/semantic-renderer/config";
import type { Box } from "@/transformers/semantic-renderer/lib/geometry";
import type { Item, Scene } from "@/transformers/semantic-renderer/lib/track/scene";

/** Room a group region keeps below its lowest member. */
const REGION_BOTTOM = 14;
/** How far a region's caption sits in from its band's left edge. */
const REGION_CAPTION_INSET = 6;

/** A frame's box once the scene is spaced, and how deep in frames it sits. */
interface FrameShape {
	readonly id: string;
	readonly box: Box;
	readonly depth: number;
}

/** A group region's band and caption once the scene is spaced. */
interface RegionShape {
	readonly group: string;
	readonly parent: string | undefined;
	readonly box: Box;
	readonly caption: Box;
	readonly depth: number;
}

/** A frame or group region, with everything it holds. */
interface Container {
	/** Room it keeps below the lowest thing it holds. */
	readonly inset: number;
	/** Its title row or caption, and every card, title row and label it holds, however deep. */
	readonly items: readonly Item[];
	/** Every frame and region inside it, however deep. */
	readonly inner: Container[];
}

/** Every frame and group region of a scene, with what each holds. */
class Containers {
	readonly frames = new Map<string, Container>();
	readonly regions: Container[];

	/**
	 * Read what each frame and region holds.
	 * @param scene The placed scene.
	 * @param edges The placed relationships, whose labels a container holds when it holds both ends.
	 */
	constructor(
		readonly scene: Scene,
		readonly edges: ReadonlyMap<string, ElkExtendedEdge>,
	) {
		for (const [id, { members }] of scene.frames)
			this.frames.set(id, this.container(CONTAINER_INSET, scene.titles.get(id)!, members));
		this.regions = scene.regions.map((region) =>
			this.container(REGION_BOTTOM, region.caption, this.regionInside(region.members)),
		);
		for (const [id, frame] of this.frames)
			frame.inner.push(...this.within(new Set(scene.frames.get(id)!.members), id));
		scene.regions.forEach(({ members }, index) =>
			this.regions[index]!.inner.push(...this.within(new Set(this.regionInside(members)))),
		);
	}

	/**
	 * Everything a region holds: its members, and everything inside the frames among them.
	 * @param members Its members.
	 * @returns The ids.
	 */
	regionInside(members: readonly string[]): string[] {
		return members.flatMap((id) => [id, ...(this.scene.frames.get(id)?.members ?? [])]);
	}

	/**
	 * A container holding some members.
	 * @param inset Room it keeps below them.
	 * @param head Its title row or caption.
	 * @param members Every member, however deep.
	 * @returns The container, with nothing inside it yet.
	 */
	container(inset: number, head: Item, members: readonly string[]): Container {
		const inside = new Set(members);
		const { scene } = this;
		const labels = [...scene.labels]
			.filter(([edge]) => {
				const placed = this.edges.get(edge)!;
				return inside.has(placed.sources[0]!) && inside.has(placed.targets[0]!);
			})
			.map(([, item]) => item);
		const held = members.flatMap((id) => scene.cards.get(id) ?? scene.titles.get(id) ?? []);
		return { inset, items: [head, ...held, ...labels], inner: [] };
	}

	/**
	 * The frames and regions inside some members: the frames among them, and
	 * the regions that sit in the frame itself or in one of those.
	 * @param inside The members.
	 * @param frame The frame they belong to, if any.
	 * @returns The containers.
	 */
	within(inside: ReadonlySet<string>, frame?: string): Container[] {
		const frames = [...this.frames].filter(([id]) => inside.has(id));
		const regions = this.scene.regions.flatMap(({ parent }, index) =>
			parent !== undefined && (parent === frame || inside.has(parent))
				? [this.regions[index]!]
				: [],
		);
		return [...frames.map(([, container]) => container), ...regions];
	}

	/**
	 * Where a container's bottom edge stands once the scene is spaced: one
	 * inset below the lowest thing it holds, the containers inside it included.
	 * @param container The container.
	 * @param left How far every x moves.
	 * @returns The height.
	 */
	bottomOf(container: Container, left: number): number {
		const items = container.items.map((item) => {
			const box = this.scene.moved(item, left);
			return box.y + box.height;
		});
		const inner = container.inner.map((one) => this.bottomOf(one, left));
		return Math.max(...items, ...inner) + container.inset;
	}

	/**
	 * How far below each band the containers that end on it reach, before
	 * spacing: a container ends on the band of the lowest thing it holds.
	 * @returns The reach below each band, nothing where no container ends.
	 */
	closings(): number[] {
		const closing = this.scene.bands.map(() => 0);
		for (const container of [...this.frames.values(), ...this.regions]) {
			const band = lastBand(container);
			closing[band] = Math.max(closing[band]!, reach(container, band));
		}
		return closing;
	}
}

/**
 * The lowest band a container holds anything on.
 * @param container The container.
 * @returns The band.
 */
function lastBand(container: Container): number {
	return Math.max(...container.items.map(({ band }) => band));
}

/**
 * How far below a band a container ending on it reaches: its inset below the
 * containers inside it that end there too.
 * @param container The container.
 * @param band The band it ends on.
 * @returns The reach.
 */
function reach(container: Container, band: number): number {
	const inner = container.inner.filter((one) => lastBand(one) === band);
	return container.inset + Math.max(0, ...inner.map((one) => reach(one, band)));
}

/**
 * Every frame: Graphviz's width, from its title row down to one inset below
 * everything it holds, the labels of its relationships and the containers
 * inside it included.
 * @param scene The spaced scene.
 * @param edges The placed relationships.
 * @param left How far every x moves.
 * @returns The frames' shapes.
 */
function frameShapes(
	scene: Scene,
	edges: ReadonlyMap<string, ElkExtendedEdge>,
	left: number,
): FrameShape[] {
	const containers = new Containers(scene, edges);
	return [...scene.frames].map(([id, { node, depth }]) => {
		const title = scene.moved(scene.titles.get(id)!, left);
		const bottom = containers.bottomOf(containers.frames.get(id)!, left);
		const box = { x: node.x! + left, y: title.y, width: node.width!, height: bottom - title.y };
		return { id, box, depth };
	});
}

/**
 * Every group region: Graphviz's width, from its caption row down to below
 * everything it holds, the labels of its relationships and the frames inside
 * it included.
 * @param scene The spaced scene.
 * @param edges The placed relationships.
 * @param left How far every x moves.
 * @returns The regions' shapes.
 */
function regionShapes(
	scene: Scene,
	edges: ReadonlyMap<string, ElkExtendedEdge>,
	left: number,
): RegionShape[] {
	const containers = new Containers(scene, edges);
	return scene.regions.map((region, index) => {
		const centred = scene.moved(region.caption, left);
		// The caption reads from the band's top-left corner, as a frame's title does.
		const caption = { ...centred, x: region.box.x + left + REGION_CAPTION_INSET };
		const bottom = containers.bottomOf(containers.regions[index]!, left);
		const depth =
			region.parent === undefined ? 0 : (scene.frames.get(region.parent)?.depth ?? 0) + 1;
		const box = { x: region.box.x + left, y: caption.y, width: region.box.width, height: 0 };
		return {
			group: region.group,
			parent: region.parent,
			box: { ...box, height: bottom - caption.y },
			caption,
			depth,
		};
	});
}

export { Containers, frameShapes, regionShapes, type FrameShape, type RegionShape };

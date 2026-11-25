// What a reading hands the renderer: the parts and lines it draws, each card with only its drawing
// fields. A door says only its name and which way it lies, and a part shows where its code lives.

import type { VariantContent } from "#shared/schemas/content.ts";
import { containersOf, type DrawnEdge, type OverviewLine } from "#shared/rules/scope.ts";
import { codePathOf } from "#shared/rules/code-path.ts";
import { withToggle, type Toggle, type Toggles } from "#shared/rules/model-expansion.ts";
import { containment } from "#shared/rules/module-fold.ts";

type Node = VariantContent["nodes"][number];

/** A card as a picture draws it: the code path is read for the picture and stored nowhere. */
type DrawnNode = Node & {
	readonly codePath?: string;
	readonly door?: DoorWay;
	readonly toggle?: Toggle;
};
/** Where a door lies in the tree from the open module. */
type DoorWay = "up" | "across" | "down";
/** What a reading hands the renderer. */
type DrawnContent = Omit<VariantContent, "nodes" | "edges"> & {
	nodes: DrawnNode[];
	edges: DrawnEdge[];
};

/**
 * Keep only drawing fields and containment that this reading explicitly opens.
 * A door is a card with a name only (rule 5).
 * @param complete The full model content.
 * @param visible Modules present in this reading.
 * @param connections Its projected lines.
 * @param framing What the picture nests, and which of its cards are doors.
 * @param framing.parents Containers whose visible children remain nested.
 * @param framing.doors The modules outside the reading that a line reaches. One that holds parts is a door, and one with none has nothing to open, so it stands as its card.
 * @param framing.toggles What a door and a frame offer a live reader, if one draws the picture.
 * @returns Renderer content without private evidence or file metadata.
 */
function drawingContent(
	complete: VariantContent,
	visible: ReadonlySet<string>,
	connections: readonly OverviewLine[],
	framing: { parents: ReadonlySet<string>; doors: readonly Node[]; toggles?: Toggles | undefined },
): DrawnContent {
	const doors = new Set(framing.doors.map((node) => node.id));
	const parentOf = new Map(complete.nodes.map((node) => [node.id, node.parent]));
	const [open] = framing.parents;
	const childrenOf = containment(complete);
	return {
		nodes: complete.nodes
			.filter((node) => visible.has(node.id))
			.map((node) => {
				const { description: _description, binding: _binding, ...drawn } = node;
				const card = withToggle(
					doors.has(node.id) && childrenOf.has(node.id)
						? nameOnly(drawn, doorWay(parentOf, node.id, open))
						: withCodePath(drawn, node, childrenOf),
					framing.toggles,
				);
				if (node.parent !== undefined && framing.parents.has(node.parent)) return card;
				const { parent: _parent, ...unframed } = card;
				return unframed;
			}),
		edges: connections.map((connection) => {
			const { anchor: _anchor, description: _description, ...line } = connection.line;
			return line;
		}),
		flows: [],
		walkthroughs: [],
	};
}

/**
 * A door says only what it is called, and which way it lies.
 * @param card The drawn module.
 * @param door Which way it lies from the open module.
 * @returns The card without its responsibility.
 */
function nameOnly(card: DrawnNode, door: DoorWay): DrawnNode {
	const { responsibility: _responsibility, ...named } = card;
	return { ...named, door };
}

/**
 * Where a door lies in the tree from the open module.
 * @param parentOf Each module's parent, by identity.
 * @param door The door's module.
 * @param open The open module, if the reading has one.
 * @returns Whether it lies higher, level or deeper.
 */
function doorWay(
	parentOf: ReadonlyMap<string, string | undefined>,
	door: string,
	open: string | undefined,
): DoorWay {
	const levels =
		open === undefined
			? 0
			: containersOf(parentOf, door).length - containersOf(parentOf, open).length;
	if (levels === 0) return "across";
	return levels < 0 ? "up" : "down";
}

/**
 * A part shows where its code lives (rule 8).
 * @param card The drawn module.
 * @param node The authored module.
 * @param childrenOf The containment index.
 * @returns The card with its path row, when it has one.
 */
function withCodePath(
	card: DrawnNode,
	node: Node,
	childrenOf: ReadonlyMap<string, readonly Node[]>,
): DrawnNode {
	const codePath = codePathOf(node, childrenOf);
	return codePath === undefined ? card : { ...card, codePath };
}

export { drawingContent, type DrawnContent };

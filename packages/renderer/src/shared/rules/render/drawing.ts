// Measurement and placement meet here; painters consume these values unchanged.
import type { SemanticEdge, SemanticNode } from "@archboard/board/content";
import type { DiagramFont } from "#shared/rules/text/fonts.ts";
import type { Box } from "#shared/rules/geometry.ts";
import type { Curve } from "#shared/rules/layout/routes/curves.ts";

/** One measured line, positioned relative to its card or label box. */
interface TextRun {
	readonly text: string;
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly font: DiagramFont;
	readonly fontSize: number;
	readonly role: "title" | "note" | "label";
}

/** Text and minimum dimensions supplied to the layout engine. */
interface MeasuredNode {
	readonly node: SemanticNode;
	readonly width: number;
	readonly height: number;
	/** Zero for a card; the reserved title area for a containing node. */
	readonly headerHeight: number;
	readonly runs: readonly TextRun[];
	/**
	 * A container's header as it stands at each width it can take, from its
	 * least, this node itself, to the width its words take one line each at;
	 * each wider one is shorter. A layout picks one once it knows how wide the
	 * container is (TASK-486). Absent where the header has one height.
	 */
	readonly headers?: readonly MeasuredNode[];
	/**
	 * For a card whose lines down leave it from its points, as out of a
	 * flowchart's decision: how far in from the left and right edges of its
	 * box the lines from its side points run down (`shared/rules/track/routes/points.ts`). A third
	 * line leaves from the middle. Absent on a card whose lines spread along
	 * its face.
	 */
	readonly pointed?: number;
}

/** A relationship label whose words and box are settled before routing. */
interface MeasuredLabel {
	readonly width: number;
	readonly height: number;
	readonly runs: readonly TextRun[];
	/**
	 * The chips the label stands on, from the top of its box: one for a label,
	 * and one for each relationship a joined line stacks (ADR 0052).
	 */
	readonly chips: readonly { readonly y: number; readonly height: number }[];
}

/** How a relationship's line is drawn, as the vault's policy says, where crossings are settled. */
interface LineLook {
	readonly dash: "solid" | "dashed" | "dotted";
	readonly arrowhead: "filled" | "open" | "none";
}

/** All measured subjects, keyed by their existing architectural identities. */
interface MeasuredArchitecture {
	readonly nodes: ReadonlyMap<string, MeasuredNode>;
	readonly labels: ReadonlyMap<string, MeasuredLabel>;
	/** How each line is drawn, by relationship id: its dash and its head, as the vault's policy says. */
	readonly lines: ReadonlyMap<string, LineLook>;
	/** The group each node is placed with, and each placing group's measured caption (TASK-347). */
	readonly groups?: MeasuredGroups | undefined;
}

/** Which group places each node, and the caption each placing group is drawn with. */
interface MeasuredGroups {
	/**
	 * A node's placing group, by node id, as regions gather it; a node with
	 * none is absent, as is one inside a container its group places, which
	 * stands in that group's region already.
	 */
	readonly placing: ReadonlyMap<string, string>;
	/** Each placing group's name, measured as its region caption. */
	readonly captions: ReadonlyMap<string, MeasuredLabel>;
}

/** One card or containing frame, in the final drawing coordinate space. */
interface DrawingNode {
	readonly measured: MeasuredNode;
	readonly box: Box;
	readonly depth: number;
}

/** A group's region: the cards one group places inside one container, gathered and captioned. */
interface DrawingRegion {
	readonly group: string;
	/** The container the region sits in; absent on the board itself. */
	readonly parent?: string | undefined;
	/**
	 * The cards and containers the board places in this group inside that
	 * container, which a viewer lights the region for.
	 */
	readonly members: readonly string[];
	readonly box: Box;
	/** Where its caption sits, and its words. */
	readonly caption: { readonly box: Box; readonly measured: MeasuredLabel };
	readonly depth: number;
}

/** A final route and its optional measured label in the same coordinates. */
interface DrawingEdge {
	readonly edge: SemanticEdge;
	readonly curve: Curve;
	readonly path: string;
	readonly label?: { readonly box: Box; readonly measured: MeasuredLabel };
}

/** Architecture diagrams read top to bottom. */
type ReadingDirection = "down";

/** The single geometry result consumed by both SVG painting and the atlas. */
interface ArchitectureDrawing {
	/** Which way this content reads on the page. */
	readonly direction: ReadingDirection;
	readonly width: number;
	readonly height: number;
	readonly cards: readonly DrawingNode[];
	readonly containers: readonly DrawingNode[];
	readonly edges: readonly DrawingEdge[];
	/** Group regions, when the engine gathers groups (TASK-347). */
	readonly regions?: readonly DrawingRegion[] | undefined;
}

/** A raised arc where one route crosses others, on the route that carries it. */
interface DrawingBridge {
	readonly edgeId: string;
	readonly under: readonly string[];
	readonly curve: Curve;
	/** A join on the upper line stands on this piece: the cut clears its mark too. */
	readonly join?: true;
}

/**
 * The drawing as the painter draws it: the routes with their bridges spliced
 * in, beside the un-bridged routes that identify their corridors. The layout
 * owner returns both, so painter, atlas and interaction share one geometry.
 */
interface PaintedDrawing extends ArchitectureDrawing {
	readonly bridged: {
		readonly edges: readonly DrawingEdge[];
		readonly bridges: readonly DrawingBridge[];
	};
}

export type {
	ReadingDirection,
	TextRun,
	MeasuredNode,
	MeasuredLabel,
	LineLook,
	MeasuredArchitecture,
	MeasuredGroups,
	DrawingNode,
	DrawingRegion,
	DrawingEdge,
	ArchitectureDrawing,
	DrawingBridge,
	PaintedDrawing,
};

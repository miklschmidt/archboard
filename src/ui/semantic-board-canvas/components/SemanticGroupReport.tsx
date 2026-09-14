import type { JSX } from "react";

import type { SemanticEdge, SemanticNode } from "@/shared/semantic-board/index";
import { Section } from "@/ui/semantic-board-canvas/components/SemanticInspectorParts";
import type { GroupFocus } from "@/ui/semantic-board-canvas/lib/groups";

/** Inputs for the inspection's complete semantic report. */
interface SemanticGroupReportProps {
	/** The shared inspection, including which members the current picture hides. */
	focus: GroupFocus;
}

/**
 * Read the whole group without changing the view or expanding containers.
 * @param props The group under inspection.
 * @returns A keyboard-accessible disclosure over the diagram.
 */
function SemanticGroupReport(props: SemanticGroupReportProps): JSX.Element {
	const { focus } = props;
	const { inspection } = focus;
	const hidden = new Set(focus.hidden.map((node) => node.id));
	const names = new Map(
		[...inspection.members, ...inspection.neighbors].map((node) => [node.id, node.name]),
	);
	return (
		<details data-slot="semantic-group-report">
			<summary className="text-control hover:bg-accent focus-visible:ring-ring cursor-pointer rounded-sm px-2 py-1 focus-visible:ring-2">
				Details
			</summary>
			<div
				aria-label={`${focus.label} group inspection`}
				className="border-border bg-card absolute top-full left-0 z-20 mt-2 max-h-[70vh] w-[360px] overflow-y-auto border"
			>
				<Section title="Members">
					<NodeList nodes={inspection.members} hidden={hidden} />
				</Section>
				<Section title="Internal relationships">
					<EdgeList edges={inspection.internalEdges} names={names} />
				</Section>
				<Section title="Boundary relationships">
					{inspection.boundaryEdges.length === 0 ? (
						<p>None</p>
					) : (
						<ul className="text-body space-y-2">
							{inspection.boundaryEdges.map(({ edge, direction }) => (
								<li key={edge.id} data-edge={edge.id} data-direction={direction}>
									<span className="text-muted-foreground">{direction}: </span>
									{edgeText(edge, names)}
								</li>
							))}
						</ul>
					)}
				</Section>
				<Section title="Immediate external neighbors">
					<NodeList nodes={inspection.neighbors} />
				</Section>
			</div>
		</details>
	);
}

/** Inputs for a list of members or immediate neighbors. */
interface NodeListProps {
	/** The nodes in semantic document order. */
	nodes: readonly SemanticNode[];
	/** Members absent from the current drawing. */
	hidden?: ReadonlySet<string>;
}

/**
 * Identify each node, including members that cannot be clicked in this view.
 * @param props The nodes and their visibility.
 * @returns The list or its empty state.
 */
function NodeList(props: NodeListProps): JSX.Element {
	const { nodes, hidden } = props;
	if (nodes.length === 0) return <p className="text-body">None</p>;
	return (
		<ul className="text-body space-y-2">
			{nodes.map((node) => (
				<li key={node.id} data-node={node.id} data-hidden={hidden?.has(node.id) ?? false}>
					{node.name} <span className="text-muted-foreground">({node.id})</span>
					{hidden?.has(node.id) === true && (
						<span className="text-muted-foreground"> — hidden in this view</span>
					)}
				</li>
			))}
		</ul>
	);
}

/** Inputs for relationships internal to the group. */
interface EdgeListProps {
	/** The relationships in semantic document order. */
	edges: readonly SemanticEdge[];
	/** Names for the members and immediate neighbors at their ends. */
	names: ReadonlyMap<string, string>;
}

/**
 * List internal relationships with their authored direction.
 * @param props The relationships and endpoint names.
 * @returns The list or its empty state.
 */
function EdgeList(props: EdgeListProps): JSX.Element {
	const { edges, names } = props;
	if (edges.length === 0) return <p className="text-body">None</p>;
	return (
		<ul className="text-body space-y-2">
			{edges.map((edge) => (
				<li key={edge.id} data-edge={edge.id}>
					{edgeText(edge, names)}
				</li>
			))}
		</ul>
	);
}

/**
 * A relationship's identity, endpoints and meaning, including hidden wiring.
 * @param edge The relationship.
 * @param names Names of its endpoints.
 * @returns The directed relationship in words.
 */
function edgeText(edge: SemanticEdge, names: ReadonlyMap<string, string>): string {
	return `${names.get(edge.from) ?? edge.from} → ${names.get(edge.to) ?? edge.to}: ${edge.label ?? edge.kind} (${edge.id})`;
}

export { SemanticGroupReport };

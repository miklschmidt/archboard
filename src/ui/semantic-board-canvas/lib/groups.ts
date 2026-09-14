// What one group looks like from inside a pane: who is offered, what is under
// inspection, which of its members the picture on screen actually draws, and
// which drawn subjects are lit, kept readable, or left to recede.
//
// Everything semantic here comes from the one pure inspection the CLI runs
// (`inspectGroup` in `@/shared/semantic-board`), over the whole variant. What
// this adds is the picture: a member the current view does not draw is still a
// member and is reported as hidden, an ancestor the picture draws around a
// member is context and never a member, and no membership is ever inferred
// from containment (ADR 0023).

import {
	groupsUsed,
	inspectGroup,
	type GroupInspection,
	type SemanticNode,
	type SemanticVariant,
} from "@/shared/semantic-board/index";
import type { SemanticPolicy } from "@/shared/semantic-policy/index";
import type { SemanticAtlas } from "@/ui/semantic-board-canvas/api/semantic-boards";
import { subjectBox } from "@/ui/semantic-board-canvas/lib/subjects";

/** What the vault calls each group, by id. */
type GroupNames = SemanticPolicy["groups"];

/** One group a pane offers for inspection. */
interface GroupChoice {
	/** The id boards carry. */
	readonly id: string;
	/** What the vault calls it, or the id itself when the vault no longer defines it. */
	readonly label: string;
	/** Whether the vault configuration defines it. */
	readonly configured: boolean;
}

/**
 * What to call a group where a person reads it.
 * @param id The group's id.
 * @param names What the vault calls each group.
 * @returns The configured name, or the id when there is none.
 */
function groupLabel(id: string, names: GroupNames): string {
	return Object.hasOwn(names, id) ? (names[id]?.name ?? id) : id;
}

/**
 * Every group the variant on screen uses, named for choosing between.
 *
 * Unresolved ids are offered too: the board says them, and a reader has to be
 * able to ask what they are, which is exactly how a removed definition is
 * found and repaired.
 * @param variant The variant on screen, or null while there is none.
 * @param names What the vault calls each group.
 * @returns The choices, in canonical id order.
 */
function groupChoices(variant: SemanticVariant | null, names: GroupNames): GroupChoice[] {
	if (variant === null) {
		return [];
	}
	return groupsUsed(variant.content).map((id) => ({
		id,
		label: groupLabel(id, names),
		configured: Object.hasOwn(names, id),
	}));
}

/** Which drawn subjects a group inspection lights, keeps readable, or leaves as context. */
interface GroupEmphasis {
	/** Members the picture draws, and the wiring between them. */
	readonly members: ReadonlySet<string>;
	/** Immediate neighbours and the connections that cross the boundary. */
	readonly boundary: ReadonlySet<string>;
	/** Containers around members that the picture draws, which are not members. */
	readonly context: ReadonlySet<string>;
}

/** One group under inspection, read against the picture on screen. */
interface GroupFocus {
	/** The group's id. */
	readonly group: string;
	/** What to call it. */
	readonly label: string;
	/** Whether the vault configuration still defines it. */
	readonly configured: boolean;
	/** What the group is, on the whole variant. */
	readonly inspection: GroupInspection;
	/** Members the picture on screen draws. */
	readonly drawn: readonly SemanticNode[];
	/** Members the picture on screen does not draw: hidden by the view, or inside a collapsed container. */
	readonly hidden: readonly SemanticNode[];
	/** What to light, keep readable, and treat as context. */
	readonly emphasis: GroupEmphasis;
}

/**
 * The containers above a node that the picture draws, outermost first.
 * @param node The node.
 * @param byId Every node of the variant, by id.
 * @param drawn Whether the picture draws a subject.
 * @returns The ids of the drawn ancestors.
 */
function drawnAncestors(
	node: SemanticNode,
	byId: ReadonlyMap<string, SemanticNode>,
	drawn: (id: string) => boolean,
): string[] {
	const found: string[] = [];
	const seen = new Set<string>([node.id]);
	let at = node.parent === undefined ? undefined : byId.get(node.parent);
	while (at !== undefined && !seen.has(at.id)) {
		seen.add(at.id);
		if (drawn(at.id)) {
			found.push(at.id);
		}
		at = at.parent === undefined ? undefined : byId.get(at.parent);
	}
	return found;
}

/**
 * Which drawn subjects the inspection lights, keeps readable, or treats as
 * context.
 * @param inspection What the group is.
 * @param nodes Every node of the variant.
 * @param drawn Whether the picture draws a subject.
 * @returns The three sets, disjoint: a member is never also context.
 */
function emphasisOf(
	inspection: GroupInspection,
	nodes: readonly SemanticNode[],
	drawn: (id: string) => boolean,
): GroupEmphasis {
	const byId = new Map(nodes.map((node) => [node.id, node]));
	const members = new Set(
		[
			...inspection.members.map((member) => member.id),
			...inspection.internalEdges.map((edge) => edge.id),
		].filter(drawn),
	);
	const boundary = new Set(
		inspection.boundaryEdges
			.flatMap((crossing) => [crossing.edge.id, crossing.neighbor])
			.filter(drawn),
	);
	const context = new Set(
		inspection.members
			.flatMap((member) => drawnAncestors(member, byId, drawn))
			.filter((ancestor) => !members.has(ancestor) && !boundary.has(ancestor)),
	);
	return { members, boundary, context };
}

/**
 * One group, inspected on the variant on screen and read against its picture.
 * @param variant The variant on screen.
 * @param group The group's id.
 * @param names What the vault calls each group.
 * @param atlas Where the picture put every subject, or null while there is no picture.
 * @returns The focus.
 */
function groupFocus(
	variant: SemanticVariant,
	group: string,
	names: GroupNames,
	atlas: SemanticAtlas | null,
): GroupFocus {
	const inspection = inspectGroup(variant.content, group);
	/**
	 * Whether the picture on screen draws one subject.
	 * @param id The subject's id.
	 * @returns True when the atlas places it.
	 */
	const drawn = (id: string): boolean => atlas !== null && subjectBox(atlas, id) !== null;
	return {
		group,
		label: groupLabel(group, names),
		configured: Object.hasOwn(names, group),
		inspection,
		drawn: inspection.members.filter((member) => drawn(member.id)),
		hidden: inspection.members.filter((member) => !drawn(member.id)),
		emphasis: emphasisOf(inspection, variant.content.nodes, drawn),
	};
}

export {
	type GroupChoice,
	type GroupEmphasis,
	type GroupFocus,
	type GroupNames,
	groupChoices,
	groupFocus,
	groupLabel,
};

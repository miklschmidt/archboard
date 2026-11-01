// Which groups a pane offers, and what choosing one selects: every member of
// it, across whatever contains each one.
//
// Membership is read from the board (`isMemberOf` in `@archboard/board/content`),
// never inferred from containment or from the regions the picture draws (ADR
// 0023): a member the view hides is still a member, and simply is not drawn to
// be seen selected.

import { groupsUsed, isMemberOf } from "@archboard/board/content";
import type { VariantContent } from "@archboard/board/content";
import type { SemanticPolicy } from "@archboard/board/policy";

/** What the vault calls each group, and its colour, by id. */
type GroupNames = SemanticPolicy["groups"];

/** One group a pane offers. */
interface GroupChoice {
	/** The id boards carry. */
	readonly id: string;
	/** What the vault calls it, or the id itself when the vault no longer defines it. */
	readonly label: string;
	/** Whether the vault configuration defines it. */
	readonly configured: boolean;
	/** Its colour's name, when the vault defines it. */
	readonly color: GroupNames[string]["color"] | undefined;
}

/** A chosen group, and its members. */
interface GroupSelection {
	/** The group's id. */
	readonly group: string;
	/** The ids of its members. */
	readonly members: readonly string[];
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
 * Every group the variant on screen uses, with its name and colour.
 *
 * An id the vault no longer defines is offered too: the board says it, and a
 * reader has to be able to find what carries it, which is how a removed
 * definition is found and repaired.
 * @param content The complete reading, or null while unavailable.
 * @param names What the vault calls each group.
 * @returns The choices, in canonical id order.
 */
function groupChoices(content: VariantContent | null, names: GroupNames): GroupChoice[] {
	if (content === null) {
		return [];
	}
	return groupsUsed(content).map((id) => {
		const configured = Object.hasOwn(names, id);
		return {
			id,
			label: groupLabel(id, names),
			configured,
			color: configured ? names[id]?.color : undefined,
		};
	});
}

/**
 * What choosing a group selects.
 * @param content The complete reading.
 * @param group The group's id.
 * @returns The group and its members.
 */
function groupSelection(content: VariantContent, group: string): GroupSelection {
	const members = content.nodes.filter((node) => isMemberOf(node, group)).map((node) => node.id);
	return { group, members };
}

export {
	type GroupChoice,
	type GroupNames,
	type GroupSelection,
	groupChoices,
	groupLabel,
	groupSelection,
};

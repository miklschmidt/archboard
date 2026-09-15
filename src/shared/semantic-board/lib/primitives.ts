// The words every part of a board is spelled with.
//
// They live apart from the things that use them because a node, a flow and a
// view all need the same name and the same identity, and a module that imported
// its neighbour for them would have to import it back.

import { z } from "zod";
import { BLOCK_ID_RE } from "@/shared/ids/ids";
import { VocabularyNameSchema } from "@/shared/semantic-policy/index";

const MAX_NAME = 120;
const MAX_RESPONSIBILITY = 200;
const MAX_DESCRIPTION = 2000;
const NonBlankTextSchema = z.string().trim().min(1).regex(/\S/u, "must not be blank");
const SingleLineTextSchema = NonBlankTextSchema.regex(/^[^\n]*$/u, "must be a single line");

/**
 * An identity minted by the repository's one minting site. The shape is the
 * block-id alphabet, so an id can be written anywhere a board id can be
 * written. `BLOCK_ID_RE` is the shared authority used here and by `isBlockId`.
 */
const SemanticIdSchema = z
	.string()
	.regex(BLOCK_ID_RE, "must be one to eight characters of the block-id alphabet");

/** A name a person reads. One line, trimmed, never empty. */
const DisplayNameSchema = SingleLineTextSchema.max(MAX_NAME);

/** A concise explanation of what a node is for; the renderer wraps its lines. */
const ResponsibilitySchema = NonBlankTextSchema.max(MAX_RESPONSIBILITY);

/**
 * The id of one configured group, as the vault configuration keys it.
 *
 * An id rather than a label, so that renaming what a reader sees changes no
 * board: the name lives in `groups` of the vault policy, and a board carries
 * only the stable key. Spelled with the vocabulary-name grammar every other
 * configured key uses.
 */
const GroupIdSchema = VocabularyNameSchema;

/**
 * What a node belongs to, which is not what contains it.
 *
 * A set of configured group ids, written as an array because JSON has no set.
 * The array is held to being the canonical spelling of that set — no id twice,
 * and in one order — so that two variants that mean the same memberships read
 * the same, and reordering alone can never look like a change. Membership is
 * explicit: a node inherits nothing from its parent, because being inside
 * something is already said by `parent` and saying it twice would leave the
 * two to disagree.
 */
const GroupMembershipsSchema = z
	.array(GroupIdSchema)
	.refine(
		(ids) => sameSemanticOrder(ids, normalizeGroupIds(ids)),
		"group memberships must be unique and in canonical order",
	)
	.meta({ uniqueItems: true });

/**
 * The canonical spelling of a set of group ids: each once, in code-unit order.
 * @param ids The ids as written, in any order, possibly repeated.
 * @returns The same set as one array.
 */
function normalizeGroupIds(ids: readonly string[]): string[] {
	return [...new Set(ids)].toSorted();
}

/**
 * Whether two id lists are the same list.
 * @param one A list.
 * @param other Another.
 * @returns True when they read the same, element for element.
 */
function sameSemanticOrder(one: readonly string[], other: readonly string[]): boolean {
	return one.length === other.length && one.every((id, index) => id === other[index]);
}

/**
 * Memberships as a node persists them: the canonical spelling, or nothing at
 * all when there are none. Omitted and empty mean the same thing, and the
 * document keeps only the shorter of the two.
 * @param ids The ids as stated, or undefined when none were.
 * @returns The canonical array, or undefined for no membership.
 */
function persistedGroupIds(ids: readonly string[] | undefined): string[] | undefined {
	if (ids === undefined) {
		return undefined;
	}
	const canonical = normalizeGroupIds(ids);
	return canonical.length === 0 ? undefined : canonical;
}

/** The longer explanation, reached by inspecting a node rather than drawn on it. */
const DescriptionSchema = NonBlankTextSchema.max(MAX_DESCRIPTION);

export {
	SemanticIdSchema,
	DisplayNameSchema,
	GroupIdSchema,
	GroupMembershipsSchema,
	normalizeGroupIds,
	persistedGroupIds,
	ResponsibilitySchema,
	DescriptionSchema,
};

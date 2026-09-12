// The words every part of a board is spelled with.
//
// They live apart from the things that use them because a node, a flow and a
// view all need the same name and the same identity, and a module that imported
// its neighbour for them would have to import it back.

import { z } from "zod";
import { isBlockId } from "@/shared/ids/ids";

const MAX_NAME = 120;
const MAX_GROUP = 60;
const MAX_RESPONSIBILITY = 200;
const MAX_DESCRIPTION = 2000;

/**
 * An identity minted by the repository's one minting site. The shape is the
 * block-id alphabet, so an id can be written anywhere a board id can be
 * written, and `isBlockId` is the only judge of it.
 */
const SemanticIdSchema = z
	.string()
	.refine(isBlockId, "must be one to eight characters of the block-id alphabet");

/** A name a person reads. One line, trimmed, never empty. */
const DisplayNameSchema = z
	.string()
	.trim()
	.min(1)
	.max(MAX_NAME)
	.refine((value) => !value.includes("\n"), "must be a single line");

/** The one short line that says what a node is for. */
const ResponsibilitySchema = z
	.string()
	.trim()
	.min(1)
	.max(MAX_RESPONSIBILITY)
	.refine((value) => !value.includes("\n"), "must be a single line");

/**
 * What a node belongs to, which is not what contains it.
 *
 * A short label an agent chooses: "payments", "the write path", "third party".
 * One per node and no more, because a thing that belongs to two groups belongs
 * to neither as far as a reader glancing at a picture is concerned — and a node
 * inherits nothing from its parent, because being inside something is already
 * said by `parent` and saying it twice would leave the two to disagree.
 *
 * Shorter than a name on purpose. A group is read as a family of things rather
 * than as a sentence, and a label nobody can hold in their head is a label that
 * groups nothing.
 */
const GroupLabelSchema = z
	.string()
	.trim()
	.min(1)
	.max(MAX_GROUP)
	.refine((value) => !value.includes("\n"), "must be a single line");

/** The longer explanation, reached by inspecting a node rather than drawn on it. */
const DescriptionSchema = z.string().trim().min(1).max(MAX_DESCRIPTION);

export {
	SemanticIdSchema,
	DisplayNameSchema,
	GroupLabelSchema,
	ResponsibilitySchema,
	DescriptionSchema,
};

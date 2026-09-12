// What a variant holds, in the sentence an agent reads before anything else.
//
// Counts and the names of what is on it, never a picture of it: the subjects
// themselves arrive as identities elsewhere in the same brief, and this is what
// says what sort of board this is at all. The voice coordinator reads it aloud,
// which is why the punctuation here is not decoration.

import type { SemanticVariant, VariantContent } from "@/shared/semantic-board/index";

/**
 * A count and the word for what it counts, pluralised.
 * @param count How many.
 * @param word What they are.
 * @returns The phrase.
 */
function many(count: number, word: string): string {
	return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * A variant's own summary as a sentence in the middle of others.
 *
 * Terminated when its author did not terminate it: the description is read
 * aloud by the voice coordinator, and a summary running into the sentence after
 * it is a sentence nobody wrote.
 * @param summary What the variant says about itself, when it says anything.
 * @returns The sentence, with a leading space, or the empty string.
 */
function sentence(summary: string | undefined): string {
	if (summary === undefined) {
		return "";
	}
	return /[.!?]$/u.test(summary) ? ` ${summary}` : ` ${summary}.`;
}

/**
 * The first few nodes by name, which is what makes a board recognisable.
 * @param content What the variant holds.
 * @returns The sentence, or the empty string when there are no nodes.
 */
function nodeNames(content: VariantContent): string {
	const shown = NAMED_IN_DESCRIPTION;
	const named = content.nodes.slice(0, shown).map((node) => node.name);
	if (named.length === 0) {
		return "";
	}
	const more = content.nodes.length > shown ? ", and more" : "";
	return ` Its nodes are ${named.join(", ")}${more}.`;
}

/**
 * How many of a variant's nodes a description names before it gives up: enough
 * to recognise a board by, and few enough that the sentence stays a sentence.
 */
const NAMED_IN_DESCRIPTION = 12;

/**
 * What a variant holds, in one line an agent reads before it reads anything else.
 *
 * Counts and the names of what is on it, never a picture of it: the subjects
 * themselves arrive as identities elsewhere in the same brief, and this is the
 * sentence that says what sort of board this is at all.
 * @param variant The variant.
 * @param content What it holds, after any view scope.
 * @param scoped Whether a view narrowed it.
 * @returns The description.
 */
function describeVariant(
	variant: SemanticVariant,
	content: VariantContent,
	scoped: boolean,
): string {
	const parts = [many(content.nodes.length, "node"), many(content.edges.length, "relationship")];
	if (content.flows.length > 0) {
		parts.push(many(content.flows.length, "flow"));
	}
	if (content.walkthroughs.length > 0) {
		parts.push(many(content.walkthroughs.length, "walkthrough"));
	}
	const through = scoped ? " through one of its views" : "";
	const summary = sentence(variant.summary);
	return (
		`"${variant.name}" is the ${variant.lifecycle} architecture${through}: ${parts.join(", ")}.` +
		`${summary}${nodeNames(content)}`
	);
}

export { describeVariant };

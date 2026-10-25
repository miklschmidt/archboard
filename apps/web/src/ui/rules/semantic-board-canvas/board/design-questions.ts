// The design questions the Board tab asks of the variant on screen (TASK-537),
// and the subjects each one's answer names, which a chosen question lights on
// the picture (ADR 0057).
//
// A question gives counts and names, never a score or a verdict (ADR 0044).

import { passThroughEntryPoints } from "@archboard/board/container-interface";
import type { VariantContent } from "@archboard/board/content";
import type { SemanticAtlas } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import { subjectBox } from "#ui/clients/semantic-board-canvas/subjects/subjects.ts";

/** A design question: for now the deletion test's, the entry points that only pass one call on. */
type DesignQuestion = "pass-through";

/** The design question a person chose, and the subjects its answer names. */
interface ChosenQuestion {
	readonly question: DesignQuestion;
	/** The ids of the parts its answer names, never empty. */
	readonly subjects: readonly string[];
}

/**
 * The entry points of a variant that only pass one call on.
 * @param content What the variant holds.
 * @returns Their ids.
 */
function passingOneCallOn(content: VariantContent): readonly string[] {
	return passThroughEntryPoints(content).map((found) => found.part.id);
}

/** What each question answers on a variant: the ids of the parts it names. */
const ANSWERS: Readonly<Record<DesignQuestion, (content: VariantContent) => readonly string[]>> = {
	"pass-through": passingOneCallOn,
};

/**
 * The subjects a question's answer names on a variant.
 * @param content What the variant holds.
 * @param question The question.
 * @returns The ids, empty when the variant gives the question nothing to name.
 */
function answerOf(content: VariantContent, question: DesignQuestion): readonly string[] {
	return ANSWERS[question](content);
}

/**
 * How many of an answer's subjects the picture on screen does not draw.
 * @param atlas Where every subject of the picture ended up.
 * @param subjects The subjects the answer names.
 * @returns The count.
 */
function hiddenBy(atlas: SemanticAtlas, subjects: readonly string[]): number {
	return subjects.filter((id) => subjectBox(atlas, id) === null).length;
}

export { answerOf, hiddenBy, type ChosenQuestion, type DesignQuestion };

// The design questions the Board tab asks of the variant on screen (TASK-537),
// the subjects each one's answer names, and what a person reads on the picture
// while they go through that answer one subject at a time (ADR 0057).
//
// A question gives counts and names, never a score or a verdict (ADR 0044).

import { passThroughEntryPoints } from "@archboard/board/container-interface";
import type { VariantContent } from "@archboard/board/content";
import { connectionsOf } from "#ui/rules/semantic-board-canvas/board/connections.ts";

/** A design question: for now the deletion test's, the entry points that only pass one call on. */
type DesignQuestion = "pass-through";

/** Where a person is in a design question's answer. */
interface QuestionStep {
	readonly question: DesignQuestion;
	/** The subject of the answer the person is at. */
	readonly at: string;
}

/** The design question a person chose, the subjects its answer names, and the one they are at. */
interface ChosenQuestion extends QuestionStep {
	/** The ids of the parts its answer names, never empty, `at` among them. */
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
 * The parts a step shows with the subject it is at: the other end of every
 * relationship that crosses the subject's edge, so the reader sees what calls
 * it and what it calls.
 * @param content What the variant holds.
 * @param at The subject.
 * @returns Their ids.
 */
function aroundStep(content: VariantContent, at: string): readonly string[] {
	const { sends, receives } = connectionsOf(content, at);
	return [...sends, ...receives].flatMap((link) =>
		link.other === undefined ? [] : [link.other.id],
	);
}

export { answerOf, aroundStep, type ChosenQuestion, type DesignQuestion, type QuestionStep };

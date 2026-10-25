// What the Archboard server says about the design questions of a vault, in one
// answer: `archboard semantic questions` and the pane's survey both parse it.
//
// It has one owner here. The route builds its answer with `designQuestionsReply`
// and the CLI and the pane parse it with `DesignQuestionsReplySchema`, so a
// field added on one side cannot be stripped by the other. Every object is
// strict, so no score, combined number or verdict can ride along (ADR 0044).
//
// The answer reads each board at its current variant. A board nobody has built
// has none, and a board that cannot be read has no content: each is listed as
// skipped with the reason, so it never reads as a board with nothing to ask.

import { z } from "zod";
import { designQuestions, type DesignQuestions } from "#shared/rules/inspect/design-questions.ts";
import type { SemanticVariant } from "#shared/schemas/board-document.ts";
import type { SemanticNode } from "#shared/schemas/content.ts";

/** A part or a container, as the board names it. */
const SubjectSchema = z.object({ id: z.string(), name: z.string(), kind: z.string() }).strict();

/** One container of a board, and the parts of it that the question names. */
const QuestionResultSchema = z
	.object({ board: z.string(), container: SubjectSchema, parts: z.array(SubjectSchema) })
	.strict();

/**
 * What one question found: how many containers and how many parts are listed
 * in `results`. The two counts say how much there is to read, not how much is
 * wrong.
 */
const QuestionSchema = z
	.object({
		containers: z.int().nonnegative(),
		parts: z.int().nonnegative(),
		results: z.array(QuestionResultSchema),
	})
	.strict();
type Question = z.infer<typeof QuestionSchema>;

/** A board the answer read, and the variant it read. */
const ReadBoardSchema = z
	.object({
		board: z.string(),
		variant: z.object({ id: z.string(), name: z.string() }).strict(),
		version: z.int(),
	})
	.strict();
type ReadBoard = z.infer<typeof ReadBoardSchema>;

/** Why a board was not read. */
const SkippedBoardSchema = z.discriminatedUnion("reason", [
	z.object({ reason: z.literal("no-current-variant"), board: z.string() }).strict(),
	z
		.object({ reason: z.literal("board-unreadable"), board: z.string(), detail: z.string() })
		.strict(),
]);
type SkippedBoard = z.infer<typeof SkippedBoardSchema>;

/** The route's answer: the boards read and skipped, and what each question found. */
const DesignQuestionsReplySchema = z
	.object({
		success: z.literal(true),
		boards: z.array(ReadBoardSchema),
		skipped: z.array(SkippedBoardSchema),
		questions: z
			.object({
				passThroughEntryPoints: QuestionSchema,
				containersWithNoHiddenPart: QuestionSchema,
				containersWithNoEntryPoint: QuestionSchema,
			})
			.strict(),
	})
	.strict();
type DesignQuestionsReply = z.infer<typeof DesignQuestionsReplySchema>;

/** A board at the variant the answer reads. */
interface BoardAtVariant {
	readonly name: string;
	readonly version: number;
	readonly variant: Pick<SemanticVariant, "id" | "name" | "content">;
}

/**
 * A node as the answer names it.
 * @param node The node.
 * @returns Its id, name and kind.
 */
function subjectOf(node: SemanticNode): z.infer<typeof SubjectSchema> {
	return { id: node.id, name: node.name, kind: node.kind };
}

/** The design questions found on one board. */
interface FoundOnBoard {
	readonly board: string;
	readonly questions: DesignQuestions;
}

/**
 * One question's results over every board read, in board order.
 * @param found What each board's variant found.
 * @param key Which question.
 * @returns The question's counts and its results.
 */
function questionOf(found: readonly FoundOnBoard[], key: keyof DesignQuestions): Question {
	const results = found.flatMap(({ board, questions }) =>
		questions[key].map(({ container, parts }) => ({
			board,
			container: subjectOf(container),
			parts: parts.map(subjectOf),
		})),
	);
	return {
		containers: results.length,
		parts: results.reduce((sum, result) => sum + result.parts.length, 0),
		results,
	};
}

/**
 * The answer to the design questions over some boards at their current
 * variants. The one function that builds it.
 * @param boards Each board read, at the variant it is read at.
 * @param skipped Each board that was not read, with the reason.
 * @returns The answer, in the order the boards are given.
 */
function designQuestionsReply(
	boards: readonly BoardAtVariant[],
	skipped: readonly SkippedBoard[],
): DesignQuestionsReply {
	const found = boards.map((one) => ({
		board: one.name,
		questions: designQuestions(one.variant.content),
	}));
	return DesignQuestionsReplySchema.parse({
		success: true,
		boards: boards.map((one): ReadBoard => ({
			board: one.name,
			variant: { id: one.variant.id, name: one.variant.name },
			version: one.version,
		})),
		skipped,
		questions: {
			passThroughEntryPoints: questionOf(found, "passThroughEntryPoints"),
			containersWithNoHiddenPart: questionOf(found, "containersWithNoHiddenPart"),
			containersWithNoEntryPoint: questionOf(found, "containersWithNoEntryPoint"),
		},
	});
}

export {
	DesignQuestionsReplySchema,
	type BoardAtVariant,
	type DesignQuestionsReply,
	type Question,
	type ReadBoard,
	type SkippedBoard,
	designQuestionsReply,
};

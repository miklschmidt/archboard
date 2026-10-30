// The Board tab's design questions (TASK-537): where understanding or changing
// the code may take more work than it should, asked of the variant on screen.
//
// The first question is the deletion test's: an entry point that only passes
// one call on (ADR 0044). Each is a question for the reader, never a fault, so
// the region states counts and names and no verdict. Each row is a step through
// the answer (ADR 0059): choosing it lights the whole answer, with what the row's
// part calls and what calls it, and brings that part in. The tab stays open, so
// the next row is one click away, and choosing the row of the current step again
// lets the question go. A row lights its part while the pointer rests on it,
// except the current step's, which is lit already, and can ask the agent of the
// pane's checkout what deleting it would cost. A board with nothing to ask has
// no region, which the Board tab decides before it draws one.

import { RiChat3Line } from "@remixicon/react";
import { useCallback, type JSX } from "react";

import type { passThroughEntryPoints } from "@archboard/board/container-interface";
import { IconButton } from "@archboard/ui-kit/components";
import { KindIcon } from "#ui/components/semantic-board-canvas/KindMarks.tsx";
import {
	SidebarChoice,
	SidebarChoices,
	SidebarGlyph,
	SidebarHeading,
	SidebarLabel,
	SidebarMeta,
	SidebarSection,
} from "#ui/components/semantic-board-canvas/SemanticSidebarParts.tsx";
import { usePaneAsk } from "#ui/hooks/semantic-board-canvas/use-pane-ask.ts";
import { usePaneVault } from "#ui/hooks/semantic-board-canvas/use-pane-vault.ts";
import { usePeekControl } from "#ui/hooks/semantic-board-canvas/use-peek.ts";
import { deletionQuestion } from "#ui/rules/semantic-board-canvas/board/deletion-question.ts";
import type {
	ChosenQuestion,
	QuestionStep,
} from "#ui/rules/semantic-board-canvas/board/design-questions.ts";
import type { KindLook } from "#ui/rules/semantic-board-canvas/board/kind-look.ts";

/** An entry point that only passes one call on, with its container. */
type PassThrough = ReturnType<typeof passThroughEntryPoints>[number];

/** Inputs for the design questions. */
interface DesignQuestionsProps {
	/** The board on screen. */
	readonly board: string;
	/** The variant on screen, by id. */
	readonly variant: string;
	/**
	 * Every entry point of that variant that only passes one call on, read off
	 * the whole variant before any view narrows it; never empty.
	 */
	readonly passing: readonly PassThrough[];
	readonly look: KindLook;
	/** The design question chosen, the subjects its answer names and the one the person is at, or null. */
	readonly question: ChosenQuestion | null;
	/**
	 * Step to a subject of a question's answer, or let the question go.
	 * @param step The question and the subject, or null to let go.
	 */
	readonly onChooseQuestion: (step: QuestionStep | null) => void;
}

/**
 * The design questions of the variant on screen.
 * @param props The board, the variant, the answers and where the person is in them.
 * @returns The section.
 */
function DesignQuestions(props: DesignQuestionsProps): JSX.Element {
	const { passing } = props;
	return (
		<SidebarSection title="Design questions" slot="semantic-board-design-questions">
			<section
				data-slot="semantic-board-question"
				data-question="pass-through"
				data-count={passing.length}
				aria-label="Entry points that pass one call on"
				className="flex flex-col gap-1"
			>
				<SidebarHeading level={3}>
					Entry points that pass one call on{" "}
					<span className="text-technical ml-0.5 font-mono font-normal">{passing.length}</span>
				</SidebarHeading>
				<p className="text-muted-foreground text-body">
					Would their callers lose anything if one were deleted?
				</p>
				<SidebarChoices
					label="Go to an entry point on the picture"
					slot="semantic-board-question-results"
				>
					{passing.map((found) => (
						<ResultRow key={found.part.id} found={found} {...props} />
					))}
				</SidebarChoices>
			</section>
		</SidebarSection>
	);
}

/** Inputs for one result. */
interface ResultRowProps extends DesignQuestionsProps {
	readonly found: PassThrough;
}

/**
 * One entry point that passes one call on: the step to it, and the question to
 * the agent where the pane has one.
 * @param props The entry point, its container, and where the person is.
 * @returns The row.
 */
function ResultRow(props: ResultRowProps): JSX.Element {
	const { found, look, onChooseQuestion } = props;
	const { container, part } = found;
	const current = props.question?.at === part.id;
	const { point } = usePeekControl();
	const aim = useCallback((): void => point(current ? null : part.id), [point, current, part.id]);
	const leave = useCallback((): void => point(null), [point]);
	const step = useCallback((): void => {
		point(null);
		onChooseQuestion(current ? null : { question: "pass-through", at: part.id });
	}, [point, onChooseQuestion, current, part.id]);
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-1">
			<SidebarChoice
				pressed={current}
				data-slot="semantic-board-question-result"
				data-part={part.id}
				data-container={container.id}
				onClick={step}
				onPointerEnter={aim}
				onPointerLeave={leave}
				onFocus={aim}
				onBlur={leave}
			>
				<SidebarGlyph>
					<KindIcon look={look} kind={part.kind} className="text-foreground/80 size-4" />
				</SidebarGlyph>
				<SidebarLabel>
					{part.name}
					<SidebarMeta>in {container.name}</SidebarMeta>
				</SidebarLabel>
			</SidebarChoice>
			<AskAboutDeletion {...props} />
		</div>
	);
}

/**
 * The question to the agent about deleting one entry point, where the pane has
 * an agent to ask.
 * @param props The entry point and where it is.
 * @returns The control, or nothing on a page with no agent.
 */
function AskAboutDeletion(props: ResultRowProps): JSX.Element | null {
	const { found, board, variant } = props;
	const ask = usePaneAsk();
	const vault = usePaneVault();
	const send = useCallback((): void => {
		ask?.(
			deletionQuestion(
				{ serverUrl: globalThis.location.origin, vault, board, variant },
				found.container,
				found.part,
			),
		);
	}, [ask, vault, board, variant, found]);
	if (ask === null) {
		return null;
	}
	return (
		<IconButton
			label={`Ask the agent what deleting ${found.part.name} would cost`}
			tip="Ask the agent"
			slot="semantic-board-question-ask"
			onClick={send}
		>
			<RiChat3Line />
		</IconButton>
	);
}

export { DesignQuestions };

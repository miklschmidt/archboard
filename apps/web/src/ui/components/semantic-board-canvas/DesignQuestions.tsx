// The Board tab's design questions (TASK-537): where understanding or changing
// the code may take more work than it should, asked of the variant on screen.
//
// The first question is the deletion test's: an entry point that only passes
// one call on (ADR 0044). Each is a question for the reader, never a fault, so
// the region states counts and names and no verdict. Choosing the question
// lights its answer on the picture and says how many of its subjects the view
// hides (ADR 0057). A row lights its part while the pointer rests on it, shows it
// on the picture when chosen, and can ask the agent of the pane's checkout what
// deleting it would cost. A board with nothing to ask has no region, which the
// Board tab decides before it draws one.

import { RiChat3Line, RiEyeLine } from "@remixicon/react";
import { useCallback, type JSX } from "react";

import type { PassThrough } from "@archboard/board/container-interface";
import { IconButton } from "@archboard/ui-kit/controls";
import type { SemanticAtlas } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
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
import {
	hiddenBy,
	type ChosenQuestion,
	type DesignQuestion,
} from "#ui/rules/semantic-board-canvas/board/design-questions.ts";
import type { KindLook } from "#ui/rules/semantic-board-canvas/board/kind-look.ts";

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
	/**
	 * Pick a part out and show it on the picture.
	 * @param id The part.
	 */
	readonly onShow: (id: string) => void;
	/** The design question chosen and the subjects its answer names, or null. */
	readonly question: ChosenQuestion | null;
	/** Where every subject of the picture on screen ended up, or null while none is drawn. */
	readonly atlas: SemanticAtlas | null;
	/**
	 * Choose a question, whose answer the picture lights, or let it go.
	 * @param question The question, or null to let go.
	 */
	readonly onChooseQuestion: (question: DesignQuestion | null) => void;
}

/**
 * The design questions of the variant on screen.
 * @param props The board, the variant, the answers and what showing a part does.
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
				<LightTheAnswer {...props} />
				<SidebarChoices
					label="Show an entry point on the picture"
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

/**
 * How many of the chosen question's answer the picture on screen does not draw.
 * @param props The question chosen, and where the picture drew each subject.
 * @returns The count: none while the question is not chosen or nothing is drawn.
 */
function hiddenOf(props: DesignQuestionsProps): number {
	const { question, atlas } = props;
	return question === null || atlas === null ? 0 : hiddenBy(atlas, question.subjects);
}

/**
 * The words of the choice: what it lights, and how many of that the view hides.
 * @param count How many the answer names.
 * @param hidden How many of them the view hides.
 * @returns What the choice says, and the fact under it, or null for none.
 */
function lightWords(
	count: number,
	hidden: number,
): { readonly name: string; readonly hides: string | null } {
	if (count === 1) {
		return { name: "Light it on the picture", hides: hidden === 0 ? null : "This view hides it" };
	}
	return {
		name: `Light all ${count} on the picture`,
		hides: hidden === 0 ? null : `This view hides ${hidden} of them`,
	};
}

/**
 * The choice that lights the question's answer on the picture, and lets it go.
 * While it is chosen it says how many of the answer the view hides: each of
 * those stands through the nearest container the view draws.
 * @param props The answer, the question chosen, and where the picture drew each subject.
 * @returns The choice.
 */
function LightTheAnswer(props: DesignQuestionsProps): JSX.Element {
	const { onChooseQuestion } = props;
	const chosen = props.question?.question === "pass-through";
	const toggle = useCallback((): void => {
		onChooseQuestion(chosen ? null : "pass-through");
	}, [onChooseQuestion, chosen]);
	const hidden = chosen ? hiddenOf(props) : 0;
	const { name, hides } = lightWords(props.passing.length, hidden);
	return (
		<SidebarChoices label="Light the answer on the picture" slot="semantic-board-question-light">
			<SidebarChoice
				pressed={chosen}
				data-slot="semantic-board-question-choice"
				data-question="pass-through"
				data-hidden={chosen ? hidden : undefined}
				onClick={toggle}
			>
				<SidebarGlyph>
					<RiEyeLine className="text-foreground/80 size-4" />
				</SidebarGlyph>
				<SidebarLabel>
					{name}
					{hides !== null && <SidebarMeta>{hides}</SidebarMeta>}
				</SidebarLabel>
			</SidebarChoice>
		</SidebarChoices>
	);
}

/** Inputs for one result. */
interface ResultRowProps extends DesignQuestionsProps {
	readonly found: PassThrough;
}

/**
 * One entry point that passes one call on: the choice that shows it, and the
 * question to the agent where the pane has one.
 * @param props The entry point, its container, and where it is.
 * @returns The row.
 */
function ResultRow(props: ResultRowProps): JSX.Element {
	const { found, look, onShow } = props;
	const { container, part } = found;
	const { point } = usePeekControl();
	const aim = useCallback((): void => point(part.id), [point, part.id]);
	const leave = useCallback((): void => point(null), [point]);
	const show = useCallback((): void => onShow(part.id), [onShow, part.id]);
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-1">
			<SidebarChoice
				data-slot="semantic-board-question-result"
				data-part={part.id}
				data-container={container.id}
				onClick={show}
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

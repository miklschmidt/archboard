// The Board tab's design questions (TASK-537): where understanding or changing
// the code may take more work than it should, asked of the variant on screen.
//
// The first question is the deletion test's: an entry point that only passes
// one call on (ADR 0044). Each is a question for the reader, never a fault, so
// the region states counts and names and no verdict. A row lights its part while
// the pointer rests on it, shows it on the picture when chosen, and can ask the
// agent of the pane's checkout what deleting it would cost. A board with nothing
// to ask has no region, which the Board tab decides before it draws one.

import { RiChat3Line } from "@remixicon/react";
import { useCallback, type JSX } from "react";

import type { PassThrough } from "@archboard/board/container-interface";
import { IconButton } from "@archboard/ui-kit/controls";
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
		<div className="flex min-w-0 items-start">
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
			className="text-muted-foreground hover:text-foreground shrink-0"
			onClick={send}
		>
			<RiChat3Line />
		</IconButton>
	);
}

export { DesignQuestions };

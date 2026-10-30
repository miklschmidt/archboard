import { RiErrorWarningLine } from "@remixicon/react";
import { useCallback, useState, type JSX } from "react";

import type { RememberedFindings } from "@archboard/code-intel/code-check";
import type { SemanticRender } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import type { BoardTab } from "#ui/components/semantic-board-canvas/PaneHeader.tsx";
import { useCodeFindings } from "#ui/hooks/semantic-board-canvas/use-code-findings.ts";

/** What the last pass found on one board at one variant. */
type RememberedReading = RememberedFindings["readings"][number];

/** The existing pane controls that a warning can use. */
interface CodeWarningsProps {
	readonly drawing: SemanticRender | undefined;
	readonly onDiagram: (tab: BoardTab) => void;
	/** Pick a subject out and show it on the diagram, as the About page's rows do. */
	readonly onShow: (id: string) => void;
}

/**
 * The count of warnings about exactly what this pane shows.
 * @param props The drawing and the pane's presentation controls.
 * @returns A warning control, or nothing before a pass read this version.
 */
function CodeWarnings(props: CodeWarningsProps): JSX.Element | null {
	const drawing = props.drawing;
	const reading = useCodeFindings(
		drawing === undefined
			? null
			: { board: drawing.board, variant: drawing.variant.id, version: drawing.version },
	);
	if (reading === null) return null;
	return (
		<WarningSteps
			key={`${reading.board}:${reading.variant}:${reading.version}:${reading.checkedAt}`}
			{...props}
			reading={reading}
		/>
	);
}

/**
 * Cycle the warnings of one pass, and focus each subject.
 * @param props The pass and the pane's presentation controls.
 * @returns The count control.
 */
function WarningSteps(
	props: CodeWarningsProps & { readonly reading: RememberedReading },
): JSX.Element {
	const { onDiagram, onShow } = props;
	const warnings = props.reading.findings.filter((finding) => finding.severity === "warning");
	const [position, setPosition] = useState(-1);
	const onNext = useCallback((): void => {
		const next = (position + 1) % warnings.length;
		const id = warnings[next]?.subject?.id;
		setPosition(next);
		if (id === undefined) onDiagram("diagram");
		else onShow(id);
	}, [position, warnings, onDiagram, onShow]);
	const current = warnings[position];
	return (
		<WarningCount
			count={warnings.length}
			message={current?.message}
			position={position}
			onNext={onNext}
		/>
	);
}

/**
 * Show the count and announce the selected warning.
 * @param props The warning control.
 * @param props.count The warning count.
 * @param props.message The selected warning message.
 * @param props.position The selected warning position.
 * @param props.onNext Select the next warning.
 * @returns The header button.
 */
function WarningCount(props: {
	readonly count: number;
	readonly message: string | undefined;
	readonly position: number;
	readonly onNext: () => void;
}): JSX.Element {
	const { count, message, position, onNext } = props;
	return (
		<button
			type="button"
			data-slot="code-warning-count"
			data-count={count}
			onClick={onNext}
			disabled={count === 0}
			aria-label={count === 0 ? "No code warnings" : `Show next code warning (${count})`}
			title={
				count === 0
					? "The last code check found no warnings"
					: (message ?? "Show the first code warning")
			}
			className="text-control text-foreground hover:bg-sidebar-accent focus-visible:ring-ring rounded-control disabled:text-muted-foreground disabled:[&_svg]:text-muted-foreground flex h-7 shrink-0 items-center gap-1.5 px-2 focus-visible:ring-2 focus-visible:outline-none disabled:hover:bg-transparent"
		>
			<RiErrorWarningLine aria-hidden="true" className="text-warning-foreground size-4" />
			<span className="tabular-nums">
				{count} {count === 1 ? "warning" : "warnings"}
			</span>
			<span aria-live="polite" className="sr-only">
				{message === undefined ? "" : `Warning ${position + 1} of ${count}: ${message}`}
			</span>
		</button>
	);
}

export { CodeWarnings, WarningCount };

import { RiErrorWarningLine } from "@remixicon/react";
import { useCallback, useEffect, useRef, useState, type JSX } from "react";

import type { RememberedReading } from "@/shared/code-check/index";
import { EXPLORING_MS } from "@/shared/timing/timing";
import type { SemanticRender } from "@/ui/semantic-board-canvas/api/semantic-boards";
import type { BoardTab } from "@/ui/semantic-board-canvas/components/PaneHeader";
import type { BoardCamera } from "@/ui/semantic-board-canvas/hooks/use-board-camera";
import { useCodeFindings } from "@/ui/semantic-board-canvas/hooks/use-code-findings";
import { subjectBox } from "@/ui/semantic-board-canvas/lib/subjects";

/** The existing pane controls that a warning can use. */
interface CodeWarningsProps {
	readonly drawing: SemanticRender | undefined;
	readonly camera: BoardCamera;
	readonly onPick: (id: string | null) => void;
	readonly onDiagram: (tab: BoardTab) => void;
	readonly onView: (view: string | null) => void;
	readonly reducedMotion: boolean;
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
	const { drawing, camera, onPick, onDiagram, onView, reducedMotion } = props;
	const warnings = props.reading.findings.filter((finding) => finding.severity === "warning");
	const [position, setPosition] = useState(-1);
	const pending = useRef<string | null>(null);
	const focus = useCallback(
		(id: string): boolean => {
			const box = drawing?.kind === "drawn" ? subjectBox(drawing.atlas, id) : null;
			return (
				box !== null &&
				camera.glide({ kind: "focus", rect: box }, reducedMotion ? 0 : EXPLORING_MS.reveal, true)
			);
		},
		[drawing, camera, reducedMotion],
	);
	useEffect(() => {
		if (pending.current !== null && focus(pending.current)) pending.current = null;
	}, [focus]);
	const onNext = useCallback((): void => {
		const next = (position + 1) % warnings.length;
		const id = warnings[next]?.subject?.id;
		setPosition(next);
		onDiagram("diagram");
		if (id === undefined) return;
		onPick(id);
		pending.current = focus(id) ? null : id;
		if (pending.current !== null) onView(null);
	}, [position, warnings, onDiagram, onPick, focus, onView]);
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

export { CodeWarnings };

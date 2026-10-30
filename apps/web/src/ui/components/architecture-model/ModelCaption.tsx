import type { JSX, ReactNode } from "react";
import { Button } from "@archboard/ui-kit/components";
import type { projectModel } from "@archboard/board/content";

interface ModelCaptionProps {
	projection: ReturnType<typeof projectModel>;
	everyLine: boolean;
	onToggle: () => void;
	/** What the reading is compared with. */
	comparison?: ReactNode;
	/** Statements of the reading that end the line, each with its control. */
	children?: ReactNode;
}

/**
 * One line above the picture: what the open module is for, and what the picture leaves out.
 * @param props The reading, whether every line is drawn, and the control that changes it.
 * @returns The caption, or nothing when it has nothing to say.
 */
function ModelCaption(props: ModelCaptionProps): JSX.Element | null {
	const { projection } = props;
	const responsibility = projection.complete.nodes.find(
		(node) => node.id === projection.opened,
	)?.responsibility;
	return (
		<div
			data-slot="model-caption"
			className="text-body border-border flex min-h-9 shrink-0 items-center gap-3 border-b px-6 py-1 empty:hidden"
		>
			{projection.flow === null && responsibility !== undefined && (
				<p className="text-muted-foreground min-w-0 flex-1 truncate" title={responsibility}>
					{responsibility}
				</p>
			)}
			{props.comparison}
			{projection.flow === null && projection.implied.length > 0 && (
				<LeftOutLines {...props} left={projection.implied.length} />
			)}
			{props.children}
		</div>
	);
}

/**
 * The statement of the lines that a picture leaves out, with the control that shows them.
 * @param props Whether every line is drawn, how many leave, and the control's action.
 * @returns The statement and its control.
 */
function LeftOutLines(
	props: Pick<ModelCaptionProps, "everyLine" | "onToggle"> & { left: number },
): JSX.Element {
	const { everyLine, left } = props;
	return (
		<>
			<output
				className="ml-auto"
				data-slot="model-left-out"
				data-count={left}
				data-every-line={everyLine}
			>
				{everyLine ? "Every line is drawn" : statement(left)}
			</output>
			<Button
				data-slot="model-every-line"
				variant="ghost"
				size="sm"
				aria-pressed={everyLine}
				onClick={props.onToggle}
			>
				Show every line
			</Button>
		</>
	);
}

/**
 * The count of lines that a picture leaves out, and why it may.
 * @param left The lines that leave.
 * @returns The statement.
 */
function statement(left: number): string {
	return left === 1
		? "1 direct line follows from longer paths"
		: `${left} direct lines follow from longer paths`;
}

export { ModelCaption };

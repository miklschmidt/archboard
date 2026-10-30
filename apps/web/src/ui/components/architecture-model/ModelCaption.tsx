import type { JSX } from "react";
import { Button } from "@archboard/ui-kit/components";
import type { projectModel } from "@archboard/board/content";

interface ModelCaptionProps {
	projection: ReturnType<typeof projectModel>;
	everyLine: boolean;
	onToggle: () => void;
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
	if (projection.flow !== null) return null;
	if (responsibility === undefined && projection.implied.length === 0) return null;
	return (
		<div
			data-slot="model-caption"
			className="text-body border-border flex items-center gap-3 border-b px-6 py-1"
		>
			<p className="text-muted-foreground min-w-0 flex-1 truncate">{responsibility}</p>
			{projection.implied.length > 0 && (
				<LeftOutLines {...props} left={projection.implied.length} />
			)}
		</div>
	);
}

/**
 * The statement of the lines that a picture leaves out, with the control that shows them.
 * @param props Whether every line is drawn, how many leave, and the control's action.
 * @returns The statement and its control.
 */
function LeftOutLines(props: ModelCaptionProps & { left: number }): JSX.Element {
	const { everyLine, left } = props;
	return (
		<>
			<output data-slot="model-left-out" data-count={left} data-every-line={everyLine}>
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

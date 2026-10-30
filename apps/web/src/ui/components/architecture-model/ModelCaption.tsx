import type { JSX, ReactNode } from "react";
import { Button } from "@archboard/ui-kit/components";
import type { Model, ModelFlow, projectModel } from "@archboard/board/content";
import { flowCollections } from "#ui/rules/architecture-model/flow-reading.ts";

interface ModelCaptionProps {
	model: Model;
	projection: ReturnType<typeof projectModel>;
	everyLine: boolean;
	onToggle: () => void;
	/** Statements of the reading that end the line, each with its control. */
	children?: ReactNode;
}

/**
 * What a flow reading says, since the open module does not own the flow: the collection that
 * holds it, then what it does. A flow retained from before summaries were required says only
 * the first.
 * @param props The flow on screen and the reading that holds it.
 * @param props.flow The flow.
 * @param props.collection The name of its collection, when a state holds it.
 * @returns The line.
 */
function FlowLine(props: { flow: ModelFlow; collection: string | undefined }): JSX.Element {
	const { collection } = props;
	const { summary } = props.flow;
	return (
		<p
			data-slot="model-flow-line"
			className="text-muted-foreground min-w-0 flex-1 truncate"
			title={[collection, summary].filter(Boolean).join(": ")}
		>
			<span className="text-foreground mr-2 font-medium">{collection}</span>
			{summary}
		</p>
	);
}

/**
 * One line above the picture: what the flow is, or what the open module is for and what the
 * picture leaves out.
 * @param props The reading, whether every line is drawn, and the control that changes it.
 * @returns The caption, or nothing when it has nothing to say.
 */
function ModelCaption(props: ModelCaptionProps): JSX.Element | null {
	const { projection, model } = props;
	const { flow } = projection;
	return (
		<div
			data-slot="model-caption"
			className="text-body border-border flex min-h-9 shrink-0 items-center gap-3 border-b px-6 py-1 empty:hidden"
		>
			{flow === null ? (
				<ModuleLine {...props} />
			) : (
				<FlowLine
					flow={flow}
					collection={flowCollections(model, projection.reference).get(flow.id)}
				/>
			)}
			{props.children}
		</div>
	);
}

/**
 * What a module reading says: what the open module is for, and what the picture leaves out.
 * @param props The reading, whether every line is drawn, and the control that changes it.
 * @returns The line.
 */
function ModuleLine(props: Omit<ModelCaptionProps, "children">): JSX.Element {
	const { projection } = props;
	const responsibility = projection.complete.nodes.find(
		(node) => node.id === projection.opened,
	)?.responsibility;
	return (
		<>
			{responsibility !== undefined && (
				<p className="text-muted-foreground min-w-0 flex-1 truncate" title={responsibility}>
					{responsibility}
				</p>
			)}
			{projection.implied.length > 0 && (
				<LeftOutLines {...props} left={projection.implied.length} />
			)}
		</>
	);
}

/**
 * The statement of the lines that a picture leaves out, with the control that shows them.
 * @param props Whether every line is drawn, how many leave, and the control's action.
 * @returns The statement and its control.
 */
function LeftOutLines(props: Omit<ModelCaptionProps, "children"> & { left: number }): JSX.Element {
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

import { ModelSubjectStanding } from "#ui/components/architecture-model/ModelStateDetails.tsx";
import type { JSX } from "react";
import { everyStep, stepWords, isMessage, type FlowStep } from "@archboard/board/flow";
import type { Model, ModelFlow } from "@archboard/board/content";
import type { ModelSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";
import { useModelPick } from "#ui/hooks/architecture-model/use-model-pick.ts";

interface ModelFlowDetailsProps {
	model: Model;
	flow: ModelFlow;
	reference: Model | undefined;
	selection: ModelSelection;
	/** Say only what is selected, for a place with no room for the whole flow. */
	brief?: boolean | undefined;
	/** Leave out the name and the summary, for a page that states them in its title. */
	bare?: boolean | undefined;
}

/**
 * Inspect authored behavior without reconstructing it from structural relationships.
 * @param props The explicit flow and current selected subjects.
 * @returns The flow narrative and keyboard-accessible authored steps.
 */
function ModelFlowDetails(props: ModelFlowDetailsProps): JSX.Element {
	const { brief, bare } = props;
	const steps = everyStep(props.flow.steps).map((step, index) => ({ step, number: index + 1 }));
	return (
		<section data-slot="model-flow-details" className="space-y-6">
			{bare !== true && <h3 className="text-title font-semibold">{props.flow.name}</h3>}
			<FlowStanding {...props} />
			{brief !== true && bare !== true && props.flow.summary && (
				<p className="text-body whitespace-pre-wrap">{props.flow.summary}</p>
			)}
			<ol data-slot="model-flow-steps" className="border-border -mx-3 border-t">
				{steps
					.filter(({ step }) => brief !== true || props.selection.ids.has(step.id))
					.map(({ step, number }) => (
						<FlowStepDetails key={step.id} step={step} number={number} {...props} />
					))}
			</ol>
		</section>
	);
}

/**
 * How the flow stands, in a place with room for it or when the flow itself is selected.
 * @param props The flow and its selection.
 * @returns The standing, or nothing while a brief place explains a step.
 */
function FlowStanding(props: ModelFlowDetailsProps): JSX.Element | null {
	const { flow, model, reference, selection, brief } = props;
	if (brief === true && !selection.ids.has(flow.id)) return null;
	return <ModelSubjectStanding model={model} subject={flow.id} reference={reference} />;
}

/** A step's number, what it says, its two ends and its kind. */
const STEP_GRID =
	"grid grid-cols-[32px_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1 @min-[860px]/sheet:grid-cols-[32px_minmax(0,1fr)_minmax(0,1fr)_64px]";

/**
 * A step keeps its kind, endpoints, and explanatory text from the selected state.
 * @param props The authored step and its selection action.
 * @returns One selectable step without altering flow order.
 */
function FlowStepDetails(
	props: ModelFlowDetailsProps & { step: FlowStep; number: number },
): JSX.Element {
	const { step, selection } = props;
	const pick = useModelPick(step.id, selection.select);
	return (
		<li className="border-border hover:bg-muted/50 has-aria-pressed:bg-sidebar-accent relative border-b">
			<button
				type="button"
				data-step-id={step.id}
				aria-pressed={selection.ids.has(step.id)}
				{...pick}
				className={`${STEP_GRID} text-control min-h-10 w-full py-2 pr-3 pl-3 text-left`}
			>
				<span className="text-muted-foreground text-right font-normal tabular-nums">
					{props.number}
				</span>
				<span data-slot="model-flow-step-words" className="min-w-0 [overflow-wrap:anywhere]">
					{stepWords(step)}
				</span>
				{isMessage(step) ? (
					<MessageDetails step={step} model={props.model} reference={props.reference} />
				) : (
					<span className="hidden @min-[860px]/sheet:block" />
				)}
				<span className="text-body text-muted-foreground col-start-2 font-normal @min-[860px]/sheet:col-start-auto">
					{step.kind}
				</span>
			</button>
			{selection.ids.has(step.id) && (
				<div className="px-3 pb-2 empty:hidden">
					<ModelSubjectStanding model={props.model} subject={step.id} reference={props.reference} />
				</div>
			)}
		</li>
	);
}

/**
 * Preserve message endpoints, repeated exchanges, and evidence notes.
 * @param props The authored message and its model.
 * @param props.step A flow message.
 * @param props.model The complete model state.
 * @param props.reference The verified base for removed participants.
 * @returns Message details without deriving reverse dependencies.
 */
function MessageDetails(props: {
	step: Extract<FlowStep, { from: string }>;
	model: Model;
	reference: Model | undefined;
}): JSX.Element {
	const { step, model } = props;
	const from = moduleName(model, step.from, props.reference);
	const to = moduleName(model, step.to, props.reference);
	return (
		<span className="col-start-2 flex min-w-0 flex-col gap-1 font-normal @min-[860px]/sheet:col-start-auto">
			<span>
				{from} → {to}
			</span>
			{step.note && (
				<span className="text-body text-muted-foreground whitespace-pre-wrap">{step.note}</span>
			)}
			{step.repeat && (
				<span className="text-body text-muted-foreground">Repeated {step.repeat} times</span>
			)}
		</span>
	);
}

/**
 * Name a known participant without substituting a different identity.
 * @param model The selected model state.
 * @param id The authored participant identity.
 * @param reference The verified base for removed participants.
 * @returns Its current name or stable identity.
 */
function moduleName(model: Model, id: string, reference: Model | undefined): string {
	return (
		model.modules.find((module) => module.id === id)?.name ??
		reference?.modules.find((module) => module.id === id)?.name ??
		id
	);
}

export { ModelFlowDetails };

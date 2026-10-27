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
}

/**
 * Inspect authored behavior without reconstructing it from structural relationships.
 * @param props The explicit flow and current selected subjects.
 * @returns The flow narrative and keyboard-accessible authored steps.
 */
function ModelFlowDetails(props: ModelFlowDetailsProps): JSX.Element {
	const steps = everyStep(props.flow.steps);
	return (
		<section data-slot="model-flow-details" className="space-y-6">
			<h3 className="text-title font-semibold">{props.flow.name}</h3>
			<ModelSubjectStanding model={props.model} subject={props.flow.id} />
			{props.flow.summary && <p className="text-body whitespace-pre-wrap">{props.flow.summary}</p>}
			<ol data-slot="model-flow-steps" className="space-y-3">
				{steps.map((step) => (
					<FlowStepDetails key={step.id} step={step} {...props} />
				))}
			</ol>
		</section>
	);
}

/**
 * A step keeps its kind, endpoints, and explanatory text from the selected state.
 * @param props The authored step and its selection action.
 * @returns One selectable step without altering flow order.
 */
function FlowStepDetails(props: ModelFlowDetailsProps & { step: FlowStep }): JSX.Element {
	const { step, selection } = props;
	const pick = useModelPick(step.id, selection.select);
	return (
		<li>
			<button
				type="button"
				data-step-id={step.id}
				aria-pressed={selection.ids.has(step.id)}
				{...pick}
				className="hover:bg-muted aria-pressed:bg-muted rounded-control text-body w-full space-y-2 px-3 py-2 text-left"
			>
				<span className="block font-semibold">{stepWords(step)}</span>
				<span className="text-muted-foreground block">{step.kind}</span>
				{isMessage(step) && (
					<MessageDetails step={step} model={props.model} reference={props.reference} />
				)}
			</button>
			{selection.ids.has(step.id) && <ModelSubjectStanding model={props.model} subject={step.id} />}
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
		<>
			<span className="block">
				{from} → {to}
			</span>
			{step.note && <span className="block whitespace-pre-wrap">{step.note}</span>}
			{step.repeat && <span className="block">Repeated {step.repeat} times</span>}
		</>
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

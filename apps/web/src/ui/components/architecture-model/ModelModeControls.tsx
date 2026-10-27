import { useCallback, useMemo, type JSX } from "react";
import { Select } from "@archboard/ui-kit/components";
import { DiagramGrammarSchema } from "@archboard/board/views";
import type { VariantContent } from "@archboard/board/content";
import type { ModelFlow } from "@archboard/board/content";
import { relevantFlows } from "#ui/rules/architecture-model/flow-reading.ts";

interface ModelModeControlsProps {
	content: VariantContent;
	subjects: ReadonlySet<string>;
	grammar: string;
	flow: string | null;
	onGrammar: (grammar: string) => void;
	onFlow: (flow: string) => void;
}

/**
 * Readers choose a diagram mode and the authored exchange that supports it.
 * @param props The reading intent and its explicit navigation actions.
 * @returns Accessible mode and relevant-flow controls.
 */
function ModelModeControls(props: ModelModeControlsProps): JSX.Element {
	const { onGrammar } = props;
	const choose = useCallback(
		(value: string | null): void => {
			if (value !== null) onGrammar(value);
		},
		[onGrammar],
	);
	return (
		<>
			<Select value={props.grammar} onValueChange={choose}>
				<Select.Trigger data-slot="model-grammar-selector" aria-label="Diagram mode" size="sm">
					<Select.Value>{grammarName(props.grammar)}</Select.Value>
				</Select.Trigger>
				<Select.Content alignItemWithTrigger={false}>
					{DiagramGrammarSchema.options.map((grammar) => (
						<Select.Item key={grammar} value={grammar} data-grammar={grammar}>
							{grammarName(grammar)}
						</Select.Item>
					))}
				</Select.Content>
			</Select>
			{props.grammar !== "architecture" && <FlowChoice {...props} />}
		</>
	);
}

/**
 * An unavailable or no-longer-relevant selected flow remains the explicit selection.
 * @param props The full model, relevant subjects, and flow address.
 * @returns The selected flow and available explicit alternatives.
 */
function FlowChoice(props: ModelModeControlsProps): JSX.Element {
	const { content, subjects, flow, onFlow } = props;
	const candidates = useMemo(() => relevantFlows(content, subjects), [content, subjects]);
	const entries = new Map<string, ModelFlow | undefined>(
		candidates.map((entry) => [entry.id, entry]),
	);
	if (flow !== null)
		entries.set(
			flow,
			content.flows.find((entry) => entry.id === flow),
		);
	const choose = useCallback(
		(value: string | null): void => {
			if (value !== null) onFlow(value);
		},
		[onFlow],
	);
	return (
		<Select value={flow} onValueChange={choose}>
			<Select.Trigger data-slot="model-flow-selector" aria-label="Flow" size="sm">
				<Select.Value placeholder="Choose flow">{flowLabel(flow, entries)}</Select.Value>
			</Select.Trigger>
			<Select.Content alignItemWithTrigger={false} className="w-auto min-w-64">
				{[...entries].map(([id, entry]) => (
					<Select.Item key={id} value={id} data-flow-id={id}>
						{entry?.name ?? `Unavailable flow · ${id}`}
					</Select.Item>
				))}
				{entries.size === 0 && (
					<p className="text-body text-muted-foreground px-3 py-2">
						No flow involves these subjects.
					</p>
				)}
			</Select.Content>
		</Select>
	);
}

/**
 * Label an explicit flow without substituting a different one.
 * @param id The selected flow, or no selection.
 * @param entries Available authored flows and any missing selection.
 * @returns Its name or the explicit missing state.
 */
function flowLabel(
	id: string | null,
	entries: ReadonlyMap<string, ModelFlow | undefined>,
): string | undefined {
	return id === null ? undefined : (entries.get(id)?.name ?? `Unavailable flow · ${id}`);
}

const GRAMMAR_NAMES = new Map([
	["architecture", "Architecture"],
	["sequence", "Sequence"],
	["flowchart", "Flowchart"],
]);

/**
 * Product labels use diagram names rather than transport spelling.
 * @param grammar The requested diagram grammar.
 * @returns Its visible name, including unsupported intent.
 */
function grammarName(grammar: string): string {
	return GRAMMAR_NAMES.get(grammar) ?? `Unavailable mode · ${grammar}`;
}

export { ModelModeControls };

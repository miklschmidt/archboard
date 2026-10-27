import { useCallback, type JSX } from "react";
import { DropdownMenu } from "@archboard/ui-kit/components";
import type { ExplanationInvocation } from "#ui/clients/architecture-model/explanations.ts";
import type { Model } from "#ui/rules/architecture-model/projection.ts";

type Action = ExplanationInvocation["request"]["action"];
const ACTIONS = {
	"explain-selection": "Explain selection",
	"explain-relationship": "Explain relationships",
	"trace-flow": "Trace flow",
	"explain-proposal": "Explain proposal",
} satisfies Record<Action, string>;

interface MenuProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	model: Model;
	selected: ReadonlySet<string>;
	unavailable: boolean;
	onAction: (action: Action) => void;
}
interface ChoiceProps {
	action: Action;
	disabled: boolean;
	onAction: MenuProps["onAction"];
}

/**
 * Offer each applicable action through one keyboard-accessible menu.
 * @param props The selected subjects and their coherent reading.
 * @returns Local agent actions with explicit unavailable choices.
 */
function ModelExplanationMenu(props: MenuProps): JSX.Element {
	const relationships = new Set([
		...props.model.relationships.map((edge) => edge.id),
		...(props.model.comparison?.subjects
			.filter((entry) => entry.subjectKind === "relationship")
			.map((entry) => entry.id) ?? []),
	]);
	const enabled: Record<Action, boolean> = {
		"explain-selection": props.selected.size > 0,
		"explain-relationship":
			props.selected.size > 0 && [...props.selected].every((id) => relationships.has(id)),
		"trace-flow": true,
		"explain-proposal":
			props.model.selectedState?.lifecycle === "draft" && props.model.comparison !== undefined,
	};
	return (
		<DropdownMenu open={props.open} onOpenChange={props.onOpenChange}>
			<DropdownMenu.Trigger
				data-slot="model-explain"
				className="text-control hover:bg-muted rounded-control px-3 py-2"
			>
				Explain
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start">
				{(
					["explain-selection", "explain-relationship", "trace-flow", "explain-proposal"] as const
				).map((action) => (
					<ActionChoice
						key={action}
						action={action}
						disabled={props.unavailable || !enabled[action]}
						onAction={props.onAction}
					/>
				))}
			</DropdownMenu.Content>
		</DropdownMenu>
	);
}

/**
 * Every choice invokes the same captured action.
 * @param props The action and its availability.
 * @returns One native menu choice.
 */
function ActionChoice(props: ChoiceProps): JSX.Element {
	const { onAction, action } = props;
	const invoke = useCallback(() => onAction(action), [onAction, action]);
	return (
		<DropdownMenu.Item data-explanation-action={action} disabled={props.disabled} onClick={invoke}>
			{ACTIONS[action]}
		</DropdownMenu.Item>
	);
}

export { ModelExplanationMenu };

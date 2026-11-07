import { useCallback, type ComponentType, type JSX } from "react";
import {
	RiArrowDownSLine,
	RiFocus3Line,
	RiGitPullRequestLine,
	RiLinksLine,
	RiOpenaiFill,
	RiRouteLine,
} from "@remixicon/react";
import { buttonVariants, DropdownMenu } from "@archboard/ui-kit/components";
import type { ExplanationInvocation } from "#ui/architecture-drawing/model-reader/access/clients/explanations.ts";
import type { Model } from "@archboard/model/content";

type Action = ExplanationInvocation["request"]["action"];
const ACTIONS = {
	"explain-selection": { label: "Explain selection", Icon: RiFocus3Line },
	"explain-relationship": { label: "Explain relationships", Icon: RiLinksLine },
	"trace-flow": { label: "Trace flow", Icon: RiRouteLine },
	"explain-proposal": { label: "Explain proposal", Icon: RiGitPullRequestLine },
} satisfies Record<Action, { readonly label: string; readonly Icon: ComponentType }>;

interface MenuProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	model: Model;
	selected: ReadonlySet<string>;
	unavailable: boolean;
	onAction: (action: Action) => void;
}
type ChoicesProps = Omit<MenuProps, "open" | "onOpenChange">;
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
	return (
		<DropdownMenu open={props.open} onOpenChange={props.onOpenChange}>
			<DropdownMenu.Trigger
				data-slot="model-explain"
				className={buttonVariants({ variant: "outline", size: "sm" })}
			>
				<RiOpenaiFill aria-hidden="true" />
				Explain with Codex
				<RiArrowDownSLine aria-hidden="true" />
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" className="w-72">
				<p className="text-body text-muted-foreground px-2 py-1.5">
					Codex reads this view and the code, and answers below and in the conversation. It changes
					nothing.
				</p>
				<DropdownMenu.Separator />
				<ExplanationChoices {...props} />
			</DropdownMenu.Content>
		</DropdownMenu>
	);
}

/**
 * Each action a reading offers, with the ones that do not apply shown disabled.
 * @param props The selected subjects and their coherent reading.
 * @returns The choices.
 */
function ExplanationChoices(props: ChoicesProps): JSX.Element {
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
		<>
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
		</>
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
	const { label, Icon } = ACTIONS[action];
	return (
		<DropdownMenu.Item data-explanation-action={action} disabled={props.disabled} onClick={invoke}>
			<Icon aria-hidden="true" />
			{label}
		</DropdownMenu.Item>
	);
}

export { ExplanationChoices, ModelExplanationMenu };

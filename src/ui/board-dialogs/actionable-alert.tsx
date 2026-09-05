// Persistent, actionable feedback. The rule: a message that carries a recovery
// action is never transient. Transient feedback (a toast, a fading status
// line) is only for messages whose loss loses no recovery action; anything
// a person has to answer stays up, as this alert, until its owner clears it
// or the person dismisses it by name.

import { RiCloseLine } from "@remixicon/react";
import { useCallback } from "react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/ui/components/alert";
import { Button } from "@/ui/components/button";

/** A recovery action the alert offers. Selecting it is reported by id. */
interface ActionableAlertAction {
	id: string;
	label: string;
}

/** Inputs for the actionable alert. */
interface ActionableAlertProps {
	title: string;
	description: string;
	tone: "default" | "destructive";
	actions: readonly ActionableAlertAction[];
	onAction: (id: string) => void;
	/** The accessible name of the dismiss control. Absent means not dismissible. */
	dismissLabel?: string;
	onDismiss?: () => void;
}

/** Inputs for one action button. */
interface ActionButtonProps {
	action: ActionableAlertAction;
	onAction: (id: string) => void;
}

/**
 * One recovery action.
 * @param props The action and the callback.
 * @returns A small outline button.
 */
function ActionButton(props: ActionButtonProps): React.JSX.Element {
	const { action, onAction } = props;
	const handleClick = useCallback(() => onAction(action.id), [onAction, action.id]);
	return (
		<Button variant="outline" size="xs" onClick={handleClick}>
			{action.label}
		</Button>
	);
}

/** Inputs for the dismiss control. */
interface DismissButtonProps {
	label: string | undefined;
	onDismiss: (() => void) | undefined;
}

/**
 * The dismiss control, offered only when the alert may be dismissed.
 * @param props The accessible name and the callback.
 * @returns An icon button, or nothing.
 */
function DismissButton(props: DismissButtonProps): React.JSX.Element | null {
	const { label, onDismiss } = props;
	if (label === undefined || onDismiss === undefined) {
		return null;
	}
	return (
		<Button variant="ghost" size="icon-xs" aria-label={label} onClick={onDismiss}>
			<RiCloseLine />
		</Button>
	);
}

/**
 * A durable alert with typed actions.
 * @param props The words, tone, actions and callbacks.
 * @returns The alert.
 */
function ActionableAlert(props: ActionableAlertProps): React.JSX.Element {
	return (
		<Alert variant={props.tone}>
			<AlertTitle>{props.title}</AlertTitle>
			<AlertDescription>{props.description}</AlertDescription>
			<AlertAction className="flex items-center gap-1.5">
				{props.actions.map((action) => (
					<ActionButton key={action.id} action={action} onAction={props.onAction} />
				))}
				<DismissButton label={props.dismissLabel} onDismiss={props.onDismiss} />
			</AlertAction>
		</Alert>
	);
}

export { ActionableAlert, type ActionableAlertAction, type ActionableAlertProps };

// The one icon-only control the dense panels use: a 24px icon button whose
// hit area reaches 32px (the documented desktop exception to a 44px target),
// named by its tooltip, which is also its accessible name. A control that cannot be
// used is dimmed and does nothing when pressed: the tooltip trigger's own `disabled`
// only stops the tip, so the button is told it is disabled as well.

import { cn } from "cn";
import type { JSX, ReactNode } from "react";

import { buttonVariants, Tooltip } from "@archboard/ui-kit/components";

/** Inputs for the icon action. */
interface IconActionProps {
	/** The action's words: the tooltip and the accessible name. */
	label: string;
	onClick: () => void;
	disabled?: boolean | undefined;
	variant?: "ghost" | "outline" | undefined;
	className?: string | undefined;
	/** Which side of the button its tooltip opens on: above it unless something sits there. */
	tipSide?: "top" | "left" | undefined;
	/** The icon. */
	children: ReactNode;
}

/**
 * An icon-only panel action with its tooltip.
 * @param props The label, the state and the icon.
 * @returns The tooltip-wrapped button.
 */
function IconAction(props: IconActionProps): JSX.Element {
	return (
		<Tooltip>
			<Tooltip.Trigger
				className={cn(
					buttonVariants({ variant: props.variant ?? "ghost", size: "icon-xs" }),
					"relative rounded-sm after:absolute after:-inset-1",
					props.disabled === true && "pointer-events-none opacity-50",
					props.className,
				)}
				aria-label={props.label}
				aria-disabled={props.disabled === true ? true : undefined}
				disabled={props.disabled}
				onClick={props.disabled === true ? undefined : props.onClick}
			>
				{props.children}
			</Tooltip.Trigger>
			<Tooltip.Content side={props.tipSide ?? "top"}>{props.label}</Tooltip.Content>
		</Tooltip>
	);
}

export { IconAction, type IconActionProps };

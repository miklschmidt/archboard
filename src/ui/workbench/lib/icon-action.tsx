// The one icon-only control the dense panels use: a 24px icon button whose
// hit area reaches 32px (the documented desktop exception to a 44px target),
// named by its tooltip, which is also its accessible name.

import { cn } from "cn";

import { buttonVariants } from "@/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/components/tooltip";

/** Inputs for the icon action. */
interface IconActionProps {
	/** The action's words: the tooltip and the accessible name. */
	label: string;
	onClick: () => void;
	disabled?: boolean | undefined;
	variant?: "ghost" | "outline" | undefined;
	className?: string | undefined;
	/** The icon. */
	children: React.ReactNode;
}

/**
 * An icon-only panel action with its tooltip.
 * @param props The label, the state and the icon.
 * @returns The tooltip-wrapped button.
 */
function IconAction(props: IconActionProps): React.JSX.Element {
	return (
		<Tooltip>
			<TooltipTrigger
				className={cn(
					buttonVariants({ variant: props.variant ?? "ghost", size: "icon-xs" }),
					"relative rounded-sm after:absolute after:-inset-1",
					props.className,
				)}
				aria-label={props.label}
				disabled={props.disabled}
				onClick={props.onClick}
			>
				{props.children}
			</TooltipTrigger>
			<TooltipContent>{props.label}</TooltipContent>
		</Tooltip>
	);
}

export { IconAction, type IconActionProps };

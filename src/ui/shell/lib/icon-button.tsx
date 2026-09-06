// The one icon-only control the chrome uses: a 28px ghost button inside a
// 32px hit area (the documented desktop exception to a 44px target), named
// by its tooltip, which is also its accessible name. A shortcut, when the
// action has one, sits in the tooltip as a key cap and in the name as words.

import { cn } from "cn";

import { buttonVariants } from "@/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/components/tooltip";

/** A 28px ghost icon button inside a 32px hit area. */
const ICON_BUTTON_CLASS = buttonVariants({
	variant: "ghost",
	size: "icon-sm",
	className: "hit-area",
});

/** Inputs for the icon button. */
interface IconButtonProps {
	/** The action's words: the tooltip and the accessible name. */
	label: string;
	/** A key combination shown as a key cap in the tooltip, when the action has one. */
	shortcut?: string | undefined;
	onClick: () => void;
	disabled?: boolean | undefined;
	/** For disclosure controls: what the button currently reveals. */
	expanded?: boolean | undefined;
	id?: string | undefined;
	className?: string | undefined;
	/** The icon. */
	children: React.ReactNode;
}

/**
 * A shortcut's words as the `aria-keyshortcuts` grammar spells them.
 * @param shortcut The shortcut as a person reads it, or undefined.
 * @returns The attribute value, or undefined when there is no shortcut.
 */
function keyShortcuts(shortcut: string | undefined): string | undefined {
	return shortcut?.replace("Ctrl", "Control").replace("Cmd", "Meta");
}

/**
 * An icon-only control with its tooltip.
 * @param props The label, the optional shortcut, the state and the icon.
 * @returns The tooltip-wrapped button.
 */
function IconButton(props: IconButtonProps): React.JSX.Element {
	const { label, shortcut } = props;
	return (
		<Tooltip>
			<TooltipTrigger
				id={props.id}
				className={cn(ICON_BUTTON_CLASS, props.className)}
				aria-label={label}
				aria-keyshortcuts={keyShortcuts(shortcut)}
				aria-expanded={props.expanded}
				onClick={props.onClick}
				disabled={props.disabled}
			>
				{props.children}
			</TooltipTrigger>
			<TooltipContent>
				{label}
				{shortcut !== undefined && (
					<kbd
						data-slot="kbd"
						className="bg-background/15 text-technical ml-1 rounded-[2px] px-1 font-mono"
					>
						{shortcut}
					</kbd>
				)}
			</TooltipContent>
		</Tooltip>
	);
}

export { ICON_BUTTON_CLASS, IconButton, type IconButtonProps };

// The one icon-only control the chrome uses: a 28px ghost button inside a
// 32px hit area (the documented desktop exception to a 44px target), named
// by its label, which is also its tooltip unless a `tip` says more, as for a
// control whose name stays while its state changes. A shortcut, when the
// action has one, sits in the tooltip as a key cap and in the name as words.
// The shell's header, a pane's header and the sidebar's own controls share it.
//
// An action that cannot be done now keeps its place: the button is dimmed, a
// press does nothing, and the tooltip and the name say why. It is not taken
// out of the row, so the row does not change size with what the page is doing.

import { cn } from "#ui/rules/class-names.ts";
import type { JSX, ReactNode } from "react";

import { buttonVariants } from "#ui/components/shadcn/button.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "#ui/components/shadcn/tooltip.tsx";

/** A 28px ghost icon button inside a 32px hit area. */
const ICON_BUTTON_CLASS = buttonVariants({
	variant: "ghost",
	size: "icon-sm",
	className: "hit-area transition-colors",
});

/** What a held button looks like: dimmed, at rest under the pointer, and still. */
const HELD_CLASS =
	"cursor-default opacity-50 hover:bg-transparent active:translate-y-0 dark:hover:bg-transparent";

/** Inputs for the icon button. */
interface IconButtonProps {
	/** The action's words: the tooltip and the accessible name. */
	label: string;
	/** What the tooltip says when that is more than the name: a control whose name stays while its state changes. */
	tip?: string | undefined;
	/** A key combination shown as a key cap in the tooltip, when the action has one. */
	shortcut?: string | undefined;
	onClick: () => void;
	/** Why the action cannot be done now, or null when it can: the button stays, dimmed, and says why. */
	held?: string | null | undefined;
	/** For disclosure controls: whether what the button reveals is shown. */
	expanded?: boolean | undefined;
	/** For disclosure controls: the element it shows and hides. */
	controls?: string | undefined;
	/** Where a test or a stylesheet finds it; the tooltip's own name when left out. */
	slot?: string | undefined;
	id?: string | undefined;
	className?: string | undefined;
	/** The icon. */
	children: ReactNode;
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
 * What a button says and does, whether or not the action can be done now.
 * @param props The button's inputs.
 * @returns Its name, its tooltip, what a press does, its look and its disabled state.
 */
function stateOf(props: IconButtonProps): {
	readonly name: string;
	readonly tip: string;
	readonly onClick: (() => void) | undefined;
	readonly className: string | undefined;
	readonly ariaDisabled: true | undefined;
} {
	const { label, held } = props;
	if (held === null || held === undefined) {
		return {
			name: label,
			tip: props.tip ?? label,
			onClick: props.onClick,
			className: undefined,
			ariaDisabled: undefined,
		};
	}
	return {
		name: `${label}. ${held}`,
		tip: held,
		onClick: undefined,
		className: HELD_CLASS,
		ariaDisabled: true,
	};
}

/**
 * An icon-only control with its tooltip.
 * @param props The label, the optional shortcut, the state and the icon.
 * @returns The tooltip-wrapped button.
 */
function IconButton(props: IconButtonProps): JSX.Element {
	const { shortcut } = props;
	const state = stateOf(props);
	return (
		<Tooltip>
			<TooltipTrigger
				id={props.id}
				{...(props.slot === undefined ? {} : { "data-slot": props.slot })}
				className={cn(ICON_BUTTON_CLASS, state.className, props.className)}
				aria-label={state.name}
				aria-keyshortcuts={keyShortcuts(shortcut)}
				aria-expanded={props.expanded}
				aria-controls={props.controls}
				aria-disabled={state.ariaDisabled}
				onClick={state.onClick}
			>
				{props.children}
			</TooltipTrigger>
			<TooltipContent>
				{state.tip}
				{shortcut !== undefined && (
					<kbd
						data-slot="kbd"
						className="bg-background/15 text-technical rounded-chip ml-1 px-1 font-mono"
					>
						{shortcut}
					</kbd>
				)}
			</TooltipContent>
		</Tooltip>
	);
}

export { IconButton, type IconButtonProps };

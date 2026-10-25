// The top of the navigator column, level with every pane's header: the brand,
// and the controls that belong to the whole application rather than to a pane
// or a board: the vault's diagnostics, the settings and the theme. Nothing
// here changes a board: a user reads an architecture an agent wrote (ADR 0023).

import { RiMoonLine, RiSettings3Line, RiSunLine } from "@remixicon/react";
import { useCallback, type JSX, type ReactNode } from "react";

import type { ShellActions, ThemeChoice } from "#ui/rules/shell/contracts.ts";
import { Brand } from "#ui/components/shell/Brand.tsx";
import { IconButton } from "@archboard/ui-kit/components";

/** The settings trigger's id: the dialog it opens returns focus to it. */
const SETTINGS_TRIGGER_ID = "shell-settings";

/** Inputs for the brand bar. */
interface BrandBarProps {
	diagnostics?: ReactNode;
	theme: ThemeChoice;
	actions: ShellActions;
}

/** Inputs for the pieces that only need the actions. */
interface ActionsProps {
	actions: ShellActions;
}

/**
 * The settings: where the server opens code.
 * @param props The actions.
 * @returns The gear.
 */
function SettingsButton(props: ActionsProps): JSX.Element {
	const { actions } = props;
	const handleClick = useCallback(() => actions.openSettings("opener"), [actions]);
	return (
		<IconButton id={SETTINGS_TRIGGER_ID} label="Settings" onClick={handleClick}>
			<RiSettings3Line />
		</IconButton>
	);
}

/** Inputs for the theme toggle. */
interface ThemeToggleProps extends ActionsProps {
	theme: ThemeChoice;
}

/**
 * Switch between the light and dark themes. The theme in force is announced
 * beside the control, so a switch is heard as well as seen.
 * @param props The current theme and the action that changes it.
 * @returns A sun or moon button named for the theme it switches to.
 */
function ThemeToggle(props: ThemeToggleProps): JSX.Element {
	const { theme, actions } = props;
	const next: ThemeChoice = theme === "dark" ? "light" : "dark";
	const handleClick = useCallback(() => actions.setTheme(next), [actions, next]);
	return (
		<>
			<IconButton label={`Switch to ${next} theme`} onClick={handleClick}>
				{theme === "dark" ? <RiSunLine /> : <RiMoonLine />}
			</IconButton>
			<output aria-live="polite" className="sr-only">
				{theme === "dark" ? "Dark theme" : "Light theme"}
			</output>
		</>
	);
}

/**
 * The brand bar.
 * @param props The diagnostics, the theme and the actions.
 * @returns The chrome row at the top of the navigator, with its one-pixel bottom rule.
 */
function BrandBar(props: BrandBarProps): JSX.Element {
	const { actions } = props;
	return (
		<header
			data-slot="brand-bar"
			className="border-border h-chrome flex shrink-0 items-center gap-1 border-b pr-2 pl-5"
		>
			<Brand />
			<span className="flex-1" />
			{props.diagnostics}
			<SettingsButton actions={actions} />
			<ThemeToggle theme={props.theme} actions={actions} />
		</header>
	);
}

export { BrandBar, SETTINGS_TRIGGER_ID, type BrandBarProps };

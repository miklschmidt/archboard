// The 56px header: four sections under full-height one-pixel rules. The brand,
// the search over every board's parts, the live state chips, and the settings.
// Where a board sits and what it is called are the pane's own (its featured
// header). Pane controls live in the pane bar, and nothing here changes a
// board: a user reads an architecture an agent wrote (ADR 0023).

import { RiMoonLine, RiSettings3Line, RiSunLine } from "@remixicon/react";
import { useCallback, type JSX, type ReactNode } from "react";

import { Separator } from "@/ui/components/separator";
import type { ShellActions, ThemeChoice } from "@/ui/shell/types/contracts";
import { Brand } from "@/ui/shell/components/Brand";
import { IconButton } from "@/ui/shell/components/IconButton";
import { StatusDot } from "@/ui/shell/components/StatusDot";

/** The settings trigger's id: the dialog it opens returns focus to it. */
const SETTINGS_TRIGGER_ID = "shell-settings";

/** Inputs for the header. */
interface HeaderProps {
	diagnostics?: ReactNode;
	/** The search over every board's parts. */
	search?: ReactNode;
	theme: ThemeChoice;
	/** Whether the active pane's socket is up; the header says so only when it is not. */
	connected: boolean;
	actions: ShellActions;
}

/**
 * The connection, said only when there is something to say: a live socket is
 * the normal state and needs no words.
 * @param props Whether the socket is up.
 * @param props.connected Whether it is.
 * @returns The warning, or nothing.
 */
function ConnectionTrouble(props: { readonly connected: boolean }): JSX.Element | null {
	if (props.connected) return null;
	return (
		<output className="text-body text-foreground flex shrink-0 items-center gap-1.5 px-3 font-medium">
			<StatusDot tone="warning" />
			Reconnecting
		</output>
	);
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
 * The shell header.
 * @param props The search, theme, connection and actions.
 * @returns The 56px header row with its one-pixel bottom rule.
 */
function Header(props: HeaderProps): JSX.Element {
	const { actions } = props;
	return (
		<header className="border-border bg-sidebar relative z-40 flex h-14 min-w-0 shrink-0 items-stretch border-b">
			{/* The rule is this section's own right border, exactly as the navigator
			    draws its rule, so the two lines meet on the same pixel. */}
			<div className="border-border flex w-(--shell-navigator-width) shrink-0 items-center justify-center border-r">
				<Brand />
			</div>
			<div className="flex min-w-0 flex-1 items-center justify-end px-4">{props.search}</div>
			<ConnectionTrouble connected={props.connected} />
			<Separator orientation="vertical" />
			<div className="flex shrink-0 items-center gap-1 px-3">
				{props.diagnostics}
				<SettingsButton actions={actions} />
				<ThemeToggle theme={props.theme} actions={actions} />
			</div>
		</header>
	);
}

export { Header, SETTINGS_TRIGGER_ID, type HeaderProps };

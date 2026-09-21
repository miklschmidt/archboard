// The 56px header: four sections under full-height one-pixel rules. The
// wordmark, the board breadcrumb, the live state chips, and the settings. Pane
// controls live in the pane bar, and nothing here changes a board: a user
// reads an architecture an agent wrote (ADR 0023). The text pieces shrink and
// truncate so a narrower window never clips the row.

import { RiLockLine, RiMoonLine, RiSettings3Line, RiSunLine } from "@remixicon/react";
import { useCallback, type ComponentPropsWithRef, type JSX, type ReactNode } from "react";

import { Badge } from "@/ui/components/badge";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/ui/components/dropdown-menu";
import { Separator } from "@/ui/components/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/components/tooltip";
import type {
	SettingsSurface,
	ShellActions,
	ShellPane,
	ThemeChoice,
} from "@/ui/shell/types/contracts";
import { ICON_BUTTON_CLASS, IconButton } from "@/ui/shell/components/IconButton";
import { StatusDot } from "@/ui/shell/components/StatusDot";
import type { BoardIdentity, LockHolder } from "@/ui/types";

/** The settings menu trigger's id: the dialogs it opens return focus to it. */
const SETTINGS_TRIGGER_ID = "shell-settings";

/** Inputs for the header. */
interface HeaderProps {
	diagnostics?: ReactNode;
	current: BoardIdentity;
	theme: ThemeChoice;
	/** The pane the header describes, or null when no pane is open. */
	pane: ShellPane | null;
	actions: ShellActions;
}

/** The parts of a pane the header reads, flattened so no piece re-derives them. */
interface PaneSummary {
	connected: boolean;
	holder: LockHolder | null;
}

const NO_PANE: PaneSummary = {
	connected: false,
	holder: null,
};

/**
 * Flatten the active pane for the header's pieces.
 * @param pane The pane, or null when none is open.
 * @returns What the header shows about it.
 */
function summarisePane(pane: ShellPane | null): PaneSummary {
	if (!pane) {
		return NO_PANE;
	}
	return { connected: pane.status.connected, holder: pane.holder };
}

/** How a lock holder reads in the header. */
interface ClaimDescription {
	label: string;
	reason: string | null;
}

/**
 * Describe who holds the board.
 * @param holder The lock holder, or null while the board is free.
 * @returns The description, or null when there is nothing to show.
 */
function describeClaim(holder: LockHolder | null): ClaimDescription | null {
	if (!holder) {
		return null;
	}
	const claimed = holder.kind === "agent" && holder.claimed === true;
	return {
		label: claimed ? "Board claimed" : "Board held",
		reason: claimed ? (holder.reason ?? null) : null,
	};
}

/** Inputs for the breadcrumb. */
interface BreadcrumbProps {
	identity: BoardIdentity;
}

/**
 * The board's address as a breadcrumb: the name in the header's one large
 * size, the variant after a thin slash when it is not the current one, and
 * the level as a small technical badge.
 * @param props The identity to spell out.
 * @returns The breadcrumb.
 */
function Breadcrumb(props: BreadcrumbProps): JSX.Element {
	const { identity } = props;
	return (
		<nav aria-label="Current board" className="flex min-w-0 flex-1 items-center gap-2">
			<span className="text-board truncate">{identity.board}</span>
			{identity.variant !== "current" && (
				<>
					<span aria-hidden="true" className="text-border text-board font-normal">
						/
					</span>
					{/* The variant is the kicker beside the board's name: set in the
					    technical face, like every other identifier a user reads
					    rather than says out loud. */}
					<span className="text-muted-foreground text-technical truncate font-mono font-medium">
						{identity.variant}
					</span>
				</>
			)}
		</nav>
	);
}

/** Inputs for the pieces that read the flattened pane. */
interface SummaryProps {
	summary: PaneSummary;
}

/**
 * Whether the pane's socket is up.
 * @param props The flattened pane.
 * @returns The connection line.
 */
function ConnectionState(props: SummaryProps): JSX.Element {
	const { connected } = props.summary;
	return (
		<span className="text-muted-foreground text-body flex shrink-0 items-center gap-1.5">
			<StatusDot tone={connected ? "live" : "idle"} />
			{connected ? "Connected" : "Disconnected"}
		</span>
	);
}

/**
 * Who holds the board. The take-back control sits in the pane's claim banner.
 * @param props The flattened pane.
 * @returns The claim chip, or nothing while the board is free.
 */
function ClaimState(props: SummaryProps): JSX.Element | null {
	const claim = describeClaim(props.summary.holder);
	if (!claim) {
		return null;
	}
	return (
		<Badge variant="outline" size="chip" className="max-w-80 min-w-0">
			<RiLockLine className="text-muted-foreground" />
			<span className="shrink-0 font-medium">{claim.label}</span>
			{claim.reason !== null && (
				<span className="text-muted-foreground truncate">· {claim.reason}</span>
			)}
			<StatusDot tone="live" className="ml-0.5" />
		</Badge>
	);
}

/** Inputs for the pieces that only need the actions. */
interface ActionsProps {
	actions: ShellActions;
}

const SETTINGS_ITEMS: ReadonlyArray<{ surface: SettingsSurface; label: string }> = [
	{ surface: "opener", label: "Opener settings" },
	{ surface: "agent", label: "Agent settings" },
];

/** Inputs for one settings entry. */
interface SettingsItemProps extends ActionsProps {
	surface: SettingsSurface;
	label: string;
}

/**
 * One settings menu entry.
 * @param props The surface it opens and the action.
 * @returns The menu item.
 */
function SettingsItem(props: SettingsItemProps): JSX.Element {
	const { surface, actions } = props;
	const handleClick = useCallback(() => actions.openSettings(surface), [actions, surface]);
	return (
		<DropdownMenuItem className="h-7" onClick={handleClick}>
			{props.label}
		</DropdownMenuItem>
	);
}

/**
 * The menu trigger as the tooltip's element, so one button is both.
 * @param props The merged props Base UI hands to the rendered element.
 * @returns The dropdown trigger.
 */
function renderMenuTrigger(props: ComponentPropsWithRef<"button">): JSX.Element {
	return <DropdownMenuTrigger {...props} />;
}

/**
 * The settings menu.
 * @param props The action that opens a settings surface.
 * @returns A dropdown behind a gear icon.
 */
function SettingsMenu(props: ActionsProps): JSX.Element {
	return (
		<DropdownMenu>
			<Tooltip>
				<TooltipTrigger
					render={renderMenuTrigger}
					id={SETTINGS_TRIGGER_ID}
					className={ICON_BUTTON_CLASS}
					aria-label="Settings"
				>
					<RiSettings3Line />
				</TooltipTrigger>
				<TooltipContent>Settings</TooltipContent>
			</Tooltip>
			<DropdownMenuContent
				align="end"
				sideOffset={8}
				className="border-border w-44 rounded-md border shadow-none"
			>
				{SETTINGS_ITEMS.map((item) => (
					<SettingsItem
						key={item.surface}
						surface={item.surface}
						label={item.label}
						actions={props.actions}
					/>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
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
 * @param props The current board, theme, active pane and actions.
 * @returns The 56px header row with its one-pixel bottom rule.
 */
function Header(props: HeaderProps): JSX.Element {
	const { actions } = props;
	const summary = summarisePane(props.pane);
	return (
		<header className="border-border bg-sidebar flex h-14 min-w-0 shrink-0 items-stretch overflow-hidden border-b">
			{/* The rule is this section's own right border, exactly as the navigator
			    draws its rule, so the two lines meet on the same pixel. */}
			<div className="border-border flex w-(--shell-navigator-width) shrink-0 items-center justify-center border-r">
				<h1 className="wordmark">
					<span className="sr-only">archboard</span>
				</h1>
			</div>
			<div className="flex min-w-0 flex-1 items-center px-4">
				<Breadcrumb identity={props.current} />
			</div>
			<Separator orientation="vertical" />
			<div className="flex min-w-0 shrink items-center gap-3 px-4">
				<ConnectionState summary={summary} />
				<ClaimState summary={summary} />
			</div>
			<Separator orientation="vertical" />
			<div className="flex shrink-0 items-center gap-1 px-3">
				{props.diagnostics}
				<SettingsMenu actions={actions} />
				<ThemeToggle theme={props.theme} actions={actions} />
			</div>
		</header>
	);
}

export { Header, SETTINGS_TRIGGER_ID, type HeaderProps };

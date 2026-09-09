// The 56px header: five sections under full-height one-pixel rules. The wordmark, the
// board breadcrumb, the live state chips, and the actions on the board. Pane
// controls live in the pane bar. The text pieces shrink and truncate so a
// narrower window never clips the row.

import { RiLockLine, RiMoonLine, RiSettings3Line, RiSunLine } from "@remixicon/react";
import { useCallback } from "react";

import { Badge } from "@/ui/components/badge";
import { Button } from "@/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/ui/components/dropdown-menu";
import { Separator } from "@/ui/components/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/components/tooltip";
import type {
	RecoveryKind,
	SettingsSurface,
	ShellActions,
	ShellPane,
	ThemeChoice,
} from "@/ui/shell/types/contracts";
import { ICON_BUTTON_CLASS, IconButton } from "@/ui/shell/components/IconButton";
import { StatusDot } from "@/ui/shell/components/StatusDot";
import type { BoardHold, BoardIdentity, LockHolder, NoteWrittenElsewhere } from "@/ui/types";

/** The settings menu trigger's id: the dialogs it opens return focus to it. */
const SETTINGS_TRIGGER_ID = "shell-settings";

/** A warning chip that is also the way into its recovery dialog. */
const WARNING_CHIP_CLASS =
	"border-warning/60 bg-warning-subtle text-warning-foreground hover:bg-warning-subtle hover:text-warning-foreground text-body h-6 shrink-0 gap-1.5 rounded-[2px] px-2 font-normal";

/** Inputs for the header. */
interface HeaderProps {
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
	hold: BoardHold | null;
	elsewhere: NoteWrittenElsewhere | null;
}

const NO_PANE: PaneSummary = {
	connected: false,
	holder: null,
	hold: null,
	elsewhere: null,
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
	return {
		connected: pane.status.connected,
		holder: pane.holder,
		hold: pane.status.hold,
		elsewhere: pane.status.writtenElsewhere,
	};
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
function Breadcrumb(props: BreadcrumbProps): React.JSX.Element {
	const { identity } = props;
	return (
		<nav aria-label="Current board" className="flex min-w-0 flex-1 items-center gap-2">
			<span className="text-board truncate">{identity.board}</span>
			{identity.variant !== "current" && (
				<>
					<span aria-hidden="true" className="text-border text-board font-normal">
						/
					</span>
					<span className="text-muted-foreground text-body truncate">{identity.variant}</span>
				</>
			)}
			{identity.level !== undefined && (
				<Badge variant="outline" size="technical" className="text-muted-foreground">
					{identity.level}
				</Badge>
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
function ConnectionState(props: SummaryProps): React.JSX.Element {
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
function ClaimState(props: SummaryProps): React.JSX.Element | null {
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

/** Inputs for one warning chip. */
interface WarningChipProps {
	kind: RecoveryKind;
	/** What the chip says, its first words the state's name. */
	children: React.ReactNode;
	/** The accessible name: the state and the choice the chip opens. */
	label: string;
	actions: ShellActions;
}

/**
 * The warning chip as the tooltip's element: a 24px outline button.
 * @param props The merged props Base UI hands to the rendered element.
 * @returns The chip button.
 */
function renderWarningChip(props: React.ComponentPropsWithRef<"button">): React.JSX.Element {
	return <Button variant="outline" size="xs" {...props} className={WARNING_CHIP_CLASS} />;
}

/**
 * A warning chip that opens the recovery dialog when chosen. A warning, not
 * a refusal: the person decides what happens next.
 * @param props The recovery kind, the words and the actions.
 * @returns A chip-sized button with a tooltip naming what it opens.
 */
function WarningChip(props: WarningChipProps): React.JSX.Element {
	const { kind, actions } = props;
	const handleClick = useCallback(() => actions.openRecovery(kind), [actions, kind]);
	return (
		<Tooltip>
			<TooltipTrigger render={renderWarningChip} aria-label={props.label} onClick={handleClick}>
				<StatusDot tone="warning" />
				<span>{props.children}</span>
			</TooltipTrigger>
			<TooltipContent>Choose what happens to the note</TooltipContent>
		</Tooltip>
	);
}

/**
 * A board that has stopped saving, or whose note was written elsewhere. The
 * chip is the way back into the choice the notice offered.
 * @param props The flattened pane and the actions.
 * @returns The chip, or nothing when the board is saving normally.
 */
function NoteState(props: SummaryProps & ActionsProps): React.JSX.Element | null {
	const { hold, elsewhere } = props.summary;
	if (hold) {
		return (
			<WarningChip
				kind="hold"
				label={`Not saving, ${hold.writes} changes held: choose what happens to the note`}
				actions={props.actions}
			>
				Not saving · <span className="font-mono">{hold.writes}</span> held
			</WarningChip>
		);
	}
	if (elsewhere) {
		return (
			<WarningChip
				kind="elsewhere"
				label="Note written elsewhere: choose what happens to the note"
				actions={props.actions}
			>
				Note written elsewhere
			</WarningChip>
		);
	}
	return null;
}

/** Inputs for the pieces that only need the actions. */
interface ActionsProps {
	actions: ShellActions;
}

/**
 * Open, New, Save and Clear.
 * @param props The board actions.
 * @returns Four text buttons.
 */
function BoardActions(props: ActionsProps): React.JSX.Element {
	const { actions } = props;
	const handleOpen = useCallback(() => actions.openBoard(), [actions]);
	const handleNew = useCallback(() => actions.createBoard(), [actions]);
	const handleSave = useCallback(() => actions.saveBoard(), [actions]);
	const handleClear = useCallback(() => actions.clearBoard(), [actions]);
	return (
		<span className="flex shrink-0 items-center gap-0.5">
			<Button variant="ghost" size="sm" onClick={handleOpen}>
				Open
			</Button>
			<Button variant="ghost" size="sm" onClick={handleNew}>
				New
			</Button>
			<Button variant="ghost" size="sm" onClick={handleSave}>
				Save
			</Button>
			<Button variant="ghost" size="sm" onClick={handleClear}>
				Clear
			</Button>
		</span>
	);
}

const SETTINGS_ITEMS: ReadonlyArray<{ surface: SettingsSurface; label: string }> = [
	{ surface: "opener", label: "Opener settings" },
	{ surface: "agent", label: "Agent settings" },
	{ surface: "library", label: "Install library" },
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
function SettingsItem(props: SettingsItemProps): React.JSX.Element {
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
function renderMenuTrigger(props: React.ComponentPropsWithRef<"button">): React.JSX.Element {
	return <DropdownMenuTrigger {...props} />;
}

/**
 * The settings menu.
 * @param props The action that opens a settings surface.
 * @returns A dropdown behind a gear icon.
 */
function SettingsMenu(props: ActionsProps): React.JSX.Element {
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
function ThemeToggle(props: ThemeToggleProps): React.JSX.Element {
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
function Header(props: HeaderProps): React.JSX.Element {
	const { actions } = props;
	const summary = summarisePane(props.pane);
	return (
		<header className="border-border bg-background flex h-14 min-w-0 shrink-0 items-stretch overflow-hidden border-b">
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
				<NoteState summary={summary} actions={actions} />
			</div>
			<Separator orientation="vertical" />
			<div className="flex shrink-0 items-center gap-1 px-4">
				<BoardActions actions={actions} />
			</div>
			<Separator orientation="vertical" />
			<div className="flex shrink-0 items-center gap-1 px-3">
				<SettingsMenu actions={actions} />
				<ThemeToggle theme={props.theme} actions={actions} />
			</div>
		</header>
	);
}

export { Header, SETTINGS_TRIGGER_ID, type HeaderProps };

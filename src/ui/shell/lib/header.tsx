// The 56px header: wordmark, board breadcrumb, then the live state and the
// controls that act on the board. Pane controls live in the pane bar. The
// text pieces shrink and truncate so a narrower window never clips the row.

import { RiMoonLine, RiSettings3Line, RiSunLine } from "@remixicon/react";
import { useCallback } from "react";

import { Badge } from "@/ui/components/badge";
import { Button, buttonVariants } from "@/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/ui/components/dropdown-menu";
import { Separator } from "@/ui/components/separator";
import type {
	SettingsSurface,
	ShellActions,
	ShellPane,
	ThemeChoice,
} from "@/ui/shell/lib/contracts";
import { StatusDot } from "@/ui/shell/lib/status-dot";
import type { BoardHold, BoardIdentity, LockHolder, NoteWrittenElsewhere } from "@/ui/types";

const ICON_BUTTON_CLASS = buttonVariants({ variant: "ghost", size: "icon-sm" });

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
 * The board's address as a breadcrumb: name, variant when it is not the
 * current one, and level as a small technical badge.
 * @param props The identity to spell out.
 * @returns The breadcrumb.
 */
function Breadcrumb(props: BreadcrumbProps): React.JSX.Element {
	const { identity } = props;
	return (
		<nav aria-label="Current board" className="flex min-w-0 flex-1 items-center gap-2 text-sm">
			<span className="truncate font-medium">{identity.board}</span>
			{identity.variant !== "current" && (
				<>
					<span className="text-muted-foreground">/</span>
					<span className="truncate">{identity.variant}</span>
				</>
			)}
			{identity.level !== undefined && (
				<Badge variant="outline" className="font-mono font-medium">
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
		<span className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs">
			<StatusDot tone={connected ? "live" : "idle"} />
			{connected ? "Connected" : "Disconnected"}
		</span>
	);
}

/**
 * Who holds the board. The take-back control sits in the pane's claim banner.
 * @param props The flattened pane.
 * @returns The claim badge, or nothing while the board is free.
 */
function ClaimState(props: SummaryProps): React.JSX.Element | null {
	const claim = describeClaim(props.summary.holder);
	if (!claim) {
		return null;
	}
	return (
		<Badge variant="outline" className="max-w-72 min-w-0 gap-1.5">
			<StatusDot tone="live" />
			<span className="shrink-0">{claim.label}</span>
			{claim.reason !== null && (
				<span className="text-muted-foreground truncate font-normal">· {claim.reason}</span>
			)}
		</Badge>
	);
}

/**
 * A board that has stopped saving, or whose note was written elsewhere.
 * @param props The flattened pane.
 * @returns The indicator, or nothing when the board is saving normally.
 */
function NoteState(props: SummaryProps): React.JSX.Element | null {
	const { hold, elsewhere } = props.summary;
	if (hold) {
		return (
			<Badge variant="destructive" className="shrink-0 gap-1.5">
				<StatusDot tone="warning" />
				Not saving · <span className="font-mono">{hold.writes}</span> held
			</Badge>
		);
	}
	if (elsewhere) {
		return (
			<Badge variant="secondary" className="shrink-0 gap-1.5">
				<StatusDot tone="warning" />
				Note written elsewhere
			</Badge>
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
	return <DropdownMenuItem onClick={handleClick}>{props.label}</DropdownMenuItem>;
}

/**
 * The settings menu.
 * @param props The action that opens a settings surface.
 * @returns A dropdown behind a gear icon.
 */
function SettingsMenu(props: ActionsProps): React.JSX.Element {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger className={ICON_BUTTON_CLASS} aria-label="Settings">
				<RiSettings3Line />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-44">
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
 * Switch between the light and dark themes.
 * @param props The current theme and the action that changes it.
 * @returns A sun or moon button named for the theme it switches to.
 */
function ThemeToggle(props: ThemeToggleProps): React.JSX.Element {
	const { theme, actions } = props;
	const next: ThemeChoice = theme === "dark" ? "light" : "dark";
	const handleClick = useCallback(() => actions.setTheme(next), [actions, next]);
	return (
		<Button
			variant="ghost"
			size="icon-sm"
			aria-label={`Switch to ${next} theme`}
			onClick={handleClick}
		>
			{theme === "dark" ? <RiSunLine /> : <RiMoonLine />}
		</Button>
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
		<header className="border-border bg-background flex h-14 min-w-0 shrink-0 items-center gap-3 overflow-hidden border-b px-4">
			<h1 className="wordmark shrink-0">
				<span className="sr-only">archboard</span>
			</h1>
			<Separator orientation="vertical" className="h-6" />
			<Breadcrumb identity={props.current} />
			<span className="flex min-w-0 shrink items-center gap-3">
				<ConnectionState summary={summary} />
				<ClaimState summary={summary} />
				<NoteState summary={summary} />
			</span>
			<Separator orientation="vertical" className="h-6" />
			<BoardActions actions={actions} />
			<SettingsMenu actions={actions} />
			<ThemeToggle theme={props.theme} actions={actions} />
		</header>
	);
}

export { Header, type HeaderProps };

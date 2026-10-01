// The 56px header: four sections under full-height one-pixel rules. The
// wordmark, the board breadcrumb, the live state chips, and the settings. Pane
// controls live in the pane bar, and nothing here changes a board: a user
// reads an architecture an agent wrote (ADR 0023). The text pieces shrink and
// truncate so a narrower window never clips the row.

import { RiArrowRightSLine, RiMoonLine, RiSettings3Line, RiSunLine } from "@remixicon/react";
import { useCallback, type JSX, type ReactNode } from "react";

import { Separator } from "@/ui/components/separator";
import type { Reading, ShownVariant } from "@/ui/shell/lib/reading";
import type { ShellActions, ThemeChoice } from "@/ui/shell/types/contracts";
import { IconButton } from "@/ui/shell/components/IconButton";
import { StatusDot } from "@/ui/shell/components/StatusDot";
import type { CatalogBoard } from "@/ui/types";
import { VariantMark } from "@/ui/variant-lifecycle";

/** The settings trigger's id: the dialog it opens returns focus to it. */
const SETTINGS_TRIGGER_ID = "shell-settings";

/** Inputs for the header. */
interface HeaderProps {
	diagnostics?: ReactNode;
	/** What the active pane is reading. */
	reading: Reading;
	theme: ThemeChoice;
	/** Whether the active pane's socket is up; the header says so only when it is not. */
	connected: boolean;
	actions: ShellActions;
}

/** Inputs for one ancestor in the breadcrumb. */
interface AncestorProps {
	board: CatalogBoard;
	actions: ShellActions;
}

/**
 * A board the one being read sits under: a way back up.
 * @param props The board and the actions.
 * @returns The crumb.
 */
function Ancestor(props: AncestorProps): JSX.Element {
	const { board, actions } = props;
	const handleClick = useCallback(() => actions.selectBoard(board.key), [actions, board.key]);
	return (
		<>
			<button
				type="button"
				onClick={handleClick}
				className="text-muted-foreground hover:text-foreground text-control max-w-56 shrink truncate rounded-[3px] font-medium"
			>
				{board.name}
			</button>
			<RiArrowRightSLine className="text-muted-foreground/70 size-4 shrink-0" aria-hidden="true" />
		</>
	);
}

/** Inputs for the breadcrumb. */
interface BreadcrumbProps {
	reading: Reading;
	actions: ShellActions;
}

/**
 * Where the reader is: the boards above, the board in the header's one large
 * size with its level, and the variant shown, with its lifecycle mark, when it
 * is not the one the board's name opens.
 * @param props The reading and the actions.
 * @returns The breadcrumb.
 */
function Breadcrumb(props: BreadcrumbProps): JSX.Element {
	const { reading, actions } = props;
	return (
		<nav aria-label="Current board" className="flex min-w-0 flex-1 items-center gap-1.5">
			{reading.ancestors.map((board) => (
				<Ancestor key={board.key} board={board} actions={actions} />
			))}
			<span className="text-board truncate">{reading.name ?? "No board"}</span>
			{reading.level !== null && (
				<span className="text-technical text-muted-foreground shrink-0 font-mono">
					{reading.level}
				</span>
			)}
			{reading.variant !== null && <ShownVariantName variant={reading.variant} />}
			{reading.unbuilt && (
				<span
					data-slot="board-not-built"
					className="text-technical text-muted-foreground border-muted-foreground/60 ml-1.5 inline-flex h-5 shrink-0 items-center rounded-[2px] border border-dashed px-1.5 font-mono"
				>
					not built
				</span>
			)}
		</nav>
	);
}

/**
 * The variant the board is read in, after its name: the lifecycle's mark, the
 * same one the navigator draws, and the variant's name.
 * @param props The variant.
 * @param props.variant Its name and, when the vault lists it, its lifecycle.
 * @returns The variant's name.
 */
function ShownVariantName(props: { readonly variant: ShownVariant }): JSX.Element {
	const { name, lifecycle } = props.variant;
	return (
		<span className="ml-1.5 flex min-w-0 shrink items-center gap-1">
			{lifecycle !== null && <VariantMark lifecycle={lifecycle} />}
			<span className="sr-only">
				{lifecycle === null ? "showing " : `showing the ${lifecycle} `}
			</span>
			<span data-slot="board-state" className="text-control text-foreground truncate font-medium">
				{name}
			</span>
		</span>
	);
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
 * @param props The reading, theme, connection and actions.
 * @returns The 56px header row with its one-pixel bottom rule.
 */
function Header(props: HeaderProps): JSX.Element {
	const { actions } = props;
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
				<Breadcrumb reading={props.reading} actions={actions} />
			</div>
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

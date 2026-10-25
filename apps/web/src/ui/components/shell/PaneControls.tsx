// A pane's own parts of its header, which the shell decides and the pane's
// stage places: its letter while two panes share the centre, and at the
// header's end what can be done with this pane — move its board to another
// repository, present it, open a second pane beside it, close it — with its
// trouble when its socket is down. Each
// control acts on the pane whose header it sits in, never on "the active
// pane", so what a click does is where the click is.

import { RiAddLine, RiCloseLine, RiFullscreenLine } from "@remixicon/react";
import { useCallback, type JSX } from "react";

import { MoveBoardControl } from "#ui/components/board-move/MoveBoardControl.tsx";
import { cn, IconButton } from "@archboard/ui-kit/components";
import type { ShellActions, ShellPane } from "#ui/rules/shell/contracts.ts";
import { presentShortcutLabel } from "#ui/rules/shell/shortcuts.ts";
import { StatusDot } from "#ui/components/shell/StatusDot.tsx";

/**
 * A pane's letter, as the navigator's chips draw it: filled for the pane with
 * focus, outlined for the other.
 * @param props The letter and whether its pane has focus.
 * @param props.letter The letter.
 * @param props.active Whether its pane has focus.
 * @returns The chip.
 */
function PaneLetter(props: { readonly letter: string; readonly active: boolean }): JSX.Element {
	return (
		<span
			data-slot="pane-letter"
			data-active={props.active ? "" : undefined}
			className={cn(
				"rounded-chip inline-flex size-[18px] shrink-0 items-center justify-center border font-mono text-[11px] font-medium",
				props.active
					? "border-foreground bg-foreground text-background"
					: "border-muted-foreground/60 text-muted-foreground",
			)}
		>
			<span className="sr-only">Pane </span>
			{props.letter}
		</span>
	);
}

/** Inputs for one pane's controls. */
interface PaneControlsProps {
	readonly pane: ShellPane;
	readonly letter: string;
	readonly paneCount: number;
	readonly actions: ShellActions;
}

/**
 * Move this pane's board to another repository, present this pane, open a
 * second pane beside it while it is alone, close it while it is not, and say so
 * when its socket is down.
 * @param props The pane, its letter, how many panes there are and the actions.
 * @returns The controls.
 */
function PaneControls(props: PaneControlsProps): JSX.Element {
	const { pane, letter, paneCount, actions } = props;
	const { paneId, connected } = pane.status;
	const handleAdd = useCallback(() => actions.addPane(), [actions]);
	const handleClose = useCallback(() => actions.closePane(paneId), [actions, paneId]);
	const handlePresent = useCallback(
		() => actions.present({ kind: "live", paneId }),
		[actions, paneId],
	);
	const alone = paneCount < 2;
	return (
		<span className="flex shrink-0 items-center gap-1">
			{!connected && (
				<output className="text-body text-foreground mr-1 flex items-center gap-1.5 font-medium">
					<StatusDot tone="warning" />
					Reconnecting
				</output>
			)}
			<MoveBoardControl status={pane.status} boardName={pane.boardName} />
			<IconButton
				label={alone ? "Present fullscreen" : `Present pane ${letter} fullscreen`}
				shortcut={presentShortcutLabel()}
				onClick={handlePresent}
			>
				<RiFullscreenLine />
			</IconButton>
			{alone ? (
				<IconButton label="Open a second pane" onClick={handleAdd}>
					<RiAddLine />
				</IconButton>
			) : (
				<IconButton label={`Close pane ${letter}`} onClick={handleClose}>
					<RiCloseLine />
				</IconButton>
			)}
		</span>
	);
}

export { PaneControls, PaneLetter };

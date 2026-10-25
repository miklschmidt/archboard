// The centre: one or two panes side by side. Each pane draws one header row,
// and the shell hands it what the shell owns of that row: the pane's letter
// while there are two, the pane's own controls, and under the row the claim
// banner while an agent claims the board. The same element is the fullscreen
// root: presenting a pane hides the others rather than remounting anything,
// so a pane's session never restarts.

import { useMemo, type JSX, type ReactNode } from "react";

import { Separator } from "@archboard/ui-kit/components";
import {
	type PaneChrome,
	PaneChromeContext,
} from "#ui/components/semantic-board-canvas/PaneChrome.tsx";
import { ClaimBanner } from "#ui/components/shell/ClaimBanner.tsx";
import { PaneControls, PaneLetter } from "#ui/components/shell/PaneControls.tsx";
import { useKept } from "#ui/hooks/shell/use-kept.ts";
import type { ShellActions, ShellPane, ShellPresentation } from "#ui/rules/shell/contracts.ts";
import { paneLetter } from "#ui/rules/shell/pane-letters.ts";
import { PresentationBar } from "#ui/components/shell/PresentationBar.tsx";
import { RecoveryMessage } from "#ui/components/shell/RecoveryMessage.tsx";

/** Inputs for the stage row. */
interface PaneStagesProps {
	panes: readonly ShellPane[];
	activePaneId: string;
	/** The pane presented fullscreen, or null in the workspace. */
	presentation: ShellPresentation | null;
	/** The key that starts and ends voice, for the presentation bar. */
	voiceControls: ReactNode;
	/** The fullscreen root: the application presents this element. */
	attachStage: ((element: HTMLDivElement | null) => void) | undefined;
	actions: ShellActions;
}

/**
 * Whether a pane is hidden by a presentation of another pane, or by recovery.
 * @param presentation The presentation, or null.
 * @param paneId The pane asking.
 * @returns True when the pane must not be shown.
 */
function hiddenBy(presentation: ShellPresentation | null, paneId: string): boolean {
	if (presentation === null) {
		return false;
	}
	return presentation.kind === "recovery" || presentation.paneId !== paneId;
}

/**
 * Find a pane by id.
 * @param panes The panes.
 * @param paneId The pane wanted.
 * @returns The pane, or null.
 */
function paneById(panes: readonly ShellPane[], paneId: string): ShellPane | null {
	return panes.find((pane) => pane.status.paneId === paneId) ?? null;
}

/** Inputs for the presentation's own chrome. */
interface PresentationChromeProps {
	presentation: ShellPresentation | null;
	presented: ShellPane | null;
	voiceControls: ReactNode;
	actions: ShellActions;
}

/**
 * The bar above a presented pane and, when the presented pane is
 * disconnected, the recovery message.
 * @param props The presentation, the pane it names and the actions.
 * @returns The chrome, or nothing in the workspace.
 */
function PresentationChrome(props: PresentationChromeProps): JSX.Element | null {
	const { presentation, presented } = props;
	if (presentation === null || presented === null) {
		return null;
	}
	return (
		<>
			<PresentationBar
				pane={presented}
				error={presentation.kind === "live" ? (presentation.error ?? null) : null}
				voiceControls={props.voiceControls}
				actions={props.actions}
			/>
			{presentation.kind === "recovery" && <RecoveryMessage message={presentation.message} />}
		</>
	);
}

/**
 * One or two panes side by side with a shared one-pixel separator, under the
 * presentation bar while a pane is presented.
 * @param props The panes to mount, the presentation and the actions.
 * @returns The stage root.
 */
function PaneStages(props: PaneStagesProps): JSX.Element {
	const { presentation, panes, actions, attachStage, voiceControls, activePaneId } = props;
	const presented = presentation ? paneById(panes, presentation.paneId) : null;
	return (
		<div
			ref={attachStage}
			data-slot="pane-stages"
			data-presenting={presented ? "" : undefined}
			className="bg-sidebar flex min-h-0 min-w-0 flex-1 flex-col"
		>
			<PresentationChrome
				presentation={presentation}
				presented={presented}
				voiceControls={voiceControls}
				actions={actions}
			/>
			<div className="flex min-h-0 min-w-0 flex-1">
				{panes.map((pane, index) => (
					<PaneStage
						key={pane.status.paneId}
						pane={pane}
						letter={paneLetter(index)}
						paneCount={panes.length}
						active={pane.status.paneId === activePaneId}
						framed={panes.length > 1 && presented === null}
						first={index === 0 || presented !== null}
						hidden={hiddenBy(presentation, pane.status.paneId)}
						actions={actions}
					/>
				))}
			</div>
		</div>
	);
}

/**
 * The stage's classes: the inset gold ring is drawn only while two panes
 * share the centre, as a layer over the pane so the header, the picture and
 * the sidebar, each with a ground of its own, never cover it.
 * @param framed Whether the active stage should carry the ring.
 * @returns The class list.
 */
function stageClass(framed: boolean): string {
	return framed
		? "relative flex min-h-0 min-w-0 flex-1 flex-col outline-none data-active:after:pointer-events-none data-active:after:absolute data-active:after:inset-0 data-active:after:z-30 data-active:after:ring-1 data-active:after:ring-primary-mark data-active:after:ring-inset"
		: "relative flex min-h-0 min-w-0 flex-1 flex-col outline-none";
}

/**
 * Whether two shell panes say the same: each part is the same one. The shell
 * view makes every pane new for any piece of news, and a pane whose own parts
 * did not change keeps the shell's parts of its header, so its header and the
 * pane's search are not drawn again (TASK-385).
 * @param kept The pane kept from before.
 * @param next The pane this render.
 * @returns True when every part is the same.
 */
function samePane(kept: ShellPane, next: ShellPane): boolean {
	const parts = Object.keys(next);
	return (
		parts.length === Object.keys(kept).length &&
		parts.every((part) => Object.is(Reflect.get(kept, part), Reflect.get(next, part)))
	);
}

/** Inputs for one pane's stage. */
interface PaneStageProps {
	pane: ShellPane;
	/** The pane's letter, by its place. */
	letter: string;
	/** How many panes share the centre. */
	paneCount: number;
	active: boolean;
	/** Draw the focus ring on the active stage: only while two panes share the centre. */
	framed: boolean;
	first: boolean;
	hidden: boolean;
	actions: ShellActions;
}

/**
 * One pane, with the separator that divides it from the pane before, and the
 * shell's parts of its header. The pane itself is the application's. With two
 * panes, the active one carries a one-pixel inset gold ring and a filled
 * letter.
 * @param props The pane, its letter, whether it is first, framed, hidden and the actions.
 * @returns The mounted pane.
 */
function PaneStage(props: PaneStageProps): JSX.Element {
	const { actions, letter, paneCount, active } = props;
	const pane = useKept(props.pane, samePane);
	const { paneId } = pane.status;
	const chrome = useMemo<PaneChrome>(
		() => ({
			letter: paneCount > 1 ? <PaneLetter letter={letter} active={active} /> : null,
			controls: (
				<PaneControls pane={pane} letter={letter} paneCount={paneCount} actions={actions} />
			),
			notice: <ClaimBanner pane={pane} actions={actions} />,
			shared: paneCount > 1,
			active,
		}),
		[pane, letter, paneCount, active, actions],
	);
	return (
		<>
			{!props.first && !props.hidden && <Separator orientation="vertical" />}
			<section
				aria-label={`Pane ${paneId}`}
				aria-current={props.active ? "true" : undefined}
				data-active={props.active ? "" : undefined}
				hidden={props.hidden}
				// Focus lands here when a presentation ends: programmatic only, no tab stop.
				tabIndex={-1}
				className={stageClass(props.framed)}
			>
				<PaneChromeContext.Provider value={chrome}>{pane.stage}</PaneChromeContext.Provider>
			</section>
		</>
	);
}

export { PaneStages, type PaneStagesProps };

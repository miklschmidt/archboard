import { useCallback, useRef, useSyncExternalStore, type ReactNode, type RefObject } from "react";

import { Button } from "../../button/index.js";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "../../dialog/index.js";
import { WorkbenchCoordinatorDisclosure } from "../../workbench-coordinator/index.js";
import { WorkbenchThreadLink } from "../../workbench-thread-link/index.js";
import type { WorkbenchFramePane, WorkbenchFramePaneIdentity } from "../contract.js";

interface WorkbenchSettingsDialogProps {
	readonly open: boolean;
	readonly coordinatorId: string;
	readonly showCoordinator: boolean;
	readonly activePaneId: WorkbenchFramePaneIdentity["id"];
	readonly onActivePaneChange: (paneId: WorkbenchFramePaneIdentity["id"]) => void;
	readonly onClose: () => void;
	readonly panes: readonly WorkbenchFramePane[];
	readonly returnFocusRef: RefObject<HTMLButtonElement | null>;
}

function subscribeToAbsentPane(): () => void {
	return () => undefined;
}

function absentPaneState(): null {
	return null;
}

export function WorkbenchSettingsDialog({
	open,
	coordinatorId,
	showCoordinator,
	activePaneId,
	onActivePaneChange,
	onClose,
	panes,
	returnFocusRef,
}: WorkbenchSettingsDialogProps): ReactNode {
	const closeRef = useRef<HTMLButtonElement | null>(null);
	const coordinatorRef = useRef<HTMLElement | null>(null);
	const activePane = panes.find((pane) => pane.identity.id === activePaneId) ?? null;
	const activeState = useSyncExternalStore(
		activePane?.transport.subscribe ?? subscribeToAbsentPane,
		activePane?.transport.state ?? absentPaneState,
		activePane?.transport.state ?? absentPaneState,
	);
	const requestOpenChange = useCallback(
		(nextOpen: boolean): void => {
			if (!nextOpen) onClose();
		},
		[onClose],
	);
	const choosePane = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>): void => {
			const paneId = event.currentTarget.dataset.settingsPane;
			if (paneId) onActivePaneChange(paneId);
		},
		[onActivePaneChange],
	);
	return (
		<Dialog open={open} onOpenChange={requestOpenChange}>
			<DialogContent
				className="agent-settings-dialog gap-0 p-0 overflow-hidden"
				data-workbench-settings=""
				initialFocus={showCoordinator ? coordinatorRef : closeRef}
				finalFocus={returnFocusRef}
			>
				<header className="flex items-start justify-between gap-region border-b border-border px-panel py-region">
					<div className="min-w-0">
						<DialogTitle>Agent settings</DialogTitle>
						<DialogDescription className="mt-grid-tight">
							Choose which pane the agent uses and manage its linked workhorse.
						</DialogDescription>
					</div>
					<DialogClose
						aria-label="Close agent settings"
						className="p-0 size-touch-target shrink-0 text-muted-foreground"
						ref={closeRef}
					>
						<span aria-hidden="true">×</span>
					</DialogClose>
				</header>
				<div className="min-h-0 overflow-y-auto">
					{panes.length > 1 ? (
						<fieldset className="m-0 border-0 border-b border-border px-panel py-region">
							<legend className="p-0 text-kicker font-semibold text-muted-foreground">
								Agent pane target
							</legend>
							<div className="mt-control flex flex-wrap gap-control">
								{panes.map((pane) => (
									<Button
										aria-pressed={pane.identity.id === activePaneId}
										data-settings-pane={pane.identity.id}
										key={pane.identity.id}
										onClick={choosePane}
										tone={pane.identity.id === activePaneId ? "primary" : "secondary"}
										type="button"
									>
										{pane.identity.label}
									</Button>
								))}
							</div>
						</fieldset>
					) : null}
					{activePane === null ? (
						<p className="m-0 px-panel py-region text-body text-destructive" role="alert">
							The selected pane is no longer available. Choose another pane.
						</p>
					) : (
						<>
							<WorkbenchThreadLink
								className="border-x-0 border-t-0 px-panel py-region"
								controller={activePane.threadLink.controller}
								hostRecoveryIntents={activePane.threadLink.hostRecoveryIntents}
								initialAccountForm={activePane.threadLink.initialAccountForm}
								paneId={activePane.identity.id}
								transport={activePane.transport}
							/>
							<details
								className="group border-b border-border bg-surface"
								id={coordinatorId}
								open={showCoordinator}
							>
								<summary
									ref={coordinatorRef}
									className="flex min-h-touch-target cursor-pointer items-center justify-between px-panel text-body font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
								>
									<span>Coordinator details</span>
									<span aria-hidden="true" className="text-muted-foreground group-open:rotate-90">
										›
									</span>
								</summary>
								{activeState === null ? null : (
									<WorkbenchCoordinatorDisclosure
										className="border-x-0 border-b-0 px-panel"
										state={activeState}
									/>
								)}
							</details>
						</>
					)}
				</div>
				<footer className="flex justify-end border-t border-border px-panel py-control">
					<DialogClose>Close</DialogClose>
				</footer>
			</DialogContent>
		</Dialog>
	);
}

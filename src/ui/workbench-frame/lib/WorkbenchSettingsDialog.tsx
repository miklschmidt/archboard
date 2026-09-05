import { RiCloseLine, RiArrowRightSLine } from "@remixicon/react";
import {
	useCallback,
	useEffect,
	useRef,
	useSyncExternalStore,
	type ReactNode,
	type RefObject,
} from "react";

import { Button } from "../../button/index.js";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
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
	readonly onConnected: () => void;
	readonly conversationId: string;
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
	onConnected,
	conversationId,
	panes,
	returnFocusRef,
}: WorkbenchSettingsDialogProps): ReactNode {
	const closeRef = useRef<HTMLButtonElement | null>(null);
	const coordinatorRef = useRef<HTMLElement | null>(null);
	const connectionCompleted = useRef(false);
	const observedAction = useRef<{ paneId: string; revision: number } | null>(null);
	const activePane = panes.find((pane) => pane.identity.id === activePaneId) ?? null;
	const activeState = useSyncExternalStore(
		activePane?.transport.subscribe ?? subscribeToAbsentPane,
		activePane?.transport.state ?? absentPaneState,
		activePane?.transport.state ?? absentPaneState,
	);
	const action = useSyncExternalStore(
		activePane?.threadLink.controller.subscribe ?? subscribeToAbsentPane,
		activePane?.threadLink.controller.snapshot ?? absentPaneState,
		activePane?.threadLink.controller.snapshot ?? absentPaneState,
	);
	useEffect(() => {
		if (!open || activePane === null || action === null) {
			observedAction.current = null;
			return;
		}
		const observed = observedAction.current;
		if (observed === null || observed.paneId !== activePane.identity.id) {
			connectionCompleted.current = false;
			observedAction.current = { paneId: activePane.identity.id, revision: action.revision };
			return;
		}
		if (
			action.revision > observed.revision &&
			action.state === "succeeded" &&
			["create", "attach", "relink"].includes(action.action)
		) {
			observedAction.current = { ...observed, revision: action.revision };
			connectionCompleted.current = true;
			onConnected();
		}
	}, [action, activePane, onConnected, open]);
	const finalFocus = useCallback(() => {
		const conversation = globalThis.document
			?.getElementById(conversationId)
			?.closest('[data-workbench-region="conversation"]');
		return (
			(connectionCompleted.current
				? conversation?.querySelector<HTMLTextAreaElement>(
						'[data-workbench-composer="executable"] textarea:not([readonly]):not([disabled])',
					)
				: null) ?? returnFocusRef.current
		);
	}, [conversationId, returnFocusRef]);
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
				className="agent-settings-dialog max-h-[calc(100dvh-2*var(--arch-space-panel))] overflow-hidden"
				data-workbench-settings=""
				initialFocus={showCoordinator ? coordinatorRef : closeRef}
				finalFocus={finalFocus}
			>
				<DialogHeader className="shrink-0 pr-touch-target">
					<DialogTitle>Agent settings</DialogTitle>
					<DialogDescription>
						{activePane?.identity.label ?? "Choose a pane"} · Connection and account
					</DialogDescription>
				</DialogHeader>
				<DialogClose
					aria-label="Close agent settings"
					className="absolute top-control right-control size-touch-target border-transparent bg-transparent p-0 text-muted-foreground"
					ref={closeRef}
				>
					<RiCloseLine aria-hidden="true" focusable="false" size={20} />
				</DialogClose>
				<div className="min-h-0 overflow-y-auto">
					{panes.length > 1 ? (
						<fieldset className="m-0 border-0 pb-region">
							<legend className="p-0 text-kicker font-semibold text-muted-foreground">Pane</legend>
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
						<p className="m-0 py-region text-body text-destructive" role="alert">
							The selected pane is no longer available. Choose another pane.
						</p>
					) : (
						<>
							<WorkbenchThreadLink
								className="p-0"
								controller={activePane.threadLink.controller}
								hostRecoveryIntents={activePane.threadLink.hostRecoveryIntents}
								initialAccountForm={activePane.threadLink.initialAccountForm}
								paneId={activePane.identity.id}
								transport={activePane.transport}
							/>
							<details
								className="group border-t border-border"
								id={coordinatorId}
								open={showCoordinator}
							>
								<summary
									ref={coordinatorRef}
									className="flex min-h-touch-target cursor-pointer items-center justify-between text-body font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
								>
									<span>Coordinator details</span>
									<RiArrowRightSLine
										aria-hidden="true"
										focusable="false"
										size={18}
										className="text-muted-foreground group-open:rotate-90"
									/>
								</summary>
								{activeState === null ? null : (
									<WorkbenchCoordinatorDisclosure state={activeState} />
								)}
							</details>
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

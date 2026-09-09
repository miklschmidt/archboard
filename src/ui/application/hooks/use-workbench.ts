// The workbench over the focused pane: each pane's current transport, heard
// through one publication per pane whenever the pane publishes its status,
// and the owners composed over the focused pane's transport.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PaneHandles } from "@/ui/application/lib/pane-handles";
import { createWorkbenchOwners, type WorkbenchOwners } from "@/ui/application/lib/workbench-owners";
import {
	createWorkbenchTransportPublication,
	type WorkbenchTransportPublication,
} from "@/ui/canvas/workbench-publication";
import type { BrowserWorkbenchTransport } from "@/ui/workbench-transport";

/** The transports by pane id; null while a pane has none. */
type PaneTransports = Readonly<Record<string, BrowserWorkbenchTransport | null>>;

/** The workbench's state and the moves the panes drive. */
interface WorkbenchHost {
	/** The owners over the focused pane's transport, or null while it has none. */
	readonly owners: WorkbenchOwners | null;
	/** A pane published its status: re-read its transport. */
	readonly paneReported: (paneId: string) => void;
	/** A pane went: forget its transport. */
	readonly paneGone: (paneId: string) => void;
}

/**
 * The workbench host.
 * @param handles The pane sessions.
 * @param activePaneId The focused pane.
 * @param openAgentSettings The settings door the runtime opens.
 * @returns The owners and the moves.
 */
function useWorkbench(
	handles: PaneHandles,
	activePaneId: string,
	openAgentSettings: () => void,
): WorkbenchHost {
	const [transports, setTransports] = useState<PaneTransports>({});
	const publications = useRef(
		new Map<string, WorkbenchTransportPublication<BrowserWorkbenchTransport>>(),
	);

	const publicationFor = useCallback(
		(paneId: string): WorkbenchTransportPublication<BrowserWorkbenchTransport> => {
			const existing = publications.current.get(paneId);
			if (existing !== undefined) {
				return existing;
			}
			const created = createWorkbenchTransportPublication<BrowserWorkbenchTransport>({
				/**
				 * The transport the pane's socket owner holds now.
				 * @returns The transport, or null.
				 */
				current: () => handles.session(paneId)?.workbenchTransport() ?? null,
				listener: {
					/**
					 * The pane's transport changed.
					 * @param transport The transport, or null.
					 */
					publish: (transport) => {
						setTransports((current) => ({ ...current, [paneId]: transport }));
					},
				},
			});
			publications.current.set(paneId, created);
			return created;
		},
		[handles],
	);

	const paneReported = useCallback(
		(paneId: string): void => publicationFor(paneId).reconcile(),
		[publicationFor],
	);
	const paneGone = useCallback((paneId: string): void => {
		publications.current.get(paneId)?.dispose();
		publications.current.delete(paneId);
		setTransports((current) => {
			const { [paneId]: gone, ...rest } = current;
			return gone === undefined ? current : rest;
		});
	}, []);

	const transport = transports[activePaneId] ?? null;
	// Composed in an effect, not a memo: the voice adapter subscribes on
	// creation, so a set that never mounted must never be created.
	const [owners, setOwners] = useState<WorkbenchOwners | null>(null);
	useEffect(() => {
		if (transport === null) {
			setOwners(null);
			return undefined;
		}
		const created = createWorkbenchOwners({
			paneId: activePaneId,
			transport,
			media: handles.media(activePaneId),
			openAgentSettings,
		});
		setOwners(created);
		return () => {
			created.dispose();
			setOwners((current) => (current === created ? null : current));
		};
	}, [activePaneId, transport, handles, openAgentSettings]);

	return useMemo(() => ({ owners, paneReported, paneGone }), [owners, paneReported, paneGone]);
}

export { useWorkbench, type WorkbenchHost };

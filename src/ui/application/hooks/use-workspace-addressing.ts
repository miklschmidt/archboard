// The address bar bound to the panes the application owns. The binding is what
// lets a person's gesture reach the address bar from a callback made before it
// exists: the actions and the dialogs are given the binding's face, and the
// real one is bound here each render.

import { useMemo } from "react";

import { createWorkspacePort, type WorkspacePortDeps } from "@/ui/application/lib/workspace-port";
import type { LiveBinding } from "@/ui/application/lib/live-binding";
import { useWorkspaceAddress, type WorkspaceAddressing } from "@/ui/board-routing";

/**
 * Reconcile the address bar with the panes, and bind what a person's gestures
 * announce themselves through.
 * @param deps The panes, the dialogs and the notices the port composes.
 * @param binding Where the address bar is bound for the callbacks that use it.
 */
function useWorkspaceAddressing(
	deps: WorkspacePortDeps,
	binding: LiveBinding<WorkspaceAddressing>,
): void {
	const { panes, dialogs, notices } = deps;
	const port = useMemo(
		() => createWorkspacePort({ panes, dialogs, notices }),
		[panes, dialogs, notices],
	);
	binding.bind(useWorkspaceAddress(port));
}

export { useWorkspaceAddressing };

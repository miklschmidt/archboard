// The address bar bound to the panes the application owns. The binding is what
// lets a person's gesture reach the address bar from a callback made before it
// exists: the actions are given the binding's face, and the real one is bound
// here each render.

import { useMemo } from "react";

import {
	createWorkspacePort,
	type WorkspacePortDeps,
} from "#ui/clients/application/workspace-port.ts";
import type { LiveBinding } from "#ui/state/application/live-binding.ts";
import {
	useWorkspaceAddress,
	type WorkspaceAddressing,
} from "#ui/hooks/board-routing/use-workspace-address.ts";

/**
 * Reconcile the address bar with the panes, and bind what a person's gestures
 * announce themselves through.
 * @param deps The panes, the readings and the notices the port composes.
 * @param binding Where the address bar is bound for the callbacks that use it.
 */
function useWorkspaceAddressing(
	deps: WorkspacePortDeps,
	binding: LiveBinding<WorkspaceAddressing>,
): void {
	const { panes, notices, readings, vaultOf } = deps;
	const port = useMemo(
		() => createWorkspacePort({ panes, notices, vaultOf, ...(readings ? { readings } : {}) }),
		[panes, notices, readings, vaultOf],
	);
	binding.bind(useWorkspaceAddress(port));
}

export { useWorkspaceAddressing };

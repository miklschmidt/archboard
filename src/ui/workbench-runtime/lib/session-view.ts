// The session view the workbench presentation reads: loading until a
// snapshot exists, empty when nothing is attached, an error when the host
// spoke a contract this browser cannot read, and ready with the snapshot.

import type { WorkbenchSessionView } from "@/ui/workbench/contracts";
import type { BrowserWorkbenchState } from "@/ui/workbench-transport";

/**
 * The session view of a transport state.
 * @param state The transport state.
 * @returns The view.
 */
function sessionView(state: BrowserWorkbenchState): WorkbenchSessionView {
	if (state.snapshot !== null) {
		return { kind: "ready", snapshot: state.snapshot };
	}
	switch (state.state) {
		case "stopped":
			return { kind: "empty", message: state.reason };
		case "incompatible_contract":
			return {
				kind: "error",
				message: state.reason,
				recovery: "Update Archboard or Codex so their workbench protocol versions match.",
			};
		default:
			return { kind: "loading" };
	}
}

export { sessionView };

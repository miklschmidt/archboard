// The address bar as a workspace address: the router that owns the tab's
// history, the workspace the tab was opened on, and the reconciliation between
// what the panes show and what the URL says.

export { createBoardRoutingHost } from "@/ui/board-routing/BoardRoutingHost";
export { useOpeningAddress } from "@/ui/board-routing/hooks/use-opening-address";
export {
	useWorkspaceAddress,
	type NavigationClaim,
	type WorkspaceAddressing,
} from "@/ui/board-routing/hooks/use-workspace-address";
export type { NavigationIntent } from "@/ui/board-routing/intent";
export type { AddressedPane, WorkspaceAddress } from "@/ui/board-routing/address";

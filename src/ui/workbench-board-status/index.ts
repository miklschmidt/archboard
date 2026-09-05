// Canonical board connection and persistence state for a pane's workbench:
// the claim adapter and the pure projection. No presentation lives here.

export { claimFromLockHolder } from "@/ui/workbench-board-status/lib/contract";
export type {
	WorkbenchBoardActivity,
	WorkbenchBoardClaim,
	WorkbenchBoardConnectionState,
	WorkbenchBoardStatusInput,
	WorkbenchBoardStatusSnapshot,
	WorkbenchSemanticContextPresentation,
	WorkbenchSemanticContextState,
	WorkbenchTakeBackResult,
	WorkbenchTakeBackState,
} from "@/ui/workbench-board-status/lib/contract";
export { projectWorkbenchBoardStatus } from "@/ui/workbench-board-status/lib/projection";

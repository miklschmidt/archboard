// The separate voice coordinator's settings, authority and disclosure logic,
// projected from the transport's published state. No disclosure markup lives
// here; the workbench renders its own coordinator line from the snapshot.

export { projectWorkbenchCoordinator } from "@/ui/workbench-coordinator/lib/projection";
export type {
	WorkbenchCoordinatorField,
	WorkbenchCoordinatorFieldState,
	WorkbenchCoordinatorSection,
	WorkbenchCoordinatorSnapshot,
	WorkbenchCoordinatorState,
	WorkbenchCoordinatorStatus,
} from "@/ui/workbench-coordinator/lib/projection";

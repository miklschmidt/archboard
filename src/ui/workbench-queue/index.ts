// The linked workhorse queue: its authoritative order, what each entry may
// do, the six controls and their settlement, and the actions the committed
// queue panel (`@/ui/workbench`) calls. Presentation lives there; this module
// owns the logic, the state and the projection.

export {
	captureWorkbenchQueueTarget,
	createWorkbenchQueueCommands,
} from "@/ui/workbench-queue/lib/actions";
export {
	createWorkbenchQueueController,
	type WorkbenchQueueCommandState,
	type WorkbenchQueueController,
} from "@/ui/workbench-queue/lib/controller";
export {
	WORKBENCH_QUEUE_ENTRY_STATUS_LABELS,
	WORKBENCH_QUEUE_NARRATIVES,
} from "@/ui/workbench-queue/lib/narratives";
export { projectWorkbenchQueue } from "@/ui/workbench-queue/lib/projection";
export { isCoordinatorOwned, planQueueReorder } from "@/ui/workbench-queue/lib/reorder";
export {
	childIdentityOf,
	isStaleWorkbenchQueueState,
	resolveWorkbenchQueueState,
} from "@/ui/workbench-queue/lib/state";
export {
	createWorkbenchQueueStore,
	type WorkbenchQueueObservation,
	type WorkbenchQueueStore,
} from "@/ui/workbench-queue/lib/store";

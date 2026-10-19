// Observing the process table: a process, a process group and the owner a lock file records.
export {
	listProcessGroupObservations,
	listProcessObservations,
	ownerRecord,
	readProcessObservation,
	recordedOwnerIsGone,
	recordedOwnerPid,
	recordedOwnerStartTime,
} from "#runtime/processes/observation.ts";

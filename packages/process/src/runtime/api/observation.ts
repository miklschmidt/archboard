// Observing the process table: a process, a process group and the owner a lock file records.
export {
	listProcessGroupObservations,
	ownerRecord,
	readProcessObservation,
	recordedOwnerIsGone,
	recordedOwnerPid,
	recordedOwnerStartTime,
} from "#runtime/processes/observation.ts";

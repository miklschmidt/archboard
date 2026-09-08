import { listProcessObservations, readProcessObservation } from "@/shared/process-observation";

interface ProcessIdentity {
	readonly pid: number;
	readonly parentPid: number;
	readonly group: number;
	readonly startTime: string;
}

function processIdentity(pid: number): ProcessIdentity | null {
	const observation = readProcessObservation(pid);
	if (observation === undefined || observation.state === "zombie") {
		return null;
	}
	return {
		pid: observation.pid,
		parentPid: observation.parentPid,
		group: observation.pgid,
		startTime: observation.startTime,
	};
}

function exactProcessExists(identity: Readonly<ProcessIdentity>): boolean {
	return processIdentity(identity.pid)?.startTime === identity.startTime;
}

function processGroupMembers(group: number): number[] {
	return listProcessObservations()
		.filter((observation) => observation.state !== "zombie" && observation.pgid === group)
		.map((observation) => observation.pid);
}

function killExactGroup(identity: Readonly<ProcessIdentity>): void {
	if (
		!exactProcessExists(identity) ||
		!processGroupMembers(identity.group).includes(identity.pid)
	) {
		return;
	}
	try {
		process.kill(-identity.group, "SIGKILL");
	} catch (error) {
		const code =
			typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
		if (code !== "ESRCH") {
			throw error;
		}
	}
}

export {
	exactProcessExists,
	killExactGroup,
	processGroupMembers,
	processIdentity,
	type ProcessIdentity,
};

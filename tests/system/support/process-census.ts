import {
	listProcessGroupObservations,
	readProcessObservation,
} from "@archboard/process/observation";

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
	return listProcessGroupObservations(group)
		.filter((observation) => observation.state !== "zombie")
		.map((observation) => observation.pid);
}

/**
 * The live children of a process, as the process table lists them now.
 * @param parentPid The parent.
 * @returns Each child that is not a zombie, read with its kernel birth identity.
 */
function childProcesses(
	parentPid: number,
): NonNullable<ReturnType<typeof readProcessObservation>>[] {
	const table = Bun.spawnSync(["ps", "-A", "-o", "pid=,ppid="], {
		stdout: "pipe",
		stderr: "ignore",
	});
	return table.stdout
		.toString()
		.trim()
		.split("\n")
		.map((line) => line.trim().split(/\s+/).map(Number))
		.filter(([, parent]) => parent === parentPid)
		.flatMap(([pid]) => {
			const observation = pid === undefined ? undefined : readProcessObservation(pid);
			return observation === undefined || observation.state === "zombie" ? [] : [observation];
		});
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
	childProcesses,
	exactProcessExists,
	killExactGroup,
	processGroupMembers,
	processIdentity,
	type ProcessIdentity,
};

import { readFileSync } from "node:fs";

import { TEST_OPENER_LIFECYCLE } from "../../../../src/shared/timing/timing.ts";

function assertBefore(deadline: number, description: string): void {
	if (Date.now() >= deadline) {
		throw new Error(`Timed out waiting for ${description}`);
	}
}

interface LinuxProcessStatEvidence {
	pid: number;
	state: string;
	processGroup: number;
	running: boolean;
}

type ProcessCompletion = "absent" | "nonrunning";

function processCompletionObserved(
	evidence: LinuxProcessStatEvidence | null,
	completion: ProcessCompletion,
): boolean {
	return evidence === null || (completion === "nonrunning" && !evidence.running);
}

function linuxProcessStatPath(pid: number): string {
	if (!Number.isSafeInteger(pid) || pid <= 0) {
		throw new Error(`Invalid Linux process PID ${pid}: expected a positive safe integer.`);
	}
	return `/proc/${pid}/stat`;
}

function invalidLinuxProcessStat(pid: number, diagnostic: string): Error {
	return new Error(
		`Invalid Linux process stat for PID ${pid} at /proc/${pid}/stat: ${diagnostic}.`,
	);
}

function parseLinuxProcessStat(pid: number, stat: string): LinuxProcessStatEvidence {
	linuxProcessStatPath(pid);
	const delimiter = stat.lastIndexOf(") ");
	const opening = stat.indexOf(" (");
	if (opening <= 0 || delimiter <= opening + 1) {
		throw invalidLinuxProcessStat(pid, "missing the final command delimiter");
	}
	const recordPidToken = stat.slice(0, opening);
	if (!/^\d+$/.test(recordPidToken)) {
		throw invalidLinuxProcessStat(
			pid,
			`record PID ${JSON.stringify(recordPidToken)} is not numeric`,
		);
	}
	const recordPid = Number(recordPidToken);
	if (!Number.isSafeInteger(recordPid) || recordPid !== pid) {
		throw invalidLinuxProcessStat(
			pid,
			`record PID ${recordPidToken} does not match expected PID ${pid}`,
		);
	}
	const fields = stat
		.slice(delimiter + 2)
		.trim()
		.split(/\s+/);
	if (fields.length < 3) {
		throw invalidLinuxProcessStat(pid, "expected state, parent PID, and process group fields");
	}
	const state = fields[0]!;
	const processGroupToken = fields[2]!;
	if (state.length !== 1) {
		throw invalidLinuxProcessStat(pid, `process state ${JSON.stringify(state)} is not one token`);
	}
	if (!/^\d+$/.test(processGroupToken)) {
		throw invalidLinuxProcessStat(
			pid,
			`process group ${JSON.stringify(processGroupToken)} is not a positive safe integer`,
		);
	}
	const processGroup = Number(processGroupToken);
	if (!Number.isSafeInteger(processGroup) || processGroup <= 0) {
		throw invalidLinuxProcessStat(
			pid,
			`process group ${JSON.stringify(processGroupToken)} is not a positive safe integer`,
		);
	}
	if (["Z", "X", "x"].includes(state)) {
		return { pid, state, processGroup, running: false };
	}
	if (!["R", "S", "D", "T", "t", "W", "K", "P", "I"].includes(state)) {
		throw invalidLinuxProcessStat(pid, `unknown process state ${JSON.stringify(state)}`);
	}
	return { pid, state, processGroup, running: true };
}

function readLinuxProcessStatEvidence(pid: number): LinuxProcessStatEvidence | null {
	const statPath = linuxProcessStatPath(pid);
	let stat: string;
	try {
		stat = readFileSync(statPath, "utf8");
	} catch (error) {
		const failure = error as NodeJS.ErrnoException;
		if (failure.code === "ENOENT" || failure.code === "ESRCH") {
			return null;
		}
		throw new Error(
			`Could not read Linux process stat for PID ${pid} at ${statPath}: ${failure.message}`,
			{ cause: error },
		);
	}
	return parseLinuxProcessStat(pid, stat);
}

function processExistsEvidence(pid: number): boolean {
	if (process.platform === "linux") {
		return readLinuxProcessStatEvidence(pid)?.running ?? false;
	}
	const command =
		process.platform === "win32"
			? ["tasklist", "/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"]
			: ["ps", "-p", String(pid), "-o", "pid="];
	const result = Bun.spawnSync(command, { stdout: "pipe", stderr: "ignore" });
	if (result.exitCode !== 0) {
		return false;
	}
	const output = result.stdout.toString();
	return process.platform === "win32"
		? output.includes(`,"${pid}",`)
		: output.trim() === String(pid);
}

async function waitForProcessCompletion(
	pid: number,
	deadline: number,
	completion: ProcessCompletion,
): Promise<void> {
	while (true) {
		const completed =
			process.platform === "linux"
				? processCompletionObserved(readLinuxProcessStatEvidence(pid), completion)
				: !processExistsEvidence(pid);
		if (completed) {
			return;
		}
		assertBefore(
			deadline,
			completion === "absent"
				? `direct process ${pid} to be reaped and disappear`
				: `detached process ${pid} to stop running`,
		);
		await Bun.sleep(TEST_OPENER_LIFECYCLE.pollMs);
	}
}

async function waitForProcessAbsence(
	pid: number,
	timeoutMs: number = TEST_OPENER_LIFECYCLE.timeoutMs,
): Promise<void> {
	await waitForProcessCompletion(pid, Date.now() + timeoutMs, "absent");
}

export {
	assertBefore,
	type LinuxProcessStatEvidence,
	type ProcessCompletion,
	processCompletionObserved,
	parseLinuxProcessStat,
	readLinuxProcessStatEvidence,
	processExistsEvidence,
	waitForProcessCompletion,
	waitForProcessAbsence,
};

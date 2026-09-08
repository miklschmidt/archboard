import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

import { TEST_BROWSER_COMMAND_TIMEOUT_MS } from "../../support/timing.ts";

function linuxProcessIdsWithMarkers(markers: ReadonlySet<string>): number[] {
	const found: number[] = [];
	for (const entry of readdirSync("/proc", { withFileTypes: true })) {
		if (!entry.isDirectory() || !/^\d+$/u.test(entry.name)) continue;
		try {
			const environment = readFileSync(`/proc/${entry.name}/environ`, "utf8").split("\0");
			if (environment.some((value) => markers.has(value))) found.push(Number(entry.name));
		} catch {
			// Processes can exit while the audit walks /proc.
		}
	}
	return found;
}

function darwinProcessIdsWithMarkers(markers: ReadonlySet<string>): number[] {
	const result = spawnSync("/bin/ps", ["-A", "-E", "-ww", "-o", "pid=", "-o", "command="], {
		encoding: "utf8",
		env: { LANG: "C", LC_ALL: "C" },
		maxBuffer: 64 * 1024 * 1024,
		timeout: TEST_BROWSER_COMMAND_TIMEOUT_MS,
	});
	if (result.error || result.signal || result.status !== 0) {
		const outcome = result.error
			? result.error.message
			: result.signal
				? `signal ${result.signal}`
				: `exit ${result.status ?? "unknown"}`;
		throw new Error(`Could not inspect macOS process environments: ${outcome}`);
	}

	const found: number[] = [];
	const patterns = [...markers].map(
		(marker) => new RegExp(`(?:^|\\s)${escapeRegex(marker)}(?=\\s|$)`, "u"),
	);
	for (const line of result.stdout.split("\n")) {
		const match = /^\s*(\d+)\s+/u.exec(line);
		if (!match) continue;
		if (patterns.some((pattern) => pattern.test(line))) found.push(Number(match[1]));
	}
	return found;
}

/** Escape one environment marker for an exact regular-expression match. */
function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function processIdsWithEnvironmentMarkers(markers: readonly string[]): number[] {
	if (
		markers.length === 0 ||
		markers.some((marker) => marker.length === 0 || /[\0\r\n]/u.test(marker))
	) {
		throw new Error("Process environment markers must be non-empty single-line values.");
	}
	const wanted = new Set(markers);
	if (process.platform === "linux") return linuxProcessIdsWithMarkers(wanted);
	if (process.platform === "darwin") return darwinProcessIdsWithMarkers(wanted);
	throw new Error(`Process environment census is unsupported on ${process.platform}.`);
}

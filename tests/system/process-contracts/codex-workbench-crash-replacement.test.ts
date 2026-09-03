import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";

import {
	openApplicationSocket,
	prepareProductionFixture,
} from "../canvas-state/support/codex-production.ts";
import { createRequester, waitFor } from "../canvas-state/support/http.ts";
import {
	exactProcessExists,
	killExactGroup,
	processGroupMembers,
	processIdentity,
	type ProcessIdentity,
} from "../support/process-census.ts";
import { pane, records, startCanvas } from "./support/codex-workbench-lifecycle.ts";

const repoRoot = resolvePath(import.meta.dir, "../../..");
const fixtureSource = join(repoRoot, "tests/system/canvas-state/fixtures/fake-codex-production.ts");

function replacementCensusSource(resources: AsyncDisposableStack): string {
	const root = mkdtempSync(join(tmpdir(), "archboard-replacement-census-"));
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	const output = join(root, "fake-codex-replacement-census.ts");
	writeFileSync(
		output,
		readFileSync(fixtureSource, "utf8")
			.replace(
				'import { appendFileSync, readFileSync } from "node:fs";',
				'import { appendFileSync, readFileSync, readdirSync } from "node:fs";',
			)
			.replace(
				'record({ kind: "app_server_spawn", pid: process.pid, args: process.argv.slice(2) });',
				String.raw`record({ kind: "app_server_spawn", pid: process.pid, args: process.argv.slice(2) });
const startupControl = JSON.parse(readFileSync(controlPath, "utf8")) as { priorGroup?: unknown };
if (Number.isSafeInteger(startupControl.priorGroup)) {
	const priorGroup = Number(startupControl.priorGroup);
	const members = readdirSync("/proc", { withFileTypes: true }).flatMap((entry) => {
		if (!entry.isDirectory() || !/^\d+$/u.test(entry.name)) return [];
		try {
			const stat = readFileSync("/proc/" + entry.name + "/stat", "utf8");
			const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/u);
			return Number(fields[2]) === priorGroup && fields[0] !== "Z" && fields[0] !== "X"
				? [Number(entry.name)]
				: [];
		} catch { return []; }
	});
	record({ kind: "prior_group_census_at_spawn", group: priorGroup, members });
}`,
			),
	);
	return output;
}

test("production crash revokes dispatch and replaces only after the exact prior group is gone", async () => {
	const resources = new AsyncDisposableStack();
	let initial: ProcessIdentity | null = null;
	let replacement: ProcessIdentity | null = null;
	try {
		const fixture = prepareProductionFixture(resources, replacementCensusSource(resources));
		const canvas = await startCanvas(fixture);
		resources.defer(() => canvas.dispose());
		const request = createRequester({ base: canvas.base, assertRunning: async () => undefined });
		const socket = await openApplicationSocket(canvas.base, "crash-replacement-client");
		resources.defer(() => socket.close());
		expect(
			(
				await request("/api/panes", {
					method: "POST",
					doing: false,
					body: pane("crash-replacement-client"),
				})
			).status,
		).toBe(200);
		expect(await socket.request("connect")).toMatchObject({ ok: true });

		const initialPid = records(fixture.logPath).find(
			(entry) => entry.kind === "app_server_spawn",
		)?.pid;
		if (initialPid === undefined) throw new Error("The initial Codex child did not log its pid.");
		initial = processIdentity(initialPid);
		if (initial === null) throw new Error("The initial exact Codex process identity was not live.");
		expect(initial.group).toBe(initial.pid);

		writeFileSync(fixture.controlPath, JSON.stringify({ exit: true, priorGroup: initial.group }));
		await waitFor(
			() => (!exactProcessExists(initial!) ? true : undefined),
			"the exact crashed Codex child to exit",
		);
		await waitFor(async () => {
			const result = await socket.request("snapshot");
			return result.ok ? undefined : result;
		}, "dispatch revocation after the exact child crash");

		writeFileSync(fixture.controlPath, JSON.stringify({ exit: false, priorGroup: initial.group }));
		const replacementPid = await waitFor(() => {
			const spawned = records(fixture.logPath).filter((entry) => entry.kind === "app_server_spawn");
			if (spawned.length < 2) return undefined;
			expect(processGroupMembers(initial!.group)).toEqual([]);
			return spawned[1]?.pid;
		}, "the replacement after exact prior-group cleanup");
		if (replacementPid === undefined) throw new Error("The replacement Codex child did not log.");
		replacement = processIdentity(replacementPid);
		if (replacement === null) throw new Error("The replacement exact identity was not live.");
		expect(replacement.pid).not.toBe(initial.pid);
		expect(replacement.group).toBe(replacement.pid);
		expect(
			records(fixture.logPath).filter((entry) => entry.kind === "app_server_spawn"),
		).toHaveLength(2);
		expect(
			records(fixture.logPath).find((entry) => entry.kind === "prior_group_census_at_spawn") as {
				readonly group?: unknown;
				readonly members?: unknown;
			},
		).toMatchObject({ group: initial.group, members: [] });
		await waitFor(async () => {
			const result = await socket.request("connect");
			return result.ok ? result : undefined;
		}, "replacement dispatch readiness");

		await canvas.normalClose();
		expect(exactProcessExists(replacement)).toBeFalse();
		expect(processGroupMembers(replacement.group)).toEqual([]);
	} finally {
		if (initial !== null) killExactGroup(initial);
		if (replacement !== null) killExactGroup(replacement);
		await resources.disposeAsync();
	}
}, 20_000);

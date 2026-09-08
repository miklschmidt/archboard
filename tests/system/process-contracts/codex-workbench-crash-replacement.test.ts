import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
	openApplicationSocket,
	prepareProductionFixture,
} from "../canvas-state/support/codex-production.ts";
import { waitFor } from "../canvas-state/support/http.ts";
import {
	exactProcessExists,
	killExactGroup,
	processGroupMembers,
	processIdentity,
} from "../support/process-census.ts";
import type { ProcessIdentity } from "../support/process-census.ts";
import { pane, records, startCanvas } from "./support/codex-workbench-lifecycle.ts";
import type { FixtureRecord } from "./support/codex-workbench-lifecycle.ts";

const { join } = path;
const repoRoot = path.resolve(import.meta.dir, "../../..");
const fixtureSource = join(repoRoot, "tests/system/canvas-state/fixtures/fake-codex-production.ts");
const processObservationModule = join(repoRoot, "src/shared/process-observation/index.ts");

function replacementCensusSource(resources: Readonly<Pick<AsyncDisposableStack, "defer">>): string {
	const root = mkdtempSync(join(tmpdir(), "archboard-replacement-census-"));
	resources.defer(() => {
		rmSync(root, { recursive: true, force: true });
	});
	const output = join(root, "fake-codex-replacement-census.ts");
	writeFileSync(
		output,
		readFileSync(fixtureSource, "utf8")
			.replaceAll(
				"./fake-codex-production-data.ts",
				join(repoRoot, "tests/system/canvas-state/fixtures/fake-codex-production-data.ts"),
			)
			.replace(
				'import { appendFileSync, readFileSync } from "node:fs";',
				`import { appendFileSync, readFileSync } from "node:fs";\nimport { listProcessObservations } from ${JSON.stringify(processObservationModule)};`,
			)
			.replace(
				'record({ kind: "app_server_spawn", pid: process.pid, args: process.argv.slice(2) });',
				String.raw`record({ kind: "app_server_spawn", pid: process.pid, args: process.argv.slice(2) });
const startupControl = JSON.parse(readFileSync(controlPath, "utf8")) as { priorGroup?: unknown };
if (Number.isSafeInteger(startupControl.priorGroup)) {
	const priorGroup = Number(startupControl.priorGroup);
	const members = listProcessObservations()
		.filter((observation) => observation.state !== "zombie" && observation.pgid === priorGroup)
		.map((observation) => observation.pid);
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
		resources.defer(async () => {
			await canvas.dispose();
		});
		const socket = await openApplicationSocket(canvas.base, "crash-replacement-client");
		resources.defer(async () => {
			await socket.close();
		});
		const registered = await fetch(new URL("/api/panes", canvas.base), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(pane("crash-replacement-client")),
		});
		expect(registered.status).toBe(200);
		expect(await socket.request("connect")).toMatchObject({ ok: true });

		let initialPid: number | undefined;
		for (const entry of records(fixture.logPath)) {
			if (entry.kind === "app_server_spawn") {
				initialPid = entry.pid;
				break;
			}
		}
		if (initialPid === undefined) {
			throw new Error("The initial Codex child did not log its pid.");
		}
		initial = processIdentity(initialPid);
		if (initial === null) {
			throw new Error("The initial exact Codex process identity was not live.");
		}
		const initialIdentity = initial;
		expect(initialIdentity.group).toBe(initialIdentity.pid);

		writeFileSync(
			fixture.controlPath,
			JSON.stringify({ exit: true, priorGroup: initialIdentity.group }),
		);
		await waitFor(
			() => !exactProcessExists(initialIdentity) || undefined,
			"the exact crashed Codex child to exit",
		);
		await waitFor(async () => {
			const result = await socket.request("snapshot");
			return result.ok ? undefined : result;
		}, "dispatch revocation after the exact child crash");

		writeFileSync(
			fixture.controlPath,
			JSON.stringify({ exit: false, priorGroup: initialIdentity.group }),
		);
		const replacementPid = await waitFor(() => {
			const spawned = [];
			for (const entry of records(fixture.logPath)) {
				if (entry.kind === "app_server_spawn") {
					spawned.push(entry);
				}
			}
			if (spawned.length < 2) {
				return null;
			}
			expect(processGroupMembers(initialIdentity.group)).toEqual([]);
			return spawned[1]?.pid ?? null;
		}, "the replacement after exact prior-group cleanup");
		if (replacementPid === null) {
			throw new Error("The replacement Codex child did not log.");
		}
		replacement = processIdentity(replacementPid);
		if (replacement === null) {
			throw new Error("The replacement exact identity was not live.");
		}
		expect(replacement.pid).not.toBe(initial.pid);
		expect(replacement.group).toBe(replacement.pid);
		const spawnRecords = [];
		let census: FixtureRecord | undefined;
		for (const entry of records(fixture.logPath)) {
			if (entry.kind === "app_server_spawn") {
				spawnRecords.push(entry);
			}
			if (entry.kind === "prior_group_census_at_spawn") {
				census = entry;
			}
		}
		expect(spawnRecords).toHaveLength(2);
		expect(census).toMatchObject({ group: initialIdentity.group, members: [] });
		await waitFor(async () => {
			const result = await socket.request("connect");
			return result.ok ? result : undefined;
		}, "replacement dispatch readiness");

		await canvas.normalClose();
		expect(exactProcessExists(replacement)).toBeFalse();
		expect(processGroupMembers(replacement.group)).toEqual([]);
	} finally {
		if (initial !== null) {
			killExactGroup(initial);
		}
		if (replacement !== null) {
			killExactGroup(replacement);
		}
		await resources.disposeAsync();
	}
}, 20_000);

import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll } from "bun:test";

import { createCodexEpochStore } from "#runtime/epoch/store/epoch.ts";
import { testAuthorities } from "#tests/runtime/support/codex-connection.ts";
import {
	buildFixture,
	prepareFixture,
	type Fixture,
} from "#tests/runtime/workhorses/workhorse-operations/operations/support.ts";

interface FixtureGroup {
	readonly create: (initialStatus?: "idle" | "active") => Fixture;
	readonly cleanup: () => void;
}

function useFixtureGroup(): FixtureGroup["create"] {
	let group: FixtureGroup | undefined;
	beforeAll(() => {
		group = createFixtureGroup();
	});
	afterAll(() => group?.cleanup());
	return (initialStatus = "idle") => {
		if (group === undefined) {
			throw new Error("fixture group is not prepared");
		}
		return group.create(initialStatus);
	};
}

function createFixtureGroup(): FixtureGroup {
	const parent = realpathSync(mkdtempSync(join("/tmp", "voice-workhorse-operations-group-")));

	let nextCase = 0;
	let closed = false;
	const liveCases = new Set<() => void>();
	const cleanup = (): void => {
		if (closed) {
			return;
		}
		closed = true;
		const leakedCases = liveCases.size;
		for (const cleanupCase of liveCases) {
			cleanupCase();
		}
		rmSync(parent, { recursive: true, force: true });
		if (leakedCases !== 0) {
			throw new Error(`fixture group cleaned ${leakedCases} leaked case(s)`);
		}
	};
	return {
		create: (initialStatus = "idle") => {
			if (closed) {
				throw new Error("fixture group is closed");
			}
			const caseRoot = join(parent, `case-${nextCase++}`);
			const epochRoot = join(caseRoot, "epoch");
			const codexHome = join(caseRoot, "codex-home");
			const sqliteHome = join(caseRoot, "codex-sqlite");
			for (const directory of [epochRoot, codexHome, sqliteHome]) {
				mkdirSync(directory, { recursive: true, mode: 0o700 });
			}
			const caseAuthorities = testAuthorities();
			const epoch = createCodexEpochStore({
				rootDirectory: epochRoot,
				codexHome,
				sqliteHome,
				now: () => 100,
			});
			const prepared = prepareFixture(epoch, caseAuthorities.identity);
			let caseClosed = false;
			const cleanupCase = (): void => {
				if (caseClosed) {
					return;
				}
				caseClosed = true;
				epoch.close();
				rmSync(caseRoot, { recursive: true, force: true });
				liveCases.delete(cleanupCase);
			};
			liveCases.add(cleanupCase);
			try {
				return buildFixture(initialStatus, caseAuthorities, epoch, prepared, cleanupCase);
			} catch (error) {
				cleanupCase();
				throw error;
			}
		},
		cleanup,
	};
}

export { type FixtureGroup, useFixtureGroup };

import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll } from "bun:test";

import { createCodexEpochStore } from "../../codex-epoch/index.js";
import {
	createIdentityAuthorities,
	restoreIdentityAuthorities,
} from "../../../shared/codex-workbench-identity/index.js";
import { buildFixture, prepareFixture, type Fixture } from "./support.js";

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
	const authorities = createIdentityAuthorities();
	const identity = authorities.identity;
	const parent = realpathSync(mkdtempSync(join("/tmp", "archboard-workhorse-operations-group-")));
	const preparedRoot = join(parent, "prepared");
	const preparedEpochRoot = join(preparedRoot, "epoch");
	const preparedCodexHome = join(preparedRoot, "codex-home");
	const preparedSqliteHome = join(preparedRoot, "codex-sqlite");
	for (const directory of [preparedEpochRoot, preparedCodexHome, preparedSqliteHome]) {
		mkdirSync(directory, { recursive: true, mode: 0o700 });
	}
	const preparedEpoch = createCodexEpochStore({
		rootDirectory: preparedEpochRoot,
		codexHome: preparedCodexHome,
		sqliteHome: preparedSqliteHome,
		now: () => 100,
	});
	const prepared = prepareFixture(preparedEpoch, identity);
	const preparedSnapshot = preparedEpoch.snapshot();
	preparedEpoch.close();

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
			copyFileSync(preparedSnapshot.manifestPath, join(epochRoot, "epoch-manifest.json"));
			const caseAuthorities = restoreIdentityAuthorities({
				childId: identity.validator.childId,
				epoch: identity.validator.epoch,
			});
			const epoch = createCodexEpochStore({
				rootDirectory: epochRoot,
				codexHome,
				sqliteHome,
				now: () => 100,
			});
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

import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import type { OpenerSelection } from "../../../src/shared/code-target/index.ts";
import { TEST_OPENER_PERSISTENCE_CASE_TIMEOUT_MS } from "../support/timing.ts";
import type { OpenerFixture } from "./support/opener-fixture.ts";

type LaunchCommand = { executable: string; argv: string[] };
type ActivationTimelineEntry =
	| ["launch", LaunchCommand]
	| ["activation-complete", "selection-a" | "caller-one" | "caller-two" | "restarted-caller"]
	| ["restart-complete"];
const CI_EXCLUDED_SYSTEM_OWNER_ENV = "ARCHBOARD_CI_EXCLUDED_SYSTEM_OWNER";
const SYSTEM_OWNER_PATH = "tests/system/code-targets/opener-persistence.test.ts";

function isExcludedFromHostedCi(environment: NodeJS.ProcessEnv): boolean {
	const excludedOwner = environment[CI_EXCLUDED_SYSTEM_OWNER_ENV];
	if (excludedOwner === undefined) {
		return false;
	}
	if (environment["CI"] !== "true") {
		throw new Error(`${CI_EXCLUDED_SYSTEM_OWNER_ENV} requires CI=true.`);
	}
	if (excludedOwner !== SYSTEM_OWNER_PATH) {
		throw new Error(
			`${CI_EXCLUDED_SYSTEM_OWNER_ENV} cannot exclude ${JSON.stringify(excludedOwner)}; only ${SYSTEM_OWNER_PATH} is allowed.`,
		);
	}
	return true;
}

const excludedFromHostedCi = isExcludedFromHostedCi(process.env);
if (excludedFromHostedCi) {
	process.stderr.write(`# CI-only system owner excluded: ${SYSTEM_OWNER_PATH}\n`);
}
const persistenceTest = excludedFromHostedCi ? test.skip : test;

async function save(fixture: OpenerFixture, selection: OpenerSelection): Promise<void> {
	const result = await fixture.request("/api/settings/opener", {
		method: "PUT",
		body: JSON.stringify(selection),
	});
	expect(result.status).toBe(200);
}

let boundNode = "";

async function activate(caller: ReturnType<OpenerFixture["caller"]>): Promise<void> {
	const result = await caller("/api/code-targets/open", {
		method: "POST",
		body: JSON.stringify({ board: "payments", element: boundNode }),
	});
	expect(result.status).toBe(200);
}

describe("machine-wide opener persistence", () => {
	persistenceTest(
		"applies the latest save to independent callers and survives a restarted base",
		async () => {
			const previousVault = process.env["ARCHBOARD_VAULT"];
			{
				await using resources = new AsyncDisposableStack();
				const vault = mkdtempSync(join(tmpdir(), "archboard-opener-vault-"));
				resources.defer(() => rmSync(vault, { recursive: true }));
				process.env["ARCHBOARD_VAULT"] = vault;
				resources.defer(() => {
					if (previousVault === undefined) {
						delete process.env["ARCHBOARD_VAULT"];
					} else {
						process.env["ARCHBOARD_VAULT"] = previousVault;
					}
				});
				const {
					createBoardTransition,
					locateSemanticBoard,
					readSemanticBoard,
					writeSemanticBoard,
				} = await import("../../../src/runtime/semantic-board-store/index.ts");
				const { createOpenerFixture } = await import("./support/opener-fixture.ts");
				const timeline: ActivationTimelineEntry[] = [];
				const fixture = await createOpenerFixture({
					// The real binding lookup, against the real store: what is being
					// checked is that a node's binding survives a restart, and a stub
					// standing in for the board would check the stub instead.
					defaultDependencies: true,
					routeDependencies: {
						launch: async (command) => {
							timeline.push(["launch", structuredClone(command)]);
							return { ok: true };
						},
					},
				});
				resources.defer(() => fixture.dispose());
				expect(process.env["ARCHBOARD_VAULT"]).toBe(vault);
				// One board with one bound node, written through the store every other
				// writer goes through, so the opener resolves a real binding.
				const written = await writeSemanticBoard({
					board: "payments",
					writer: { kind: "agent" },
					transition: createBoardTransition({
						name: "payments",
						nodes: [
							{
								name: "Payments",
								kind: "service",
								binding: { repo: fixture.repository, path: "src/index.ts" },
							},
						],
						edges: [],
						flows: [],
						views: [],
						walkthroughs: [],
					}),
				});
				expect(written.outcome).toBe("applied");
				const read = readSemanticBoard("payments");
				if (!read.ok) {
					throw new Error(`The bound board could not be read: ${read.problem}`);
				}
				boundNode =
					read.board.variants.find((one) => one.id === read.board.current)?.content.nodes[0]?.id ??
					"";
				expect(boundNode).not.toBe("");
				const note = locateSemanticBoard("payments").file;
				const noteBytes = readFileSync(note);
				const noteMtime = statSync(note, { bigint: true }).mtimeNs;

				const selectionA: OpenerSelection = {
					version: 1,
					kind: "custom",
					executable: join(fixture.root, "missing-selection-a-opener"),
					argv: ["--selection-A", "{path}"],
				};
				await save(fixture, selectionA);
				await activate(fixture.caller());
				timeline.push(["activation-complete", "selection-a"]);

				const selectionB: OpenerSelection = {
					version: 1,
					kind: "custom",
					executable: join(fixture.root, "missing-selection-b-opener"),
					argv: ["--selection-B", "{path}"],
				};
				await save(fixture, selectionB);
				const callerOne = fixture.caller();
				const callerTwo = fixture.caller();
				await activate(callerOne);
				timeline.push(["activation-complete", "caller-one"]);
				await activate(callerTwo);
				timeline.push(["activation-complete", "caller-two"]);

				await fixture.restart();
				timeline.push(["restart-complete"]);
				const restartedCaller = fixture.caller();
				await activate(restartedCaller);
				timeline.push(["activation-complete", "restarted-caller"]);
				const target = join(fixture.checkout, "src/index.ts");
				const commandA = {
					executable: selectionA.executable,
					argv: ["--selection-A", target],
				};
				const commandB = {
					executable: selectionB.executable,
					argv: ["--selection-B", target],
				};
				expect(timeline).toEqual([
					["launch", commandA],
					["activation-complete", "selection-a"],
					["launch", commandB],
					["activation-complete", "caller-one"],
					["launch", commandB],
					["activation-complete", "caller-two"],
					["restart-complete"],
					["launch", commandB],
					["activation-complete", "restarted-caller"],
				]);
				expect(relative(vault, fixture.configFile).startsWith("..")).toBeTrue();
				expect(readFileSync(note)).toEqual(noteBytes);
				expect(statSync(note, { bigint: true }).mtimeNs).toBe(noteMtime);
				const noteText = noteBytes.toString("utf8");
				const customArgv = [selectionA, selectionB].flatMap((selection) =>
					selection.kind === "custom" ? selection.argv : [],
				);
				for (const forbidden of [
					process.execPath,
					fixture.checkout,
					fixture.configFile,
					selectionA.executable,
					selectionB.executable,
					...customArgv,
					"/api/code-targets/open",
				]) {
					expect(noteText).not.toContain(forbidden);
				}
			}
			if (previousVault === undefined) {
				expect(process.env["ARCHBOARD_VAULT"]).toBeUndefined();
			} else {
				expect(process.env["ARCHBOARD_VAULT"]).toBe(previousVault);
			}
		},
		TEST_OPENER_PERSISTENCE_CASE_TIMEOUT_MS,
	);
});

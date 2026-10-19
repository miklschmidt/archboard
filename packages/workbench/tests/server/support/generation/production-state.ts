import { afterAll, mock } from "bun:test";
import os from "node:os";

let fixtureHome: string | undefined;
// Bun captures the native account home at startup. Supply the test account
// at the operating-system boundary before production captures its imports.
mock.module("os", () => ({ ...os, homedir: () => fixtureHome ?? os.homedir() }));
afterAll(() => mock.module("os", () => os));

/** Capture production storage under a throwaway home on each supported platform. */
export function withProductionState<T>(root: string, create: () => T): T {
	const keys = ["HOME", "LOCALAPPDATA", "XDG_STATE_HOME"] as const;
	const prior = keys.map((key) => process.env[key]);
	for (const key of keys) process.env[key] = root;
	const previousHome = fixtureHome;
	fixtureHome = root;
	try {
		return create();
	} finally {
		fixtureHome = previousHome;
		for (const [index, key] of keys.entries()) {
			const value = prior[index];
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
}

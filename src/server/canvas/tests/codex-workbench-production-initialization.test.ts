import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	createIdentityAuthorities,
	createIdentityLedger,
} from "../../../shared/codex-workbench-identity/index.js";
import { createCanvasCodexWorkbenchInstallation } from "../codex-workbench-production.js";
import type { CodexWorkbenchComponents } from "../codex-workbench-generation.js";
import type { CodexWorkbenchGenerationInput } from "../codex-workbench-owner.js";

function deferred(): {
	readonly promise: Promise<void>;
	readonly resolve: () => void;
} {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => void (resolve = done));
	return { promise, resolve };
}

function installation() {
	const root = mkdtempSync(join(tmpdir(), "archboard-production-activation-"));
	const prior = process.env.XDG_STATE_HOME;
	process.env.XDG_STATE_HOME = root;
	try {
		return {
			root,
			value: createCanvasCodexWorkbenchInstallation({
				checkoutRoot: "/repo",
			} as never),
		};
	} finally {
		if (prior === undefined) delete process.env.XDG_STATE_HOME;
		else process.env.XDG_STATE_HOME = prior;
	}
}

describe("production Codex activation guards", () => {
	for (const stage of ["initialize", "account", "coordinator"] as const)
		test(`a retired ${stage} continuation cannot publish readiness`, async () => {
			const owned = installation();
			const events: string[] = [];
			const initializeGate = deferred();
			const accountGate = deferred();
			const coordinatorGate = deferred();
			let initializeEntered!: () => void;
			const initializeStarted = new Promise<void>((resolve) => void (initializeEntered = resolve));
			let accountEntered!: () => void;
			const accountStarted = new Promise<void>((resolve) => void (accountEntered = resolve));
			let coordinatorEntered!: () => void;
			const coordinatorStarted = new Promise<void>(
				(resolve) => void (coordinatorEntered = resolve),
			);
			let active = true;
			const identity = createIdentityAuthorities(createIdentityLedger());
			const input = {
				generation: 1,
				child: {
					lifecycle: {
						markAppServerReady: () => void events.push("child:app-ready"),
						markAccountReady: () => void events.push("child:account-ready"),
					},
				},
				adoptedSession: null,
				assertActivationCurrent: () => {
					if (!active) throw new Error("activation retired");
				},
				markSessionReady: () => void events.push("session:ready"),
			} as unknown as CodexWorkbenchGenerationInput;
			const session = {
				initialize: async () => {
					events.push("session:initialize");
					initializeEntered();
					if (stage === "initialize") await initializeGate.promise;
				},
				accountRead: async () => {
					events.push("session:account-read");
					accountEntered();
					if (stage === "account") await accountGate.promise;
					return { account: { type: "chatgpt" } };
				},
			};
			const components = {
				identity,
				epoch: {
					snapshot: () => ({ manifest: { activeEpoch: null } }),
					startEpoch: () => void events.push("epoch:start"),
				},
				coordinator: {
					ensure: async () => {
						events.push("coordinator:ensure");
						coordinatorEntered();
						if (stage === "coordinator") await coordinatorGate.promise;
						return { state: "ready" };
					},
				},
			} as unknown as CodexWorkbenchComponents;
			try {
				const activation = owned.value.hooks(input).initializeSession(session as never, components);
				if (stage === "initialize") await initializeStarted;
				if (stage === "account") await accountStarted;
				if (stage === "coordinator") await coordinatorStarted;
				active = false;
				initializeGate.resolve();
				accountGate.resolve();
				coordinatorGate.resolve();
				expect(
					await activation.then(
						() => null,
						(error: unknown) => error,
					),
				).toBeInstanceOf(Error);
				expect(events).not.toContain("session:ready");
				expect(events).not.toContain("child:account-ready");
				if (stage === "initialize") {
					expect(events).not.toContain("child:app-ready");
					expect(events).not.toContain("session:account-read");
				}
				if (stage === "account") expect(events).not.toContain("coordinator:ensure");
			} finally {
				rmSync(owned.root, { recursive: true, force: true });
			}
		});
});

import { afterEach, describe, expect, test } from "bun:test";
import express from "express";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { SessionResponse } from "@archboard/codex-app-server/session";
import {
	createCodexSettingsService,
	type CodexSettingsScope,
} from "#server/codex-settings/services/codex-settings.ts";
import { createCodexSettingsRouter } from "#server/codex-settings/routes/codex-settings-routes.ts";
import { CodexSettingsReplySchema } from "#shared/codex-settings/schemas/codex-settings.ts";

type ModelEntry = SessionResponse<"model/list">["data"][number];

const tempDirectories: string[] = [];
const originalConfigEnv = process.env["ARCHBOARD_CODEX_MODELS_CONFIG"];

afterEach(() => {
	if (originalConfigEnv === undefined) {
		delete process.env["ARCHBOARD_CODEX_MODELS_CONFIG"];
	} else {
		process.env["ARCHBOARD_CODEX_MODELS_CONFIG"] = originalConfigEnv;
	}
	for (const directory of tempDirectories.splice(0)) {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

function tempConfigPath(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-codex-settings-guards-"));
	tempDirectories.push(dir);
	return path.join(dir, "codex-models.json");
}

function modelFixture(): ModelEntry {
	return {
		id: "gpt-6.1-terra",
		model: "gpt-6.1-terra",
		upgrade: null,
		upgradeInfo: null,
		availabilityNux: null,
		displayName: "GPT-6.1 Terra",
		description: "Fast coordinator model",
		modelSpecialty: null,
		hidden: false,
		supportedReasoningEfforts: [{ reasoningEffort: "low", description: "Fast responses" }],
		defaultReasoningEffort: "low",
		inputModalities: ["text"],
		supportsPersonality: false,
		multiAgentVersion: null,
		additionalSpeedTiers: [],
		serviceTiers: [],
		defaultServiceTier: null,
		availableAccessPrograms: null,
		isDefault: true,
	};
}

function makeScope(options: {
	readonly signedIn?: boolean;
	readonly modelList: () => Promise<{ data: ModelEntry[]; nextCursor: string | null }>;
}): { readonly scope: CodexSettingsScope; readonly setSignedIn: (signedIn: boolean) => void } {
	let accountState: ReturnType<CodexSettingsScope["account"]["snapshot"]>["account"] =
		options.signedIn
			? {
					kind: "codex_account_response",
					response: {
						account: { type: "apiKey" },
						requiresOpenaiAuth: true,
						workspaceRouting: null,
					},
				}
			: { kind: "account", state: "signed_out" };
	const loginState: ReturnType<CodexSettingsScope["account"]["snapshot"]>["login"] = {
		kind: "login",
		state: "idle",
	};
	const scope: CodexSettingsScope = {
		assertCurrent: () => undefined,
		epoch: { assertCurrent: () => undefined } as unknown as CodexSettingsScope["epoch"],
		account: {
			snapshot: () => ({
				account: accountState,
				login: loginState,
				process: {
					state: "running",
					ready: true,
					generation: 1,
					childPid: 1234,
					restartAttempt: 0,
					nextRestartAtMs: null,
					failure: null,
				},
			}),
			read: async () => undefined,
			login: async () => {
				accountState = {
					kind: "codex_account_response",
					response: {
						account: { type: "apiKey" },
						requiresOpenaiAuth: true,
						workspaceRouting: null,
					},
				};
			},
			loginCancel: async () => undefined,
			logout: async () => {
				accountState = { kind: "account", state: "signed_out" };
			},
		},
		session: {
			modelList: options.modelList,
			threadSettingsUpdate: async () => ({}),
		} as unknown as CodexSettingsScope["session"],
		sessions: { list: () => [] } as unknown as CodexSettingsScope["sessions"],
		publish: () => undefined,
	};
	return {
		scope,
		setSignedIn: (signedIn) => {
			accountState = signedIn
				? {
						kind: "codex_account_response",
						response: {
							account: { type: "apiKey" },
							requiresOpenaiAuth: true,
							workspaceRouting: null,
						},
					}
				: { kind: "account", state: "signed_out" };
		},
	};
}

describe("codex settings guardrails", () => {
	test("keeps account state and logout available when model/list fails", async () => {
		process.env["ARCHBOARD_CODEX_MODELS_CONFIG"] = tempConfigPath();
		const { scope } = makeScope({
			modelList: async () => {
				throw new Error("Model catalogue offline");
			},
		});
		const service = createCodexSettingsService({
			getScope: () => scope,
			getStartupState: () => ({ state: "ready", reason: "Ready" }),
		});
		const app = express();
		app.use(express.json());
		app.use(createCodexSettingsRouter(service));
		const server = http.createServer(app);
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
		try {
			const login = await fetch(`${baseUrl}/api/settings/codex/login`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ type: "apiKey", apiKey: "sk-test" }),
			});
			expect(login.status).toBe(200);
			for (const response of [login, await fetch(`${baseUrl}/api/settings/codex`)]) {
				const snapshot = CodexSettingsReplySchema.parse(await response.json());
				expect(snapshot.auth.state).toBe("authenticated");
				expect(snapshot.models).toEqual([]);
				expect(snapshot.modelError).toContain("Model catalogue offline");
			}
			const logout = await fetch(`${baseUrl}/api/settings/codex/logout`, { method: "POST" });
			expect(logout.status).toBe(200);
			const afterLogout = CodexSettingsReplySchema.parse(await logout.json());
			expect(afterLogout.auth.state).toBe("signed_out");
			expect(afterLogout.modelError).toBeNull();
		} finally {
			await new Promise<void>((resolve) => server.close(() => resolve()));
		}
	});

	test.each([
		["sign-out", "returns"],
		["generation replacement", "returns"],
		["sign-out", "fails"],
		["generation replacement", "fails"],
	] as const)(
		"discards an in-flight catalogue after %s when model/list %s",
		async (change, outcome) => {
			const config = tempConfigPath();
			process.env["ARCHBOARD_CODEX_MODELS_CONFIG"] = config;
			const listed = Promise.withResolvers<void>();
			const release = Promise.withResolvers<void>();
			let requests = 0;
			const model = modelFixture();
			const first = makeScope({
				signedIn: true,
				modelList: async () => {
					requests += 1;
					if (requests === 2) listed.resolve();
					await release.promise;
					if (outcome === "fails") throw new Error("Model catalogue offline");
					return { data: [model], nextCursor: null };
				},
			});
			let activeScope = first.scope;
			const service = createCodexSettingsService({
				getScope: () => activeScope,
				getStartupState: () => ({ state: "ready", reason: "Ready" }),
			});
			const role = { model: model.model, effort: "low", serviceTier: null };
			const reading = service.readSettings();
			const saving = service.saveSettings({ orchestrator: role, workhorse: role });
			await listed.promise;
			if (change === "sign-out") await first.scope.account.logout();
			else
				activeScope = makeScope({
					signedIn: true,
					modelList: async () => ({ data: [model], nextCursor: null }),
				}).scope;
			release.resolve();

			for (const result of await Promise.all([reading, saving])) {
				expect(result).toMatchObject({ ok: false, code: "CODEX_UNAVAILABLE" });
			}
			expect(fs.existsSync(config)).toBe(false);
		},
	);
});

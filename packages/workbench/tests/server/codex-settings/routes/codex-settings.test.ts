import { afterEach, describe, expect, test } from "bun:test";
import express from "express";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { SessionResponse } from "@archboard/codex-app-server/session";
import { createIdentityAuthorities } from "@archboard/codex-app-server/identity";
import {
	readCodexModelPreferences,
	readVoiceAgentModelPreferences,
	resetCodexModelPreferences,
	saveCodexModelPreferences,
} from "#server/codex-settings/store/configuration.ts";
import {
	createCodexSettingsService,
	type CodexSettingsScope,
	type CodexSettingsStartupState,
} from "#server/codex-settings/services/codex-settings.ts";
import { createCodexSettingsRouter } from "#server/codex-settings/routes/codex-settings-routes.ts";

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
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-codex-settings-"));
	tempDirectories.push(dir);
	return path.join(dir, "codex-models.json");
}

function modelFixture(overrides: Partial<ModelEntry> = {}): ModelEntry {
	return {
		id: "gpt-6-sol",
		model: "gpt-6-sol",
		upgrade: null,
		upgradeInfo: null,
		availabilityNux: null,
		displayName: "GPT-6 Sol",
		description: "Fast coordinator model",
		modelSpecialty: null,
		hidden: false,
		supportedReasoningEfforts: [
			{ reasoningEffort: "low", description: "Fast responses" },
			{ reasoningEffort: "medium", description: "Balanced reasoning" },
		],
		defaultReasoningEffort: "low",
		inputModalities: ["text"],
		supportsPersonality: false,
		multiAgentVersion: null,
		additionalSpeedTiers: [],
		serviceTiers: [{ id: "priority", name: "Priority", description: "Lower latency" }],
		defaultServiceTier: null,
		availableAccessPrograms: null,
		isDefault: false,
		...overrides,
	};
}

interface FakeScopeController {
	readonly scope: CodexSettingsScope;
	readonly settingsUpdates: Array<Record<string, unknown>>;
	publishCount: number;
	failModelList: boolean;
	setSignedIn: (signedIn: boolean) => void;
}

function createFakeScope(pages: readonly (readonly ModelEntry[])[]): FakeScopeController {
	const authorities = createIdentityAuthorities();
	const { childId, epoch } = authorities.identity.validator;
	const threadId = authorities.identity.decoder.adoptThreadId("workhorse-thread-1");
	const staleThreadId = authorities.identity.decoder.adoptThreadId("stale-workhorse");
	const operationId = authorities.operation.issuer.mintOperationId();
	const readyWorkhorse = (id: typeof threadId) => ({
		components: {
			workhorse: {
				snapshot: () => ({ state: "ready", threadId: id, childId, epoch, operationId }),
			},
		},
	});
	let accountState: ReturnType<CodexSettingsScope["account"]["snapshot"]>["account"] = {
		kind: "codex_account_response",
		response: { account: null, requiresOpenaiAuth: true, workspaceRouting: null },
	};
	let loginState: ReturnType<CodexSettingsScope["account"]["snapshot"]>["login"] = {
		kind: "login",
		state: "idle",
	};
	const settingsUpdates: Array<Record<string, unknown>> = [];
	const controller: FakeScopeController = {
		settingsUpdates,
		publishCount: 0,
		failModelList: false,
		setSignedIn: (signedIn: boolean) => {
			loginState = { kind: "login", state: "idle" };
			accountState = signedIn
				? {
						kind: "codex_account_response",
						response: {
							account: {
								type: "chatgpt",
								email: "architect@example.com",
								planType: "pro",
								workspaceName: "Archboard",
							},
							requiresOpenaiAuth: true,
							workspaceRouting: null,
						},
					}
				: {
						kind: "codex_account_response",
						response: { account: null, requiresOpenaiAuth: true, workspaceRouting: null },
					};
		},
		scope: {
			assertCurrent: () => undefined,
			epoch: {
				assertCurrent: (request: Parameters<CodexSettingsScope["epoch"]["assertCurrent"]>[0]) => {
					if (request.threadId === staleThreadId) {
						throw new Error("Workhorse start is no longer current");
					}
					expect(request).toEqual({ childId, epoch, operationId, threadId });
				},
			} as unknown as CodexSettingsScope["epoch"],
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
				login: async (login) => {
					if (login.type === "chatgpt") {
						const loginId = authorities.identity.decoder.adoptLoginId("login-123");
						loginState = {
							kind: "login",
							state: "pending",
							loginId,
							variant: "chatgpt",
							authUrl: "https://auth.openai.com/authorize?state=test",
						};
						accountState = {
							kind: "account",
							state: "login_pending",
							loginId,
							variant: "chatgpt",
						};
						return;
					}
					loginState = { kind: "login", state: "idle" };
					accountState = {
						kind: "codex_account_response",
						response: {
							account: { type: "apiKey" },
							requiresOpenaiAuth: true,
							workspaceRouting: null,
						},
					};
				},
				loginCancel: async () => {
					loginState = { kind: "login", state: "idle" };
					accountState = {
						kind: "codex_account_response",
						response: { account: null, requiresOpenaiAuth: true, workspaceRouting: null },
					};
				},
				logout: async () => {
					loginState = { kind: "login", state: "idle" };
					accountState = { kind: "account", state: "signed_out" };
				},
			},
			session: {
				modelList: async (params?: { cursor?: string | null }) => {
					if (controller.failModelList) throw new Error("Model catalogue unavailable");
					const index = params?.cursor ? Number(params.cursor) : 0;
					const data = pages[index] ?? [];
					const nextCursor = index + 1 < pages.length ? String(index + 1) : null;
					return { data: [...data], nextCursor };
				},
				threadSettingsUpdate: async (params: Record<string, unknown>) => {
					settingsUpdates.push(params);
					return {};
				},
			} as unknown as CodexSettingsScope["session"],
			sessions: {
				list: () => [
					{
						workhorses: new Map([
							["/stale-checkout", readyWorkhorse(staleThreadId)],
							["/checkout", readyWorkhorse(threadId)],
						]),
					},
				],
			} as unknown as CodexSettingsScope["sessions"],
			publish: () => {
				controller.publishCount += 1;
			},
		},
	};
	return controller;
}

async function startRouteServer(
	router: express.Router,
): Promise<{ readonly baseUrl: string; readonly close: () => Promise<void> }> {
	const app = express();
	app.use(express.json());
	app.use(router);
	const server = http.createServer(app);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address() as AddressInfo;
	return {
		baseUrl: `http://127.0.0.1:${port}`,
		close: () => new Promise<void>((resolve) => server.close(() => resolve())),
	};
}

describe("codex model preferences store", () => {
	test("reads defaults when absent, persists valid selections, resets, and refuses corrupt files", () => {
		const configFile = tempConfigPath();
		process.env["ARCHBOARD_CODEX_MODELS_CONFIG"] = configFile;

		expect(readCodexModelPreferences()).toEqual({
			ok: true,
			selection: { version: 1, orchestrator: null, workhorse: null },
		});
		expect(readVoiceAgentModelPreferences()).toEqual({ coordinator: null, workhorse: null });

		const saved = saveCodexModelPreferences({
			version: 1,
			orchestrator: { model: "gpt-6-sol", effort: "low", serviceTier: "priority" },
			workhorse: { model: "gpt-6-astra", effort: "high", serviceTier: null },
		});
		expect(saved.ok).toBe(true);
		expect(readVoiceAgentModelPreferences()).toEqual({
			coordinator: { model: "gpt-6-sol", effort: "low", serviceTier: "priority" },
			workhorse: { model: "gpt-6-astra", effort: "high", serviceTier: null },
		});

		expect(resetCodexModelPreferences()).toEqual({
			ok: true,
			selection: { version: 1, orchestrator: null, workhorse: null },
		});

		fs.writeFileSync(configFile, "{invalid json");
		const corrupted = readCodexModelPreferences();
		expect(corrupted.ok).toBe(false);
		expect(readVoiceAgentModelPreferences()).toEqual({ coordinator: null, workhorse: null });
	});
});

describe("codex settings HTTP routes and service", () => {
	test("handles unauthenticated gating, sign-in lifecycle, paginated model/list, validation, save, reset, and logout", async () => {
		process.env["ARCHBOARD_CODEX_MODELS_CONFIG"] = tempConfigPath();
		const sol = modelFixture();
		const hidden = modelFixture({ id: "hidden-m", model: "hidden-m", hidden: true });
		const astra = modelFixture({
			id: "gpt-6-astra",
			model: "gpt-6-astra",
			displayName: "GPT-6 Astra",
			supportedReasoningEfforts: [
				{ reasoningEffort: "medium", description: "Balanced" },
				{ reasoningEffort: "high", description: "Deep" },
			],
			defaultReasoningEffort: "medium",
			serviceTiers: [],
			isDefault: true,
		});
		const fake = createFakeScope([[sol, hidden], [astra]]);
		let activeScope: CodexSettingsScope | null = fake.scope;
		const startup: CodexSettingsStartupState = {
			state: "unavailable",
			reason: "Codex app-server is not running.",
		};
		const service = createCodexSettingsService({
			getScope: () => activeScope,
			getStartupState: () => startup,
		});
		const server = await startRouteServer(createCodexSettingsRouter(service));
		const originHeaders = {
			Origin: server.baseUrl,
			"Sec-Fetch-Site": "same-origin",
			"Content-Type": "application/json",
		};

		try {
			// Signed out: models must be empty and save refused with 409.
			const signedOutRes = await fetch(`${server.baseUrl}/api/settings/codex`, {
				headers: { Origin: server.baseUrl, "Sec-Fetch-Site": "same-origin" },
			});
			expect(signedOutRes.status).toBe(200);
			const signedOut = await signedOutRes.json();
			expect(signedOut.auth.state).toBe("signed_out");
			expect(signedOut.models).toEqual([]);

			const unauthSave = await fetch(`${server.baseUrl}/api/settings/codex`, {
				method: "PUT",
				headers: originHeaders,
				body: JSON.stringify({
					orchestrator: { model: "gpt-6-sol", effort: "low", serviceTier: "priority" },
					workhorse: { model: "gpt-6-astra", effort: "medium", serviceTier: null },
				}),
			});
			expect(unauthSave.status).toBe(409);
			expect((await unauthSave.json()).code).toBe("CODEX_UNAUTHENTICATED");

			// ChatGPT login start -> pending with authUrl -> cancel.
			const chatgptRes = await fetch(`${server.baseUrl}/api/settings/codex/login`, {
				method: "POST",
				headers: originHeaders,
				body: JSON.stringify({ type: "chatgpt" }),
			});
			expect(chatgptRes.status).toBe(200);
			const pending = await chatgptRes.json();
			expect(pending.auth.state).toBe("login_pending");
			expect(pending.auth.authUrl).toBe("https://auth.openai.com/authorize?state=test");
			expect(pending.models).toEqual([]);

			const cancelRes = await fetch(`${server.baseUrl}/api/settings/codex/login/cancel`, {
				method: "POST",
				headers: originHeaders,
				body: JSON.stringify({ loginId: pending.auth.loginId }),
			});
			expect(cancelRes.status).toBe(200);
			expect((await cancelRes.json()).auth.state).toBe("signed_out");

			// Sign in with API key -> authenticated, paginated non-hidden models populated.
			const apiKeyRes = await fetch(`${server.baseUrl}/api/settings/codex/login`, {
				method: "POST",
				headers: originHeaders,
				body: JSON.stringify({ type: "apiKey", apiKey: "sk-test-123" }),
			});
			expect(apiKeyRes.status).toBe(200);
			const authed = await apiKeyRes.json();
			expect(authed.auth).toEqual({ state: "authenticated", account: { type: "apiKey" } });
			expect(authed.models.map((entry: { model: string }) => entry.model)).toEqual([
				"gpt-6-sol",
				"gpt-6-astra",
			]);

			// Invalid service tier rejected with 422.
			const invalidSave = await fetch(`${server.baseUrl}/api/settings/codex`, {
				method: "PUT",
				headers: originHeaders,
				body: JSON.stringify({
					orchestrator: { model: "gpt-6-sol", effort: "low", serviceTier: "priority" },
					workhorse: { model: "gpt-6-astra", effort: "high", serviceTier: "priority" },
				}),
			});
			expect(invalidSave.status).toBe(422);
			expect((await invalidSave.json()).code).toBe("MODEL_SELECTION_INVALID");

			// Valid save persists and pushes thread/settings/update to live workhorse.
			const validSave = await fetch(`${server.baseUrl}/api/settings/codex`, {
				method: "PUT",
				headers: originHeaders,
				body: JSON.stringify({
					orchestrator: { model: "gpt-6-sol", effort: "medium", serviceTier: null },
					workhorse: { model: "gpt-6-astra", effort: "high", serviceTier: null },
				}),
			});
			expect(validSave.status).toBe(200);
			const savedBody = await validSave.json();
			expect(savedBody.selection).toEqual({
				version: 1,
				orchestrator: { model: "gpt-6-sol", effort: "medium", serviceTier: null },
				workhorse: { model: "gpt-6-astra", effort: "high", serviceTier: null },
			});
			expect(fake.settingsUpdates).toHaveLength(1);
			expect(fake.settingsUpdates[0]).toMatchObject({
				model: "gpt-6-astra",
				effort: "high",
				serviceTier: null,
			});
			expect(fake.publishCount).toBe(1);

			// Reset refuses while signed out or when model/list fails without erasing preferences.
			fake.setSignedIn(false);
			const signedOutReset = await fetch(`${server.baseUrl}/api/settings/codex`, {
				method: "DELETE",
				headers: originHeaders,
			});
			expect(signedOutReset.status).toBe(409);
			expect(readCodexModelPreferences()).toEqual({ ok: true, selection: savedBody.selection });

			fake.setSignedIn(true);
			fake.failModelList = true;
			const failedReset = await fetch(`${server.baseUrl}/api/settings/codex`, {
				method: "DELETE",
				headers: originHeaders,
			});
			expect(failedReset.status).toBe(502);
			expect(readCodexModelPreferences()).toEqual({ ok: true, selection: savedBody.selection });
			fake.failModelList = false;

			// Reset clears overrides back to null.
			const resetRes = await fetch(`${server.baseUrl}/api/settings/codex`, {
				method: "DELETE",
				headers: { Origin: server.baseUrl, "Sec-Fetch-Site": "same-origin" },
			});
			expect(resetRes.status).toBe(200);
			expect((await resetRes.json()).selection).toEqual({
				version: 1,
				orchestrator: null,
				workhorse: null,
			});

			// Logout signs out and clears models.
			const logoutRes = await fetch(`${server.baseUrl}/api/settings/codex/logout`, {
				method: "POST",
				headers: { Origin: server.baseUrl, "Sec-Fetch-Site": "same-origin" },
			});
			expect(logoutRes.status).toBe(200);
			const loggedOut = await logoutRes.json();
			expect(loggedOut.auth.state).toBe("signed_out");
			expect(loggedOut.models).toEqual([]);

			// Unavailable scope returns unavailable auth state and 503 on save.
			activeScope = null;
			const unavailableRes = await fetch(`${server.baseUrl}/api/settings/codex`, {
				headers: { Origin: server.baseUrl, "Sec-Fetch-Site": "same-origin" },
			});
			expect(unavailableRes.status).toBe(200);
			expect((await unavailableRes.json()).auth.state).toBe("unavailable");
		} finally {
			await server.close();
		}
	});
});

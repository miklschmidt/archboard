import { beforeEach, describe, expect, test } from "bun:test";

import type {
	CodeTargetNotice,
	CodeTargetOpenFailure,
	OpenerSelection,
	OpenerSelectionReply,
	OpenerSettingsReply,
	OpenerTestReply,
} from "@/shared/code-target";
import {
	createOpenerSettingsFlow,
	type OpenerSettingsApi,
	type OpenerSettingsFlow,
} from "@/ui/opener-settings-flow";

const repository = "github.com/acme/archboard";
const customSelection: OpenerSelection = {
	version: 1,
	kind: "custom",
	executable: "/opt/acme/bin/editor",
	argv: ["--reuse-window", "{path}"],
};
const platformSelection: OpenerSelection = { version: 1, kind: "platform" };

/**
 * The settings reply for a selection.
 * @param selection The saved selection.
 * @returns The reply.
 */
function settingsReply(selection: OpenerSelection): OpenerSettingsReply {
	const command =
		selection.kind === "custom"
			? { executable: selection.executable, argv: selection.argv }
			: { executable: "xdg-open", argv: ["{path}"] };
	return {
		success: true,
		selection,
		effectiveCommand: command,
		availability: { available: true },
		platformDefault: { executable: "xdg-open", argv: ["{path}"] },
		presets: [
			{ preset: "vscode", command: { executable: "code", argv: ["{path}"] } },
			{ preset: "cursor", command: { executable: "cursor", argv: ["{path}"] } },
			{ preset: "zed", command: { executable: "zed", argv: ["{path}"] } },
		],
		repositories: [
			{ repository, root: "/controlled/checkout", exists: true, identityMatches: true },
		],
	};
}

/** What the fake server answers, and what it was asked. */
interface FakeServer {
	fetchReply: OpenerSettingsReply | CodeTargetOpenFailure;
	resetReply: OpenerSelectionReply | CodeTargetOpenFailure;
	saveReply: OpenerSelectionReply | CodeTargetOpenFailure;
	testReply: OpenerTestReply | CodeTargetOpenFailure;
	fetches: number;
	resets: number;
	saves: OpenerSelection[];
	tests: { selection: OpenerSelection; repository: string }[];
}

/**
 * A fresh fake server.
 * @returns The server.
 */
function fakeServer(): FakeServer {
	return {
		fetchReply: settingsReply(customSelection),
		resetReply: { success: true, selection: platformSelection },
		saveReply: { success: true, selection: customSelection },
		testReply: { success: true, code: "OPENER_TESTED", repository },
		fetches: 0,
		resets: 0,
		saves: [],
		tests: [],
	};
}

/**
 * The api over a fake server.
 * @param server The server.
 * @returns The api.
 */
function apiOver(server: FakeServer): OpenerSettingsApi {
	/**
	 * Read the settings.
	 * @returns The scripted reply.
	 */
	async function fetch(): Promise<OpenerSettingsReply | CodeTargetOpenFailure> {
		server.fetches += 1;
		await Promise.resolve();
		return server.fetchReply;
	}
	/**
	 * Reset the settings; a successful reset changes what the next read answers.
	 * @returns The scripted reply.
	 */
	async function reset(): Promise<OpenerSelectionReply | CodeTargetOpenFailure> {
		server.resets += 1;
		if (server.resetReply.success) {
			server.fetchReply = settingsReply(platformSelection);
		}
		await Promise.resolve();
		return server.resetReply;
	}
	/**
	 * Save a selection.
	 * @param selection The selection.
	 * @returns The scripted reply.
	 */
	async function save(
		selection: OpenerSelection,
	): Promise<OpenerSelectionReply | CodeTargetOpenFailure> {
		server.saves.push(selection);
		await Promise.resolve();
		return server.saveReply;
	}
	/**
	 * Test a selection.
	 * @param selection The selection.
	 * @param selectedRepository The checkout.
	 * @returns The scripted reply.
	 */
	async function testSelection(
		selection: OpenerSelection,
		selectedRepository: string,
	): Promise<OpenerTestReply | CodeTargetOpenFailure> {
		server.tests.push({ selection, repository: selectedRepository });
		await Promise.resolve();
		return server.testReply;
	}
	return { fetch, reset, save, test: testSelection };
}

/** What the listener heard. */
interface Heard {
	successes: string[];
	failures: CodeTargetNotice[];
	saved: number;
}

let server: FakeServer;
let heard: Heard;
let flow: OpenerSettingsFlow;

beforeEach(() => {
	server = fakeServer();
	heard = { successes: [], failures: [], saved: 0 };
	flow = createOpenerSettingsFlow({
		api: apiOver(server),
		listener: { onSuccess, onFailure, onSaved },
	});
});

/**
 * Record a success.
 * @param message What succeeded.
 */
function onSuccess(message: string): void {
	heard.successes.push(message);
}

/**
 * Record a failure.
 * @param notice What failed.
 */
function onFailure(notice: CodeTargetNotice): void {
	heard.failures.push(notice);
}

/** Record the save. */
function onSaved(): void {
	heard.saved += 1;
}

describe("opener settings flow", () => {
	test("loads through the api once and exposes the settings", async () => {
		const states: boolean[] = [];
		flow.subscribe(() => states.push(flow.getSnapshot().loading));
		await flow.load();
		expect(server.fetches).toBe(1);
		expect(states[0]).toBe(true);
		expect(flow.getSnapshot()).toMatchObject({
			loading: false,
			settings: { selection: customSelection },
			error: null,
		});
	});

	test("a failed read keeps the error and tells the listener", async () => {
		server.fetchReply = { success: false, code: "OPENER_CONFIG_INVALID", error: "Could not read." };
		await flow.load();
		expect(flow.getSnapshot()).toMatchObject({
			loading: false,
			settings: null,
			error: { message: "Could not read." },
		});
		expect(heard.failures).toEqual([{ kind: "error", message: "Could not read.", actions: [] }]);
	});

	test("a test launches the selection against the checkout and keeps the draft on failure", async () => {
		await flow.load();
		await flow.test({ selection: customSelection, repository });
		expect(server.tests).toEqual([{ selection: customSelection, repository }]);
		expect(server.saves).toEqual([]);
		expect(heard.successes).toEqual([`Test opener launched for ${repository}.`]);
		expect(heard.saved).toBe(0);
		expect(flow.getSnapshot().testResult).toEqual({
			success: true,
			code: "OPENER_TESTED",
			repository,
		});

		const draft: OpenerSelection = {
			...customSelection,
			executable: "/opt/draft/bin/editor",
			argv: ["--new-window", "{path}"],
		};
		server.testReply = {
			success: false,
			code: "OPENER_SPAWN_FAILED",
			error: "Controlled opener failed before launch.",
			actions: [{ kind: "settings", label: "Opener settings" }],
		};
		await flow.test({ selection: draft, repository });
		expect(server.tests[1]).toEqual({ selection: draft, repository });
		expect(heard.failures).toEqual([
			{
				kind: "error",
				message: "Controlled opener failed before launch.",
				actions: [{ kind: "settings", label: "Opener settings" }],
			},
		]);
		expect(flow.getSnapshot()).toMatchObject({
			busy: { test: false, save: false, reset: false },
			error: { message: "Controlled opener failed before launch." },
			settings: { selection: customSelection },
		});
		expect(heard.saved).toBe(0);
	});

	test("save reports its outcome and closes only on success", async () => {
		await flow.load();
		server.saveReply = {
			success: false,
			code: "OPENER_CONFIG_INVALID",
			error: "Could not save opener settings.",
		};
		await flow.save(customSelection);
		expect(server.saves).toEqual([customSelection]);
		expect(heard.failures).toEqual([
			{ kind: "error", message: "Could not save opener settings.", actions: [] },
		]);
		expect(heard.saved).toBe(0);
		expect(flow.getSnapshot().error).toEqual({
			title: "Opener settings",
			message: "Could not save opener settings.",
		});

		server.saveReply = { success: true, selection: customSelection };
		await flow.save(customSelection);
		expect(server.saves).toEqual([customSelection, customSelection]);
		expect(heard.successes).toEqual([
			"Saved. Every pane and caller uses this opener on the next activation.",
		]);
		expect(heard.saved).toBe(1);
		expect(flow.getSnapshot().error).toBeNull();
	});

	test("reset reports its outcome and re-reads the settings on success", async () => {
		await flow.load();
		server.resetReply = {
			success: false,
			code: "OPENER_CONFIG_INVALID",
			error: "Could not reset opener settings.",
		};
		await flow.reset();
		expect(server.resets).toBe(1);
		expect(server.fetches).toBe(1);
		expect(heard.failures).toEqual([
			{ kind: "error", message: "Could not reset opener settings.", actions: [] },
		]);
		expect(flow.getSnapshot().busy.reset).toBe(false);

		server.resetReply = { success: true, selection: platformSelection };
		await flow.reset();
		expect(server.resets).toBe(2);
		expect(server.fetches).toBe(2);
		expect(heard.successes).toEqual(["Reset to the system default for every pane and caller."]);
		expect(heard.saved).toBe(0);
		expect(flow.getSnapshot()).toMatchObject({
			busy: { reset: false },
			settings: { selection: platformSelection },
		});
	});

	test("each action marks only itself busy while in flight", async () => {
		await flow.load();
		const busyWhileTesting = flow.test({ selection: customSelection, repository });
		expect(flow.getSnapshot().busy).toEqual({ test: true, save: false, reset: false });
		await busyWhileTesting;
		const busyWhileSaving = flow.save(customSelection);
		expect(flow.getSnapshot().busy).toEqual({ test: false, save: true, reset: false });
		await busyWhileSaving;
		expect(flow.getSnapshot().busy).toEqual({ test: false, save: false, reset: false });
	});
});

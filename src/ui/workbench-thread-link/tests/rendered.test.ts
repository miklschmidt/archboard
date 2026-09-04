import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { BrowserSnapshot } from "../../../shared/codex-browser-model/index.js";
import { createThreadLinkController, WorkbenchThreadLink } from "../index.js";
import type {
	ThreadLinkInventory,
	ThreadLinkRecoveryIntent,
	WorkbenchThreadLinkProps,
} from "../index.js";
import {
	capabilities,
	connected,
	executableLink,
	FakeTransport,
	loginA,
	pane,
	record,
	snapshot,
	threadA,
	threadB,
} from "./fixtures.js";

const HOST_INTENTS = [
	"start_workbench",
	"choose_binary",
	"unlock_home",
	"repair_storage",
	"refresh_inventory",
] as const satisfies readonly ThreadLinkRecoveryIntent[];

function render(
	overrides: {
		readonly inventory?: ThreadLinkInventory;
		readonly readiness?: BrowserSnapshot["readiness"];
		readonly threadLink?: BrowserSnapshot["threadLink"];
		readonly supported?: NonNullable<Parameters<typeof capabilities>[0]>["supported"];
		readonly hostRecoveryIntents?: readonly ThreadLinkRecoveryIntent[];
		readonly initialAccountForm?: WorkbenchThreadLinkProps["initialAccountForm"];
	} = {},
): string {
	const value = snapshot({
		...(overrides.readiness === undefined ? {} : { readiness: overrides.readiness }),
		...(overrides.threadLink === undefined ? {} : { threadLink: overrides.threadLink }),
	});
	const transport = new FakeTransport(
		connected(value),
		capabilities(overrides.supported === undefined ? {} : { supported: overrides.supported }),
	);
	const controller = createThreadLinkController({ capturePane: () => pane(transport) });
	return renderToStaticMarkup(
		createElement(WorkbenchThreadLink, {
			paneId: "pane-a",
			transport,
			controller,
			inventory: overrides.inventory ?? {
				state: "listed",
				records: [record()],
				exhausted: true,
			},
			hostRecoveryIntents: overrides.hostRecoveryIntents ?? HOST_INTENTS,
			...(overrides.initialAccountForm === undefined
				? {}
				: { initialAccountForm: overrides.initialAccountForm }),
		}),
	);
}

describe("rendered pane thread link", () => {
	test("renders the readiness arm, the current link, and the live action region", () => {
		const markup = render();
		expect(markup).toContain('data-thread-link-readiness="thread_capable"');
		expect(markup).toContain("Ready to create or attach a thread link");
		expect(markup).toContain("No thread link");
		expect(markup).toContain('data-thread-link-action="idle"');
		expect(markup).toContain('aria-live="polite"');
		expect(markup).toContain("No thread-link action has run in this pane.");
	});

	test("renders one row per joined record with every disclosed fact before binding", () => {
		const markup = render();
		expect(markup).toContain('data-thread-link-row="selection-a"');
		expect(markup).toContain('data-thread-link-outcome="executable"');
		expect(markup).toContain('data-thread-link-intent="attach"');
		expect(markup).toContain(threadA);
		for (const label of ["Classification", "Source", "Status", "Loaded", "Controllability"])
			expect(markup).toContain(label);
		expect(markup).toContain("Standard app-server thread");
		expect(markup).toContain("Accepts direct input");
		expect(markup).toContain("Joined from 1 persisted row and 1 current");
		expect(markup).toContain(">Attach<");
	});

	test("renders an inspect-only row with its reason and its inspection-only action", () => {
		const markup = render({
			inventory: {
				state: "listed",
				records: [record({ state: "inspect_only", reason: "prior_epoch" })],
				exhausted: true,
			},
		});
		expect(markup).toContain('data-thread-link-outcome="inspect_only"');
		expect(markup).toContain(
			"Prior epoch: this thread was bound in an epoch before the current one.",
		);
		expect(markup).toContain("Attach for inspection");
	});

	test("renders duplicate and unjoined records as refused rows with a refresh path", () => {
		const markup = render({
			inventory: {
				state: "listed",
				records: [
					record({ selectionId: "first" }),
					record({ selectionId: "second" }),
					record({ selectionId: "orphan", threadId: threadB, persistedRows: 0 }),
				],
				exhausted: true,
			},
		});
		expect(markup).toContain("Records this pane refuses to bind");
		expect(markup).toContain('data-thread-link-excluded="duplicate_row"');
		expect(markup).toContain('data-thread-link-excluded="not_persisted"');
		expect(markup).toContain('data-thread-link-recovery="refresh_inventory"');
		expect(markup).toContain("Refresh the thread list");
	});

	test("renders the empty inventory as its own state rather than a blank list", () => {
		const markup = render({ inventory: { state: "listed", records: [], exhausted: true } });
		expect(markup).toContain('data-thread-link-selection="empty"');
		expect(markup).toContain("No persisted thread joined the current loaded list");
	});

	test("keeps create separate from attach and states its own prerequisite", () => {
		const markup = render();
		expect(markup).toContain('data-thread-link-create="offer"');
		expect(markup).toContain("Create a workhorse thread");
		expect(markup).toContain("No thread list is required.");
		expect(markup).toContain("Attach and relink are separate commands from create.");
	});

	test("disables both commands with a stated reason before the pane is ready", () => {
		const markup = render({ supported: [] });
		expect(markup).toContain("Create is unavailable. It needs:");
		expect(markup).toContain("active command lease");
		expect(markup).toContain("disabled");
	});

	test("renders every recovery for a failed startup arm", () => {
		const markup = render({
			readiness: {
				kind: "readiness",
				state: "incompatible_contract",
				reason: "Codex startup refused. The pinned app-server binary is missing.",
			},
		});
		expect(markup).toContain('data-thread-link-readiness="incompatible_contract"');
		expect(markup).toContain("The pinned app-server binary is missing.");
		expect(markup).toContain('data-thread-link-recovery="choose_binary"');
		expect(markup).toContain('data-thread-link-recovery="start_workbench"');
	});

	test("renders a locked or mismatched storage arm with both of its recoveries", () => {
		const markup = render({
			readiness: {
				kind: "readiness",
				state: "storage_mismatch",
				reason: "Dedicated Codex roots are locked or colliding.",
			},
		});
		expect(markup).toContain('data-thread-link-recovery="unlock_home"');
		expect(markup).toContain('data-thread-link-recovery="repair_storage"');
		expect(markup).toContain("Dedicated Codex roots are locked or colliding.");
	});

	test("renders the backoff instant and disables a recovery this pane cannot own", () => {
		const markup = render({
			readiness: {
				kind: "readiness",
				state: "backoff",
				retryAtMs: 1_700_000_000_000,
				reason: "The Codex app server is waiting before its next start.",
			},
			hostRecoveryIntents: [],
		});
		expect(markup).toContain("Next start at 1700000000000.");
		expect(markup).toContain("has no owner for that action");
	});

	test("points a sign-in retry at the account section rather than at a dead control", () => {
		const markup = render({ readiness: { kind: "readiness", state: "signed_out" } });
		expect(markup).toMatch(/<a [^>]*data-thread-link-recovery="retry_login"[^>]*href="#/u);
	});

	test("offers cancelling a pending sign-in from the readiness arm", () => {
		const markup = render({
			readiness: { kind: "readiness", state: "login_pending", loginId: loginA },
		});
		expect(markup).toContain('data-thread-link-recovery="cancel_login"');
	});

	test("renders the four supported sign-in forms and the four unavailable methods", () => {
		const markup = render();
		for (const id of ["apiKey", "chatgpt", "amazonBedrock", "amazonBedrockAccessKeys"])
			expect(markup).toContain(`data-thread-link-form-option="${id}"`);
		for (const id of [
			"chatgptDeviceCode",
			"chatgptAuthTokens",
			"amazonBedrockProfile",
			"amazonBedrockEnvironment",
		])
			expect(markup).toContain(`data-thread-link-unavailable="${id}"`);
		expect(markup).toContain("Sign-in methods this workbench does not offer");
		expect(markup).toContain("Unavailable: the device-code flow completes on another device");
	});

	test("renders the Bedrock access-key form with its optional session token masked", () => {
		const markup = render({ initialAccountForm: "amazonBedrockAccessKeys" });
		expect(markup).toContain('data-thread-link-form="amazonBedrockAccessKeys"');
		for (const name of ["accessKeyId", "secretAccessKey", "sessionToken", "region"])
			expect(markup).toContain(`data-thread-link-field="${name}"`);
		expect(markup).toMatch(/data-thread-link-field="secretAccessKey"[^>]*type="password"/u);
		expect(markup).toMatch(/data-thread-link-field="sessionToken"[^>]*type="password"/u);
		expect(markup).toMatch(/data-thread-link-field="region"[^>]*type="text"/u);
		expect(markup).toContain("Session token (optional)");
	});

	test("renders the hosted ChatGPT form as a fieldless flow", () => {
		const markup = render({ initialAccountForm: "chatgpt" });
		expect(markup).toContain('data-thread-link-form="chatgpt"');
		expect(markup).not.toContain("data-thread-link-field=");
		expect(markup).toContain("Codex opens it and reports progress here");
	});

	test("names the pane already holding a link rather than offering it again", () => {
		const markup = render({ threadLink: executableLink(threadA) });
		expect(markup).toContain("Executable link");
		expect(markup).toContain('data-thread-link-intent="current"');
		expect(markup).toContain("This pane is already linked to this thread.");
	});
});

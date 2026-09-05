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
	listed,
	loginA,
	unknownCandidates,
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
] as const satisfies readonly ThreadLinkRecoveryIntent[];

function render(
	overrides: {
		readonly account?: BrowserSnapshot["account"];
		readonly login?: BrowserSnapshot["login"];
		readonly inventory?: ThreadLinkInventory;
		readonly readiness?: BrowserSnapshot["readiness"];
		readonly threadLink?: BrowserSnapshot["threadLink"];
		readonly supported?: NonNullable<Parameters<typeof capabilities>[0]>["supported"];
		readonly hostRecoveryIntents?: readonly ThreadLinkRecoveryIntent[];
		readonly initialAccountForm?: WorkbenchThreadLinkProps["initialAccountForm"];
		readonly undiscovered?: boolean;
	} = {},
): string {
	const value = snapshot({
		...(overrides.account === undefined ? {} : { account: overrides.account }),
		...(overrides.login === undefined ? {} : { login: overrides.login }),
		...(overrides.readiness === undefined ? {} : { readiness: overrides.readiness }),
		...(overrides.threadLink === undefined ? {} : { threadLink: overrides.threadLink }),
		threadCandidates:
			overrides.inventory ??
			(overrides.undiscovered === true ? unknownCandidates : listed([record()])),
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
			hostRecoveryIntents: overrides.hostRecoveryIntents ?? HOST_INTENTS,
			...(overrides.initialAccountForm === undefined
				? {}
				: { initialAccountForm: overrides.initialAccountForm }),
		}),
	);
}

describe("rendered pane thread link", () => {
	test("offers two connection choices without idle diagnostic chrome", () => {
		const markup = render();
		expect(markup).toContain('data-thread-link-readiness="thread_capable"');
		expect(markup).toContain("Start agent");
		expect(markup).toContain("Choose existing conversation");
		expect(markup).not.toContain('data-thread-link-action="idle"');
		expect(markup).not.toContain("Pane thread link");
		expect(markup).not.toContain("command lease");
	});

	test("renders one row per joined record with every disclosed fact before binding", () => {
		const markup = render();
		expect(markup).toContain('data-thread-link-row="selection-a"');
		expect(markup).toContain('data-thread-link-outcome="executable"');
		expect(markup).toContain('data-thread-link-intent="attach"');
		expect(markup).toContain(threadA);
		expect(markup).toContain("Idle");
		expect(markup).not.toContain("Classification");
		expect(markup).toContain("1 conversation.");
		expect(markup).toContain(">Connect<");
		expect(markup).toContain(`aria-label="Connect conversation ${threadA}"`);
	});

	test("renders an inspect-only row with its reason and its inspection-only action", () => {
		const markup = render({
			inventory: listed([record({ state: "inspect_only", reason: "prior_epoch" })]),
		});
		expect(markup).toContain('data-thread-link-outcome="inspect_only"');
		expect(markup).toContain("This conversation belongs to an earlier agent session.");
		expect(markup).toContain("View only");
	});

	test("renders one row per published record with the refresh path beside them", () => {
		const markup = render({
			inventory: listed([
				record({ selectionId: "first" }),
				record({ selectionId: "second", threadId: threadB }),
			]),
		});
		expect(markup).toContain('data-thread-link-row="first"');
		expect(markup).toContain('data-thread-link-row="second"');
		expect(markup).toContain("2 conversations");
		expect(markup).toContain('data-thread-link-recovery="refresh_inventory"');
		expect(markup).toContain("Refresh conversations");
	});

	test("renders the undiscovered inventory as its own state with a refresh path", () => {
		const markup = render({ inventory: undefined, undiscovered: true });
		expect(markup).toContain('data-thread-link-selection="unknown"');
		expect(markup).toContain("Refresh to load your conversations.");
		expect(markup).toContain('data-thread-link-recovery="refresh_inventory"');
	});

	test("renders the empty inventory as its own state rather than a blank list", () => {
		const markup = render({ inventory: listed([]) });
		expect(markup).toContain('data-thread-link-selection="empty"');
		expect(markup).toContain("No conversations are available.");
	});

	test("keeps create separate from attach and states its own prerequisite", () => {
		const markup = render();
		expect(markup).toContain('data-thread-link-create="offer"');
		expect(markup).toContain("Start agent");
		expect(markup).toContain("Choose existing conversation");
		expect(markup).toContain('aria-expanded="false"');
	});

	test("disables both commands with a stated reason before the pane is ready", () => {
		const markup = render({ supported: [] });
		expect(markup).toContain("Refresh the connection and try again.");
		expect(markup).not.toContain("command lease");
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
		expect(markup).toContain("waiting before its next start");
		expect(markup).toContain("Do this where Archboard is running.");
	});

	test("points a sign-in retry at the account section rather than at a dead control", () => {
		const markup = render({
			readiness: { kind: "readiness", state: "signed_out" },
			account: { kind: "account", state: "signed_out" },
		});
		expect(markup).toContain('data-thread-link-account="signed_out"');
		expect(markup).toContain(">Sign in<");
		expect(markup).toContain("<details open");
	});

	test("offers the published ChatGPT continuation and cancellation while sign-in is pending", () => {
		const markup = render({
			readiness: { kind: "readiness", state: "login_pending", loginId: loginA },
			account: { kind: "account", state: "login_pending", loginId: loginA, variant: "chatgpt" },
			login: {
				kind: "login",
				state: "pending",
				loginId: loginA,
				variant: "chatgpt",
				authUrl: "https://example.test/login",
			},
		});
		const continuation = markup.match(/<a[^>]*href="https:\/\/example.test\/login"[^>]*>/)?.[0];
		expect(continuation).toBeDefined();
		expect(continuation).toContain('target="_blank"');
		expect(continuation).toContain('rel="noopener noreferrer"');
		expect(markup).toContain(">Continue to ChatGPT<");
		expect(markup).toContain(">Cancel sign-in<");
		expect(markup).not.toContain("data-thread-link-form-option=");
		expect(markup).not.toContain(">Sign in<");
		expect(markup).not.toContain(">Sign out<");
	});

	test("defaults to ChatGPT first and omits inactive signed-out actions and policy help", () => {
		const markup = render({ account: { kind: "account", state: "signed_out" } });
		expect(
			[...markup.matchAll(/data-thread-link-form-option="([^"]+)"/g)].map((match) => match[1]),
		).toEqual(["chatgpt", "apiKey", "amazonBedrock", "amazonBedrockAccessKeys"]);
		expect(markup.match(/<input[^>]*data-thread-link-form-option="chatgpt"[^>]*>/)?.[0]).toContain(
			"checked",
		);
		expect(markup).toContain('data-thread-link-form="chatgpt"');
		expect(markup).not.toContain("Hosted ChatGPT");
		expect(markup).not.toContain("Sign-in help");
		expect(markup).not.toContain("data-thread-link-unavailable=");
		expect(markup).not.toContain(">Cancel sign-in<");
		expect(markup).not.toContain(">Sign out<");
	});

	test("retains the current failed sign-in reason beside the signed-out account and retry", () => {
		const markup = render({
			account: { kind: "account", state: "signed_out" },
			login: {
				kind: "login",
				state: "failed",
				loginId: loginA,
				reason: "ChatGPT sign-in was denied.",
			},
		});
		expect(markup).toContain('data-thread-link-account="signed_out"');
		expect(markup).toContain('data-thread-link-readiness="login_failed"');
		expect(markup.match(/ChatGPT sign-in was denied\./g)).toHaveLength(1);
		expect(markup).toContain(">Sign in<");
		expect(markup).not.toContain(">Continue to ChatGPT<");
		expect(markup).not.toContain(">Cancel sign-in<");
	});

	test("collapses account management to status and sign out while signed in", () => {
		const markup = render();
		expect(markup).toContain('data-thread-link-account="ready"');
		expect(markup).toContain("Signed in");
		expect(markup).toContain(">Sign out<");
		expect(markup).not.toContain("data-thread-link-form-option=");
		expect(markup).not.toContain("data-thread-link-unavailable=");
	});

	test("renders the Bedrock access-key form with its optional session token masked", () => {
		const markup = render({
			account: { kind: "account", state: "signed_out" },
			initialAccountForm: "amazonBedrockAccessKeys",
		});
		expect(markup).toContain('data-thread-link-form="amazonBedrockAccessKeys"');
		for (const name of ["accessKeyId", "secretAccessKey", "sessionToken", "region"])
			expect(markup).toContain(`data-thread-link-field="${name}"`);
		expect(markup).toMatch(/data-thread-link-field="secretAccessKey"[^>]*type="password"/u);
		expect(markup).toMatch(/data-thread-link-field="sessionToken"[^>]*type="password"/u);
		expect(markup).toMatch(/data-thread-link-field="region"[^>]*type="text"/u);
		expect(markup).toContain("Session token (optional)");
	});

	test("renders the ChatGPT form as a fieldless flow", () => {
		const markup = render({
			account: { kind: "account", state: "signed_out" },
			initialAccountForm: "chatgpt",
		});
		expect(markup).toContain('data-thread-link-form="chatgpt"');
		expect(markup).not.toContain("data-thread-link-field=");
		expect(markup).toContain("Continue with your ChatGPT account.");
	});

	test("names the pane already holding a link rather than offering it again", () => {
		const markup = render({ threadLink: executableLink(threadA) });
		expect(markup).toContain("This conversation can work on the board.");
		expect(markup).toContain('data-thread-link-intent="current"');
		expect(markup).toContain("This conversation is already connected.");
	});
});

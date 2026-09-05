import { describe, expect, test } from "bun:test";
import { act } from "react";

import type {
	BrowserReadiness,
	BrowserSnapshot,
	BrowserTimeline,
} from "../../../shared/codex-browser-model/index.js";
import type { BrowserWorkbenchState } from "../../workbench-transport/index.js";
import { workbenchRuntimeMessageId, type WorkbenchSubmissionResult } from "../index.js";
import {
	connected,
	latestExecutable,
	mountProvider,
	MutableTransport,
	snapshot,
	threadId,
	timeline,
	turnId,
	type TimelineItem,
} from "./mounted-support.js";

describe("mounted workbench runtime provider", () => {
	test("keeps one live subscription and stable assistant runtime across updates and replacement", async () => {
		const first = new MutableTransport();
		const second = new MutableTransport();
		const mounted = await mountProvider();
		try {
			await mounted.render(first);
			expect(first.subscriptions).toBe(1);
			const runtime = latestExecutable(mounted.contexts).assistantRuntime;

			await act(async () => first.publish(connected(snapshot(timeline()))));
			expect(latestExecutable(mounted.contexts).assistantRuntime).toBe(runtime);
			const providerClient = mounted.observations.at(-1)?.client;
			expect(providerClient).toBeDefined();
			expect(mounted.observations.at(-1)?.thread.messages[0]?.id).toBe(
				workbenchRuntimeMessageId(threadId, turnId),
			);

			await mounted.render(second);
			expect(first.teardowns).toBe(1);
			expect(second.subscriptions).toBe(1);
			expect(latestExecutable(mounted.contexts).assistantRuntime).toBe(runtime);

			const control = await mountProvider();
			try {
				const sourceTimeline = timeline();
				const wrongTimeline = {
					...sourceTimeline,
					turns: [
						{
							...sourceTimeline.turns[0]!,
							turnId: "wrong-provider-turn" as BrowserTimeline["turns"][number]["turnId"],
						},
					],
				};
				await control.render(new MutableTransport(connected(snapshot(wrongTimeline))));
				const wrongRuntime = latestExecutable(control.contexts).assistantRuntime;
				expect(wrongRuntime).not.toBe(runtime);
				expect(control.observations.at(-1)?.client).not.toBe(providerClient);
				expect(control.observations.at(-1)?.thread.messages[0]?.id).toBe(
					workbenchRuntimeMessageId(threadId, "wrong-provider-turn"),
				);
				expect(mounted.observations.at(-1)?.client).toBe(providerClient);
			} finally {
				await control.close();
			}
		} finally {
			await mounted.close();
		}
		expect(second.teardowns).toBe(1);
		expect(second.listeners.size).toBe(0);
	});
	test("preserves stopped and incompatible contract reasons with state-specific recovery", async () => {
		const stoppedReason = "The workbench socket was intentionally stopped.";
		const incompatibleReason = "Expected protocol 7 but Codex supplied protocol 6.";
		const transport = new MutableTransport({
			kind: "connection",
			state: "stopped",
			connection: "stopped",
			snapshot: null,
			sequence: null,
			reason: stoppedReason,
		});
		const mounted = await mountProvider();
		try {
			await mounted.render(transport);
			const stopped = mounted.contexts.at(-1);
			expect(stopped?.view.state).toBe("stopped");
			expect(stopped?.view.reason).toBe(stoppedReason);
			expect(mounted.container.queryByRole("status")?.textContent).toBe(
				`${stoppedReason} Restart the Codex workbench, then retry.`,
			);

			await act(async () =>
				transport.publish({
					kind: "connection",
					state: "incompatible_contract",
					connection: "stopped",
					snapshot: null,
					sequence: null,
					reason: incompatibleReason,
				}),
			);
			const incompatible = mounted.contexts.at(-1);
			expect(incompatible?.view.state).toBe("incompatible_contract");
			expect(incompatible?.view.reason).toBe(incompatibleReason);
			const visible = mounted.container.queryByRole("status")?.textContent;
			expect(visible).toBe(
				`${incompatibleReason} Update Archboard or Codex so their workbench protocol versions match.`,
			);
			expect(visible).not.toContain("select a current executable workhorse");
		} finally {
			await mounted.close();
		}
	});
	test("renders every retained account and storage readiness recovery", async () => {
		const cases = [
			[
				{ kind: "readiness", state: "storage_mismatch", reason: "Storage mismatch exactly." },
				"Correct the Codex storage configuration",
			],
			[{ kind: "readiness", state: "login_capable" }, "Sign in to Codex"],
			[{ kind: "readiness", state: "signed_out" }, "Sign in to Codex"],
			[
				{
					kind: "readiness",
					state: "login_pending",
					loginId: "matrix-login" as Extract<
						BrowserReadiness,
						{ readonly state: "login_pending" }
					>["loginId"],
				},
				"Complete or cancel the pending Codex sign-in",
			],
			[
				{ kind: "readiness", state: "initialized" },
				"Wait for Codex to finish preparing a thread-capable workhorse",
			],
			[
				{ kind: "readiness", state: "account_ready" },
				"Wait for Codex to finish preparing a thread-capable workhorse",
			],
			[
				{
					kind: "readiness",
					state: "backoff",
					retryAtMs: 10,
					reason: "Readiness backoff exactly.",
				},
				"Wait until Codex retries",
			],
		] as const satisfies readonly (readonly [BrowserReadiness, string])[];
		const transport = new MutableTransport();
		const mounted = await mountProvider();
		try {
			await mounted.render(transport);
			for (const [readiness, recovery] of cases) {
				const value: BrowserSnapshot = { ...snapshot(), readiness };
				const state: BrowserWorkbenchState = {
					kind: "readiness",
					state: readiness.state,
					connection: "connected",
					snapshot: value,
					sequence: 1,
				};
				await act(async () => transport.publish(state));
				const context = mounted.contexts.at(-1);
				expect(context?.mode).toBe("readonly");
				expect(context?.view.state).toBe(readiness.state);
				expect(context?.assistantRuntime).toBeNull();
				expect(mounted.container.queryByRole("status")?.textContent).toContain(recovery);
			}
		} finally {
			await mounted.close();
		}
	});
	test("renders reconnect, stale-link, unsupported-item, and runtime-failure recovery", async () => {
		const transport = new MutableTransport();
		const mounted = await mountProvider();
		try {
			await mounted.render(transport);
			expect(mounted.container.queryByRole("status")?.getAttribute("aria-label")).toBe(
				"Codex workbench status",
			);
			expect(mounted.container.queryByRole("status")?.getAttribute("class")).toBe("sr-only");
			await act(async () =>
				transport.publish({
					kind: "stream",
					state: "stale_snapshot",
					connection: "connected",
					snapshot: snapshot(),
					sequence: 1,
					expectedSequence: 2,
					receivedSequence: 3,
					reason: "The active turn snapshot is stale.",
				}),
			);
			expect(mounted.container.queryByRole("status")?.textContent).toContain(
				"Wait for a fresh Codex snapshot",
			);
			expect(mounted.container.queryByRole("status")?.getAttribute("class")).not.toContain(
				"sr-only",
			);
			await act(async () =>
				transport.publish({
					kind: "connection",
					state: "reconnecting",
					connection: "reconnecting",
					snapshot: snapshot(),
					sequence: 1,
					reason: "Codex connection was lost.",
				}),
			);
			expect(mounted.container.queryByRole("status")?.textContent).toContain(
				"Wait for Codex to reconnect",
			);

			const stale = snapshot();
			await act(async () =>
				transport.publish(
					connected({
						...stale,
						threadLink: {
							kind: "thread_link",
							state: "inspect_only",
							childId: null,
							epoch: null,
							threadId,
							sourcePresentation: "unknown",
							status: "active",
							loaded: true,
							canAcceptDirectInput: false,
							reason: "The active turn belongs to a prior Codex process.",
						},
					}),
				),
			);
			expect(mounted.container.queryByRole("status")?.textContent).toContain(
				"select a current executable workhorse",
			);

			const futureItem = {
				media: "future",
				itemId: "future-item",
			} as unknown as TimelineItem;
			await act(async () => transport.publish(connected(snapshot(timeline([futureItem])))));
			expect(
				latestExecutable(mounted.contexts).view.messages[0]?.metadata.custom.archboard.items[0],
			).toMatchObject({
				itemId: "future-item",
				kind: "future",
				supported: false,
			});

			const allMedia = [
				{ media: "text", itemId: "media-text", text: "text" },
				{ media: "reasoning", itemId: "media-reasoning", text: "reasoning" },
				{ media: "plan", itemId: "media-plan", text: "plan" },
				{ media: "tool", itemId: "media-tool", name: "tool", status: "completed" },
				{ media: "command", itemId: "media-command", command: "cmd", status: "failed" },
				{ media: "fileChange", itemId: "media-file", status: "declined" },
				{
					media: "approval",
					itemId: "media-approval",
					approvalId: "approval-a",
					status: "pending",
				},
			] as unknown as TimelineItem[];
			const baseTurn = timeline().turns[0]!;
			const statusTimeline = {
				...timeline(),
				turns: [
					{ ...baseTurn, turnId: "status-running", status: "inProgress", items: allMedia },
					{ ...baseTurn, turnId: "status-complete", status: "completed", items: [] },
					{ ...baseTurn, turnId: "status-interrupted", status: "interrupted", items: [] },
					{ ...baseTurn, turnId: "status-failed", status: "failed", items: [] },
				],
			} as unknown as BrowserTimeline;
			await act(async () => transport.publish(connected(snapshot(statusTimeline))));
			const mapped = latestExecutable(mounted.contexts).view.messages;
			expect(mapped[0]?.metadata.custom.archboard.items.map((item) => item.itemId)).toEqual(
				allMedia.map((item) => item.itemId),
			);
			expect(mapped.map((message) => message.status.type)).toEqual([
				"running",
				"complete",
				"incomplete",
				"incomplete",
			]);
			const observed = mounted.observations.at(-1)?.thread;
			expect(observed?.messages.map((message) => message.id)).toEqual([
				workbenchRuntimeMessageId(threadId, "status-running"),
				workbenchRuntimeMessageId(threadId, "status-complete"),
				workbenchRuntimeMessageId(threadId, "status-interrupted"),
				workbenchRuntimeMessageId(threadId, "status-failed"),
			]);
			expect(observed?.messages[0]?.content).toEqual([
				{ type: "text", text: "Mounted authoritative turn" },
			]);
			expect(observed?.capabilities).toMatchObject({
				edit: false,
				reload: false,
				delete: false,
			});

			const sharedItemId = "same" as TimelineItem["itemId"];
			const sharedIdentity = timeline([
				{ media: "command", itemId: sharedItemId, command: "bun test", status: "completed" },
				{
					media: "approval",
					itemId: sharedItemId,
					approvalId: "approval-shared" as never,
					status: "pending",
				},
			]);
			await act(async () => transport.publish(connected(snapshot(sharedIdentity))));
			const sharedItems = latestExecutable(mounted.contexts).view.messages[0]?.metadata.custom
				.archboard.items;
			expect(sharedItems?.map((item) => item.itemId)).toEqual([sharedItemId, sharedItemId]);
			expect(sharedItems?.map((item) => item.kind)).toEqual(["command", "approval"]);

			const duplicate = timeline([
				{ media: "command", itemId: sharedItemId, command: "bun test", status: "completed" },
				{ media: "command", itemId: sharedItemId, command: "bun test", status: "completed" },
			]);
			await act(async () => transport.publish(connected(snapshot(duplicate))));
			expect(mounted.contexts.at(-1)?.view.state).toBe("runtime_failure");
			expect(mounted.container.queryByRole("status")?.textContent).toContain(
				`Duplicate Codex item identity: ["${threadId}","${turnId}","${sharedItemId}","command"]`,
			);
		} finally {
			await mounted.close();
		}
	});
	test("translates submission outcomes without replay and ignores completion after teardown", async () => {
		const transport = new MutableTransport();
		const mounted = await mountProvider();
		try {
			await mounted.render(transport, async () => ({
				outcome: "not_delivered",
				reason: "Offline",
			}));
			const notDeliveredComposer = latestExecutable(mounted.contexts).assistantRuntime.thread
				.composer;
			await act(async () => {
				notDeliveredComposer.setText("retry me");
				notDeliveredComposer.send();
				await Promise.resolve();
			});
			expect(mounted.container.queryByRole("status")?.textContent).toContain("draft was restored");
			expect(notDeliveredComposer.getState().text).toBe("retry me");

			await mounted.render(transport, async () => ({
				outcome: "outcome_unknown",
				reason: "The response was lost.",
			}));
			const unknownComposer = latestExecutable(mounted.contexts).assistantRuntime.thread.composer;
			await act(async () => {
				unknownComposer.setText("do not replay");
				unknownComposer.send();
				await Promise.resolve();
			});
			expect(mounted.container.queryByRole("status")?.textContent).toContain(
				"Inspect the current workhorse",
			);
			expect(unknownComposer.getState().text).toBe("");

			await mounted.render(transport, async () => ({ outcome: "delivered", turnId }));
			const deliveredComposer = latestExecutable(mounted.contexts).assistantRuntime.thread.composer;
			await act(async () => {
				deliveredComposer.setText("confirmed");
				deliveredComposer.send();
				await Promise.resolve();
			});
			expect(mounted.container.queryByRole("status")?.textContent).toContain(
				"published its authoritative turn",
			);
			expect(deliveredComposer.getState().text).toBe("");

			await mounted.render(transport, async () => ({
				outcome: "delivered",
				turnId: "not-yet-authoritative" as BrowserTimeline["turns"][number]["turnId"],
			}));
			await act(async () => {
				latestExecutable(mounted.contexts).assistantRuntime.thread.append({
					role: "user",
					content: [{ type: "text", text: "unconfirmed" }],
				});
				await Promise.resolve();
			});
			expect(mounted.container.queryByRole("status")?.textContent).toContain(
				"authoritative turn has not appeared",
			);

			await mounted.render(transport, async () => {
				throw new Error("Transport result was lost.");
			});
			await act(async () => {
				latestExecutable(mounted.contexts).assistantRuntime.thread.append({
					role: "user",
					content: [{ type: "text", text: "thrown outcome" }],
				});
				await Promise.resolve();
			});
			expect(mounted.container.queryByRole("status")?.textContent).toContain(
				"Transport result was lost",
			);
			expect(mounted.container.queryByRole("status")?.textContent).toContain(
				"before deciding whether to send again",
			);
		} finally {
			await mounted.close();
		}

		const deferredTransport = new MutableTransport();
		const deferredMounted = await mountProvider();
		let resolve!: (result: WorkbenchSubmissionResult) => void;
		const pending = new Promise<WorkbenchSubmissionResult>((done) => {
			resolve = done;
		});
		await deferredMounted.render(deferredTransport, async () => await pending);
		await act(async () => {
			latestExecutable(deferredMounted.contexts).assistantRuntime.thread.append({
				role: "user",
				content: [{ type: "text", text: "pending" }],
			});
			await Promise.resolve();
		});
		const rendersBeforeClose = deferredMounted.contexts.length;
		await deferredMounted.close();
		resolve({ outcome: "outcome_unknown", reason: "Late result" });
		await Promise.resolve();
		expect(deferredMounted.contexts).toHaveLength(rendersBeforeClose);
		expect(deferredTransport.listeners.size).toBe(0);
	});

	test("fences every late settlement from a replaced transport", async () => {
		const cases = [
			{ outcome: "delivered", turnId },
			{ outcome: "not_delivered", reason: "Late refusal" },
			{ outcome: "outcome_unknown", reason: "Late uncertainty" },
			new Error("Late rejection"),
		] as const satisfies readonly (WorkbenchSubmissionResult | Error)[];
		for (const result of cases) {
			const first = new MutableTransport();
			const second = new MutableTransport();
			const mounted = await mountProvider();
			let resolve!: (value: WorkbenchSubmissionResult) => void;
			let reject!: (error: Error) => void;
			const deferred = new Promise<WorkbenchSubmissionResult>((done, fail) => {
				resolve = done;
				reject = fail;
			});
			try {
				await mounted.render(first, async () => await deferred);
				const runtime = latestExecutable(mounted.contexts).assistantRuntime;
				await act(async () => {
					runtime.thread.composer.setText("submission for A");
					runtime.thread.composer.send();
					await Promise.resolve();
				});
				await mounted.render(second, async () => ({ outcome: "delivered", turnId }));
				await act(async () => {
					runtime.thread.composer.setText("draft for B");
					if (result instanceof Error) reject(result);
					else resolve(result);
					await deferred.catch(() => undefined);
				});
				expect(runtime.thread.composer.getState().text).toBe("draft for B");
				expect(mounted.container.queryByRole("status")?.textContent).toBe(
					"The current Codex workhorse is ready.",
				);
			} finally {
				await mounted.close();
			}
		}
	});
});

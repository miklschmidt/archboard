import { describe, expect, test } from "bun:test";
import { act } from "react";

import type { BrowserTimeline } from "../../../shared/codex-browser-model/index.js";
import type { WorkbenchSubmissionResult } from "../index.js";
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
			expect(mounted.observations.at(-1)?.thread.messages[0]?.id).toBe(turnId);

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
				expect(control.observations.at(-1)?.thread.messages[0]?.id).toBe("wrong-provider-turn");
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
	test("renders reconnect, stale-link, unsupported-item, and runtime-failure recovery", async () => {
		const transport = new MutableTransport();
		const mounted = await mountProvider();
		try {
			await mounted.render(transport);
			expect(mounted.container.queryByRole("status")?.getAttribute("aria-label")).toBe(
				"Codex workbench status",
			);
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
							source: "unknown",
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
			expect(latestExecutable(mounted.contexts).view.messages[0]?.content[0]).toMatchObject({
				itemId: "future-item",
				name: "archboard-unsupported-item",
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
			expect(mapped[0]?.content.map((part) => ("itemId" in part ? part.itemId : null))).toEqual(
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
				"status-running",
				"status-complete",
				"status-interrupted",
				"status-failed",
			]);
			expect(
				observed?.messages[0]?.content.map((part) => ("itemId" in part ? part.itemId : null)),
			).toEqual(allMedia.map((item) => item.itemId));
			expect(observed?.capabilities).toMatchObject({
				edit: false,
				reload: false,
				delete: false,
			});

			const duplicate = timeline([
				{ media: "text", itemId: "same" as TimelineItem["itemId"], text: "one" },
				{ media: "reasoning", itemId: "same" as TimelineItem["itemId"], text: "two" },
			]);
			await act(async () => transport.publish(connected(snapshot(duplicate))));
			expect(mounted.container.queryByRole("status")?.textContent).toContain(
				"Duplicate Codex item identity",
			);
			expect(mounted.container.queryByRole("status")?.textContent).toContain("reconnect or reload");
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
});

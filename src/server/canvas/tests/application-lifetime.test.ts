import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import winston from "winston";

import { CanvasApplicationHeldError, createCanvasApplicationLifetime } from "../index.js";
import { closeLogger } from "../../../runtime/engine/logger.js";

describe("canvas application lifetime", () => {
	test("starts in order and stops every owner in reverse order", async () => {
		const actions: string[] = [];
		const lifetime = createCanvasApplicationLifetime({
			resources: ["engine", "codex", "http", "browser", "signals"].map((name) => ({
				name,
				start: () => {
					actions.push(`start:${name}`);
				},
				stop: () => {
					actions.push(`stop:${name}`);
				},
			})),
		});

		await lifetime.start();
		expect(lifetime.phase()).toBe("running");
		await lifetime.stop("test");
		expect(lifetime.phase()).toBe("stopped");
		expect(actions).toEqual([
			"start:engine",
			"start:codex",
			"start:http",
			"start:browser",
			"start:signals",
			"stop:signals",
			"stop:browser",
			"stop:http",
			"stop:codex",
			"stop:engine",
		]);
	});

	test("unwinds partial startup and a fresh owner can start afterwards", async () => {
		const actions: string[] = [];
		const failed = createCanvasApplicationLifetime({
			resources: [
				{
					name: "engine",
					stop: () => {
						actions.push("stop:engine");
					},
				},
				{
					name: "codex",
					start: () => {
						throw new Error("codex failed");
					},
					stop: () => {
						actions.push("stop:codex");
					},
				},
			],
		});

		await expect(failed.start()).rejects.toThrow("codex failed");
		expect(failed.phase()).toBe("failed");
		expect(actions).toEqual(["stop:codex", "stop:engine"]);

		const replacement = createCanvasApplicationLifetime({
			resources: [{ name: "engine", stop: () => undefined }],
		});
		await replacement.start();
		expect(replacement.phase()).toBe("running");
		await replacement.stop("test");
	});

	test("refuses shutdown while every held board and recovery is named", async () => {
		const actions: string[] = [];
		const lifetime = createCanvasApplicationLifetime({
			resources: [
				{
					name: "engine",
					stop: () => {
						actions.push("stop");
					},
				},
			],
			heldBoards: () => ["zeta", "alpha"],
		});
		await lifetime.start();

		const refusal = await lifetime.stop("test").catch((error: unknown) => error);
		expect(refusal).toBeInstanceOf(CanvasApplicationHeldError);
		expect((refusal as CanvasApplicationHeldError).code).toBe("CANVAS_HELD");
		expect((refusal as Error).message).toContain('"alpha", "zeta"');
		expect((refusal as Error).message).toContain("reload");
		expect((refusal as Error).message).toContain("overwrite");
		expect((refusal as Error).message).toContain("elsewhere");
		expect(lifetime.phase()).toBe("running");
		expect(actions).toEqual([]);
	});

	test("continues reverse teardown after failures and reports them", async () => {
		const actions: string[] = [];
		const lifetime = createCanvasApplicationLifetime({
			resources: ["engine", "codex", "http"].map((name) => ({
				name,
				stop: () => {
					actions.push(name);
					if (name !== "codex") throw new Error(`${name} failed`);
				},
			})),
		});
		await lifetime.start();

		await expect(lifetime.stop("test")).rejects.toThrow("Canvas application cleanup failed");
		expect(actions).toEqual(["http", "codex", "engine"]);
		expect(lifetime.phase()).toBe("failed");
	});

	test("shares one terminal shutdown across concurrent and repeated callers", async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => void (release = resolve));
		let stops = 0;
		const lifetime = createCanvasApplicationLifetime({
			resources: [
				{
					name: "engine",
					stop: async () => {
						stops++;
						await gate;
					},
				},
			],
		});
		await lifetime.start();

		const first = lifetime.stop("test");
		const concurrent = lifetime.stop("SIGTERM");
		expect(concurrent).toBe(first);
		await new Promise<void>((resolve) => setImmediate(resolve));
		expect(stops).toBe(1);
		release();
		await first;
		expect(lifetime.stop("test")).toBe(first);
		await lifetime.stop("test");
		expect(stops).toBe(1);
	});

	test("forces a timed owner and waits for its original stop to settle", async () => {
		const actions: string[] = [];
		let release!: () => void;
		const gate = new Promise<void>((resolve) => void (release = resolve));
		const lifetime = createCanvasApplicationLifetime({
			observe: ({ action, resource }) => {
				if (resource !== null && (action === "force" || action === "forced"))
					actions.push(`${action}:${resource}`);
			},
			resources: [
				{
					name: "http",
					stopGraceMs: 5,
					stop: async () => {
						actions.push("stop:http");
						await gate;
						actions.push("settled:http");
					},
					forceStop: () => {
						actions.push("force-action:http");
						release();
					},
				},
			],
		});
		await lifetime.start();

		await lifetime.stop("test");
		expect(actions).toEqual([
			"stop:http",
			"force:http",
			"force-action:http",
			"settled:http",
			"forced:http",
		]);
		expect(lifetime.phase()).toBe("stopped");
	});

	test("cancels a partially started owner and unwinds every entered owner", async () => {
		const actions: string[] = [];
		let release!: () => void;
		const gate = new Promise<void>((resolve) => void (release = resolve));
		const lifetime = createCanvasApplicationLifetime({
			resources: [
				{
					name: "signals",
					stop: () => {
						actions.push("stop:signals");
					},
				},
				{
					name: "codex",
					start: async (signal) => {
						actions.push("start:codex");
						signal.addEventListener("abort", release, { once: true });
						await gate;
						throw new Error("codex startup canceled");
					},
					stop: () => {
						actions.push("stop:codex");
						release();
					},
				},
			],
		});

		const starting = lifetime.start();
		expect(lifetime.phase()).toBe("starting");
		await lifetime.stop("SIGTERM");
		await expect(starting).rejects.toThrow("codex startup canceled");
		expect(actions).toEqual(["start:codex", "stop:codex", "stop:signals"]);
		expect(lifetime.phase()).toBe("stopped");
	});

	test("drains admitted writes, rechecks holds, and resumes after refusal", async () => {
		let held: string[] = [];
		let quiesces = 0;
		let resumes = 0;
		const lifetime = createCanvasApplicationLifetime({
			resources: [{ name: "engine", stop: () => undefined }],
			heldBoards: () => held,
			quiesce: () => {
				quiesces++;
				if (quiesces === 1) held = ["late-hold"];
			},
			resume: () => {
				resumes++;
			},
		});
		await lifetime.start();

		await expect(lifetime.stop("test")).rejects.toThrow('"late-hold"');
		expect(lifetime.phase()).toBe("running");
		expect(resumes).toBe(1);
		held = [];
		await lifetime.stop("test");
		expect(quiesces).toBe(2);
		expect(lifetime.phase()).toBe("stopped");
	});

	test("startup unwind closes a real logger transport owned before the failure", async () => {
		const root = mkdtempSync(join(tmpdir(), "archboard-lifetime-logger-failure-"));
		const transport = new winston.transports.File({ filename: join(root, "startup.log") });
		const owner = winston.createLogger({ transports: [transport] });
		try {
			const lifetime = createCanvasApplicationLifetime({
				resources: [
					{ name: "logger", stop: () => closeLogger(owner) },
					{
						name: "failing-owner",
						start: () => {
							throw new Error("startup failed after logger creation");
						},
						stop: () => undefined,
					},
				],
			});

			await expect(lifetime.start()).rejects.toThrow("startup failed after logger creation");
			expect(owner.transports).toEqual([]);
			expect(transport.listenerCount("finish")).toBe(0);
		} finally {
			if (!owner.destroyed && !owner.writableFinished) owner.destroy();
			rmSync(root, { recursive: true, force: true });
		}
	});
});

import { describe, expect, test } from "bun:test";

import { CanvasApplicationHeldError, createCanvasApplicationLifetime } from "../index.js";

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
		expect(actions).toEqual(["stop:engine"]);

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
		expect(stops).toBe(1);
		release();
		await first;
		expect(lifetime.stop("test")).toBe(first);
		await lifetime.stop("test");
		expect(stops).toBe(1);
	});

	test("bounds the complete reverse teardown and still invokes later owners", async () => {
		const actions: string[] = [];
		const lifetime = createCanvasApplicationLifetime({
			stopTimeoutMs: 5,
			resources: ["engine", "http"].map((name) => ({
				name,
				stop: () => {
					actions.push(name);
					return new Promise<void>(() => undefined);
				},
			})),
		});
		await lifetime.start();

		await expect(lifetime.stop("test")).rejects.toThrow("application shutdown cap");
		expect(actions).toEqual(["http", "engine"]);
		expect(lifetime.phase()).toBe("failed");
	});
});

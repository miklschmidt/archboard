import { describe, expect, test } from "bun:test";

import { SERVER_NOTIFICATION_METHODS } from "#runtime/protocol/protocol-methods.ts";
import {
	ProtocolDecodeError,
	decodeServerNotification,
} from "#runtime/protocol/protocol-decoder.ts";
import { notificationFixture } from "#tests/runtime/support/notification-fixtures.ts";
import {
	assertChallengeFailure,
	changedPaths,
	pathKey,
} from "#tests/runtime/support/union-challenge-audit.ts";
import { SERVER_NOTIFICATION_UNION_CHALLENGES } from "#tests/runtime/support/union-challenges.ts";

describe("closed-union challenges", () => {
	test("covers every supported notification without duplicate target paths", () => {
		expect(Object.keys(SERVER_NOTIFICATION_UNION_CHALLENGES).toSorted()).toEqual(
			[...SERVER_NOTIFICATION_METHODS].toSorted(),
		);
		const challengePaths = SERVER_NOTIFICATION_METHODS.flatMap((method) =>
			SERVER_NOTIFICATION_UNION_CHALLENGES[method].map(
				(challenge) => `${method}:${pathKey(challenge.targetPath)}`,
			),
		);
		expect(new Set(challengePaths).size).toBe(challengePaths.length);
	});

	for (const method of SERVER_NOTIFICATION_METHODS) {
		for (const challenge of SERVER_NOTIFICATION_UNION_CHALLENGES[method]) {
			test(`rejects ${method} ${challenge.name} future member`, () => {
				const prepared = challenge.prepare(notificationFixture(method));
				expect(decodeServerNotification({ method, params: prepared }) as unknown).toEqual({
					method,
					params: prepared,
				});
				const mutation = challenge.mutate(prepared);
				expect(changedPaths(prepared, mutation.params).map(pathKey)).toEqual([
					pathKey(mutation.targetPath),
				]);
				try {
					decodeServerNotification({ method, params: mutation.params });
					throw new Error("expected generated union challenge to fail");
				} catch (error) {
					expect(error).toBeInstanceOf(ProtocolDecodeError);
					if (error instanceof ProtocolDecodeError) {
						assertChallengeFailure(error, mutation);
					}
				}
			});
		}
	}

	test("aggregates prepared and mutated coverage for every challenge", () => {
		const failures: string[] = [];
		let audited = 0;
		for (const method of SERVER_NOTIFICATION_METHODS) {
			for (const challenge of SERVER_NOTIFICATION_UNION_CHALLENGES[method]) {
				audited += 1;
				try {
					const prepared = challenge.prepare(notificationFixture(method));
					decodeServerNotification({ method, params: prepared });
					const mutation = challenge.mutate(prepared);
					expect(changedPaths(prepared, mutation.params).map(pathKey)).toEqual([
						pathKey(mutation.targetPath),
					]);
					try {
						decodeServerNotification({ method, params: mutation.params });
						failures.push(`${method}:${challenge.name}: mutated branch decoded`);
					} catch (error) {
						if (!(error instanceof ProtocolDecodeError)) {
							throw error;
						}
						assertChallengeFailure(error, mutation);
					}
				} catch (error) {
					failures.push(`${method}:${challenge.name}: ${String(error)}`);
				}
			}
		}

		expect(audited).toBeGreaterThan(0);
		expect(failures).toEqual([]);
	});

	test("keeps generated JsonValue extension points open", () => {
		const params = {
			...(notificationFixture("item/started") as Record<string, unknown>),
			item: {
				type: "mcpToolCall",
				id: "item-1",
				server: "fixture",
				tool: "fixture",
				status: "completed",
				arguments: { nested: ["future", { value: true }] },
				appContext: null,
				mcpAppUi: null,
				pluginId: null,
				readOnlyHint: null,
				result: {
					content: [{ providerDefined: true }],
					structuredContent: { nested: ["future"] },
					_meta: ["future", { providerDefined: true }],
				},
				error: null,
				durationMs: 1,
			},
		};
		expect(decodeServerNotification({ method: "item/started", params }) as unknown).toEqual({
			method: "item/started",
			params,
		});
	});
});

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider, notifyManager, useQuery } from "@tanstack/react-query";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";

import { semanticBoardKeys } from "@/ui/semantic-board-canvas";
import { DEFAULT_SEMANTIC_POLICY, type VaultCheck } from "@/shared/semantic-policy";
import { useVaultCheck, useVaultPolicyRefresh } from "@/ui/vault-diagnostics";

beforeAll(() => {
	GlobalRegistrator.register();
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
		value: true,
		configurable: true,
	});
	notifyManager.setScheduler(queueMicrotask);
});
afterAll(async () => {
	await GlobalRegistrator.unregister();
	notifyManager.setScheduler((callback) => setTimeout(callback, 0));
});

test("check failure preserves issues; recovery clears only checked issues and refreshes changed policy", async () => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const root = createRoot(document.createElement("div"));
	const originalFetch = globalThis.fetch;
	const issue = {
		severity: "warning" as const,
		code: "unknown-kind",
		file: "Orders.semantic.json",
		message: "Unknown kind old-service",
	};
	let answer: VaultCheck = {
		policy: DEFAULT_SEMANTIC_POLICY,
		configurationValid: true,
		configurationFile: "archboard.yaml",
		fingerprint: "first",
		diagnostics: [issue],
	};
	let failed = false;
	let drawings = 0;
	let current: ReturnType<typeof useVaultCheck> | undefined;
	/**
	 * Observe both the diagnostics and render-refresh subscription.
	 * @returns No rendered content.
	 */
	function Observer() {
		const check = useVaultCheck();
		useQuery({
			queryKey: [...semanticBoardKeys.renders, "observed-board"],
			staleTime: Number.POSITIVE_INFINITY,
			/**
			 * Count requests for pictures under the checked policy.
			 * @returns The request number.
			 */
			queryFn: () => ++drawings,
		});
		const { data, isError } = check;
		useEffect(() => {
			current = check;
		}, [check]);
		useVaultPolicyRefresh();
		return createElement("output", null, isError ? "failed" : data?.diagnostics.length);
	}
	globalThis.fetch = Object.assign(
		async () =>
			new Response(failed ? "unavailable" : JSON.stringify(answer), { status: failed ? 503 : 200 }),
		{ preconnect: originalFetch.preconnect },
	);
	/**
	 * Read the current mounted hook.
	 * @returns Its last published snapshot.
	 */
	function latest(): ReturnType<typeof useVaultCheck> {
		if (current === undefined) throw new Error("Query did not mount");
		return current;
	}
	/**
	 * Read the visible issues.
	 * @returns The current diagnostics.
	 */
	function diagnostics() {
		return latest().data?.diagnostics;
	}
	/** Drain query notifications after a read. */
	async function refresh(): Promise<void> {
		await act(async () => {
			await latest().refetch();
		});
	}
	try {
		await act(async () => {
			root.render(createElement(QueryClientProvider, { client }, createElement(Observer)));
		});
		await refresh();
		expect(diagnostics()).toEqual([issue]);
		expect(drawings).toBe(2);
		failed = true;
		await refresh();
		expect(latest().isError).toBe(true);
		expect(diagnostics()).toEqual([issue]);
		failed = false;
		await refresh();
		expect(diagnostics()).toEqual([issue]);
		answer = { ...answer, fingerprint: "repaired-policy", diagnostics: [] };
		await refresh();
		expect(diagnostics()).toEqual([]);
		expect(drawings).toBe(3);
	} finally {
		await act(async () => {
			root.unmount();
		});
		client.clear();
		globalThis.fetch = originalFetch;
	}
});

test.each([false, true])(
	"policy refresh replaces an older picture with initial render pending=%s",
	async (pending) => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const container = document.createElement("div");
		const root = createRoot(container);
		const originalFetch = globalThis.fetch;
		const firstCheck = Promise.withResolvers<Response>();
		let policy = "A";
		let drawings = 0;
		const firstDrawing = Promise.withResolvers<string>();
		/**
		 * Show a picture while the independent initial checker read remains in flight.
		 * @returns The policy used to draw it.
		 */
		function Picture() {
			useVaultPolicyRefresh();
			const drawing = useQuery({
				queryKey: [...semanticBoardKeys.renders, "test-board"],
				staleTime: Number.POSITIVE_INFINITY,
				/**
				 * Draw from the policy in force when this request reaches the renderer.
				 * @returns The current policy marker.
				 */
				queryFn: () => {
					drawings += 1;
					return drawings === 1 && pending ? firstDrawing.promise : policy;
				},
			});
			return createElement("output", null, drawing.data);
		}
		globalThis.fetch = Object.assign(() => firstCheck.promise, {
			preconnect: originalFetch.preconnect,
		});
		try {
			await act(async () => {
				root.render(createElement(QueryClientProvider, { client }, createElement(Picture)));
			});
			expect(container.textContent).toBe(pending ? "" : "A");
			expect(drawings).toBe(1);
			policy = "B";
			await act(async () => {
				firstCheck.resolve(
					new Response(
						JSON.stringify({
							policy: DEFAULT_SEMANTIC_POLICY,
							configurationValid: true,
							configurationFile: "archboard.yaml",
							fingerprint: "B",
							diagnostics: [],
						} satisfies VaultCheck),
					),
				);
			});
			expect(container.textContent).toBe("B");
			expect(drawings).toBe(2);
			await act(async () => firstDrawing.resolve("A"));
			expect(container.textContent).toBe("B");
		} finally {
			await act(async () => root.unmount());
			client.clear();
			globalThis.fetch = originalFetch;
		}
	},
);

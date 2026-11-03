import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { SemanticPaneContextSchema } from "@archboard/model/pane-context";
import { ExplanationActionRequestSchema } from "@archboard/workbench/browser-contract";
import { SHOP, shopReading } from "#tests/ui/support/architecture-model/scene.ts";
import { ModelExplanationContext } from "#ui/state/architecture-model/explanations.ts";
import type { ExplanationInvocation } from "#ui/clients/architecture-model/explanations.ts";
import { comparedWith } from "#ui/rules/architecture-model/comparison-choices.ts";
import type { PaneReading } from "#ui/state/pane-session/pane-reading.ts";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { cleanup, renderHook } = await import("@testing-library/react");
const { useModelExplanation } =
	await import("#ui/hooks/architecture-model/use-model-explanation.ts");

afterEach(cleanup);
afterAll(async () => {
	await Bun.sleep(1);
	await GlobalRegistrator.unregister();
});

/** This owner changes no reading through user input. */
function noUserChange(): void {}

test("pane labels survive the wire without entering an explanation request, and wait for the picture", () => {
	const client = new QueryClient();
	/** Keep reports without an HTTP request. */
	const report = mock((_reading: PaneReading | null): void => {});
	/** Keep the exact invocation for its wire assertion. */
	const invoke = mock((_vault: string, _input: ExplanationInvocation): void => {});
	const host = {
		report,
		invoke,
		userChanged: noUserChange,
		pending: false,
	};
	const model = { ...SHOP, manifest: { ...SHOP.manifest, name: "Web shop" } };
	const vault = "/checkout/.archboard/vault";
	const location = shopReading();
	const selected = new Set(["Shop#Gateway"]);
	/**
	 * Supply the query cache and the explanation host.
	 * @param props The rendered hook.
	 * @param props.children The hook.
	 * @returns Its providers.
	 */
	const wrapper = ({ children }: { children: ReactNode }) =>
		createElement(
			QueryClientProvider,
			{ client },
			createElement(ModelExplanationContext.Provider, { value: host }, children),
		);
	const { result, rerender, unmount } = renderHook(
		({ ready }) =>
			useModelExplanation(vault, model, location, selected, { ready, presentation: null }),
		{ wrapper, initialProps: { ready: false } },
	);
	expect(report.mock.calls.at(-1)?.[0]?.architecture).toBeNull();
	rerender({ ready: true });
	const wire = SemanticPaneContextSchema.parse({
		...report.mock.calls.at(-1)?.[0],
		paneId: "A",
		clientId: "client",
		sequence: 1,
		at: new Date().toISOString(),
	});
	expect(wire.architecture).toMatchObject({
		model: model.manifest.id,
		subjects: [...selected],
		display: { model: model.manifest.name, state: model.selectedState!.name },
	});
	expect(wire.architecture!.display!.comparison).toBe(
		comparedWith({ reading: model, against: null, catalogue: undefined }),
	);
	result.current.act("explain-selection");
	expect(invoke).toHaveBeenCalledTimes(1);
	const invocation = invoke.mock.calls[0];
	expect(
		ExplanationActionRequestSchema.safeParse({
			type: "invoke",
			tabSessionId: "tab",
			...invocation?.[1],
		}).success,
	).toBe(true);
	unmount();
	client.clear();
});

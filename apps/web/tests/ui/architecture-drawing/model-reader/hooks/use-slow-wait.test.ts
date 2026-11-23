import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, jest, test } from "bun:test";

/** How long a wait lasts before it is named: the reviewed delay, as a test number. */
const WAIT_NOTICE_MS = 800;

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useSlowWait } =
	await import("#ui/architecture-drawing/model-reader/hooks/use-slow-wait.ts");

/**
 * Let time pass.
 * @param ms How long.
 */
function pass(ms: number): void {
	act(() => {
		jest.advanceTimersByTime(ms);
	});
}

afterEach(() => {
	cleanup();
	jest.useRealTimers();
});
afterAll(() => GlobalRegistrator.unregister());

test("a wait is named only once it has lasted, and a new destination starts again", () => {
	jest.useFakeTimers();
	const opening: { on: string | null } = { on: "gateway" };
	const wait = renderHook(({ on }) => useSlowWait(on), { initialProps: opening });
	pass(WAIT_NOTICE_MS - 1);
	expect(wait.result.current).toBe(false);
	pass(1);
	expect(wait.result.current).toBe(true);
	wait.rerender({ on: "worker" });
	expect(wait.result.current).toBe(false);
	wait.rerender({ on: null });
	pass(WAIT_NOTICE_MS);
	expect(wait.result.current).toBe(false);
});

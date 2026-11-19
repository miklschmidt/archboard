import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { useSubjectKey } from "#ui/architecture-drawing/code-browser/hooks/use-subject-key.ts";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
const { cleanup, renderHook } = await import("@testing-library/react");

afterEach(cleanup);
afterAll(() => GlobalRegistrator.unregister());

test("a focused code key keeps lighting its subject until the key is removed", () => {
	const onPoint = mock<(subject: string | null) => void>();
	const onShow = mock<(subject: string) => void>();
	const key = renderHook(() => useSubjectKey("Shop#Gateway", { onShow, onPoint }));
	key.result.current.onFocus();
	key.result.current.onPointerEnter();
	key.result.current.onPointerLeave();
	expect(onPoint).toHaveBeenLastCalledWith("Shop#Gateway");
	key.unmount();
	expect(onPoint).toHaveBeenLastCalledWith(null);
});

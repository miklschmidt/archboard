import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, expect, mock, test } from "bun:test";
import { PICTURE_MS } from "#ui/architecture-drawing/constants/motion.ts";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
const awaited = mock((_shown: boolean, _ms: number) => undefined);
await mock.module(
	"#ui/architecture-drawing/canvas/picture/transitions/clients/picture-stage.ts",
	() => ({
		/**
		 * Supply the controlled stage.
		 * @returns The stage.
		 */
		stageOf: () => ({
			/**
			 * Ignore lighting.
			 * @returns Nothing.
			 */
			setLight: () => undefined,
			/**
			 * Ignore the far view.
			 * @returns Nothing.
			 */
			setFarLine: () => undefined,
			/**
			 * Ignore traffic.
			 * @returns Nothing.
			 */
			setTrafficShown: () => undefined,
			setAwaited: awaited,
		}),
	}),
);
const { renderHook } = await import("@testing-library/react");
const { useStageLook } =
	await import("#ui/architecture-drawing/canvas/picture/hooks/use-stage-look.ts");
afterAll(async () => {
	await GlobalRegistrator.unregister();
});

test("reduced motion removes the pending picture step without a return animation", () => {
	const picture = { surface: document.createElement("div"), root: document.createElement("svg") };
	const hook = renderHook(
		({ reducedMotion }) => {
			useStageLook(
				picture,
				{
					probing: null,
					veiled: false,
					presenting: false,
					standing: null,
					reach: null,
					reducedMotion,
				},
				true,
				true,
			);
		},
		{ initialProps: { reducedMotion: false } },
	);
	try {
		expect(awaited).toHaveBeenLastCalledWith(true, PICTURE_MS.awaitIn);
		hook.rerender({ reducedMotion: true });
		expect(awaited).toHaveBeenLastCalledWith(false, 0);
	} finally {
		hook.unmount();
	}
});

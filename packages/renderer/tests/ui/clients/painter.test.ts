import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { expect, mock, test } from "bun:test";

const stops: ((reason: string) => void)[] = [];
await mock.module("#shared/protocol/generated/core/archboard_painter_wasm.js", () => ({
	/** Load the controlled painter. @returns Once ready. */
	default: async () => undefined,
	/** Name this test build. @returns Its source identity. */
	sourceHash: () => "painter-test",
	Painter: {
		/**
		 * Keep the device stop callback.
		 * @param stopped The device callback.
		 * @returns Once the device starts.
		 */
		warm: async (stopped: (reason: string) => void) => {
			stops.push(stopped);
		},
		/** Start a controlled painter. @returns The painter. */
		gpu: () => ({}),
	},
}));
const { startPainter } = await import("#ui/clients/painter.ts");

test("GPU stops reach late subscribers and stay with the GPU that stopped", async () => {
	GlobalRegistrator.register();
	const previous = Object.getOwnPropertyDescriptor(globalThis, "ARCHBOARD_CORE_SOURCE_HASH");
	Object.defineProperty(globalThis, "ARCHBOARD_CORE_SOURCE_HASH", {
		value: "painter-test",
		configurable: true,
	});
	Object.defineProperty(navigator, "gpu", {
		value: {
			/** Supply a hardware adapter. @returns The adapter. */
			requestAdapter: async () => ({ info: { isFallbackAdapter: false } }),
		},
		configurable: true,
	});
	try {
		const first = await startPainter(document.createElement("canvas"), false);
		stops[0]?.("first device stopped");
		const late = mock();
		const detachFirst = first.whenGpuStops?.(late);
		expect(late).toHaveBeenCalledTimes(1);
		expect(late).toHaveBeenCalledWith("first device stopped");
		detachFirst?.();

		const second = await startPainter(document.createElement("canvas"), false);
		const live = mock();
		const detachSecond = second.whenGpuStops?.(live);
		stops[0]?.("old device stopped again");
		expect(live).not.toHaveBeenCalled();
		await startPainter(document.createElement("canvas"), false);
		expect(stops).toHaveLength(2);
		detachSecond?.();
		stops[1]?.("second device stopped");
		expect(live).not.toHaveBeenCalled();
	} finally {
		if (previous === undefined) Reflect.deleteProperty(globalThis, "ARCHBOARD_CORE_SOURCE_HASH");
		else Object.defineProperty(globalThis, "ARCHBOARD_CORE_SOURCE_HASH", previous);
		await GlobalRegistrator.unregister();
	}
});

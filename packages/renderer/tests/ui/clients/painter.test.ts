import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { expect, mock, test } from "bun:test";

const stops: ((reason: string) => void)[] = [];
/** Why WebGL2 refuses the next canvas, or nothing when it starts. */
const webgl: { refusal?: string } = {};
/** Why the CPU refuses the next canvas, or nothing when it starts. */
const cpu: { refusal?: string } = {};
await mock.module("#shared/protocol/generated/core/archboard_painter_wasm.js", () => ({
	/**
	 * Load the controlled painter.
	 * @returns Once ready.
	 */
	default: async () => undefined,
	/**
	 * Name this test build.
	 * @returns Its source identity.
	 */
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
		/**
		 * Start a controlled painter.
		 * @returns The painter.
		 */
		gpu: () => ({}),
		/**
		 * Start a controlled WebGL2 painter, or refuse as the test says.
		 * @returns The painter.
		 */
		webgl: () => {
			if (webgl.refusal !== undefined) throw new Error(webgl.refusal);
			return {};
		},
		/**
		 * Start a controlled CPU painter.
		 * @returns The painter.
		 */
		cpu: () => {
			if (cpu.refusal !== undefined) throw new Error(cpu.refusal);
			return {};
		},
	},
}));
const { startPainter } = await import("#ui/clients/painter.ts");

/**
 * Subscribe to a GPU painter, which must expose its stop notification.
 * @param started The started painter.
 * @param listener Who hears the stop.
 * @returns Stop listening.
 */
function listen(
	started: Awaited<ReturnType<typeof startPainter>>,
	listener: (reason: string) => void,
): () => void {
	if (started.whenGpuStops === undefined)
		throw new Error("The GPU painter has no stop notification.");
	return started.whenGpuStops(listener);
}

/**
 * Run a test in a page whose WebGPU gives an adapter, or none.
 * @param adapter Whether WebGPU gives a hardware adapter.
 * @param run The test.
 * @returns After the test.
 */
async function inPage(adapter: boolean, run: () => Promise<void>): Promise<void> {
	GlobalRegistrator.register();
	const previous = Object.getOwnPropertyDescriptor(globalThis, "ARCHBOARD_CORE_SOURCE_HASH");
	Object.defineProperty(globalThis, "ARCHBOARD_CORE_SOURCE_HASH", {
		value: "painter-test",
		configurable: true,
	});
	Object.defineProperty(navigator, "gpu", {
		value: {
			/**
			 * Supply a hardware adapter, or none.
			 * @returns The adapter.
			 */
			requestAdapter: async () => (adapter ? { info: { isFallbackAdapter: false } } : null),
		},
		configurable: true,
	});
	try {
		await run();
	} finally {
		if (previous === undefined) Reflect.deleteProperty(globalThis, "ARCHBOARD_CORE_SOURCE_HASH");
		else Object.defineProperty(globalThis, "ARCHBOARD_CORE_SOURCE_HASH", previous);
		delete webgl.refusal;
		delete cpu.refusal;
		await GlobalRegistrator.unregister();
	}
}

/**
 * A canvas in the page.
 * @returns The canvas.
 */
function pageCanvas(): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	document.body.append(canvas);
	return canvas;
}

test("GPU stops reach late subscribers and stay with the GPU that stopped", async () => {
	await inPage(true, async () => {
		const first = await startPainter(document.createElement("canvas"), false);
		stops[0]?.("first device stopped");
		const late = mock();
		const detachFirst = listen(first, late);
		expect(late).toHaveBeenCalledTimes(1);
		expect(late).toHaveBeenCalledWith("first device stopped");
		detachFirst();

		const second = await startPainter(document.createElement("canvas"), false);
		const live = mock();
		const detachSecond = listen(second, live);
		stops[0]?.("old device stopped again");
		expect(live).not.toHaveBeenCalled();
		await startPainter(document.createElement("canvas"), false);
		expect(stops).toHaveLength(2);
		detachSecond();
		stops[1]?.("second device stopped");
		expect(live).not.toHaveBeenCalled();
	});
});

test("a WebGPU painter that fails again soon gives way to WebGL2 on a fresh canvas", async () => {
	await inPage(true, async () => {
		const canvas = pageCanvas();
		const next = await startPainter(canvas, false, {
			painter: "gpu",
			reason: "device lost",
			retry: false,
		});
		expect(next.kind).toBe("webgl");
		expect(next.canvas).not.toBe(canvas);
		expect(next.canvas.isConnected).toBe(true);
		expect(canvas.isConnected).toBe(false);
	});
});

test("with no WebGPU adapter a canvas paints on WebGL2 and hears its context lost", async () => {
	await inPage(false, async () => {
		const canvas = pageCanvas();
		const started = await startPainter(canvas, false);
		expect(started.kind).toBe("webgl");
		expect(started.canvas).toBe(canvas);
		expect(started.reason).not.toBeNull();
		const lost = mock();
		listen(started, lost);
		canvas.dispatchEvent(new Event("webglcontextlost"));
		expect(lost).toHaveBeenCalledTimes(1);
	});
});

test("a WebGL2 context lost before subscription still reports its loss", async () => {
	await inPage(false, async () => {
		const canvas = pageCanvas();
		const started = await startPainter(canvas, false);
		const lostContext = {
			/**
			 * Say that the context is lost.
			 * @returns It is.
			 */
			isContextLost: () => true,
		};
		Object.defineProperty(canvas, "getContext", {
			/**
			 * Give the canvas's WebGL2 context, already lost.
			 * @returns The context.
			 */
			value: () => lostContext,
		});
		canvas.dispatchEvent(new Event("webglcontextlost"));
		const lost = mock();
		const detach = listen(started, lost);
		expect(lost).toHaveBeenCalledTimes(1);
		detach();
		canvas.dispatchEvent(new Event("webglcontextlost"));
		expect(lost).toHaveBeenCalledTimes(1);
	});
});

test("a WebGL2 refusal paints on the CPU on a fresh canvas", async () => {
	await inPage(false, async () => {
		webgl.refusal = "WebGL2 draws in software: SwiftShader.";
		const canvas = pageCanvas();
		const started = await startPainter(canvas, false);
		expect(started.kind).toBe("cpu");
		expect(started.canvas).not.toBe(canvas);
		expect(started.canvas.isConnected).toBe(true);
		expect(started.reason).not.toBeNull();
	});
});

test("a WebGL2 painter that stopped at work gives way to the CPU on a fresh canvas", async () => {
	await inPage(false, async () => {
		const canvas = pageCanvas();
		const next = await startPainter(canvas, false, {
			painter: "webgl",
			reason: "The WebGL2 context was lost.",
			retry: false,
		});
		expect(next.kind).toBe("cpu");
		expect(next.canvas).not.toBe(canvas);
	});
});

test("a failed CPU fallback keeps the caller's canvas for disposal and retry", async () => {
	await inPage(false, async () => {
		webgl.refusal = "WebGL2 unavailable";
		cpu.refusal = "2D context unavailable";
		const canvas = pageCanvas();
		const host = canvas.parentElement;
		const refused = await startPainter(canvas, false).then(
			() => null,
			(error: unknown) => error,
		);
		expect(refused).toBeInstanceOf(Error);
		expect(host?.querySelector("canvas")).toBe(canvas);
		delete cpu.refusal;
		const next = await startPainter(canvas, false);
		expect(next.kind).toBe("cpu");
		expect(host?.querySelector("canvas")).toBe(next.canvas);
		expect(next.canvas.isConnected).toBe(true);
	});
});

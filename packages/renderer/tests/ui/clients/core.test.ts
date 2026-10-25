import { expect, test } from "bun:test";
import initCore, * as core from "#shared/protocol/generated/core/archboard_renderer_wasm.js";
import { loadBrowserCore } from "#ui/clients/core.ts";

test("the browser accepts its core and refuses one from another frontend build", async () => {
	const bytes = await Bun.file(
		new URL(
			"../../../src/shared/protocol/generated/core/archboard_renderer_wasm_bg.wasm",
			import.meta.url,
		),
	).arrayBuffer();
	await initCore({ module_or_path: bytes });
	const previous = Object.getOwnPropertyDescriptor(globalThis, "ARCHBOARD_CORE_SOURCE_HASH");
	try {
		Object.defineProperty(globalThis, "ARCHBOARD_CORE_SOURCE_HASH", {
			value: core.sourceHash(),
			configurable: true,
		});
		expect(await loadBrowserCore()).toBe(core);
		Object.defineProperty(globalThis, "ARCHBOARD_CORE_SOURCE_HASH", {
			value: "another-source-build",
			configurable: true,
		});
		const refused = await loadBrowserCore().then(
			() => undefined,
			(error: unknown) => error,
		);
		expect(refused).toBeInstanceOf(Error);
	} finally {
		if (previous === undefined) Reflect.deleteProperty(globalThis, "ARCHBOARD_CORE_SOURCE_HASH");
		else Object.defineProperty(globalThis, "ARCHBOARD_CORE_SOURCE_HASH", previous);
	}
});

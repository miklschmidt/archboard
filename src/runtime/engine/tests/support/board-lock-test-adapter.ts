import { spyOn } from "bun:test";
import fs from "node:fs";

/** Alter one module-owned receipt read without knowing or reconstructing its private path or schema. */
export async function withLockHandoffReadFault<T>(
	leaseToken: string,
	fault: "malformed" | "wrong-token",
	action: () => Promise<T>,
): Promise<T> {
	const originalRead = fs.readFileSync.bind(fs);
	let injected = false;
	const readSpy = spyOn(fs, "readFileSync").mockImplementation((file, options) => {
		const content = originalRead(file, options);
		if (injected || typeof content !== "string" || !content.includes(leaseToken)) return content;
		injected = true;
		return fault === "malformed" ? "{broken" : content.replace(leaseToken, "wrong-lease-token");
	});
	try {
		const result = await action();
		if (!injected) throw new Error(`The ${fault} lock handoff fault was not observed.`);
		return result;
	} finally {
		readSpy.mockRestore();
	}
}

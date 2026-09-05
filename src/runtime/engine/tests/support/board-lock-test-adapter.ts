import { spyOn } from "bun:test";

/** Alter one module-owned receipt read without knowing or reconstructing its private path or schema. */
export async function withLockHandoffReadFault<T>(
	leaseToken: string,
	fault: "malformed" | "wrong-token",
	action: () => Promise<T>,
): Promise<T> {
	const originalParse = JSON.parse.bind(JSON);
	let injected = false;
	const parseSpy = spyOn(JSON, "parse").mockImplementation((text, reviver) => {
		if (injected || !text.includes(leaseToken)) {
			return originalParse(text, reviver);
		}
		injected = true;
		const altered =
			fault === "malformed" ? "{broken" : text.replace(leaseToken, "wrong-lease-token");
		return originalParse(altered, reviver);
	});
	try {
		const result = await action();
		if (!injected) {
			throw new Error(`The ${fault} lock handoff fault was not observed.`);
		}
		return result;
	} finally {
		parseSpy.mockRestore();
	}
}

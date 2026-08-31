import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";

import { canonicalDynamicApprovalJson, dynamicApprovalHashForCanonicalJson } from "../index.js";
import { DYNAMIC_APPROVAL_HASH_VECTORS } from "./dynamic-hash-vectors.js";

describe("dynamic approval canonical hash contract", () => {
	test("keeps literal canonical bytes and independently computed SHA-256 vectors", () => {
		for (const vector of DYNAMIC_APPROVAL_HASH_VECTORS) {
			const actualJson = canonicalDynamicApprovalJson(vector.input);
			expect(actualJson, vector.name).toBe(vector.canonicalJson);
			expect(new TextEncoder().encode(actualJson), `${vector.name} canonical UTF-8 bytes`).toEqual(
				new TextEncoder().encode(vector.canonicalJson),
			);
			expect(
				dynamicApprovalHashForCanonicalJson(vector.canonicalJson),
				`${vector.name} implementation hash`,
			).toBe(vector.expectedHash);
			expect(
				`sha256:${createHash("sha256").update(vector.canonicalJson, "utf8").digest("hex")}`,
				`${vector.name} independent hash`,
			).toBe(vector.expectedHash);
		}
	});
});

import { expect, test } from "bun:test";

import { vaultRepairRequest } from "@/ui/vault-diagnostics/api";

test("the repair request runs the checker against the server this browser shows", () => {
	const request = vaultRepairRequest("http://localhost:4317");
	expect(request).toContain("archboard --url http://localhost:4317 check");
});

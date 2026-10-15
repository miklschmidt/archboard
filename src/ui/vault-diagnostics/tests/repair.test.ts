import { expect, test } from "bun:test";

import { vaultRepairRequest } from "@/ui/vault-diagnostics/api";

test("the repair request runs the checker against the server this browser shows, in the vault it diagnosed", () => {
	const request = vaultRepairRequest("http://localhost:4317", "/work/it's here/.archboard/vault");
	expect(request).toContain(
		String.raw`ARCHBOARD_VAULT='/work/it'\''s here/.archboard/vault' archboard --url http://localhost:4317 check`,
	);
});

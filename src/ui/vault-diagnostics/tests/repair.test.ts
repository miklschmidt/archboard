import { expect, test } from "bun:test";

import { vaultRepairRequest } from "@/ui/vault-diagnostics/api";

test("the repair request runs the checker against the server this browser shows, in the vault it diagnosed", () => {
	const request = vaultRepairRequest("http://localhost:4317", "/work/it's here/.archboard/vault");
	expect(request).toContain(
		String.raw`archboard -C '/work/it'\''s here/.archboard/vault' --url http://localhost:4317 check`,
	);
});

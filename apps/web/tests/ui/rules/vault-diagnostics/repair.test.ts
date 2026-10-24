import { expect, test } from "bun:test";

import { vaultRepairRequest } from "#ui/rules/vault-diagnostics/repair-request.ts";

test("the repair request runs the semantics check, which the pane shows, against the server this browser shows, in the vault it diagnosed", () => {
	const request = vaultRepairRequest("http://localhost:4317", "/work/it's here/.archboard/vault");
	expect(request).toContain(
		String.raw`archboard -C '/work/it'\''s here/.archboard/vault' --url http://localhost:4317 check semantics`,
	);
});

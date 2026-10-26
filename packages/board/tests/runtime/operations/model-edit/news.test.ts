import { afterEach, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	readArchitectureModel,
	watchArchitectureModel,
	readArchitectureClaims,
} from "@archboard/board/store-read";
import {
	editArchitectureModule,
	takeBackArchitectureClaim,
	claimArchitectureSubjects,
} from "@archboard/board/store-write";
import type { ArchitectureEvent } from "@archboard/board/model";
import { LOCK_WATCH_MS } from "@archboard/timing";
import {
	fixture,
	intent,
	readBytes,
	disposeFixtures,
} from "#tests/runtime/operations/model-edit/fixture.ts";
afterEach(disposeFixtures);

test("news starts with a coherent snapshot and follows claims, durable completion and stable external content", async () => {
	const { vault } = fixture();
	const events: ArchitectureEvent[] = [];
	const stop = watchArchitectureModel(vault, (event) => events.push(event));
	try {
		expect(events).toMatchObject([
			{
				type: "architecture_snapshot",
				reading: { success: true },
				claims: { success: true, claims: [] },
			},
		]);
		const input = await intent(vault);
		expect(readArchitectureClaims(vault)).toMatchObject({
			success: true,
			claims: [{ id: input.claim, writer: "agent", subjects: [input.subject] }],
		});
		const result = await editArchitectureModule(vault, input);
		if (!result.success) throw new Error(JSON.stringify(result));
		expect(events.filter((event) => event.type === "architecture_changed")).toMatchObject([
			{ reason: "completed", revision: result.after, subjects: [input.subject] },
		]);
		const external = JSON.parse(readBytes(vault).toString());
		writeFileSync(
			join(vault, "gateway.module.json"),
			JSON.stringify({ ...external, description: "An external correction" }),
		);
		await Bun.sleep(LOCK_WATCH_MS * 2);
		expect(events.filter((event) => event.type === "architecture_changed")).toMatchObject([
			{ reason: "completed" },
			{ reason: "external", model: input.target.model, state: input.target.state },
		]);
		writeFileSync(join(vault, "gateway.module.json"), "{");
		await Bun.sleep(LOCK_WATCH_MS * 2);
		expect(events.at(-1)).toMatchObject({
			type: "architecture_status",
			reading: { success: false, code: "MODEL_INVALID" },
		});
		expect(
			await editArchitectureModule(vault, { ...input, operationId: "invalid-input" }),
		).toMatchObject({ success: false, code: "MODEL_INVALID" });
		const reconnect: ArchitectureEvent[] = [];
		const close = watchArchitectureModel(vault, (event) => reconnect.push(event));
		close();
		expect(reconnect).toMatchObject([
			{ type: "architecture_snapshot", reading: { success: false, code: "MODEL_INVALID" } },
		]);
	} finally {
		stop();
	}
});

test("explicit scope exclusion and take-back reject the former writer without changing architecture", async () => {
	const { vault } = fixture();
	const input = await intent(vault);
	const before = readArchitectureModel(vault);
	expect(
		await claimArchitectureSubjects(vault, {
			target: input.target,
			writer: "other",
			reason: "another task",
			subjects: [input.subject],
		}),
	).toMatchObject({ success: false, code: "CLAIM_HELD" });
	const other = await claimArchitectureSubjects(vault, {
		target: input.target,
		writer: "other",
		reason: "another task",
		subjects: ["Shop#Worker"],
	});
	expect(other.success).toBe(true);
	expect(await editArchitectureModule(vault, { ...input, subject: "Shop#Worker" })).toMatchObject({
		success: false,
		code: "CLAIM_REQUIRED",
	});
	await takeBackArchitectureClaim(vault, { claim: input.claim, origin: "human" });
	expect(await editArchitectureModule(vault, input)).toMatchObject({
		success: false,
		code: "CLAIM_REVOKED",
	});
	expect(readArchitectureModel(vault)).toEqual(before);
});

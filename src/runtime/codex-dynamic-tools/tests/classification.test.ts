import { describe, expect, test } from "bun:test";

import {
	assertMutationTargetAllowed,
	assertWaitTargetAllowed,
	resolveCaller,
	resolveTarget,
} from "../index.js";
import { optionsFor, requestFor, setupAuthorities, targetAuthority } from "./support.js";

function refusalCode(action: () => unknown): string {
	try {
		action();
	} catch (error) {
		if (error !== null && typeof error === "object" && "code" in error) {
			return String(error.code);
		}
		throw error;
	}
	throw new Error("expected a policy refusal");
}

describe("dynamic target policy", () => {
	test("accepts exactly the authored mutation cells", () => {
		const { authorities, caller, otherTarget, selfTarget } = setupAuthorities();
		expect(assertMutationTargetAllowed("fork_thread", caller, otherTarget)).toBe("other");
		expect(
			assertMutationTargetAllowed(
				"fork_thread",
				caller,
				targetAuthority(authorities, "attached-thread", caller, { ownership: "attached" }),
			),
		).toBe("other");
		expect(assertMutationTargetAllowed("fork_thread", caller, selfTarget)).toBe("self");
		expect(assertMutationTargetAllowed("send_message_to_thread", caller, otherTarget)).toBe(
			"other",
		);
		expect(
			assertMutationTargetAllowed(
				"send_message_to_thread",
				caller,
				targetAuthority(authorities, "attached-send", caller, { ownership: "attached" }),
			),
		).toBe("other");
	});

	test("refuses every unlisted mutation cell before an effect", () => {
		const { authorities, caller } = setupAuthorities();
		const cases = [
			["prior epoch", { epochState: "prior" as const }, "prior_epoch"],
			["unknown epoch", { epochState: "unknown" as const }, "unknown_provenance"],
			["foreign ownership", { ownership: "foreign" as const }, "unknown_provenance"],
			["unloaded", { loaded: false }, "not_loaded"],
			["not loaded status", { status: "notLoaded" as const }, "not_loaded"],
			["system error", { status: "systemError" as const }, "system_error"],
			["false direct input", { directInput: false }, "not_controllable"],
			["unknown direct input", { directInput: null }, "not_controllable"],
			["unknown source", { source: "unknown" as const }, "unknown_provenance"],
			["active other fork", { status: "active" as const }, "busy"],
		] as const;

		for (const [label, overrides, expected] of cases) {
			const target = targetAuthority(authorities, `case-${label}`, caller, overrides);
			const tool = label === "active other fork" ? "fork_thread" : "send_message_to_thread";
			expect(refusalCode(() => assertMutationTargetAllowed(tool, caller, target))).toBe(expected);
		}

		const activeOther = targetAuthority(authorities, "active-send", caller, { status: "active" });
		expect(
			refusalCode(() => assertMutationTargetAllowed("send_message_to_thread", caller, activeOther)),
		).toBe("busy");
		const selfIdle = targetAuthority(authorities, caller.wireThreadId, caller, {
			threadId: caller.threadId,
			wireThreadId: caller.wireThreadId,
		});
		expect(
			refusalCode(() => assertMutationTargetAllowed("send_message_to_thread", caller, selfIdle)),
		).toBe("cycle");
		expect(refusalCode(() => assertMutationTargetAllowed("fork_thread", caller, selfIdle))).toBe(
			"cycle",
		);
	});

	test("wait accepts active, idle, and system-error other targets but rejects self and bad state", () => {
		const { authorities, caller } = setupAuthorities();
		for (const status of ["idle", "active", "systemError"] as const) {
			const target = targetAuthority(authorities, `wait-${status}`, caller, { status });
			expect(assertWaitTargetAllowed(caller, target)).toBe("other");
		}
		const self = targetAuthority(authorities, caller.wireThreadId, caller, {
			threadId: caller.threadId,
			wireThreadId: caller.wireThreadId,
		});
		expect(refusalCode(() => assertWaitTargetAllowed(caller, self))).toBe("cycle");
		const notLoaded = targetAuthority(authorities, "wait-not-loaded", caller, {
			status: "notLoaded",
		});
		expect(refusalCode(() => assertWaitTargetAllowed(caller, notLoaded))).toBe("not_loaded");
	});

	test("caller and target resolution use the supplied link and authority proofs", async () => {
		const { authorities, caller, otherTarget } = setupAuthorities();
		const fixture = optionsFor(authorities, caller);
		fixture.threadAuthority.targets.set(otherTarget.wireThreadId, otherTarget);
		const request = requestFor(authorities, caller, "send_message_to_thread", {
			threadId: otherTarget.wireThreadId,
			prompt: "hello",
		});

		const resolvedCaller = await resolveCaller(request, fixture.options);
		const resolvedTarget = await resolveTarget(caller, otherTarget.wireThreadId, fixture.options);
		expect(resolvedCaller.linkClassification?.proof).toBe(caller.provenance);
		expect(resolvedTarget.linkClassification?.proof).toBe(otherTarget.provenance);

		const foreign = targetAuthority(authorities, "foreign", caller, { ownership: "foreign" });
		fixture.threadAuthority.targets.set(foreign.wireThreadId, foreign);
		const foreignTarget = await resolveTarget(caller, foreign.wireThreadId, fixture.options);
		expect(
			refusalCode(() =>
				assertMutationTargetAllowed("send_message_to_thread", caller, foreignTarget),
			),
		).toBe("unknown_provenance");
	});
});

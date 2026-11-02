import type { z } from "zod";
import type { readArchitectureModel } from "@archboard/model/store-read";
import type {
	ExplanationActionRequestSchema,
	ExplanationActionResultSchema,
} from "#shared/schemas/architecture-explanation.ts";
import type {
	CodexWorkbenchDomainScope,
	CodexWorkbenchDomain,
} from "#runtime/protocol/voice/extension.ts";

type Request = z.infer<typeof ExplanationActionRequestSchema>;
type Invocation = Extract<Request, { type: "invoke" }>;
type Result = z.infer<typeof ExplanationActionResultSchema>;
type Action = Extract<Result, { success: true }>["action"];
type Reading = Extract<Awaited<ReturnType<typeof readArchitectureModel>>, { success: true }>;
type Workhorse = ReturnType<ReturnType<CodexWorkbenchDomainScope["sessions"]["open"]>["workhorse"]>;
type Notification = Parameters<
	NonNullable<CodexWorkbenchDomain["onNotification"]>
>[0]["notification"];
type Entry = {
	vault: string;
	invocation: Invocation;
	model: Reading;
	action: Action;
	workhorse?: Workhorse;
	threadId?: NonNullable<ReturnType<Workhorse["components"]["workhorse"]["snapshot"]>["threadId"]>;
	turnId?: string;
	clientId?: string;
	submission?: Awaited<ReturnType<Workhorse["components"]["queue"]["list"]>>["queue"][number]["id"];
	/** The message that holds the answer, so that its deltas reach the action. */
	answerItem?: string;
	/** Wakes a delivery that waits for the turn Codex starts by itself. */
	turnNamed?: () => void;
	/** A pending report of text that arrives faster than a reader can read. */
	announcing?: ReturnType<typeof setTimeout>;
	pending?: Promise<void>;
	captureDirectory?: string;
	retired?: true;
};
/**
 * Return an explicit action refusal.
 * @param code The refusal identity.
 * @param error The recovery guidance.
 * @returns The shared refusal.
 */
function refuse(code: string, error: string): Result {
	return { success: false, code, error };
}
/**
 * Detach a temporary result from its mutable local owner.
 * @param entry The captured action.
 * @returns The caller's snapshot.
 */
function reply(entry: Entry): Result {
	return structuredClone({ success: true, action: entry.action });
}
export { refuse, reply };
export type { Request, Invocation, Result, Action, Reading, Workhorse, Notification, Entry };

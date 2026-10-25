import { expect, test } from "bun:test";
import { SEMANTIC_CONTEXT_LIMITS } from "#runtime/api/semantic-context.ts";
import { CALLBACK_MAX_UTF8_BYTES } from "#runtime/rules/coordinator-callbacks/encoding.ts";
import {
	BROWSER_VOICE_CONTEXT_BODY_MAX_UTF8_BYTES,
	BROWSER_VOICE_CONTEXT_BRIEF_MAX_UTF8_BYTES,
} from "@archboard/codex-realtime-voice/schemas";

test("the browser voice-context brief fits the Archboard producer contract", () => {
	expect(BROWSER_VOICE_CONTEXT_BODY_MAX_UTF8_BYTES).toBe(CALLBACK_MAX_UTF8_BYTES);
	expect(BROWSER_VOICE_CONTEXT_BRIEF_MAX_UTF8_BYTES).toBe(SEMANTIC_CONTEXT_LIMITS.briefBytes);
});

import { DEFAULT_VOICE_AGENT_IDENTITY } from "#runtime/protocol/host/identity.ts";
import { createVoiceToolset } from "#runtime/rules/host/toolset.ts";

/** The built-in namespaces of a host that names none of its own. */
export const TEST_TOOLS = createVoiceToolset(DEFAULT_VOICE_AGENT_IDENTITY);

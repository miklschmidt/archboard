import { DEFAULT_VOICE_AGENT_IDENTITY } from "#runtime/host/protocol/identity.ts";
import { createVoiceToolset } from "#runtime/host/toolset/rules/toolset.ts";

/** The built-in namespaces of a host that names none of its own. */
export const TEST_TOOLS = createVoiceToolset(DEFAULT_VOICE_AGENT_IDENTITY);

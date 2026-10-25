// The Remix Icons the renderer draws of its own accord, beside the icons a
// vault's policy names for its node kinds. The host supplies every icon's path
// data (`shared/rules/render/host.ts`), and the core draws it.

/** The icon a node kind without one of its own is drawn with. */
const FALLBACK_ICON = "RiQuestionLine";

/** The icon a flowchart's flow is drawn with. */
const FLOW_ICON = "RiFlowChart";

/** Every icon the renderer draws whatever the policy says. */
const OWN_ICONS: readonly string[] = [FALLBACK_ICON, FLOW_ICON];

export { FLOW_ICON, OWN_ICONS };

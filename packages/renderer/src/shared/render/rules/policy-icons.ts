// The icons a picture drawn under a vault policy can name. The browser fetches
// these before it draws, and a model snapshot carries their paths.

import { defaultSemanticPolicy, type SemanticPolicy } from "@archboard/model/policy";
import { OWN_ICONS } from "#shared/protocol/generated/core/marks.ts";

/**
 * Every icon a picture drawn under a policy can name: the policy's, and the
 * renderer's own, such as a flowchart's frame.
 * @param policy The vault policy.
 * @returns The icon names.
 */
function iconsNamedBy(policy: SemanticPolicy): Set<string> {
	const kinds = [
		...Object.values(policy.nodeKinds),
		...Object.values(defaultSemanticPolicy().nodeKinds),
	];
	return new Set([...OWN_ICONS, ...kinds.map((kind) => kind.icon)]);
}

export { iconsNamedBy };

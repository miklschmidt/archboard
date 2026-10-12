// How the vault's kinds look, for the pages and the details panel: the policy
// the vault checks (one cache entry, which the picture and the groups read as
// well) and the icons the picture on screen draws.

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import {
	DEFAULT_LOOK_POLICY,
	kindLookOf,
	type KindLook,
} from "@/ui/semantic-board-canvas/lib/kind-look";
import type { AppliedAppearance } from "@/transformers/semantic-renderer/picture-key";
import { vaultCheckQuery } from "@/ui/semantic-board-canvas/lib/queries";

/**
 * How the vault's kinds look.
 * @param appearances What the picture on screen draws each subject with.
 * @returns The look.
 */
function useKindLook(appearances: ReadonlyMap<string, AppliedAppearance>): KindLook {
	const policy = useQuery(vaultCheckQuery()).data?.policy ?? DEFAULT_LOOK_POLICY;
	return useMemo(() => kindLookOf(policy, appearances), [policy, appearances]);
}

export { useKindLook };

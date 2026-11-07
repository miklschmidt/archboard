// How the vault's kinds look, for the pages and the details panel: the policy
// the vault checks (one cache entry, which the picture and the groups read as
// well) and the icons the picture on screen draws.

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import {
	DEFAULT_LOOK_POLICY,
	kindLookOf,
	type KindLook,
} from "#ui/architecture-drawing/canvas/picture/rules/kind-look.ts";
import type { AppliedAppearance } from "#ui/architecture-drawing/canvas/picture/reads/clients/drawings.ts";
import { vaultCheckQuery } from "#ui/architecture-drawing/canvas/picture/reads/clients/queries.ts";
import { usePaneVault } from "#ui/architecture-drawing/canvas/picture/reads/hooks/use-pane-vault.ts";

/**
 * How the vault's kinds look.
 * @param appearances What the picture on screen draws each subject with.
 * @returns The look.
 */
function useKindLook(appearances: ReadonlyMap<string, AppliedAppearance>): KindLook {
	const policy = useQuery(vaultCheckQuery(usePaneVault())).data?.policy ?? DEFAULT_LOOK_POLICY;
	return useMemo(() => kindLookOf(policy, appearances), [policy, appearances]);
}

export { useKindLook };

// The navigator's listing failure, said in a toast with Retry while it lasts. It is said when it
// changes, so a toast the person dismissed stays dismissed until the failure changes.

import { useEffect, useRef } from "react";

import { LISTING_NOTICE_ID, listingNotice } from "#ui/application/rules/notices.ts";
import type { NoticeStack } from "#ui/application/hooks/use-notices.ts";
import type { ModelCatalog } from "#ui/panes/model-catalog/hooks/use-model-catalog.ts";

/**
 * Keep the listing's toast in step with its failure.
 * @param catalog The repository listing.
 * @param notices The notice stack.
 */
function useListingNotice(
	catalog: Pick<ModelCatalog, "error" | "loading">,
	notices: Pick<NoticeStack, "raise" | "dismiss">,
): void {
	const { error: failure, loading } = catalog;
	const { raise, dismiss } = notices;
	const reported = useRef<string | null>(null);
	useEffect(() => {
		if (loading || failure === reported.current) return;
		reported.current = failure;
		if (failure === null) dismiss(LISTING_NOTICE_ID);
		else raise(listingNotice(failure));
	}, [failure, loading, raise, dismiss]);
}

export { useListingNotice };

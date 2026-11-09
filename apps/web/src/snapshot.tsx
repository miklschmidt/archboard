// The browser entry of the snapshot page: draw the model snapshot that the address names,
// read-only and with no Archboard server. The stylesheet is linked from snapshot.html.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { followSystemTheme } from "#ui/snapshot-reader/clients/system-preferences.ts";
import { SnapshotPage } from "#ui/snapshot-reader/components/SnapshotPage.tsx";

const root = document.getElementById("root");
if (!root) {
	throw new Error("The page has no #root element to mount into.");
}

followSystemTheme(document.documentElement);

createRoot(root).render(
	<StrictMode>
		<SnapshotPage />
	</StrictMode>,
);

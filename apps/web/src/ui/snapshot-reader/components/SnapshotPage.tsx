// The snapshot page: one model snapshot, drawn read-only, with no Archboard server. The address
// names the file, and the page shows the snapshot, or why it shows none.

import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useState, type JSX, type ReactNode } from "react";

import { Tooltip } from "@archboard/ui-kit/components";
import { createModelQueryClient } from "#ui/panes/model-catalog/clients/query-client.ts";
import { SnapshotCanvas } from "#ui/snapshot-reader/components/SnapshotCanvas.tsx";
import { snapshotFileQuery } from "#ui/snapshot-reader/clients/snapshot-reads.ts";
import { snapshotLocation, SNAPSHOT_PARAMETER } from "#ui/snapshot-reader/rules/snapshot-file.ts";

/** What the page says when its address names no file. */
const NO_FILE = `Name a snapshot file in the address, as in snapshot.html?${SNAPSHOT_PARAMETER}=model.snapshot.json. Write one with archboard model snapshot --out model.snapshot.json.`;

/**
 * The page, around the snapshot that its address names.
 * @returns The page.
 */
function SnapshotPage(): JSX.Element {
	const [client] = useState(createModelQueryClient);
	const [location] = useState(() => snapshotLocation(window.location.search, document.baseURI));
	return (
		<QueryClientProvider client={client}>
			<Tooltip.Provider>
				<main
					data-slot="snapshot-page"
					className="bg-background text-foreground flex h-dvh min-h-0 flex-col"
				>
					{location === null ? (
						<SnapshotNotice refused>{NO_FILE}</SnapshotNotice>
					) : (
						<SnapshotFile location={location} />
					)}
				</main>
			</Tooltip.Provider>
		</QueryClientProvider>
	);
}

/**
 * The snapshot file, while it opens, once it is drawn, or as the reason the page refused it.
 * @param props The file.
 * @param props.location The file's URL.
 * @returns The snapshot or a notice.
 */
function SnapshotFile(props: { readonly location: URL }): JSX.Element {
	const opened = useQuery(snapshotFileQuery(props.location));
	if (opened.isError) return <SnapshotNotice refused>{opened.error.message}</SnapshotNotice>;
	if (opened.data === undefined) return <SnapshotNotice>Opening the snapshot…</SnapshotNotice>;
	if (opened.data.kind === "refused") {
		return <SnapshotNotice refused>{opened.data.reason}</SnapshotNotice>;
	}
	return <SnapshotCanvas snapshot={opened.data.snapshot} />;
}

/**
 * A notice in place of the picture.
 * @param props The words, and whether they say why the page draws nothing.
 * @param props.children The words.
 * @param props.refused Whether the page refused the address or the file.
 * @returns The notice.
 */
function SnapshotNotice(props: { readonly children: ReactNode; readonly refused?: boolean }) {
	return (
		<div className="flex flex-1 items-center justify-center p-8">
			<p
				data-slot="snapshot-notice"
				role={props.refused === true ? "alert" : "status"}
				className={`text-body max-w-prose text-center text-pretty ${props.refused === true ? "text-foreground" : "text-muted-foreground"}`}
			>
				{props.children}
			</p>
		</div>
	);
}

export { SnapshotPage };

import { useCallback, type JSX } from "react";
import { Select } from "@archboard/ui-kit/components";
import type { Model } from "@archboard/board/content";

/**
 * Open a preserved reading without creating architecture content.
 * @param props The current catalogue and explicit bookmark selection.
 * @param props.catalogue The public imported reading catalogue.
 * @param props.selected The requested bookmark identity.
 * @param props.pending Whether the first catalogue is loading.
 * @param props.onSelect Changes reading intent through the existing router.
 * @returns A bounded optional bookmark control.
 */
function ModelBookmarks(props: {
	catalogue: Pick<NonNullable<Model["migrationPreview"]>, "bookmarks"> | undefined;
	selected: string | null;
	pending: boolean;
	onSelect: (id: string | null) => void;
}): JSX.Element | null {
	const { onSelect } = props;
	const choose = useCallback(
		(value: string | null): void => {
			if (value !== null) onSelect(value === "none" ? null : value);
		},
		[onSelect],
	);
	const bookmarks = props.catalogue?.bookmarks ?? [];
	if (bookmarks.length === 0 && props.selected === null) return null;
	const label = bookmarkLabel(bookmarks, props.selected);
	return (
		<Select value={props.selected ?? "none"} onValueChange={choose}>
			<Select.Trigger
				size="sm"
				data-slot="preview-bookmark-selector"
				aria-label="Bookmark"
				disabled={props.pending}
			>
				<Select.Value>{label}</Select.Value>
			</Select.Trigger>
			<Select.Content align="end" alignItemWithTrigger={false} className="w-auto max-w-xl min-w-64">
				<Select.Item value="none" data-preview-bookmark="none">
					Explore modules
				</Select.Item>
				{bookmarks.map((entry) => (
					<Select.Item key={entry.id} value={entry.id} data-preview-bookmark={entry.id}>
						<span className="flex flex-col gap-1">
							<span>{entry.name}</span>
							<span className="text-body text-muted-foreground">{entry.summary ?? entry.id}</span>
						</span>
					</Select.Item>
				))}
			</Select.Content>
		</Select>
	);
}

export { ModelBookmarks };

/**
 * Keep an unavailable requested bookmark visible instead of substituting another name.
 * @param bookmarks The captured optional readings.
 * @param requested The exact requested bookmark.
 * @returns Its name or the explicit requested identity.
 */
function bookmarkLabel(
	bookmarks: NonNullable<NonNullable<Model["migrationPreview"]>["bookmarks"]>,
	requested: string | null,
): string {
	return bookmarks.find((entry) => entry.id === requested)?.name ?? requested ?? "Bookmarks";
}

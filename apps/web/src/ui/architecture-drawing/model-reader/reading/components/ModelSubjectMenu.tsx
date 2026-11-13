import { useCallback, useMemo, type JSX } from "react";
import { RiFileCopyLine } from "@remixicon/react";
import { DropdownMenu } from "@archboard/ui-kit/components";

import { ExplanationChoices } from "#ui/architecture-drawing/model-reader/reading/components/ModelExplanationMenu.tsx";
import type { SelectionActions } from "#ui/architecture-drawing/model-reader/reading/components/ModelReadingControls.tsx";
import type { SubjectMenu } from "#ui/architecture-drawing/model-reader/reading/hooks/use-subject-menu.ts";
import { subjectReference } from "#ui/architecture-drawing/model-reader/reading/rules/subject-reference.ts";
import { readsVaultOnDisk } from "#ui/architecture-drawing/model-reader/rules/vault-on-disk.ts";

/**
 * What a right click on a part of the picture offers, at the cursor.
 * @param props What can be done with the selection, and where the menu stands.
 * @param props.actions What can be done with the selection.
 * @param props.menu Where the menu stands and whether it is open.
 * @param props.onOpenChange Open or close the menu.
 * @returns The menu.
 */
function ModelSubjectMenu(props: {
	readonly actions: SelectionActions;
	readonly menu: SubjectMenu;
	readonly onOpenChange: (open: boolean) => void;
}): JSX.Element {
	const { actions, menu } = props;
	const { reader, explanation } = actions;
	const { accepted, model, selection } = reader;
	const { shown } = accepted;
	const anchor = useMemo(() => {
		const cursor = new DOMRect(menu.x, menu.y, 0, 0);
		/**
		 * Where the cursor was when the menu opened.
		 * @returns An empty box there.
		 */
		const getBoundingClientRect = (): DOMRect => cursor;
		return { getBoundingClientRect };
	}, [menu.x, menu.y]);
	const copy = useCallback((): void => {
		const reading = { ...shown, ids: selection.ids };
		void navigator.clipboard.writeText(subjectReference(reading, window.location.href));
	}, [shown, selection.ids]);
	return (
		<DropdownMenu open={menu.open} onOpenChange={props.onOpenChange} modal={false}>
			<DropdownMenu.Content
				data-slot="model-subject-menu"
				anchor={anchor}
				sideOffset={0}
				className="w-60"
			>
				<DropdownMenu.Item data-slot="model-subject-copy" onClick={copy}>
					<RiFileCopyLine aria-hidden="true" />
					Copy reference
				</DropdownMenu.Item>
				{readsVaultOnDisk(model) && (
					<>
						<DropdownMenu.Separator />
						<ExplanationChoices
							model={shown.model}
							selected={selection.ids}
							unavailable={explanation.unavailable}
							onAction={explanation.act}
						/>
					</>
				)}
			</DropdownMenu.Content>
		</DropdownMenu>
	);
}

export { ModelSubjectMenu };

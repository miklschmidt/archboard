import { useCallback, type JSX } from "react";
import { DropdownMenu } from "@archboard/ui-kit/components";
import type { Model } from "#ui/rules/architecture-model/projection.ts";

/**
 * Follow an exact original alias through the captured migration catalogue.
 * @param props The catalogue and router action.
 * @param props.catalogue The public original address catalogue.
 * @param props.selected The requested original address.
 * @param props.pending Whether the first read is pending.
 * @param props.onSelect Opens the exact address without guessing a state.
 * @returns A bounded original-address menu.
 */
function ModelLegacyAddresses(props: {
	catalogue: Pick<NonNullable<Model["migrationPreview"]>, "addresses"> | undefined;
	selected: string | null;
	pending: boolean;
	onSelect: (address: string) => void;
}): JSX.Element | null {
	const addresses = props.catalogue?.addresses ?? [];
	if (addresses.length === 0) return null;
	return (
		<DropdownMenu>
			<DropdownMenu.Trigger
				data-slot="preview-address-selector"
				disabled={props.pending}
				aria-label="Former addresses"
				className="text-control hover:bg-muted rounded-control max-w-80 truncate px-3 py-2"
			>
				{props.selected ?? "Former addresses"}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" className="max-h-80 overflow-auto">
				{[...new Set(addresses.map((entry) => entry.address))].map((address) => (
					<AddressChoice key={address} address={address} onSelect={props.onSelect} />
				))}
			</DropdownMenu.Content>
		</DropdownMenu>
	);
}

/**
 * Route one exact address while retaining the selected checkpoint.
 * @param props The alias and navigation action.
 * @param props.address The original address spelling.
 * @param props.onSelect Opens the requested alias.
 * @returns One keyboard-accessible alias action.
 */
function AddressChoice({
	address,
	onSelect,
}: {
	address: string;
	onSelect: (address: string) => void;
}): JSX.Element {
	const select = useCallback((): void => onSelect(address), [address, onSelect]);
	return (
		<DropdownMenu.Item data-preview-address={address} onClick={select}>
			{address}
		</DropdownMenu.Item>
	);
}

export { ModelLegacyAddresses };

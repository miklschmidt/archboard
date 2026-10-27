import { useMemo, useState, type JSX } from "react";
import { Select } from "@archboard/ui-kit/components";
import type { Model } from "#ui/rules/architecture-model/projection.ts";
import { originalSource } from "#ui/rules/architecture-model/original-source.ts";

type Inputs = NonNullable<NonNullable<Model["migrationPreview"]>["originalInputs"]>;

/**
 * Inspect exact retained files independently of canonical composition.
 * @param props The retained preview receipt.
 * @param props.model The original input envelope and optional model.
 * @returns Deliberate original-file inspection or absence for live previews.
 */
function ModelPreviewOriginals({ model }: { model: Model }): JSX.Element | null {
	const inputs = model.migrationPreview?.originalInputs;
	if (inputs === undefined || inputs.length === 0) return null;
	return <OriginalFiles key={model.revision.digest} inputs={inputs} />;
}

/**
 * Decode one chosen file only after the reader asks to inspect it.
 * @param props The immutable original files.
 * @param props.inputs The complete original byte envelope.
 * @returns A file choice and its unchanged source text.
 */
function OriginalFiles({ inputs }: { inputs: Inputs }): JSX.Element {
	const [selected, select] = useState<string | null>(null);
	const file = inputs.find((input) => input.file === selected);
	const source = useMemo(() => (file === undefined ? null : originalSource(file.base64)), [file]);
	return (
		<details data-slot="preview-originals" className="text-body border-border shrink-0 border-b">
			<summary className="hover:bg-muted cursor-pointer px-4 py-2">
				Original files · {inputs.length}
			</summary>
			<div className="space-y-3 px-4 pb-4">
				<Select value={selected} onValueChange={select}>
					<Select.Trigger
						size="sm"
						data-slot="preview-original-selector"
						aria-label="Original input file"
					>
						<Select.Value placeholder="Choose an original file" />
					</Select.Trigger>
					<Select.Content
						align="start"
						alignItemWithTrigger={false}
						className="w-auto max-w-xl min-w-80"
					>
						{inputs.map((input) => (
							<Select.Item key={input.file} value={input.file} data-original-file={input.file}>
								{input.file}
							</Select.Item>
						))}
					</Select.Content>
				</Select>
				{source !== null && (
					<section className="space-y-2" aria-label="Retained source">
						<p className="text-muted-foreground">
							{source.encoding} · Retained input, without reformatting
						</p>
						<textarea
							data-slot="preview-original-text"
							aria-label="Original file contents"
							className="border-border bg-muted h-64 w-full overflow-auto rounded border p-3 font-mono text-xs"
							readOnly
							wrap="off"
							spellCheck={false}
							value={source.text}
						/>
					</section>
				)}
			</div>
		</details>
	);
}

export { ModelPreviewOriginals };

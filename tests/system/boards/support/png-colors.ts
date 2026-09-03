import { inflateSync } from "node:zlib";

function paeth(left: number, above: number, upperLeft: number): number {
	const estimate = left + above - upperLeft;
	const leftDistance = Math.abs(estimate - left);
	const aboveDistance = Math.abs(estimate - above);
	const cornerDistance = Math.abs(estimate - upperLeft);
	return leftDistance <= aboveDistance && leftDistance <= cornerDistance
		? left
		: aboveDistance <= cornerDistance
			? above
			: upperLeft;
}

export function pngRgbCounts(bytes: Uint8Array): Map<string, number> {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const width = view.getUint32(16);
	const height = view.getUint32(20);
	const colorType = bytes[25];
	const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
	if (bytes[24] !== 8 || channels === 0)
		throw new Error(`Expected an 8-bit RGB/RGBA PNG, received colour type ${String(colorType)}.`);
	const chunks: Uint8Array[] = [];
	for (let offset = 8; offset < bytes.length;) {
		const length = view.getUint32(offset);
		const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
		if (type === "IDAT") chunks.push(bytes.slice(offset + 8, offset + 8 + length));
		offset += length + 12;
	}
	const compressed = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
	const filtered = inflateSync(compressed);
	const stride = width * channels;
	const pixels = new Uint8Array(stride * height);
	for (let y = 0; y < height; y += 1) {
		const filter = filtered[y * (stride + 1)]!;
		for (let x = 0; x < stride; x += 1) {
			const raw = filtered[y * (stride + 1) + x + 1]!;
			const index = y * stride + x;
			const left = x >= channels ? pixels[index - channels]! : 0;
			const above = y > 0 ? pixels[index - stride]! : 0;
			const upperLeft = y > 0 && x >= channels ? pixels[index - stride - channels]! : 0;
			pixels[index] =
				filter === 0
					? raw
					: filter === 1
						? raw + left
						: filter === 2
							? raw + above
							: filter === 3
								? raw + Math.floor((left + above) / 2)
								: filter === 4
									? raw + paeth(left, above, upperLeft)
									: (() => {
											throw new Error(`Unsupported PNG row filter ${filter}.`);
										})();
		}
	}
	const counts = new Map<string, number>();
	for (let offset = 0; offset < pixels.length; offset += channels) {
		const color = `${pixels[offset]},${pixels[offset + 1]},${pixels[offset + 2]}`;
		counts.set(color, (counts.get(color) ?? 0) + 1);
	}
	return counts;
}

const ROUND_CONSTANTS = [
	0x42_8a_2f_98, 0x71_37_44_91, 0xb5_c0_fb_cf, 0xe9_b5_db_a5, 0x39_56_c2_5b, 0x59_f1_11_f1,
	0x92_3f_82_a4, 0xab_1c_5e_d5, 0xd8_07_aa_98, 0x12_83_5b_01, 0x24_31_85_be, 0x55_0c_7d_c3,
	0x72_be_5d_74, 0x80_de_b1_fe, 0x9b_dc_06_a7, 0xc1_9b_f1_74, 0xe4_9b_69_c1, 0xef_be_47_86,
	0x0f_c1_9d_c6, 0x24_0c_a1_cc, 0x2d_e9_2c_6f, 0x4a_74_84_aa, 0x5c_b0_a9_dc, 0x76_f9_88_da,
	0x98_3e_51_52, 0xa8_31_c6_6d, 0xb0_03_27_c8, 0xbf_59_7f_c7, 0xc6_e0_0b_f3, 0xd5_a7_91_47,
	0x06_ca_63_51, 0x14_29_29_67, 0x27_b7_0a_85, 0x2e_1b_21_38, 0x4d_2c_6d_fc, 0x53_38_0d_13,
	0x65_0a_73_54, 0x76_6a_0a_bb, 0x81_c2_c9_2e, 0x92_72_2c_85, 0xa2_bf_e8_a1, 0xa8_1a_66_4b,
	0xc2_4b_8b_70, 0xc7_6c_51_a3, 0xd1_92_e8_19, 0xd6_99_06_24, 0xf4_0e_35_85, 0x10_6a_a0_70,
	0x19_a4_c1_16, 0x1e_37_6c_08, 0x27_48_77_4c, 0x34_b0_bc_b5, 0x39_1c_0c_b3, 0x4e_d8_aa_4a,
	0x5b_9c_ca_4f, 0x68_2e_6f_f3, 0x74_8f_82_ee, 0x78_a5_63_6f, 0x84_c8_78_14, 0x8c_c7_02_08,
	0x90_be_ff_fa, 0xa4_50_6c_eb, 0xbe_f9_a3_f7, 0xc6_71_78_f2,
] as const;

const EFFECT_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/u;

/**
 * Rotates a 32-bit word right, the SHA-256 primitive.
 * @param value - The word.
 * @param amount - How many bits to rotate by.
 * @returns The rotated word.
 */
function rotateRight(value: number, amount: number): number {
	return (value >>> amount) | (value << (32 - amount));
}

/**
 * Hashes canonical compact JSON without making the shared browser model Node-only.
 * @param value - The text to hash, encoded as UTF-8.
 * @returns The digest as sixty-four lowercase hexadecimal characters.
 */
function sha256(value: string): string {
	const input = new TextEncoder().encode(value);
	const blockCount = Math.ceil((input.byteLength + 9) / 64);
	const padded = new Uint8Array(blockCount * 64);
	padded.set(input);
	padded[input.byteLength] = 0x80;
	const view = new DataView(padded.buffer);
	const bitLength = input.byteLength * 8;
	view.setUint32(padded.byteLength - 4, bitLength, false);

	let h0 = 0x6a_09_e6_67;
	let h1 = 0xbb_67_ae_85;
	let h2 = 0x3c_6e_f3_72;
	let h3 = 0xa5_4f_f5_3a;
	let h4 = 0x51_0e_52_7f;
	let h5 = 0x9b_05_68_8c;
	let h6 = 0x1f_83_d9_ab;
	let h7 = 0x5b_e0_cd_19;

	for (let offset = 0; offset < padded.byteLength; offset += 64) {
		const words = new Uint32Array(64);
		for (let index = 0; index < 16; index++) {
			words[index] = view.getUint32(offset + index * 4, false);
		}
		for (let index = 16; index < 64; index++) {
			const first = words[index - 15]!;
			const second = words[index - 2]!;
			const smallSigma0 = rotateRight(first, 7) ^ rotateRight(first, 18) ^ (first >>> 3);
			const smallSigma1 = rotateRight(second, 17) ^ rotateRight(second, 19) ^ (second >>> 10);
			words[index] = (words[index - 16]! + smallSigma0 + words[index - 7]! + smallSigma1) >>> 0;
		}

		let a = h0;
		let b = h1;
		let c = h2;
		let d = h3;
		let e = h4;
		let f = h5;
		let g = h6;
		let h = h7;
		for (let index = 0; index < 64; index++) {
			const bigSigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
			const choice = (e & f) ^ (~e & g);
			const temporary1 = (h + bigSigma1 + choice + ROUND_CONSTANTS[index]! + words[index]!) >>> 0;
			const bigSigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
			const majority = (a & b) ^ (a & c) ^ (b & c);
			const temporary2 = (bigSigma0 + majority) >>> 0;
			h = g;
			g = f;
			f = e;
			e = (d + temporary1) >>> 0;
			d = c;
			c = b;
			b = a;
			a = (temporary1 + temporary2) >>> 0;
		}
		h0 = (h0 + a) >>> 0;
		h1 = (h1 + b) >>> 0;
		h2 = (h2 + c) >>> 0;
		h3 = (h3 + d) >>> 0;
		h4 = (h4 + e) >>> 0;
		h5 = (h5 + f) >>> 0;
		h6 = (h6 + g) >>> 0;
		h7 = (h7 + h) >>> 0;
	}

	return [h0, h1, h2, h3, h4, h5, h6, h7]
		.map((word) => word.toString(16).padStart(8, "0"))
		.join("");
}

/**
 * Tells whether a string is spelled as an effect hash: `sha256:` and a digest.
 * @param value - The string to test.
 * @returns True when it matches the effect hash form.
 */
function isEffectHash(value: string): boolean {
	return EFFECT_HASH_PATTERN.test(value);
}

/**
 * Spells the effect hash of a canonical effect body.
 * @param value - The canonical compact JSON of the effect.
 * @returns The `sha256:`-prefixed digest.
 */
function effectHashFor(value: string): string {
	return `sha256:${sha256(value)}`;
}

export { sha256, isEffectHash, effectHashFor };

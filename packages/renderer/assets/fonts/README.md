# Shell fonts

Archboard bundles these files so the operator shell renders identically on a
machine with no installed fonts. The Noto fallback faces at the end serve only
the renderer core. All three shell families are licensed under the SIL
Open Font License 1.1; the exact license texts sit beside the binaries.

## Onest 1.000

- `Onest-wght-v1.000.ttf` is the runtime human-interface face. It is the Onest
  variable font at Google Fonts commit
  [`d0754ee`](https://github.com/google/fonts/blob/d0754ee7cddf8ba879f1f8884e3ca2b5e1b100f8/ofl/onest/Onest%5Bwght%5D.ttf),
  imported from `simpals/onest` commit
  [`838e8c6`](https://github.com/simpals/onest/commit/838e8c63a8e9efd5cb81cddcc7ffacb15bd9a596).
  SHA-256:
  `3faa4b905661849b2332e394b42f91b5bf5575e553c516caa81811e868a4d589`.
- `Onest-Medium-v1.000.ttf` is the static Medium face, from the official
  [`1.000` release](https://github.com/simpals/onest/releases/tag/1.000). The
  renderer draws the weight 500 of a diagram with it
  (`crates/archboard-text/src/faces.rs`).
  SHA-256:
  `c3014cae121488aea22ae5b50b584db332f130189be95217edf57469ef297cec`.
- `Onest-Bold-v1.000.ttf` is the static Bold face, `fonts/ttf/Onest-Bold.ttf`
  of the same `1.000` release's archive `onest-fonts.zip` (archive SHA-256
  `e44491d1f892716036307beddb4cad5adae52aac7fb70f8c274198c8aea3cb15`). The
  renderer draws the weight 700 of a diagram with it, which only the letters
  of a flowchart's jump markers use.
  SHA-256:
  `550c8eac408188241ed5d5a8f1934653dedcf5f52e237cc80ef04d79f22b0b38`.
- `OFL-Onest-1.1.txt` is the upstream license text, normalized to LF line
  endings with trailing whitespace removed, from the
  [OFL file](https://github.com/google/fonts/blob/d0754ee7cddf8ba879f1f8884e3ca2b5e1b100f8/ofl/onest/OFL.txt).
  SHA-256:
  `7805ccc507e6dc0c0796f1afa4f03ad413a9d302a30a24f8dbeb1aeef07a6c17`.

The official static release has no SemiBold file. The variable runtime file is
therefore required for the application weights 400, 500, 600, and 700. The
separate static Medium and Bold files are the diagrams' weights 500 and 700,
byte-pinned to the same 1.000 design. The shell's stylesheet registers neither.

The renderer core builds `Onest-wght-v1.000.ttf`, `Onest-Medium-v1.000.ttf`,
`Onest-Bold-v1.000.ttf` and the two Maple Mono NL files into itself, shapes
every word of a diagram with them, and writes the outline of each glyph a
picture uses into that picture (ADR 0059). A browser loads no diagram font.

## Maple Mono NL 7.9

- `MapleMonoNL-Regular-Subset-v7.9.ttf` and `MapleMonoNL-Medium-Subset-v7.9.ttf`
  are subsets of the two files of the same weights in the release archive
  [`MapleMonoNL-TTF.zip`](https://github.com/subframe7536/maple-font/releases/tag/v7.9),
  SHA-256 `2f7f702a121cd910751849dde76f431d81a5be1618507f5724606d3147028b88`. NL is the build with no ligatures. The inputs have the
  SHA-256 values
  `30fe0df56b3aee42c012e6bbbabd60cc531e4ded91a6453eb8823dab0882976f`
  and
  `3b186c8cc71a271c50f02054d3e888822bb18d6821666bf5875d6471edb536d7`.
  The subsets are 40,044 bytes
  (`b8802446aaeddf1d08f014ba9772467c3c586e9c62bc8b67ee97978f224024c6`) and
  40,168 bytes
  (`bfb67f52230ddd1d58e8e31d304ccc5ec300a4dfdbdd660a113a60dd6ecd2a10`).
- `OFL-MapleMono-1.1.txt` is the `LICENSE.txt` of the archive, normalized to LF
  line endings with trailing whitespace removed. SHA-256:
  `eb2d28d2e565a0757e3d64e34ebb452e75a0cad87c0ab3faf4e08ba7596de902`.

A full file is 242 KB, and the core carries each file it uses, so the repository
keeps subsets of the characters that the product sets in mono. They hold the
Latin, the punctuation and the signs that the earlier mono face held. A character
outside them comes from the Noto fallback faces. From the repository root, extract
the two inputs into `maple-sources` and run `subset-mono.sh` with fonttools 4.63.0
from the pinned Nix input:

```sh
mkdir -p out
nix shell --inputs-from . nixpkgs#python3Packages.fonttools -c \
  packages/renderer/assets/fonts/subset-mono.sh maple-sources out
```

The command keeps only the `ccmp` and `locl` layout features, so no context swaps
a glyph, keeps the names and writes the same bytes on every run.

Only weights 400 and 500 are loaded. Maple Mono NL is reserved for technical tokens
such as levels, revisions, paths, hashes, and timestamps; human headings and
labels remain Onest.

## Big Shoulders Display 2.002

One display face. It is not a human-interface face, so every label and
sentence still uses Onest.

- `BigShouldersDisplay-wght.ttf` is the variable font at Google Fonts commit
  [`7d86539`](https://github.com/google/fonts/blob/7d86539c3e24d8ea2cae7b3ff04c64250dca99c5/ofl/bigshouldersdisplay/BigShouldersDisplay%5Bwght%5D.ttf).
  Google Fonts added this file in commit `94ee6b8` and has not changed it since.
  Its name table says Version 2.002, as that commit's description does. SHA-256:
  `60e208dc276a1c35fc5b62e94f9fb959c40c11783a9eb7548175c14b1fbeb720`.
  A name set as the title of what a region is about (a picked part, a variant,
  a walkthrough) in tracked capitals, and the archboard wordmark, set in tracked
  capitals as well.
- `OFL-BigShouldersDisplay-1.1.txt` is the upstream license text, normalized to
  LF line endings with trailing whitespace removed, from the
  [OFL file](https://github.com/google/fonts/blob/7d86539c3e24d8ea2cae7b3ff04c64250dca99c5/ofl/bigshouldersdisplay/OFL.txt)
  pinned at the same commit. SHA-256:
  `bf3b5640d5d1d94a8d057bfa0232c6a405cad28ecaa28a0c17fdf879f5b91842`.

## Noto fallback faces

Onest and Maple Mono NL have no glyph for some characters. The renderer core draws
such a character from the first fallback face that has one (ADR 0059). The order
is fixed: Noto Sans at the run's weight for Greek, then Noto Sans Symbols 2,
then Noto Sans Math (`crates/archboard-text/src/faces.rs`). The shell does not
use these files. All three families are licensed under the SIL Open Font
License 1.1. The license texts sit beside the files.

The repository keeps only the subsets. Each subset comes from the unhinted
TTF in the release archive. From the repository root, extract the three archives
into `noto-sources` and keep their internal directories. Run `subset-fallbacks.sh`
with fonttools 4.63.0 from the pinned Nix input:

```sh
mkdir -p out
nix shell --inputs-from . nixpkgs#python3Packages.fonttools -c \
  packages/renderer/assets/fonts/subset-fallbacks.sh noto-sources out
```

The command keeps the layout features and the names, drops hinting and the
`MATH` table, and writes the same bytes on every run.

- `NotoSans-Greek-Regular-v2.015.ttf` and `NotoSans-Greek-Medium-v2.015.ttf`
  hold U+0370-03FF (Greek and Coptic). Source:
  [`NotoSans-v2.015.zip`](https://github.com/notofonts/latin-greek-cyrillic/releases/download/NotoSans-v2.015/NotoSans-v2.015.zip),
  SHA-256 `0c34df072a3fa7efbb7cbf34950e1f971a4447cffe365d3a359e2d4089b958f5`.
  The inputs are `NotoSans/unhinted/ttf/NotoSans-Regular.ttf`
  (`f3961a9cde016d41a4879aecda1474d3a36d6bf54fa0e4643de029cc2248b0e8`) and
  `NotoSans/unhinted/ttf/NotoSans-Medium.ttf`
  (`220e74546aee1b9a17cd50025dd917a064d0224e653f562287446c2328e4160b`). The
  subsets are 20,124 bytes
  (`e04a163554658552433cd74edf4612f79279230630fca8938d8a5297a4231911`) and
  20,072 bytes
  (`2eefac8cffcbbba9a946daf9cd3ed60c98928514c647af70ed3f2b11ffcb19c3`).
  `OFL-NotoSans.txt` is the `OFL.txt` of the archive
  (`cee9892f9f0cc8fe882c9e9537ee6a89621d86ee7ceaf70b02e2b2b1c25c061a`).
- `NotoSansSymbols2-Subset-v2.008.ttf` holds U+2300-23FF (miscellaneous
  technical), U+25A0-25FF (geometric shapes), U+2600-26FF (miscellaneous
  symbols), U+2700-27BF (dingbats, such as ✓ and ✗) and U+2B00-2B59 (arrows,
  shapes and stars). Source:
  [`NotoSansSymbols2-v2.008.zip`](https://github.com/notofonts/symbols/releases/download/NotoSansSymbols2-v2.008/NotoSansSymbols2-v2.008.zip),
  SHA-256 `346c930bbe8eb946701a05c54e9c11a2094dee1d93c387bf1771c0a3e335688f`.
  The input is `NotoSansSymbols2/unhinted/ttf/NotoSansSymbols2-Regular.ttf`
  (`c4a0a80f0041ce4be81e2478faad22776d23edb98ae3f0d19bd37044820ecf9d`). The
  subset is 78,076 bytes
  (`d2914f8495662f50a11ff4f346668bcbaba272334ba4a4faaa8511d9294bf8f7`).
  `OFL-NotoSansSymbols2.txt` is the `OFL.txt` of the archive
  (`b118dd41337806a5d4797052c77caf3bd096aed783e5eb21b4d11154351e1ac0`).
- `NotoSansMath-Subset-v3.000.ttf` holds U+2100-214F (letterlike symbols),
  U+2190-21FF (arrows), U+2200-22FF (mathematical operators, such as √ and ∞),
  U+2500-259F (box drawing and block elements) and U+27C0-27FF (mathematical
  symbols and long arrows). Source:
  [`NotoSansMath-v3.000.zip`](https://github.com/notofonts/math/releases/download/NotoSansMath-v3.000/NotoSansMath-v3.000.zip),
  SHA-256 `ac351837b41f8a897f020b97fb0f075ad574c1e9669fb5839ada1f92fd748356`.
  The input is `NotoSansMath/unhinted/ttf/NotoSansMath-Regular.ttf`
  (`b127e84699212b6b2ef50aff58e0ebebeec04ffe6db1b9eb9e209c8c3d97b4aa`). The
  subset is 92,116 bytes
  (`419cc604c7a7842f763bb5fd04ab721b7ecf0d5a4a685e53051a0a2a2b6ef938`).
  `OFL-NotoSansMath.txt` is the `OFL.txt` of the archive
  (`c9c63b8ed6cf76b2ce0c58b241acfc1195c2c928334c989c7047cbdac58773d9`).

No bundled face has an emoji, such as ❌ (U+274C). The core draws such a
character as the `.notdef` box of the run's face.

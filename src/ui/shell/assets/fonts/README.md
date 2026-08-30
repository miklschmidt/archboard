# Shell fonts

Archboard bundles these files so the operator shell renders identically on a
machine with no installed fonts. Both families are licensed under the SIL Open
Font License 1.1; the exact license texts sit beside the binaries.

## Onest 1.000

- `Onest-wght-v1.000.ttf` is the runtime human-interface face. It is the Onest
  variable font at Google Fonts commit
  [`d0754ee`](https://github.com/google/fonts/blob/d0754ee7cddf8ba879f1f8884e3ca2b5e1b100f8/ofl/onest/Onest%5Bwght%5D.ttf),
  imported from `simpals/onest` commit
  [`838e8c6`](https://github.com/simpals/onest/commit/838e8c63a8e9efd5cb81cddcc7ffacb15bd9a596).
  SHA-256:
  `3faa4b905661849b2332e394b42f91b5bf5575e553c516caa81811e868a4d589`.
- `Onest-Medium-v1.000.ttf` is the deterministic wordmark-outline source from
  the official
  [`1.000` release](https://github.com/simpals/onest/releases/tag/1.000).
  SHA-256:
  `c3014cae121488aea22ae5b50b584db332f130189be95217edf57469ef297cec`.
- `OFL-Onest-1.1.txt` is the upstream license text, normalized to LF line
  endings with trailing whitespace removed, from the
  [OFL file](https://github.com/google/fonts/blob/d0754ee7cddf8ba879f1f8884e3ca2b5e1b100f8/ofl/onest/OFL.txt).
  SHA-256:
  `7805ccc507e6dc0c0796f1afa4f03ad413a9d302a30a24f8dbeb1aeef07a6c17`.

The official static release has no SemiBold file. The variable runtime file is
therefore required for the application weights 400, 500, 600, and 700. The
separate static Medium file exists because `opentype.js` 1.3.4 reads the
variable font's `fvar` table but does not apply `gvar` deltas while generating
paths. It is byte-pinned to the same 1.000 design and is not loaded by the app.

## DM Mono 1.000

- `DMMono-Regular-v1.000.ttf` and `DMMono-Medium-v1.000.ttf` come from the
  upstream `googlefonts/dm-mono` repository at commit
  [`57fadab`](https://github.com/googlefonts/dm-mono/tree/57fadabfb200a77de2812540026c249dc3013077/exports).
  Their SHA-256 values are respectively
  `55b4c98f123daebb3ed27947ba47b2af00554fc6284d639a540bcef5e6258ad2`
  and
  `fd327daf461db87b44a87def475d251bf03b997f7c07d9680592d75dbbfaad0b`.
- `OFL-DMMono-1.1.txt` is the upstream license text, normalized to LF line
  endings with trailing whitespace removed, from the
  [OFL file](https://github.com/google/fonts/blob/ade3d1533e06b2b1462ffcde8e08b129627ca360/ofl/dmmono/OFL.txt)
  pinned at Google Fonts commit `ade3d1533e06b2b1462ffcde8e08b129627ca360`.
  SHA-256:
  `f5898de81851415b71431c1a8ea527c88a4e79caeb23936483428d2e911af40c`.

Only weights 400 and 500 are loaded. DM Mono is reserved for technical tokens
such as levels, revisions, paths, hashes, and timestamps; human headings and
labels remain Onest.

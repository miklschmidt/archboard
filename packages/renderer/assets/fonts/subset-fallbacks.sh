#!/usr/bin/env bash
# Subset the Noto fallback faces of the renderer core.
# Usage: subset-fallbacks.sh <directory holding the extracted archives> <output directory>
set -euo pipefail
in=$1
out=$2
common=(--no-hinting --drop-tables+=MATH,DSIG --layout-features='*' --name-IDs='*' --notdef-outline)
pyftsubset "$in/NotoSans/unhinted/ttf/NotoSans-Regular.ttf" "${common[@]}" --unicodes='U+0370-03FF' \
	--output-file="$out/NotoSans-Greek-Regular-v2.015.ttf"
pyftsubset "$in/NotoSans/unhinted/ttf/NotoSans-Medium.ttf" "${common[@]}" --unicodes='U+0370-03FF' \
	--output-file="$out/NotoSans-Greek-Medium-v2.015.ttf"
pyftsubset "$in/NotoSansSymbols2/unhinted/ttf/NotoSansSymbols2-Regular.ttf" "${common[@]}" \
	--unicodes='U+2300-23FF,U+25A0-25FF,U+2600-26FF,U+2700-27BF,U+2B00-2B59' \
	--output-file="$out/NotoSansSymbols2-Subset-v2.008.ttf"
pyftsubset "$in/NotoSansMath/unhinted/ttf/NotoSansMath-Regular.ttf" "${common[@]}" \
	--unicodes='U+2100-214F,U+2190-21FF,U+2200-22FF,U+2500-259F,U+27C0-27FF' \
	--output-file="$out/NotoSansMath-Subset-v3.000.ttf"

#!/usr/bin/env bash
# Subset Maple Mono NL to the characters the product sets in mono.
# Usage: subset-mono.sh <directory holding the two release files> <output directory>
set -euo pipefail
in=$1
out=$2
unicodes='U+0020-007E,U+00A0-00AC,U+00AE-0107,U+010A-011B,U+011E-0123,U+0128-0131,U+0136-0137,U+0139-0148'
unicodes+=',U+014C-015B,U+015E-0165,U+0168-017E,U+018F,U+0192,U+01FC-01FD,U+0218-021B,U+0259,U+02C6-02C7'
unicodes+=',U+02D8-02DD,U+0300-0304,U+0306-0308,U+030A-030C,U+0312,U+0326-0328,U+03C0,U+1E80-1E85'
unicodes+=',U+1EBC-1EBD,U+1EF2-1EF3,U+1EF8-1EF9,U+2013-2014,U+2018-201A,U+201C-201E,U+2020-2022,U+2026'
unicodes+=',U+2030,U+2039-203A,U+2044,U+2074,U+20AC,U+20BD,U+2113,U+2122,U+212E,U+2202,U+220F'
unicodes+=',U+2211-2212,U+2215,U+221A,U+221E,U+222B,U+2248,U+2260,U+2264-2265,U+25CA'
common=(--no-hinting --layout-features='ccmp,locl' --name-IDs='*' --notdef-outline --unicodes="$unicodes")
for weight in Regular Medium; do
	pyftsubset "$in/MapleMonoNL-$weight.ttf" "${common[@]}" \
		--output-file="$out/MapleMonoNL-$weight-Subset-v7.9.ttf"
done

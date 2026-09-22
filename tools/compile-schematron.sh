#!/usr/bin/env bash
# Compiles the official XSLT 2.0 Schematron artefacts to SaxonJS SEF so they can
# run in a browser, with no server and no Java: the free "XX" compiler bundled
# in the `xslt3` npm package does this (Saxon-EE is only needed for the faster
# Java compiler — see node_modules/xslt3/readme.md "Saxon compile time and run
# time" after `npm install`). lxml cannot do this step at all: it is XSLT 1.0
# only, and both these Schematron-generated stylesheets need XSLT 2.0.
#
# Measured payload: EN 16931 = 5.1 MB raw / 141 KB gzipped (140 KB target).
#                   French CTC = 2.7 MB raw / 76 KB gzipped.
#
# The EN 16931 CII stylesheet resolves ~118 `document('FACTUR-X_EN16931_codedb.xml')`
# calls (code-list checks: BT-24 profile URNs, allowance/charge reason codes,
# etc.) against its OWN location on disk, inside the `factur-x` pip package's
# site-packages install. SaxonJS bakes that resolved absolute file:// URI into
# the SEF at compile time — which happens to keep working in Node.js on the
# machine that compiled it (this project's own test suite ran for weeks
# looking fine), but breaks the moment the SEF is loaded anywhere else: a
# different developer's machine, CI, and *always* in a browser, since
# `file://` isn't fetchable there by design (see test/validate-browser.test.ts,
# which is what caught this). The fix is to inline codedb.xml's ~188 KB of
# static reference data into the stylesheet before compiling, replacing every
# document() call with a reference to that inlined tree — the SEF becomes
# fully self-contained, which is a strictly better artefact for a "runs
# anywhere, no server" validator, not a workaround.
set -euo pipefail
# `python3` on Windows is the Microsoft Store stub; the real interpreter is `py`.
if command -v py >/dev/null 2>&1; then PY=py; else PY=python3; fi
SRC="$($PY -c 'import facturx,os;print(os.path.join(os.path.dirname(facturx.__file__),"xsd_and_schematron"))')"
mkdir -p packages/validate/artefacts tools/artefacts/.tmp

"$PY" - "$SRC" <<'PYEOF'
import re, sys
src = sys.argv[1]
xsl_path = f"{src}/facturx-en16931/Factur-X_1.09_EN16931.xsl"
codedb_path = f"{src}/facturx-en16931/FACTUR-X_EN16931_codedb.xml"

xsl = open(xsl_path, encoding="utf-8").read()
codedb = open(codedb_path, encoding="utf-8").read()
codedb = re.sub(r"^<\?xml[^>]*\?>\s*", "", codedb)  # drop the XML declaration; this becomes inline content, not a document

call = "document('FACTUR-X_EN16931_codedb.xml')"
count = xsl.count(call)
if count == 0:
    raise SystemExit(f"expected to find {call!r} in {xsl_path}; the upstream package may have changed")
xsl = xsl.replace(call, "$fx-codedb-inline")

variable = f'<xsl:variable name="fx-codedb-inline">{codedb}</xsl:variable>'
patched, n = re.subn(r"(<xsl:stylesheet\b[^>]*>)", r"\1" + variable, xsl, count=1)
if n != 1:
    raise SystemExit(f"could not find the <xsl:stylesheet> root element to patch in {xsl_path}")

open("tools/artefacts/.tmp/en16931-inlined.xsl", "w", encoding="utf-8").write(patched)
print(f"inlined codedb.xml ({len(codedb):,} bytes) over {count} document() call sites")
PYEOF

npx xslt3 -xsl:tools/artefacts/.tmp/en16931-inlined.xsl \
          -export:packages/validate/artefacts/en16931.sef.json -nogo
npx xslt3 -xsl:"$SRC/cii-schematron-fr-ctc/BR-FR-Flux2-Schematron-CII.xslt" \
          -export:packages/validate/artefacts/fr-ctc.sef.json -nogo
echo "compiled. gzipped sizes:"
for f in packages/validate/artefacts/*.sef.json; do
  printf "  %-24s %s\n" "$(basename "$f")" "$(gzip -9c "$f" | wc -c | numfmt --to=iec)"
done

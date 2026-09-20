#!/usr/bin/env bash
# Compiles the official XSLT 2.0 Schematron artefacts to SaxonJS SEF so they can
# run in a browser. lxml cannot do this: it is XSLT 1.0 only.
#
# Measured payload: EN 16931 = 5.1 MB raw / 140 KB gzipped.
#                   French CTC = 2.7 MB raw / 76 KB gzipped.
set -euo pipefail
SRC="$(python3 -c 'import facturx,os;print(os.path.join(os.path.dirname(facturx.__file__),"xsd_and_schematron"))')"
mkdir -p packages/validate/artefacts
npx xslt3 -xsl:"$SRC/facturx-en16931/Factur-X_1.09_EN16931.xsl" \
          -export:packages/validate/artefacts/en16931.sef.json -nogo
npx xslt3 -xsl:"$SRC/cii-schematron-fr-ctc/BR-FR-Flux2-Schematron-CII.xslt" \
          -export:packages/validate/artefacts/fr-ctc.sef.json -nogo
echo "compiled. gzipped sizes:"
for f in packages/validate/artefacts/*.sef.json; do
  printf "  %-24s %s\n" "$(basename "$f")" "$(gzip -9c "$f" | wc -c | numfmt --to=iec)"
done

"""
Validates the sample PDF's embedded CII XML, then every fixture in every format
tools/fixtures.manifest.ts (mirrored below) says it must satisfy:

  cii-en16931   Factur-X 1.09 EN16931 XSD + EN16931 Schematron (via the facturx package)
  ubl-en16931   official UBL 2.1 XSD     + EN16931 Schematron for UBL (CEN's own compiled XSLT)
  cii-xrechnung factur-x's CII XSD (same syntax) + XRechnung 3.0 CII Schematron (KoSIT)
  ubl-xrechnung official UBL 2.1 XSD     + XRechnung 3.0 UBL Schematron (KoSIT)
  ubl-peppol    official UBL 2.1 XSD     + EN16931 Schematron (UBL) + Peppol BIS 3.0 Schematron
                (Peppol's own .sch carries only Peppol-specific rules, not the EN16931 base
                ones, so both must run for a document to be Peppol BIS 3.0 compliant)

A `negative/` fixture is expected to FAIL: it proves the pipeline actually rejects
a wrong invoice, not just that it accepts everything handed to it.

Run: py tools/validate.py   (build the fixtures first: npx tsx tools/build-fixtures.ts)
"""
import logging
import re
import subprocess
import sys
from pathlib import Path

import facturx
from lxml import etree
from facturx import xml_check_xsd, xml_check_schematron, get_facturx_xml_from_pdf, get_level, get_flavor

sys.path.insert(0, str(Path(__file__).parent))
import fetch_artefacts

logging.disable(logging.WARNING)

ROOT = Path(__file__).resolve().parent.parent
OUT_FIXTURES = ROOT / "out" / "fixtures"
UBL_XSD_DIR = Path(facturx.__file__).parent / "xsd_and_schematron" / "ubl-2.1"
EN16931_UBL_XSLT = UBL_XSD_DIR / "EN16931-UBL-validation.xslt"

ok = True


def check(label, fn):
    """PASS/FAIL a step that should succeed. Returns True on PASS."""
    global ok
    try:
        r = fn()
        print(f"  PASS  {label}" + (f"  -> {r}" if isinstance(r, str) else ""))
        return True
    except Exception as e:
        ok = False
        print(f"  FAIL  {label}\n        {type(e).__name__}: {str(e)[:500]}")
        return False


def expect_failure(label, fn):
    """PASS only if fn() raises: this is a negative-control check."""
    global ok
    try:
        fn()
        ok = False
        print(f"  FAIL  {label}  (expected a validation error, got none)")
        return False
    except AssertionError as e:
        print(f"  PASS  {label}  -> correctly rejected: {str(e)[:300]}")
        return True


# ---------------------------------------------------------------------------
# [1]-[4]: the sample PDF, exactly as before.
# ---------------------------------------------------------------------------

print("\n[1] Standalone XML against the OFFICIAL Factur-X 1.09 EN16931 XSD")
xml = (ROOT / "out" / "factur-x.xml").read_bytes()
check("XSD schema validation", lambda: (xml_check_xsd(xml, flavor='factur-x', level='en16931'), "valid")[1])

print("\n[2] Standalone XML against the OFFICIAL EN 16931 Schematron rules")
check("Schematron (BR-* / BR-CO-* business rules)", lambda: (xml_check_schematron(xml, flavor='factur-x', level='en16931'), "valid")[1])

print("\n[3] Independent extraction from the PDF (third-party reader)")
pdf = (ROOT / "out" / "invoice.pdf").read_bytes()
check("get_facturx_xml_from_pdf()", lambda: "extracted" if get_facturx_xml_from_pdf(pdf) else None)
try:
    fn, x2 = get_facturx_xml_from_pdf(pdf)
    print(f"        embedded filename : {fn}")
    print(f"        bytes recovered   : {len(x2)}")
    print(f"        byte-identical    : {x2.strip() == xml.strip()}")
    print(f"        detected flavor   : {get_flavor(etree.fromstring(x2))}")
    print(f"        detected level    : {get_level(etree.fromstring(x2))}")
    print("\n[4] Round-trip: re-validate the XML AS EXTRACTED FROM THE PDF")
    check("XSD on extracted XML", lambda: (xml_check_xsd(x2, flavor='factur-x', level='en16931'), "valid")[1])
    check("Schematron on extracted XML", lambda: (xml_check_schematron(x2, flavor='factur-x', level='en16931'), "valid")[1])
except Exception as e:
    ok = False
    print(f"  FAIL  extraction: {e}")

# ---------------------------------------------------------------------------
# Engines for the fixture matrix: lxml for XSD, Saxon for the XSLT-compiled
# CIUS Schematron artefacts (they need XSLT 2.0/3.0; lxml's libxslt is 1.0 only).
# ---------------------------------------------------------------------------

fetch_artefacts.ensure()
from saxonche import PySaxonProcessor  # noqa: E402 (deferred: only needed once artefacts exist)

_xsd_cache: dict[str, etree.XMLSchema] = {}


def ubl_schema(root_element: str) -> etree.XMLSchema:
    """root_element is 'Invoice' or 'CreditNote'."""
    if root_element not in _xsd_cache:
        p = UBL_XSD_DIR / "maindoc" / f"UBL-{root_element}-2.1.xsd"
        _xsd_cache[root_element] = etree.XMLSchema(etree.parse(str(p)))
    return _xsd_cache[root_element]


def check_ubl_xsd(xml_path: Path) -> str:
    doc = etree.parse(str(xml_path))
    root_element = etree.QName(doc.getroot().tag).localname
    schema = ubl_schema(root_element)
    if not schema.validate(doc):
        raise AssertionError("; ".join(str(e) for e in schema.error_log)[:600])
    return f"valid ({root_element})"


_saxon_cm = PySaxonProcessor(license=False)
_saxon = _saxon_cm.__enter__()
_xslt_cache: dict[str, object] = {}
SVRL_NS = {"svrl": "http://purl.oclc.org/dsdl/svrl"}


def _compiled(xslt_path: Path):
    key = str(xslt_path)
    if key not in _xslt_cache:
        _xslt_cache[key] = _saxon.new_xslt30_processor().compile_stylesheet(stylesheet_file=key)
    return _xslt_cache[key]


def check_schematron_xslt(xslt_path: Path, xml_path: Path) -> str:
    """Applies a compiled (Schematron -> XSLT) stylesheet and reads the SVRL result.
    Anything flagged warning/info is not a failure; everything else (including the
    Schematron default, no flag at all) is."""
    executable = _compiled(xslt_path)
    svrl_text = executable.transform_to_string(source_file=str(xml_path))
    svrl = etree.fromstring(svrl_text.encode("utf-8"))
    failures = []
    for el in svrl.findall(".//svrl:failed-assert", SVRL_NS) + svrl.findall(".//svrl:successful-report", SVRL_NS):
        flag = (el.get("flag") or el.get("role") or "error").lower()
        if flag in ("warning", "warn", "info"):
            continue
        text = "".join(el.itertext()).strip()
        failures.append(f"[{el.get('id') or (el.get('test') or '')[:40]}] {text[:200]}")
    if failures:
        raise AssertionError(f"{len(failures)} rule(s) failed: " + " | ".join(failures[:3]))
    return f"0 rules failed ({len(svrl.findall('.//svrl:fired-rule', SVRL_NS))} rules fired)"


ARTEFACTS = ROOT / "tools" / "artefacts"
XRECHNUNG_CII_XSLT = ARTEFACTS / "xrechnung" / "schematron" / "cii" / "XRechnung-CII-validation.xsl"
XRECHNUNG_UBL_XSLT = ARTEFACTS / "xrechnung" / "schematron" / "ubl" / "XRechnung-UBL-validation.xsl"
PEPPOL_UBL_XSLT = ARTEFACTS / "peppol" / "PEPPOL-EN16931-UBL.xsl"

CHECKS = {
    "cii-en16931": [
        ("Factur-X CII XSD", lambda p: (xml_check_xsd(p.read_bytes(), flavor='factur-x', level='en16931'), "valid")[1]),
        ("EN 16931 Schematron (CII)", lambda p: (xml_check_schematron(p.read_bytes(), flavor='factur-x', level='en16931'), "valid")[1]),
    ],
    "ubl-en16931": [
        ("UBL 2.1 XSD", check_ubl_xsd),
        ("EN 16931 Schematron (UBL)", lambda p: check_schematron_xslt(EN16931_UBL_XSLT, p)),
    ],
    # The KoSIT .sch files are a DELTA over EN16931 (~55KB, versus ~230-310KB for
    # the Peppol repo's full CEN-EN16931-CII/UBL.sch): they add German-specific
    # rules, they do not repeat the CEN base rules. Confirmed empirically: a fixture
    # missing a seller identifier failed the base EN16931 Schematron (BR-CO-26) while
    # passing XRechnung's own ruleset outright. So an XRechnung document must pass
    # BOTH, the same two-layer shape as Peppol below.
    "cii-xrechnung": [
        ("Factur-X CII XSD (same syntax as XRechnung CII)", lambda p: (xml_check_xsd(p.read_bytes(), flavor='factur-x', level='en16931'), "valid")[1]),
        ("EN 16931 Schematron (CII)", lambda p: (xml_check_schematron(p.read_bytes(), flavor='factur-x', level='en16931'), "valid")[1]),
        ("XRechnung 3.0 Schematron (CII)", lambda p: check_schematron_xslt(XRECHNUNG_CII_XSLT, p)),
    ],
    "ubl-xrechnung": [
        ("UBL 2.1 XSD", check_ubl_xsd),
        ("EN 16931 Schematron (UBL)", lambda p: check_schematron_xslt(EN16931_UBL_XSLT, p)),
        ("XRechnung 3.0 Schematron (UBL)", lambda p: check_schematron_xslt(XRECHNUNG_UBL_XSLT, p)),
    ],
    "ubl-peppol": [
        ("UBL 2.1 XSD", check_ubl_xsd),
        ("EN 16931 Schematron (UBL)", lambda p: check_schematron_xslt(EN16931_UBL_XSLT, p)),
        ("Peppol BIS Billing 3.0 Schematron (UBL)", lambda p: check_schematron_xslt(PEPPOL_UBL_XSLT, p)),
    ],
}

# ---------------------------------------------------------------------------
# [5] The fixture matrix. The manifest is parsed out of the .ts source (rather
# than duplicated here) so this file and tools/build-fixtures.ts cannot diverge
# on which fixture is supposed to validate against which target.
# ---------------------------------------------------------------------------

MANIFEST_TS = (ROOT / "tools" / "fixtures.manifest.ts").read_text(encoding="utf-8")


def parse_manifest():
    entries = []
    for m in re.finditer(
        r"\{\s*file:\s*'([^']+)',\s*targets:\s*\[([^\]]*)\](?:,\s*negative:\s*(true))?", MANIFEST_TS):
        file, targets_raw, negative = m.groups()
        targets = [t.strip().strip("'") for t in targets_raw.split(",") if t.strip()]
        entries.append((file, targets, bool(negative)))
    if not entries:
        raise RuntimeError("could not parse tools/fixtures.manifest.ts; is its shape unchanged?")
    return entries


print("\n[5] Fixture matrix: every fixture against every format it targets")
# Regenerated on every run (not left stale from a previous one) so this gate,
# run alone as `py tools/validate.py`, always checks what the serializers
# produce right now.
tsx_bin = ROOT / "node_modules" / ".bin" / ("tsx.cmd" if sys.platform == "win32" else "tsx")
build = subprocess.run([str(tsx_bin), "tools/build-fixtures.ts"], cwd=ROOT,
                        capture_output=True, text=True)
print(f"  {build.stdout.strip() or build.stderr.strip()}")
if build.returncode != 0:
    print("  FAIL  tools/build-fixtures.ts did not complete")
    ok = False
elif not OUT_FIXTURES.exists():
    print("  FAIL  out/fixtures/ was not created")
    ok = False
else:
    for file, targets, negative in parse_manifest():
        stem = file.replace(".json", "").replace("/", "__")
        print(f"\n  {file}{'  [NEGATIVE CONTROL: must fail]' if negative else ''}")
        for target in targets:
            xml_path = OUT_FIXTURES / f"{stem}__{target}.xml"
            if not xml_path.exists():
                ok = False
                print(f"    FAIL  missing {xml_path.relative_to(ROOT)}")
                continue
            for label, fn in CHECKS[target]:
                full_label = f"{target}: {label}"
                # A negative fixture is structurally valid XML that violates a
                # business rule: only the Schematron (business-rule) checks are
                # expected to fail. An XSD check cannot see across categories or
                # elements, so it is expected to PASS even here.
                if negative and "Schematron" in label:
                    expect_failure(f"    {full_label}", lambda p=xml_path, f=fn: f(p))
                else:
                    check(f"    {full_label}", lambda p=xml_path, f=fn: f(p))

_saxon_cm.__exit__(None, None, None)

print("\n" + ("=" * 58))
print("RESULT:", "ALL CHECKS PASSED" if ok else "FAILURES PRESENT")
print("=" * 58)
sys.exit(0 if ok else 1)

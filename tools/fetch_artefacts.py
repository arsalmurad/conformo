"""Fetch the third-party validation artefacts that the factur-x package does not ship.

Nothing here is committed: tools/artefacts/ is gitignored. Every download is pinned
by SHA-256, so a moved tag or a tampered mirror fails loudly instead of quietly
changing what "valid" means.

  XRechnung 3.0.2 Schematron  KoSIT prebuilt XSLT, CII and UBL
  Peppol BIS Billing 3.0      Schematron SOURCES (.sch), compiled here with SchXslt2
  SchXslt2                    the Schematron -> XSLT compiler

The pins were taken on first download (trust on first use). The SchXslt2 zip also has
a detached .asc signature; it is not verified here because that needs a GPG keyring.

Usage: py tools/fetch_artefacts.py [--force]
"""
import hashlib
import io
import pathlib
import sys
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent / "artefacts"

XRECHNUNG = ("https://github.com/itplr-kosit/xrechnung-schematron/releases/download/"
             "v2.6.0/xrechnung-3.0.2-schematron-2.6.0.zip")
SCHXSLT = "https://codeberg.org/SchXslt/schxslt2/releases/download/v1.11.2/schxslt2-1.11.2.zip"
PEPPOL = "https://raw.githubusercontent.com/OpenPEPPOL/peppol-bis-invoice-3/v3.0.20/rules/sch/"

PINS = {
    "xrechnung": (XRECHNUNG, "ca5e07afd04e72cd283d581590ffff3a15f4aac9d2f40c993345d78e67ea22b4"),
    "schxslt2": (SCHXSLT, "a0f5be3173113eb5ff4b5cf246fd9d1af0497a90df37023d3c0ccf60422af37c"),
    "peppol-ubl": (PEPPOL + "PEPPOL-EN16931-UBL.sch",
                   "5ddf3a2f6633147b20b7805df9902d825af1a984f10014fcee186d4170364b1d"),
    "peppol-cii": (PEPPOL + "PEPPOL-EN16931-CII.sch",
                   "a15bea71add713a425f0fab0043fdd5b03d54a62d27c4252ed6d8a4863da218d"),
}

# What validate.py consumes.
XRECHNUNG_CII = ROOT / "xrechnung" / "schematron" / "cii" / "XRechnung-CII-validation.xsl"
XRECHNUNG_UBL = ROOT / "xrechnung" / "schematron" / "ubl" / "XRechnung-UBL-validation.xsl"
PEPPOL_CII = ROOT / "peppol" / "PEPPOL-EN16931-CII.xsl"
PEPPOL_UBL = ROOT / "peppol" / "PEPPOL-EN16931-UBL.xsl"
_TRANSPILE = ROOT / "schxslt2" / "schxslt2-1.11.2" / "transpile.xsl"


def _download(name):
    url, pin = PINS[name]
    req = urllib.request.Request(url, headers={"User-Agent": "conformo-tools"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    got = hashlib.sha256(data).hexdigest()
    if got != pin:
        raise SystemExit(f"SHA-256 mismatch for {name}\n  url:      {url}\n"
                         f"  expected: {pin}\n  got:      {got}\nRefusing to use it.")
    return data


def _unzip(data, dest):
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        z.extractall(dest)


def _compile_schematron(sch_path, xsl_path):
    """Schematron source -> validation XSLT, via SchXslt2 running on Saxon."""
    from saxonche import PySaxonProcessor
    with PySaxonProcessor(license=False) as proc:
        exe = proc.new_xslt30_processor().compile_stylesheet(stylesheet_file=str(_TRANSPILE))
        exe.transform_to_file(source_file=str(sch_path), output_file=str(xsl_path))


def ensure(force=False):
    """Idempotent. Returns True if anything was fetched."""
    wanted = [XRECHNUNG_CII, XRECHNUNG_UBL, PEPPOL_CII, PEPPOL_UBL]
    if not force and all(p.exists() for p in wanted):
        return False
    ROOT.mkdir(parents=True, exist_ok=True)
    print("fetching validation artefacts (pinned by SHA-256)...")
    _unzip(_download("xrechnung"), ROOT / "xrechnung")
    _unzip(_download("schxslt2"), ROOT / "schxslt2")
    (ROOT / "peppol").mkdir(exist_ok=True)
    for key, xsl in (("peppol-ubl", PEPPOL_UBL), ("peppol-cii", PEPPOL_CII)):
        sch = xsl.with_suffix(".sch")
        sch.write_bytes(_download(key))
        _compile_schematron(sch, xsl)
    return True


if __name__ == "__main__":
    fetched = ensure(force="--force" in sys.argv)
    print("artefacts fetched" if fetched else "artefacts already present")
    for p in (XRECHNUNG_CII, XRECHNUNG_UBL, PEPPOL_CII, PEPPOL_UBL):
        print(f"  {p.stat().st_size:>9,}  {p.relative_to(ROOT.parent.parent)}")

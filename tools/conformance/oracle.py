"""Reference verdicts for the conformance run, produced by a different engine than the product.

The product runs each Schematron as a SaxonJS stylesheet export (SEF) and the XSD through libxml2-in-WebAssembly.
This script runs the SAME publisher XSLT files with Saxon-HE (saxonche, native) and the XSDs with lxml (native
libxml2). A disagreement therefore points at our compilation/loading path, not at the rules.

Input  (argv[1]): JSON  [{"id": str, "file": str, "xslts": {rulesetId: path}, "xsd": path|null}]
Output (argv[2]): JSON  {id: {"rulesets": {rulesetId: {"fired": n, "failed": [..], "advisory": [..]}}, "xsd": {"valid": bool, "errors": [..]}|null, "error": str|null}}

Rule ids: the SVRL @id, or the leading "[ID]" of the message when the stylesheet puts it there (as CEN's does for some rules).
Severity: @flag / @role in warning|warn|info|information is advisory; anything else (including no flag) fails.
Run with: py -I tools/conformance/oracle.py in.json out.json   (python3 -I on Linux)
"""
import json
import re
import sys
from pathlib import Path

from lxml import etree
from saxonche import PySaxonProcessor

SVRL = "{http://purl.oclc.org/dsdl/svrl}"
ADVISORY = {"warning", "warn", "info", "information"}


def rule_id(el):
    text = "".join(el.itertext()).strip()
    m = re.match(r"\[([^\]]+)\]", text)
    return m.group(1) if m else (el.get("id") or "")


def main(inp, out):
    jobs = json.loads(Path(inp).read_text(encoding="utf-8"))
    results = {}
    xsd_cache = {}
    with PySaxonProcessor(license=False) as proc:
        compiled = {}
        for job in jobs:
            res = {"rulesets": {}, "xsd": None, "error": None}
            results[job["id"]] = res
            try:
                for rid, xslt in job["xslts"].items():
                    if xslt not in compiled:
                        compiled[xslt] = proc.new_xslt30_processor().compile_stylesheet(stylesheet_file=xslt)
                    svrl = etree.fromstring(compiled[xslt].transform_to_string(source_file=job["file"]).encode("utf-8"))
                    failed, advisory = [], []
                    for el in svrl.iter(SVRL + "failed-assert", SVRL + "successful-report"):
                        rid_ = rule_id(el)
                        if not rid_:
                            continue
                        flag = (el.get("flag") or el.get("role") or "error").lower()
                        (advisory if flag in ADVISORY else failed).append(rid_)
                    res["rulesets"][rid] = {
                        "fired": len(list(svrl.iter(SVRL + "fired-rule"))),
                        "failed": sorted(failed),
                        "advisory": sorted(advisory),
                    }
                if job.get("xsd"):
                    if job["xsd"] not in xsd_cache:
                        xsd_cache[job["xsd"]] = etree.XMLSchema(etree.parse(job["xsd"]))
                    schema = xsd_cache[job["xsd"]]
                    doc = etree.parse(job["file"])
                    ok = schema.validate(doc)
                    res["xsd"] = {"valid": bool(ok), "errors": [str(e.message) for e in schema.error_log][:20]}
            except Exception as e:  # a document the oracle itself cannot process is reported, not hidden
                res["error"] = f"{type(e).__name__}: {str(e)[:300]}"
    Path(out).write_text(json.dumps(results, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

import sys, logging
from lxml import etree
from facturx import xml_check_xsd, xml_check_schematron, get_facturx_xml_from_pdf, get_level, get_flavor
logging.disable(logging.WARNING)

ok = True
def check(label, fn):
    global ok
    try:
        r = fn(); print(f"  PASS  {label}" + (f"  -> {r}" if isinstance(r,str) else "")); return r
    except Exception as e:
        ok = False; print(f"  FAIL  {label}\n        {type(e).__name__}: {str(e)[:400]}"); return None

xml = open('out/factur-x.xml','rb').read()
print("\n[1] Standalone XML against the OFFICIAL Factur-X 1.09 EN16931 XSD")
check("XSD schema validation", lambda: (xml_check_xsd(xml, flavor='factur-x', level='en16931'), "valid")[1])

print("\n[2] Standalone XML against the OFFICIAL EN 16931 Schematron rules")
check("Schematron (BR-* / BR-CO-* business rules)", lambda: (xml_check_schematron(xml, flavor='factur-x', level='en16931'), "valid")[1])

print("\n[3] Independent extraction from the PDF (third-party reader)")
pdf = open('out/invoice.pdf','rb').read()
res = check("get_facturx_xml_from_pdf()", lambda: "extracted" if get_facturx_xml_from_pdf(pdf) else None)
try:
    fn, x2 = get_facturx_xml_from_pdf(pdf)
    print(f"        embedded filename : {fn}")
    print(f"        bytes recovered   : {len(x2)}")
    print(f"        byte-identical    : {x2.strip()==xml.strip()}")
    print(f"        detected flavor   : {get_flavor(etree.fromstring(x2))}")
    print(f"        detected level    : {get_level(etree.fromstring(x2))}")
    print("\n[4] Round-trip: re-validate the XML AS EXTRACTED FROM THE PDF")
    check("XSD on extracted XML", lambda: (xml_check_xsd(x2, flavor='factur-x', level='en16931'), "valid")[1])
    check("Schematron on extracted XML", lambda: (xml_check_schematron(x2, flavor='factur-x', level='en16931'), "valid")[1])
except Exception as e:
    ok=False; print(f"  FAIL  extraction: {e}")

print("\n" + ("="*58))
print("RESULT:", "ALL CHECKS PASSED" if ok else "FAILURES PRESENT")
print("="*58)
sys.exit(0 if ok else 1)

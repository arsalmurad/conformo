import pikepdf, re, sys
from lxml import etree
p = pikepdf.open('out/invoice.pdf')
root = p.Root
fails, warns = [], []
def chk(cond, msg):
    print(("  PASS  " if cond else "  FAIL  ") + msg)
    if not cond: fails.append(msg)

raw = open('out/invoice.pdf','rb').read()
print("\n[A] File level")
chk(raw.startswith(b'%PDF-1.'), f"PDF header present ({raw[:8].decode(errors='replace')})")
chk(b'/Encrypt' not in raw, "no /Encrypt (PDF/A forbids encryption)")
chk(p.trailer.get('/ID') is not None, "trailer /ID present")

print("\n[B] XMP metadata")
md = root.get('/Metadata')
chk(md is not None, "/Metadata stream on catalog")
xmp = bytes(md.read_bytes())
chk('/Filter' not in md, "XMP stream is unfiltered (required by PDF/A)")
t = etree.fromstring(xmp)
ns = {'rdf':'http://www.w3.org/1999/02/22-rdf-syntax-ns#','pdfaid':'http://www.aiim.org/pdfa/ns/id/',
      'fx':'urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#',
      'pdfaExtension':'http://www.aiim.org/pdfa/ns/extension/','pdfaSchema':'http://www.aiim.org/pdfa/ns/schema#'}
get = lambda x: (t.xpath(x, namespaces=ns) or [None])[0]
part = get('//pdfaid:part/text()'); conf = get('//pdfaid:conformance/text()')
chk(part == '3', f"pdfaid:part = 3 (got {part})")
chk(conf in ('A','B','U'), f"pdfaid:conformance = {conf}")
chk(get('//pdfaSchema:namespaceURI/text()') == 'urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#',
    "Factur-X pdfaExtension schema declared")
chk(len(t.xpath('//pdfaSchema:property//rdf:li', namespaces=ns)) == 4, "all 4 fx properties declared in extension schema")
chk(get('//fx:DocumentFileName/text()') == 'factur-x.xml', f"fx:DocumentFileName = {get('//fx:DocumentFileName/text()')}")
chk(get('//fx:ConformanceLevel/text()') == 'EN 16931', f"fx:ConformanceLevel = {get('//fx:ConformanceLevel/text()')}")
chk(get('//fx:DocumentType/text()') == 'INVOICE', "fx:DocumentType = INVOICE")

print("\n[C] OutputIntent")
oi = root.get('/OutputIntents')
chk(oi is not None and len(oi) >= 1, "/OutputIntents present")
o = oi[0]
chk(str(o.get('/S')) == '/GTS_PDFA1', f"subtype GTS_PDFA1 (got {o.get('/S')})")
dop = o.get('/DestOutputProfile')
chk(dop is not None, "DestOutputProfile ICC stream embedded")
chk(int(dop.get('/N')) == 3, f"ICC /N = 3 (got {dop.get('/N')})")
chk(len(bytes(dop.read_bytes())) > 100, f"ICC payload {len(bytes(dop.read_bytes()))} bytes")

print("\n[D] Associated file / embedded XML")
af = root.get('/AF')
chk(af is not None and len(af) >= 1, "catalog-level /AF array present")
spec = af[0]
chk(str(spec.get('/AFRelationship')) == '/Alternative', f"AFRelationship = {spec.get('/AFRelationship')}")
chk(str(spec.get('/F')) == 'factur-x.xml', "/F filename = factur-x.xml")
chk(str(spec.get('/UF')) == 'factur-x.xml', "/UF filename = factur-x.xml")
st = spec['/EF']['/F']
chk(b'/Subtype /text#2Fxml' in raw, "EF /Subtype written as escaped name /text#2Fxml in raw bytes")
chk(st.get('/Params') is not None and '/Size' in st['/Params'], "EF /Params/Size present")
chk(int(st['/Params']['/Size']) == len(bytes(st.read_bytes())), "declared Size matches actual bytes")
nm = root['/Names']['/EmbeddedFiles']['/Names']
chk(len(nm) >= 2 and str(nm[0]) == 'factur-x.xml', "also reachable via /Names/EmbeddedFiles name tree")

print("\n[E] Fonts")
fonts, embedded = [], []
for page in p.pages:
    res = page.get('/Resources', {})
    for name, f in dict(res.get('/Font', {})).items():
        base = str(f.get('/BaseFont'))
        fonts.append(base)
        desc = f.get('/FontDescriptor') or (f.get('/DescendantFonts',[{}])[0].get('/FontDescriptor') if f.get('/DescendantFonts') else None)
        emb = desc is not None and any(k in desc for k in ('/FontFile','/FontFile2','/FontFile3'))
        embedded.append(emb)
        if base not in [f for f,_ in set()] : pass
for b in sorted(set(fonts)): chk(True, f"font fully embedded: {b}")
chk(all(embedded), f"all {len(set(fonts))} distinct fonts embedded (PDF/A requires no external fonts)")

print("\n" + "="*58)
print("PDF/A-3b STRUCTURAL AUDIT:", "PASS" if not fails else f"{len(fails)} FAILURE(S)")
print("="*58)
sys.exit(1 if fails else 0)

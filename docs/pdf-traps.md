# What actually breaks Factur-X generation

Verified against pdf-lib 1.17.1 by deliberately reintroducing each failure and
confirming the regression guard in `test/pdfa-traps.test.ts` catches it.

> An earlier draft of this document listed five problems. Two of them were
> wrong: pdf-lib does escape the embedded-file `/Subtype` correctly, and it does
> write the catalog-level `/AF` array by itself. Both claims were made without
> testing the unpatched behaviour. They are corrected below. If you saw the
> five-item version, this supersedes it.

## Trap 1: `attach()` treats a string argument as base64

This is the worst one, because the output looks fine.

```ts
// WRONG: stores base64-decoded binary noise, at a plausible length,
// in a PDF that opens normally and shows an attachment of the right name
await pdfDoc.attach(xmlString, 'factur-x.xml', { ... });

// RIGHT
await pdfDoc.attach(new TextEncoder().encode(xmlString), 'factur-x.xml', { ... });
```

Symptom: the PDF opens, the attachment is listed, the byte count is roughly
right, and every reader fails to parse the XML.

## Trap 2: the XMP packet must be written as UTF-8 bytes

Passing the packet to pdf-lib as a JS string encodes it as latin1, which mangles
the leading U+FEFF in `<?xpacket begin="..."?>` and makes the whole packet
unparseable. Encode it explicitly:

```ts
ctx.stream(new TextEncoder().encode(xmp), { Type: PDFName.of('Metadata'), ... })
```

The stream must also stay unfiltered. PDF/A forbids compressed metadata.

## Trap 3: `/AFRelationship` is not set unless you ask for it

pdf-lib writes the catalog `/AF` array on its own, but the filespec gets no
`/AFRelationship` key unless you pass the option. PDF/A-3 requires it.

```ts
await pdfDoc.attach(bytes, 'factur-x.xml', {
  afRelationship: AFRelationship.Alternative,   // without this, rejected
});
```

## Trap 4: CII element order is a strict `xs:sequence`

A correctly populated document in the wrong order is rejected by the XSD.

- `ChargeTotalAmount` comes **before** `AllowanceTotalAmount`
- an empty `ApplicableHeaderTradeDelivery` must still be emitted
- `URIUniversalCommunication` goes after `PostalTradeAddress` and before
  `SpecifiedTaxRegistration`

## Things pdf-lib handles correctly, contrary to a lot of advice online

- The embedded-file `/Subtype`. `PDFName.of('text/xml')` escapes to
  `/text#2Fxml` automatically. No patching needed.
- The catalog-level `/AF` array. It is written during `save()`, not before, so
  do not try to read or assert it inside your own finalize step.

---

## The finding that matters more than any of these

A document can pass EN 16931 cleanly and still be rejected by a member state.
Our sample passed EN 16931, then failed 7 French CTC rules:

- Three mandatory French mentions EN 16931 never asks for: `AAB` (discount
  terms), `PMD` (late-payment penalties), `PMT` (recovery-cost indemnity)
- `BT-23` billing mode, from a closed list of 20 values
- `BT-34` and `BT-49` electronic addresses, optional in EN 16931, mandatory in FR
- A 9-digit SIREN format check on any party with `schemeID=0002`

EN 16931 is the easy 20%. The country CIUS layer is the product.

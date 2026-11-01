# CLI

`conformo` creates, validates, converts and explains e-invoices from the command line, on Windows, macOS and Linux. Exit code 0 means success (for `validate`: the document is valid), 1 means invalid, 2 means a usage or input error. The full reference is in [docs/cli.md](../cli.md).

```bash
npm install --global @conformo/cli
```

Save an invoice as JSON (money in integer minor units):

```json file=invoice.json
{
  "number": "RE-2027-0001", "issueDate": "2027-01-15", "currency": "EUR", "buyerReference": "04011000-1234512345-06",
  "seller": { "name": "Muster Software GmbH", "vatId": "DE123456789", "street": "Hauptstrasse 1", "postcode": "10115", "city": "Berlin", "country": "DE",
    "electronicAddress": "rechnung@muster.example", "contact": { "name": "Erika Mustermann", "phone": "+49 30 1234567", "email": "erika@muster.example" } },
  "buyer": { "name": "Stadt Beispielhausen", "street": "Rathausplatz 1", "postcode": "50667", "city": "Beispielhausen", "country": "DE",
    "electronicAddress": "04011000-1234512345-06", "electronicAddressScheme": "0204" },
  "payment": { "meansCode": "58", "iban": "DE89370400440532013000" },
  "lines": [{ "name": "Wartung Dezember", "quantity": 8, "unitCode": "HUR", "unitPriceMinor": 9500, "taxCategory": "S", "taxRate": 19 }]
}
```

Make an XRechnung and a hybrid PDF, check them, convert to UBL:

```bash
conformo create invoice.json --format xrechnung-cii -o invoice.xml
conformo validate invoice.xml
conformo create invoice.json --pdf --profile xrechnung -o invoice.pdf
conformo validate invoice.pdf --country DE
conformo convert invoice.xml --to xrechnung-ubl -o invoice-ubl.xml
conformo parse invoice.pdf --json
```

Look things up:

```bash
conformo explain BR-DE-15
conformo requirements DE
conformo --help
```

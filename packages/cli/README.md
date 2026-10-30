# @conformo/cli

Command line for e-invoices: `create`, `convert`, `validate`, `parse`, `explain`, `requirements`.

```bash
npx @conformo/cli validate invoice.xml
```

```bash
npx @conformo/cli create invoice.json --format xrechnung-cii -o invoice.xml
```

```bash
npx @conformo/cli create invoice.json --pdf --profile xrechnung -o invoice.pdf
```

Exit codes: 0 valid, 1 invalid, 2 usage or input error. Full reference: [docs/cli.md](../../docs/cli.md).

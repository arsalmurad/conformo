# Design: the Conformo app and validator

Who it is for: a freelancer or small business owner in Germany, France or Belgium who must send a legally valid
e-invoice and is not technical, often German-speaking. The app's one job: "make an invoice my customer's system will
accept, in a few minutes, and know it is right." The validator's one job: "tell me whether this invoice will be
accepted, and if not, exactly what to fix."

## 1. Plan (first draft)

**Palette**

| Name | Hex (light) | Hex (dark) | Role |
|---|---|---|---|
| Ledger ink | `#1D2B2A` | `#E4EBE7` | Text, the "fix" button, rules between sections |
| Form white | `#FFFFFF` | `#18201E` | Inputs and the invoice paper |
| Desk | `#EEF1EE` | `#101614` | Page background around the paper |
| Seal green | `#0E6A4E` | `#53C79C` | "Accepted", the download button, focus ring |
| Stamp vermilion | `#B3261E` | `#FF8F80` | Problems, and only problems |
| Graphite | `#56615E` | `#A1ADA8` | Hints, secondary text |

**Type.** One family, Work Sans, self-hosted from `public/assets/fonts` (the same files the PDF embeds, so the screen
and the document share one voice; no font CDN, the app stays offline-capable and private). Regular 400 for text, Bold
700 for headings, section numbers and the verdict. `font-variant-numeric: tabular-nums` on every amount, total and
date. Sentence case everywhere. No monospace anywhere in the interface.

**Layout concept.** The page is a desk; the invoice is the sheet of paper on it. The form is a numbered checklist in
four steps that fill the sheet; the seal is a stamp on the sheet's corner.

1366px:

```
+--------------------------------------------------------------------------------------------+
| (o) Conformo  Free, private e-invoices...            App  Validator  Docs  GitHub   [DE|EN] |
+--------------------------------------------------------------------------------------------+
| Who is this invoice for?                     [More v]  |  +-- seal ------------------------+ |
| (o) A business in Germany  ( ) German authority        |  | (3) 3 fields still needed     | |
| ( ) A business in France   ( ) Another EU country      |  |  Your customer: Leitweg-ID -> | |
|                                                        |  +-------------------------------+ |
| 1  Your business                                       |  +-------------------------------+ |
|    Business name [______________________]              |  |                               | |
|    Street        [______________________]              |  |      live PDF preview,        | |
|    Postcode [____]  City [_____________]               |  |      ~620px wide, readable    | |
| 2  Your customer ...                                   |  |                               | |
| 3  What you're billing                                 |  |                               | |
|    Number [INV-...] Date [..] Due [..] Currency [EUR]  |  |                               | |
|    Description [_______________________________]       |  |                               | |
|    Qty [__] Price [_____] VAT [Standard v] % [19] 0,00 |  +-------------------------------+ |
| 4  Payment ...                                         |                                    |
+--------------------------------------------------------------------------------------------+
|                         [Download draft (not valid ...)]  [ Fill in 3 fields ]              |
+--------------------------------------------------------------------------------------------+
```

375px:

```
+-----------------------------------+
| (o) Conformo               [DE|EN]|
| App Validator Docs GitHub         |
+-----------------------------------+
| [ Form ][ Preview (3) ]   sticky  |
+-----------------------------------+
| Who is this invoice for?          |
| (o) A business in Germany         |
| ( ) A German public authority     |
| ...                     [More v]  |
| 1 Your business                   |
|   Business name                   |
|   [____________________________]  |
| ...                               |
+-----------------------------------+
| [Draft]        [Fill in 3 fields] |  fixed
+-----------------------------------+
```

**Principles specific to this product**

1. *The document is the hero.* The preview is the largest thing on a desktop screen and readable without zooming; the
   form exists to fill it.
2. *Show, don't claim.* The seal says "Accepted under XRechnung 3.0" only when the official rule sets ran on this
   exact invoice and found nothing. Every problem names its field and how to fix it; rule ids stay one click away.
3. *Calm until it matters.* No red before the user has done something; one primary action; everything secondary
   (autosave, numbering, import, export) behind one "More" menu.

## 2. Review against generic defaults (and what changed)

| Generic default spotted in the first draft or the old app | Change |
|---|---|
| Near-black UI with one bright blue accent (the old app) | Gone. Ink is a green-tinted near-black on a cool grey desk; the only accent is the seal green, and it means one thing: accepted / go. |
| Warm cream "paper" background | The desk is a cool grey-green (`#EEF1EE`), and only the invoice itself is white, so the paper metaphor comes from the document, not a tinted page. |
| Identical rounded cards for every section | Sections are not boxed. Each is a numbered step separated by a hairline rule, with the step number hanging in the left margin. Only two things have a surface: the invoice paper and the seal. Corners are 2-4px, not pill-round. |
| All-caps eyebrow labels over headings | None. Section titles are sentence-case 20px bold with a number; field labels are sentence-case 14px. |
| Monospace for data labels / codes | None in the UI. Codes (BR-DE-15) appear only in technical details, set in the same family with tabular figures. |
| A green "success" toast for valid | No toast. The seal on the preview changes state; that is the only success signal. |
| Blue links for problem lists | Problems are vermilion-numbered entries that read as "field: what to do", each a button that focuses its field. |
| Generic system-font stack | Work Sans, which the PDF already uses: the preview and the interface look like they belong together. |

## 3. Screenshot critique

Screenshots: `docs/screenshots/` (generated by `e2e/screenshots.spec.ts`: 375, 768, 1366 and 1920px; empty, half filled
with errors, valid; validator valid and invalid).

Every screenshot is in German (the default for a German browser) because that is the primary user.

### Round 1

| Screenshot | What was weak | Fix |
|---|---|---|
| `app-1366-errors` | With ten problems revealed, the seal listed all ten and pushed the invoice paper below the fold: the document stopped being the hero the moment the user needed it most. | The seal lists three problems and a "7 weitere anzeigen" toggle; the full list is one click away and every entry still focuses its field. |
| `app-1366-*` | The four audience cards with two lines of detail each, plus the "not supported" paragraph, took ~400px: the first field again started half a screen down (the very complaint of item 5, in a new form). | Options are one line each; only the selected one shows its detail. The unsupported-countries note moved into an "Andere Länder" disclosure. First field now at ~470px instead of ~580px on a 900px-tall laptop. |
| `app-375-*` | "Mehr" sat on its own row above the question, costing 60px before anything useful. | "Mehr" sits beside the question. |
| `app-375-errors`, line item | The VAT type select was squeezed to half the width and truncated ("Regelsteuersat…"), the same defect as item 3. | Below 640px the VAT type takes a full row; rate and line total share the row below. |
| `validator-1366-invalid` | "Tragen Sie eine Telefonnummer ein." without saying whose phone number. | Each fix is headed by the field it is about ("Ihr Unternehmen: Telefon"), from the same label table as the app. |
| `app-*` preview bar | The layout picker floated on its own row above the paper. | It shares one line with the preview status. |

### Round 2

| Screenshot | What was weak | Fix |
|---|---|---|
| `app-768-errors-preview` | The preview was 380px wide inside a 736px column: it had been drawn while the Preview tab was hidden (width 0, fallback size) and never redrawn. Item 10 again, on tablets. | The preview observes its panel width and redraws when it changes; it now fills the column at every width. |
| `validator-375-*` | After choosing a file the verdict appeared below the fold, so on a phone nothing visibly happened. | On narrow screens the verdict scrolls into view when a check finishes (instantly under reduced motion). |

### Round 3 (final)

Checked at 375, 768, 1366 and 1920px, empty, with errors, valid, and the validator valid and invalid. The paper is the
largest element on desktop (about 680px wide at 1366px, 720px at 1920px) and readable without zooming; the seal is
the only coloured element on the screen and changes with the invoice; nothing is red before the user has done
something; every line input has a visible label and fits its content; no horizontal scroll at any width
(e2e/layout.spec.ts) and no serious or critical axe findings in light or dark (e2e/a11y.spec.ts).

Left as is, deliberately:

- The audience options are uneven in height at 1920px because only the selected one shows its detail line. Equal
  heights would bring back the empty space round 1 removed.
- On a 375px phone the preview paper is 343px wide: a full A4 page cannot be read at that size without zooming. The
  seal above it carries the verdict, which is what the phone user needs; the PDF itself is downloaded to read.

Not done (outside this pass): the PDF templates' own labels ("INVOICE", "BILL TO") are English for every customer.
Translating them changes `packages/pdf` output for every template and needs the PDF/A and determinism tests re-run
against new reference output; it is listed in docs/KNOWN-GAPS.md.

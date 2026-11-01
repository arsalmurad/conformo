import type { Lang } from '../i18n/strings.js';
import type { Problem } from './problems.js';

/**
 * Plain-language, field-level messages in English and German: what is wrong and how to fix it, from the user's side.
 * The official rule text and id stay available in the technical details, never as the message itself (the KoSIT rules
 * are written in German, the French CTC rules in French, the EN 16931 ones in English).
 */
interface Msg {
  missing?: string;
  invalid?: string;
  fix?: string;
}

type Table = Record<string, Msg>;

const en: Table = {
  number: { missing: 'Give the invoice a number.', fix: 'Use the next number in your sequence, or type your own.' },
  issueDate: { missing: 'Add the invoice date.', invalid: 'This is not a real date.' },
  dueDate: { invalid: 'This is not a real date.' },
  'delivery.date': { missing: 'Add the date you delivered or did the work.', invalid: 'This is not a real date.' },
  currency: { invalid: 'Use a three-letter currency code such as EUR.' },
  'seller.name': { missing: 'Add your business name.' },
  'seller.street': { missing: 'Add your street and number.' },
  'seller.postcode': { missing: 'Add your postcode.', fix: 'German authorities reject an XRechnung without it.' },
  'seller.city': { missing: 'Add your city.' },
  'seller.country': { missing: 'Choose your country.', invalid: 'Choose your country from the list.' },
  'seller.vatId': {
    missing: 'Add your VAT ID, or your tax number if you have no VAT ID.',
    invalid: 'Check your VAT ID. It starts with your country code, for example DE123456789.',
    fix: 'An invoice with VAT must name who charges it.',
  },
  'seller.taxRegistrationId': { invalid: 'Check your tax number.' },
  'seller.legalId': { missing: 'Add your SIREN, the 9-digit number of your company.', invalid: 'A SIREN has exactly 9 digits.' },
  'seller.electronicAddress': { missing: 'Add the email address for e-invoices.', invalid: 'Check this address.' },
  'seller.contact.name': { missing: 'Add a contact person.', fix: 'German authorities need a named contact on every XRechnung.' },
  'seller.contact.phone': { missing: 'Add a contact phone number.' },
  'seller.contact.email': { missing: 'Add a contact email address.' },
  'buyer.name': { missing: "Add your customer's name." },
  'buyer.street': { missing: "Add your customer's street and number." },
  'buyer.postcode': { missing: "Add your customer's postcode." },
  'buyer.city': { missing: "Add your customer's city." },
  'buyer.country': { missing: "Choose your customer's country.", invalid: 'Choose the country from the list.' },
  'buyer.vatId': {
    missing: "Add your customer's VAT ID.",
    invalid: "Check your customer's VAT ID.",
    fix: 'Reverse charge only works between two VAT-registered businesses.',
  },
  'buyer.electronicAddress': { missing: "Add your customer's e-invoice address.", fix: 'For a public authority this is usually the Leitweg-ID.' },
  buyerReference: {
    missing: "Add your customer's Leitweg-ID.",
    invalid: 'Check this Leitweg-ID.',
    fix: 'You find it on the order or contract from the authority.',
  },
  leitwegInvalid: {
    invalid: "This Leitweg-ID's check digits don't match.",
    fix: 'Copy it again from the order. It looks like 04011000-1234512345-06.',
  },
  sirenInvalid: { invalid: 'A SIREN has exactly 9 digits.' },
  ibanInvalid: { invalid: 'This IBAN is not valid. A digit is probably wrong or missing.', fix: 'Copy it again from your bank.' },
  businessProcess: { missing: 'Choose whether you invoice goods, services or both.' },
  'notes.AAB': { missing: 'Add the early payment discount notice (or say there is none).' },
  'notes.PMD': { missing: 'Add the late payment penalty notice.' },
  'notes.PMT': { missing: 'Add the fixed recovery fee notice (40 EUR).' },
  'line.name': { missing: 'Describe what you are billing.' },
  'line.quantity': { missing: 'Add a quantity.', invalid: 'Enter the quantity as a number.' },
  'line.unitPriceMinor': { missing: 'Add a price.', invalid: 'Enter the price as a number.' },
  'line.taxCategory': { invalid: 'Choose a VAT type.' },
  'line.taxRate': {
    missing: 'Add the VAT rate.',
    invalid: 'This VAT rate does not fit the VAT type.',
    fix: 'Standard-rated lines need a rate above 0 %. For 0 %, choose another VAT type.',
  },
  'line.exemptionReason': { missing: 'Say why there is no VAT on this line.', fix: 'For example "Reverse charge" or the legal exemption that applies.' },
  'payment.iban': { missing: 'Add your IBAN so your customer can pay.', invalid: 'Check your IBAN.' },
  'payment.bic': { invalid: 'Check the BIC.' },
  totals: { invalid: 'The totals do not add up.', fix: 'This should not happen with amounts typed here; please report it.' },
  lines: { invalid: 'Something on the invoice lines is not accepted.' },
};

const de: Table = {
  number: { missing: 'Geben Sie der Rechnung eine Nummer.', fix: 'Nehmen Sie die nächste Nummer Ihrer Folge oder tippen Sie Ihre eigene ein.' },
  issueDate: { missing: 'Tragen Sie das Rechnungsdatum ein.', invalid: 'Das ist kein gültiges Datum.' },
  dueDate: { invalid: 'Das ist kein gültiges Datum.' },
  'delivery.date': { missing: 'Tragen Sie das Liefer- oder Leistungsdatum ein.', invalid: 'Das ist kein gültiges Datum.' },
  currency: { invalid: 'Verwenden Sie einen dreistelligen Währungscode wie EUR.' },
  'seller.name': { missing: 'Tragen Sie den Namen Ihres Unternehmens ein.' },
  'seller.street': { missing: 'Tragen Sie Ihre Straße und Hausnummer ein.' },
  'seller.postcode': { missing: 'Tragen Sie Ihre PLZ ein.', fix: 'Ohne PLZ lehnen Behörden eine XRechnung ab.' },
  'seller.city': { missing: 'Tragen Sie Ihren Ort ein.' },
  'seller.country': { missing: 'Wählen Sie Ihr Land.', invalid: 'Wählen Sie Ihr Land aus der Liste.' },
  'seller.vatId': {
    missing: 'Tragen Sie Ihre USt-IdNr. ein, oder Ihre Steuernummer, wenn Sie keine USt-IdNr. haben.',
    invalid: 'Prüfen Sie Ihre USt-IdNr. Sie beginnt mit dem Ländercode, zum Beispiel DE123456789.',
    fix: 'Eine Rechnung mit Umsatzsteuer muss angeben, wer sie berechnet.',
  },
  'seller.taxRegistrationId': { invalid: 'Prüfen Sie Ihre Steuernummer.' },
  'seller.legalId': { missing: 'Tragen Sie Ihre SIREN ein, die 9-stellige Unternehmensnummer.', invalid: 'Eine SIREN hat genau 9 Ziffern.' },
  'seller.electronicAddress': { missing: 'Tragen Sie die E-Mail-Adresse für E-Rechnungen ein.', invalid: 'Prüfen Sie diese Adresse.' },
  'seller.contact.name': { missing: 'Tragen Sie einen Ansprechpartner ein.', fix: 'Behörden verlangen auf jeder XRechnung einen Ansprechpartner.' },
  'seller.contact.phone': { missing: 'Tragen Sie eine Telefonnummer ein.' },
  'seller.contact.email': { missing: 'Tragen Sie eine E-Mail-Adresse für Rückfragen ein.' },
  'buyer.name': { missing: 'Tragen Sie den Namen Ihres Kunden ein.' },
  'buyer.street': { missing: 'Tragen Sie Straße und Hausnummer Ihres Kunden ein.' },
  'buyer.postcode': { missing: 'Tragen Sie die PLZ Ihres Kunden ein.' },
  'buyer.city': { missing: 'Tragen Sie den Ort Ihres Kunden ein.' },
  'buyer.country': { missing: 'Wählen Sie das Land Ihres Kunden.', invalid: 'Wählen Sie das Land aus der Liste.' },
  'buyer.vatId': {
    missing: 'Tragen Sie die USt-IdNr. Ihres Kunden ein.',
    invalid: 'Prüfen Sie die USt-IdNr. Ihres Kunden.',
    fix: 'Reverse Charge geht nur zwischen zwei Unternehmen mit USt-IdNr.',
  },
  'buyer.electronicAddress': { missing: 'Tragen Sie die E-Rechnungs-Adresse Ihres Kunden ein.', fix: 'Bei Behörden ist das meist die Leitweg-ID.' },
  buyerReference: {
    missing: 'Tragen Sie die Leitweg-ID Ihres Kunden ein.',
    invalid: 'Prüfen Sie diese Leitweg-ID.',
    fix: 'Sie steht im Auftrag oder Vertrag der Behörde.',
  },
  leitwegInvalid: {
    invalid: 'Die Prüfziffer dieser Leitweg-ID stimmt nicht.',
    fix: 'Kopieren Sie sie erneut aus dem Auftrag. Sie sieht aus wie 04011000-1234512345-06.',
  },
  sirenInvalid: { invalid: 'Eine SIREN hat genau 9 Ziffern.' },
  ibanInvalid: { invalid: 'Diese IBAN ist ungültig. Wahrscheinlich fehlt eine Ziffer oder ist falsch.', fix: 'Kopieren Sie sie erneut von Ihrer Bank.' },
  businessProcess: { missing: 'Wählen Sie, ob Sie Waren, Dienstleistungen oder beides berechnen.' },
  'notes.AAB': { missing: 'Ergänzen Sie den Hinweis zum Skonto (oder dass es keins gibt).' },
  'notes.PMD': { missing: 'Ergänzen Sie den Hinweis zu Verzugszinsen.' },
  'notes.PMT': { missing: 'Ergänzen Sie den Hinweis zur Mahnpauschale (40 EUR).' },
  'line.name': { missing: 'Beschreiben Sie, was Sie berechnen.' },
  'line.quantity': { missing: 'Tragen Sie eine Menge ein.', invalid: 'Geben Sie die Menge als Zahl ein.' },
  'line.unitPriceMinor': { missing: 'Tragen Sie einen Preis ein.', invalid: 'Geben Sie den Preis als Zahl ein.' },
  'line.taxCategory': { invalid: 'Wählen Sie eine Steuerart.' },
  'line.taxRate': {
    missing: 'Tragen Sie den Steuersatz ein.',
    invalid: 'Dieser Steuersatz passt nicht zur Steuerart.',
    fix: 'Beim Regelsteuersatz muss der Satz über 0 % liegen. Für 0 % wählen Sie eine andere Steuerart.',
  },
  'line.exemptionReason': { missing: 'Geben Sie an, warum auf dieser Position keine USt. anfällt.', fix: 'Zum Beispiel „Steuerschuldnerschaft des Leistungsempfängers“ oder die geltende Befreiung.' },
  'payment.iban': { missing: 'Tragen Sie Ihre IBAN ein, damit Ihr Kunde zahlen kann.', invalid: 'Prüfen Sie Ihre IBAN.' },
  'payment.bic': { invalid: 'Prüfen Sie die BIC.' },
  totals: { invalid: 'Die Summen gehen nicht auf.', fix: 'Das sollte mit hier eingegebenen Beträgen nicht passieren; bitte melden Sie es.' },
  lines: { invalid: 'Etwas an den Rechnungspositionen wird nicht akzeptiert.' },
};

const TABLES: Record<Lang, Table> = { en, de };

/** BR-S-05 and its siblings: the rate does not match the category. */
const RATE_RULE = /^BR-(S|Z|E|AE|IC|G|O)-0[5-6]$/;

function tableKey(key: string): string {
  const m = /^lines\.\d+\.(.+)$/.exec(key);
  return m ? `line.${m[1]}` : key;
}

export interface Described {
  text: string;
  fix?: string;
}

export function describe(problem: Problem, lang: Lang): Described {
  const table = TABLES[lang];
  let k = problem.messageId ?? tableKey(problem.key);
  if (!problem.messageId && problem.ruleId && RATE_RULE.test(problem.ruleId) && /\.taxRate$/.test(problem.key)) k = 'line.taxRate';
  const msg = table[k];
  const text = problem.kind === 'missing' ? msg?.missing ?? msg?.invalid : msg?.invalid ?? msg?.missing;
  if (text) return { text, fix: msg?.fix };
  // A rule with no field-level wording yet: English uses the rule's own plain-language note when there is one; every
  // language says plainly that the official check refused it. The official text is in the technical details.
  if (lang === 'en' && problem.plain) return { text: problem.plain.summary, fix: problem.plain.fix };
  return lang === 'de'
    ? { text: 'Die offizielle Prüfung lehnt diese Angabe ab.', fix: 'Die genaue Regel steht unter „Technische Details“.' }
    : { text: 'The official check rejects this.', fix: 'The exact rule is under "Technical details".' };
}

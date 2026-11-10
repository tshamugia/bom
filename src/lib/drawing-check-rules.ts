// The rules the dxf-checker service reports (services/dxf-checker, issue #18),
// grouped as in Settings. A copy of `RULES` / `GROUPS` in
// services/dxf-checker/app/checker/common.py — tests/unit/lib/drawing-check-rules.test.ts
// fails when the two drift apart. Client-safe: no server imports.
//
// The app sends the enabled ids with every check, so it has to know them all:
// a rule that was enabled and reported nothing has passed, and its open Remark
// closes (see `planRemarkChanges` in ./drawing-checks).

export const CHECK_SEVERITIES = ["ERROR", "WARNING", "INFO"] as const;
export type CheckSeverity = (typeof CHECK_SEVERITIES)[number];

export type CheckRule = { id: string; severity: CheckSeverity; ref: string; title: string };
export type CheckRuleGroup = { id: string; label: string; rules: readonly CheckRule[] };

export const CHECK_RULE_GROUPS: readonly CheckRuleGroup[] = [
  {
    id: "file-name",
    label: "ფაილის სახელი",
    rules: [
      { id: "N-LATIN", severity: "ERROR", ref: "NAMING §3, §8", title: "არალათინური სიმბოლოები სახელში" },
      { id: "N-SPACE", severity: "ERROR", ref: "NAMING §3", title: "ცარიელი ადგილი სახელში" },
      { id: "N-LOWER", severity: "ERROR", ref: "NAMING §3", title: "პატარა ასოები სახელში" },
      { id: "N-FORBIDDEN", severity: "ERROR", ref: "NAMING §8", title: "აკრძალული სიტყვა სახელში" },
      { id: "N-DATE", severity: "ERROR", ref: "NAMING §8, §11.1", title: "თარიღი სახელში" },
      { id: "N-FORMAT", severity: "ERROR", ref: "NAMING §3", title: "სახელი 7-ველიან ფორმატს არ მიჰყვება" },
      { id: "N-ORDER", severity: "ERROR", ref: "NAMING §3, §11.1", title: "ველების ძველი რიგი" },
      { id: "N-EXTRA-FIELD", severity: "ERROR", ref: "NAMING §2, §11.1", title: "ზედმეტი ველი (დოკუმენტის ტიპი)" },
      { id: "N-PROJECT-DASH", severity: "ERROR", ref: "NAMING §3, §4.2", title: "ტირე პროექტის კოდში" },
      { id: "N-EXTRA-SUFFIX", severity: "ERROR", ref: "NAMING §3, §8", title: "ზედმეტი სუფიქსი რევიზიის შემდეგ" },
    ],
  },
  {
    id: "name-codes",
    label: "კოდები სახელში",
    rules: [
      { id: "N-ORIG", severity: "ERROR", ref: "NAMING §4.1", title: "შემსრულებლის კოდი არასწორია" },
      { id: "N-ORIG-UNKNOWN", severity: "WARNING", ref: "NAMING §4.1", title: "შემსრულებლის კოდი ცნობილ სიაში არ არის" },
      { id: "N-PROJECT", severity: "ERROR", ref: "NAMING §4.2", title: "პროექტის კოდი არასწორია" },
      { id: "N-ZONE", severity: "ERROR", ref: "NAMING §4.3", title: "ზონის კოდი სიაში არ არის" },
      { id: "N-FLOOR", severity: "ERROR", ref: "NAMING §4.4", title: "სართულის კოდი სიაში არ არის" },
      { id: "N-SYSTEM", severity: "ERROR", ref: "NAMING §4.5", title: "სისტემის კოდი სიაში არ არის" },
      { id: "N-NUMBER", severity: "ERROR", ref: "NAMING §5", title: "ნომერი სამნიშნა არ არის" },
      { id: "N-SEQ00", severity: "ERROR", ref: "NAMING §5", title: "რიგითი ნომერი 00" },
      { id: "N-SERIES-RESERVED", severity: "WARNING", ref: "NAMING §5", title: "სარეზერვო სერია 8xx" },
      { id: "N-EXT-SERIES", severity: "WARNING", ref: "NAMING §2, §7.1, §10.3", title: "გაფართოება და სერია არ შეესაბამება" },
      { id: "N-PLAN-FLOOR", severity: "WARNING", ref: "NAMING §4.4, §5", title: "გეგმას (1xx) კონკრეტული სართული არ აქვს" },
    ],
  },
  {
    id: "name-revision",
    label: "რევიზია სახელში",
    rules: [
      { id: "N-REV", severity: "ERROR", ref: "NAMING §6", title: "რევიზიის ფორმატი არასწორია" },
      { id: "N-REV-WIP", severity: "ERROR", ref: "NAMING §8", title: "სამუშაო ფაილს რევიზია სახელში აქვს" },
      { id: "N-REV-MISSING", severity: "ERROR", ref: "NAMING §8", title: "გაცემულ ფაილს რევიზია აკლია" },
      { id: "N-SUBREV-ISSUED", severity: "ERROR", ref: "NAMING §6", title: "შიდა ქვერევიზია გაცემულ ფაილში" },
    ],
  },
  {
    id: "title-block",
    label: "შტამპი",
    rules: [
      { id: "T-MISSING", severity: "ERROR", ref: "NAMING §10.1; DRAFTING წესი 16", title: "შტამპი ვერ მოიძებნა" },
      { id: "T-NO-ATTRIBS", severity: "WARNING", ref: "NAMING §10.2", title: "შტამპი ატრიბუტების/fields-ის გარეშეა" },
      { id: "T-FIELD-MISSING", severity: "ERROR", ref: "NAMING §10.1", title: "შტამპს სავალდებულო ველი აკლია" },
      { id: "T-FIELD-EMPTY", severity: "WARNING", ref: "NAMING §10.1", title: "შტამპის ველი ცარიელია" },
      { id: "T-SHEET", severity: "ERROR", ref: "NAMING §10, §11.2", title: "ფურცლის ნომერი შტამპში ფაილის სახელს არ ემთხვევა" },
      { id: "T-FILENAME", severity: "ERROR", ref: "NAMING §10.1", title: "ფაილის სახელი შტამპში არ ემთხვევა" },
      { id: "T-REV", severity: "ERROR", ref: "NAMING §11.2", title: "რევიზია შტამპში ფაილის სახელს არ ემთხვევა" },
      { id: "T-PROJECT", severity: "WARNING", ref: "NAMING §10.1", title: "პროექტის ნომერი შტამპში არ ჩანს/არ ემთხვევა" },
      { id: "T-FLOOR", severity: "ERROR", ref: "NAMING §4.4, §11.2", title: "სართულის კოდი და შტამპის დასახელება არ შეესაბამება" },
      { id: "T-REVTABLE", severity: "WARNING", ref: "NAMING §6, §10.1", title: "რევიზიების ცხრილი აკლია ან არასრულია" },
      { id: "T-SCALE", severity: "WARNING", ref: "NAMING §10.1", title: "მასშტაბის ჩანაწერი არასწორია" },
      { id: "T-FORMAT", severity: "WARNING", ref: "NAMING §10.1", title: "ფორმატის ჩანაწერი არასწორია" },
    ],
  },
  {
    id: "legend",
    label: "ლეგენდა",
    rules: [
      { id: "D08-LEGEND-MISSING", severity: "ERROR", ref: "DRAFTING წესი 8, 12", title: "ლეგენდა (LEGEND ლეიერი) არ არის" },
      { id: "D09-LEGEND-SYMBOL", severity: "WARNING", ref: "DRAFTING წესი 9", title: "ლეგენდაში სიმბოლოები ბლოკებით არ არის" },
      { id: "D11-LEGEND-BLOCK", severity: "ERROR", ref: "DRAFTING წესი 11", title: "გეგმის ბლოკი ლეგენდაში არ არის" },
      { id: "D11-LEGEND-CABLE", severity: "WARNING", ref: "DRAFTING წესი 11", title: "კაბელის ლეიერი ლეგენდაში არ ჩანს" },
      { id: "D11-LEGEND-UNITS", severity: "INFO", ref: "DRAFTING წესი 8", title: "ლეგენდაში ერთეულის სვეტი არ ჩანს" },
      { id: "D12-LEGEND-LAYER", severity: "WARNING", ref: "DRAFTING წესი 12", title: "ლეგენდის ობიექტები სხვა ლეიერზეა" },
    ],
  },
  {
    id: "layouts",
    label: "Layout-ები",
    rules: [
      { id: "D16-LAYOUTS", severity: "ERROR", ref: "DRAFTING წესი 16; NAMING §8", title: "ერთ ფაილში ერთზე მეტი layout" },
      { id: "D05-PAPER-DEVICE", severity: "WARNING", ref: "DRAFTING წესი 5", title: "ბლოკი paper space-ში" },
    ],
  },
  {
    id: "blocks",
    label: "ბლოკები",
    rules: [
      { id: "D01-EXPLODED", severity: "WARNING", ref: "DRAFTING წესი 1", title: "შესაძლოა მოწყობილობის ბლოკი დაშლილია" },
      { id: "D02-COPY-BLOCK", severity: "WARNING", ref: "DRAFTING წესი 2", title: "ბლოკის ჩაკოპირებული/ძველი ასლი" },
      { id: "D03-UNAPPROVED", severity: "ERROR", ref: "DRAFTING წესი 3", title: "ბლოკი დამტკიცებულ ბიბლიოთეკაში არ არის" },
      { id: "D04-DYNAMIC", severity: "WARNING", ref: "DRAFTING წესი 4", title: "dynamic block visibility state-ით" },
      { id: "D06-DUPLICATE", severity: "ERROR", ref: "DRAFTING წესი 6", title: "ერთმანეთზე დადებული დუბლიკატი ბლოკები" },
    ],
  },
  {
    id: "xref",
    label: "Xref",
    rules: [
      { id: "D05-XREF-COUNT", severity: "WARNING", ref: "DRAFTING წესი 5", title: "xref-ი არქიტექტურული ფონის გარდა" },
      { id: "D05-XREF-ABS", severity: "WARNING", ref: "NAMING §10.2", title: "xref-ი აბსოლუტური მისამართით" },
    ],
  },
  {
    id: "sku",
    label: "SKU ნახაზზე",
    rules: [
      { id: "D07-SKU", severity: "WARNING", ref: "DRAFTING წესი 7", title: "შესაძლო SKU / მოდელის კოდი ნახაზზე" },
      { id: "D07-SKU-STRONG", severity: "ERROR", ref: "DRAFTING წესი 7", title: "მწარმოებლის მოდელის კოდი ნახაზზე" },
    ],
  },
  {
    id: "cables",
    label: "კაბელის ლეიერები",
    rules: [
      { id: "D13-CABLE-LAYER-NAME", severity: "WARNING", ref: "DRAFTING წესი 13", title: "კაბელის ლეიერის სახელი ფორმატს არ მიჰყვება" },
      { id: "D13-CABLE-OFF-LAYER", severity: "WARNING", ref: "DRAFTING წესი 13", title: "კაბელის მსგავსი ლეიერი CBL- პრეფიქსის გარეშე" },
      { id: "D14-CABLE-CONTENT", severity: "ERROR", ref: "DRAFTING წესი 14", title: "კაბელის ლეიერზე ტრასის გარდა სხვა ობიექტია" },
    ],
  },
  {
    id: "units",
    label: "ერთეული და მასშტაბი",
    rules: [
      { id: "D15-UNITS", severity: "ERROR", ref: "DRAFTING წესი 15", title: "ერთეული მილიმეტრი არ არის (INSUNITS≠4)" },
      { id: "D15-SCALE", severity: "WARNING", ref: "DRAFTING წესი 15", title: "მოდელი ძალიან პატარაა: შესაძლოა 1:1 არ არის" },
    ],
  },
  {
    id: "typical",
    label: "ტიპიური სართული",
    rules: [
      { id: "D17-TYPICAL", severity: "ERROR", ref: "DRAFTING წესი 17", title: "ტიპიური სართულის მამრავლი შევსებული არ არის" },
    ],
  },
];

export const CHECK_RULES: readonly CheckRule[] = CHECK_RULE_GROUPS.flatMap(g => g.rules);
export const CHECK_RULE_IDS: readonly string[] = CHECK_RULES.map(r => r.id);

const BY_ID = new Map(CHECK_RULES.map(r => [r.id, r]));

export function checkRule(id: string): CheckRule | undefined {
  return BY_ID.get(id);
}

// Aptly — build notes.
//
// Set in the product's own palette and typographic voices, so the document
// about Aptly looks like Aptly. Compile with:
//     uv run python docs/render-notes.py

#let ink = rgb("#16181D")
#let slate = rgb("#5A6270")
#let faint = rgb("#8A919C")
#let signal = rgb("#14655C")
#let amber = rgb("#C0821F")
#let amberink = rgb("#8F6114")
#let hairline = rgb("#E2E6E8")
#let mist = rgb("#F4F5F3")
#let softsignal = rgb("#E9F1EF")
#let softamber = rgb("#FDF3E2")
#let danger = rgb("#9B2C2C")

#let sans = ("Helvetica Neue", "Helvetica", "Arial", "DejaVu Sans")
#let mono = ("Menlo", "DejaVu Sans Mono")

#set document(title: "Aptly — Build Notes", author: "Aptly")

#set page(
  paper: "a4",
  fill: rgb("#FBFBFA"),
  margin: (top: 2.4cm, bottom: 2.2cm, left: 2.3cm, right: 2.3cm),
  footer: context {
    set text(size: 8pt, fill: faint, font: sans)
    grid(
      columns: (1fr, auto),
      align(left)[Aptly · build notes],
      align(right)[#counter(page).display()],
    )
  },
)

#set text(font: sans, size: 10pt, fill: ink, lang: "en")
#set par(justify: false, leading: 0.78em, spacing: 1.15em)

// ── Headings ────────────────────────────────────────────────────────────

#show heading.where(level: 1): it => {
  pagebreak(weak: true)
  block(above: 0pt, below: 16pt)[
    #set text(size: 20pt, weight: 600, fill: ink)
    #it.body
  ]
}

#show heading.where(level: 2): it => block(above: 20pt, below: 8pt)[
  #set text(size: 12.5pt, weight: 600, fill: ink)
  #it.body
]

#show heading.where(level: 3): it => block(above: 14pt, below: 5pt)[
  #set text(size: 10pt, weight: 600, fill: ink)
  #it.body
]

#show raw: set text(font: mono, size: 8.8pt)
#show link: set text(fill: signal)
#show strong: set text(weight: 600)

// ── Building blocks ─────────────────────────────────────────────────────

// Weak spacing is *not* used anywhere below. Typst collapses adjacent weak
// spacing to a single value, and a small explicit `v()` next to paragraph
// spacing wins rather than losing — which flattened every gap in this document
// until each one was set outright.
#let kicker(n, label) = block(below: 13pt)[
  #text(font: mono, size: 8pt, fill: faint)[#n]
  #h(6pt)
  #text(size: 8pt, fill: signal, weight: 600, tracking: 0.12em)[#upper(label)]
]

#let note(title, body, tone: "signal") = {
  let accent = if tone == "amber" { amberink } else { signal }
  let ground = if tone == "amber" { softamber } else { softsignal }
  block(
    fill: ground,
    stroke: (left: 2.5pt + accent),
    inset: (x: 12pt, y: 10pt),
    radius: (right: 4pt),
    width: 100%,
    above: 14pt,
    below: 14pt,
    breakable: false,
  )[
    #grid(
      rows: 2,
      row-gutter: 5pt,
      text(size: 7.5pt, weight: 700, fill: accent, tracking: 0.1em)[#upper(title)],
      block(above: 0pt, below: 0pt)[
        #set text(size: 9.3pt)
        #body
      ],
    )
  ]
}

#let panel(body) = block(
  breakable: false,
  fill: rgb("#1A1C21"),
  inset: (x: 12pt, y: 9pt),
  radius: 5pt,
  width: 100%,
  above: 12pt,
  below: 12pt,
)[
  // Tighter than the body leading, the way a terminal actually sets its lines.
  #set par(leading: 0.5em)
  #set text(font: mono, size: 8.3pt, fill: rgb("#E8EAE7"))
  #body
]

#let datatable(headers, ..rows) = {
  set text(size: 9pt)
  block(above: 12pt, below: 14pt)[
    #table(
      columns: headers.len(),
      stroke: (x, y) => (
        bottom: if y == 0 { 0.8pt + ink } else { 0.4pt + hairline },
      ),
      inset: (x: 0pt, y: 7pt),
      column-gutter: 14pt,
      align: left + top,
      ..headers.map(h => text(
        size: 7.5pt, weight: 600, fill: faint, tracking: 0.08em,
      )[#upper(h)]),
      ..rows.pos()
    )
  ]
}

// Inner gaps come from `row-gutter`, which is exact, rather than from `v()`
// between paragraphs, which stacks on top of paragraph spacing and made the
// title-to-body gap as wide as the gap between whole steps.
#let step(n, title, body, meta) = block(above: 0pt, below: 15pt, breakable: false)[
  #grid(
    columns: (18pt, 1fr),
    column-gutter: 10pt,
    text(font: mono, size: 8.5pt, fill: signal)[#n],
    grid(
      rows: 3,
      row-gutter: (5pt, 5pt),
      text(size: 10pt, weight: 600)[#title],
      block(above: 0pt, below: 0pt)[
        #set text(size: 9.2pt)
        #body
      ],
      text(font: mono, size: 7.6pt, fill: faint)[#meta],
    ),
  )
]

// `verdict` comes before `body` so the call site can pass it as a plain string.
// As a trailing argument it would arrive as a content block written `["Reject"]`,
// and Typst would set the quote marks as text — which it did.
#let layer(n, title, verdict, body) = {
  let vcol = if verdict == "Reject" { danger } else { amberink }
  let vbg = if verdict == "Reject" { rgb("#FBEAEA") } else { softamber }
  block(above: 0pt, below: 9pt, breakable: false)[
    #grid(
      columns: (16pt, 1fr, auto),
      column-gutter: 9pt,
      align: (left, left, right),
      text(font: mono, size: 8.5pt, fill: faint)[#n],
      grid(
        rows: 2,
        row-gutter: 3pt,
        text(size: 9.5pt, weight: 600)[#title],
        text(size: 8.8pt, fill: slate)[#body],
      ),
      box(fill: vbg, inset: (x: 5pt, y: 2pt), radius: 8pt)[
        #text(size: 7pt, weight: 700, fill: vcol, tracking: 0.06em)[#upper(verdict)]
      ],
    )
  ]
}

// ═══════════════════════════════════════════════════════════════════════
// Cover
// ═══════════════════════════════════════════════════════════════════════

#v(2.2cm)

#text(size: 8.5pt, weight: 600, fill: signal, tracking: 0.15em)[#upper("Build notes")]

#v(10pt)

#text(size: 30pt, weight: 600)[
  Aptly
]

#v(2pt)

#text(size: 17pt, weight: 400, fill: slate)[
  Poora system, shuru se aakhir tak
]

#v(16pt)

#block(width: 90%)[
  #set text(size: 10.5pt, fill: slate)
  Ek CV tailoring tool jiski yaaddasht hai. Job post aur CV daalo, exact lines
  dikhti hain jo badalni hain, ek tap mein lag jaati hain — aur har application
  ka record rehta hai, taaki paanch hafte baad recruiter call kare toh tumhare
  paas woh sab ho jo tumne bheja tha.
]

#v(22pt)

#line(length: 100%, stroke: 0.4pt + hairline)
#v(10pt)

#grid(
  columns: (1fr, 1fr, 1fr, 1fr, 1fr, 1fr),
  ..(
    ("202", "backend tests"),
    ("7.5k", "lines Python"),
    ("5.2k", "lines TypeScript"),
    ("8", "validator layers"),
    ("5", "file formats"),
    ("~11s", "ek tailoring run"),
  ).map(pair => [
    #text(size: 14pt, weight: 600)[#pair.at(0)]
    #v(2pt)
    #text(size: 7.5pt, fill: slate)[#pair.at(1)]
  ])
)

#v(10pt)
#line(length: 100%, stroke: 0.4pt + hairline)

#v(28pt)

#text(size: 8.5pt, weight: 600, fill: faint, tracking: 0.12em)[#upper("Contents")]
#v(8pt)

#let toc = (
  ("01", "Ye app hai kya"),
  ("02", "Kaise kaam karta hai — step by step"),
  ("03", "AI architecture"),
  ("04", "No-fabrication validator"),
  ("05", "File formats ka jhanjhat"),
  ("06", "Tech stack"),
  ("07", "Kya bana, kya baaki"),
  ("08", "Chalane ka tarika"),
  ("09", "Imaandari se"),
)

#for entry in toc [
  #block(below: 5pt)[
    #text(font: mono, size: 8pt, fill: faint)[#entry.at(0)]
    #h(10pt)
    #text(size: 10pt)[#entry.at(1)]
  ]
]

// ═══════════════════════════════════════════════════════════════════════
= Ye app hai kya

#kicker("01", "The problem")

Aaj ek job ke liye log *chaar alag tools* use karte hain — CV builder, keyword
scanner, application tracker, aur interview prep. Kaam bat jaata hai, AI ka
output generic lagta hai, aur sabse stressful moment pe koi tool madad nahi
karta.

Woh moment ye hai:

#note("Jiske liye ye poora product hai", tone: "amber")[
  Recruiter call karta hai. Tumne paanch hafte pehle apply kiya tha. Yaad nahi
  kaunsa CV bheja tha, aur job post site se hat chuka hai.
]

Aptly teen kaam karta hai: *tailor* (exact changes dikhata hai), *remember*
(job post ko us din ki haalat mein freeze karke rakhta hai), aur *be ready*
(call se pehle sab saamne rakhta hai).

Aur ek rule hai jo kabhi nahi tootta — *ye tumhare baare mein kuch invent nahi
karta.* Ye product ka pehla claim bhi hai aur sabse mushkil engineering bhi.

// ═══════════════════════════════════════════════════════════════════════
= Kaise kaam karta hai

#kicker("02", "Step by step")

Jab tum CV aur job post daalte ho, andar ye hota hai. Har step apne upar wale
ka output khaata hai, isliye ye asli sequence hai.

#v(10pt)

#step("1", "File padhi jaati hai")[
  `.docx` / `.pdf` / `.tex` / `.txt` — har format ka apna parser hai. Ye file ko
  *CVDocument* mein badalta hai: sections, entries, aur har line ek addressable
  node.
][backend/src/aptly/ingest/]

#step("2", "Har line ko ek stable ID milti hai")[
  Yahi cheez one-tap apply possible banati hai. Model kabhi nahi kehta "ye
  string dhoondh ke badal do" — woh node ID bolta hai. Aur har node apna
  *SourceAnchor* rakhta hai: asli file mein wapas likhne ka exact pata.
][model/document.py · model/anchors.py]

#step("3", "Job post parse hota hai")[
  Ek sasta model advert se requirements, responsibilities aur keywords nikaalta
  hai. Sirf wahi jo likha hai — salary guess nahi karta, company domain se infer
  nahi karta.
][gemini-3.1-flash-lite · ~3s]

#step("4", "Coverage nikalti hai")[
  Job ke har term ke liye check hota hai ki CV usko genuinely dikhata hai ya
  nahi. "K8s" se "Kubernetes" cover hota hai. Kam score aana _sahi jawab_ hai,
  failure nahi.
][2 / 11 aana bilkul normal hai]

#step("5", "Har section parallel mein tailor hota hai")[
  Summary, experience, projects, skills — sab alag-alag calls, ek saath. Isliye
  pehla change card \~7 second mein aa jaata hai, poora run khatam hone ka wait
  nahi karna padta.
][gemini-2.5-flash · parallel]

#step("6", "Validator har suggestion ko rokta hai")[
  Model ka output seedha screen pe nahi jaata. 8 layers ka deterministic Python
  check chalta hai. Jo pass nahi hota woh discard — aur count tumhe dikhta hai.
][validate/\_\_init\_\_.py]

#step("7", "Cards stream hote hain")[
  Server SSE se ek-ek card bhejta hai. Har card: purani line, nayi line, ek
  plain reason, aur "kahan se aaya" ka quote.
][POST /api/tailor · server-sent events]

#step("8", "Apply — poora browser mein")[
  Apply dabane pe koi server call nahi jaati. Document browser mein hi badalta
  hai, isliye turant hai aur undo bhi turant. Server sirf download ke waqt aata
  hai.
][lib/document.ts]

#step("9", "Export — usi format mein wapas")[
  SourceAnchors ki wajah se edits tumhari _apni_ file mein jaate hain. `.docx`
  aur `.tex` byte-identical wapas aate hain agar kuch na badla ho.
][export/runs.py · export/sources.py]

#step("10", "Save — Library mein record ban jaata hai")[
  Job post ka frozen snapshot + jo CV bheja + har change ka log, sab ek saath.
  Account ki zaroorat nahi; sign in baad mein karo toh kaam tumhare saath aa
  jaata hai.
][POST /api/records]

// ═══════════════════════════════════════════════════════════════════════
= AI architecture

#kicker("03", "Models aur prompt")

Do models, apne-apne kaam ke liye. Mehenga model wahan jahan quality hi product
hai; sasta model wahan jahan kaam mechanical hai.

#datatable(
  ("Model", "Kaam", "Kyun"),
  raw("gemini-2.5-flash"), [Tailoring suggestions, Gap Coach],
  [Yahi asli product hai — judgement chahiye],
  raw("gemini-3.1-flash-lite"), [Job post parse, coverage check],
  [Extraction hai, sasta aur tez kaafi hai],
)

#note("Ek zaroori baat", tone: "amber")[
  Google ke free tier pe saaf likha hai "data used for training". Aptly ka input
  CV hai — naam, phone, address, poori job history. Isliye code startup pe hi
  paid key assert karta hai aur free tier pe chupke se girne se rokta hai.
  Chup-chaap free pe girna hi asli khatra hai.
]

== Prompt kaise bana hai

Model ko sirf do cheezein source ke roop mein milti hain: CV ke *editable nodes*
(bullets, summary, skill lines), aur *Story Bank* ke items jab woh bane.

Job post _source material nahi hai._ Ye jaan-boojh ke hai — advert employer ki
wish list hai, applicant ka itihaas nahi. Agar job post ko source maan lete toh
model employer ki maangi hui skills ko chupke se tumhare CV mein daal deta.

== Kya editable hai, kya nahi

Naam, employer, job title, dates — ye *facts* hain, prose nahi. Model ko ye
editable ke roop mein milte hi nahi. Isse fabrication ki ek poori category
prompt tak pahunchne se pehle khatam ho jaati hai: rewrite pass tumhe "Senior"
promote nahi kar sakta.

== Structured output

Har call Pydantic `response_schema` ke saath jaati hai, toh model prose nahi de
sakta jahan data chahiye. Har suggestion mein *provenance* field mandatory hai —
kaunsi line se aaya aur uska exact quote. Provenance na ho toh suggestion tum
tak pahunchti hi nahi.

== Speed aur cost

#datatable(
  ("", "Pehle", "Ab"),
  [Ek run], [117 s], [*\~11 s*],
  [Pehla card], [\~40 s], [*\~7 s*],
  [Cost], [\$0.070], [*\$0.015*],
)

Teen cheezon se: sections parallel chalte hain, thinking budget capped hai, aur
job post ab prompt mein _ek baar_ jaata hai — pehle parsed summary aur poora raw
advert dono ja rahe the, jisse CV ki 3–4 lines prompt mein dab jaati thin.

// ═══════════════════════════════════════════════════════════════════════
= No-fabrication validator

#kicker("04", "Product ka central claim")

Ye product ka central claim hai, isliye ise prompt pe nahi chhoda gaya. Prompt
ek _tendency_ deta hai; ye *guarantee* hai — deterministic Python jo model ke har
suggestion ko dobara check karta hai.

#v(10pt)

#layer("1", "Anchor", "Reject")[
  Line abhi bhi wahi kehti hai jo suggestion sochti hai? Warna tumne beech mein
  edit kiya — overwrite nahi hoga.
]

#layer("2", "Provenance", "Reject")[
  Cited source exist karta hai, aur uska quote sach mein usme milta hai? Jo apna
  kaam dikha na sake, woh nahi jaayega.
]

#layer("3", "Claims", "Reject")[
  Har figure, naam aur technical token pehle se tumhare material mein hona
  chahiye. Numbers pe sabse sakht — jo digit source mein nahi, woh hard block.
]

#layer("4", "Title loss", "Reject")[
  "Data Science Intern — CSC India:" bullet ke aage se nahi ud sakta. Woh batata
  hai kaam _kahan_ hua.
]

#layer("5", "Deletions", "Reject")[
  Skills line reorder ho sakti hai, kaat nahi sakti. Tum C++ ab bhi jaante ho,
  chahe ye advert usko na maange.
]

#layer("6", "Stuffing", "Reject")[
  Koi term score badhane ke liye baar-baar nahi aa sakta.
]

#layer("7", "Proportion aur vagueness", "Flag")[
  Line bahut lambi ho gayi = padding. Ya matlab wale shabd hata ke kuch add na
  kiya = dhundhla, tighter nahi.
]

#layer("8", "Dropped details", "Flag")[
  Employer ka naam ya koi number line se gayab hua toh tumhe dikhega — faisla
  tumhara.
]

#v(6pt)

Layers 1–6 *reject* karte hain kyunki woh sach naapte hain. 7–8 sirf *flag*
karte hain kyunki woh taste naapte hain — aur ek suggestion jo tum dekh ke khud
judge kar sako, woh chupke se hataye jaane se behtar hai.

== Asli output

Jaan-boojh ke \~20% match wali jodi: frontend developer ka CV, data engineer ki
job. JD Airflow, dbt, Kafka, Spark, Snowflake maangta hai — ek bhi CV mein nahi.

#panel[
```
COVERAGE  2 / 11
  has     SQL, Python
  missing Airflow, dbt, AWS, Spark, Kafka, Snowflake, BigQuery…

[1] TECHNICAL SKILLS
    Languages: JavaScript, TypeScript, Python, HTML5, CSS3
 →  Languages: Python, SQL, JavaScript, TypeScript, HTML5, CSS3

[2] WORK EXPERIENCE
 →  Built the internal pricing dashboard end to end, writing SQL…

[3] WORK EXPERIENCE
 →  Wrote a Python script for data quality, reconciling the…
──────────────────────────────────────────────────────
accepted=4  rejected=1 {dropped_skill: 1}  10.3s  $0.0104
FABRICATED TOOLS: none
```
]

Dhyan do: model ne skills line se PostgreSQL aur SQL _delete_ karne ki koshish
ki — validator ne roka. Aur Airflow/dbt/Kafka kahin nahi aaye, jabki JD unhi ko
maang raha tha. Yahi asli test hai.

// ═══════════════════════════════════════════════════════════════════════
= File formats ka jhanjhat

#kicker("05", "Format preservation")

Tumne kaha tha: jis format mein user de, usi mein wapas. Ye teen formats mein
*poori tarah* hota hai, aur PDF mein _lagbhag_.

#datatable(
  ("Format", "Fidelity", "Kaise"),
  raw(".docx"), [\~95%], [Run-level surgery — asli file hi edit hoti hai, styling untouched],
  raw(".tex"), [\~99%], [Source plain text hai — content patch, baaki sab waisa],
  raw(".txt / .md"), [100%], [Line span replacement],
  raw(".pdf"), [\~80% visual], [Style profile nikaal ke rebuild — edit nahi],
)

#note("PDF edit kyun nahi ho sakta", tone: "amber")[
  PDF ek _print_ format hai, document format nahi. Usme "paragraph" ya "sentence"
  hoti hi nahi — sirf "is (x,y) pe ye glyph draw karo". Text reflow ka concept
  hai hi nahi. Agar naya bullet purane se chaar shabd lamba hua, toh woh
  literally next line pe overlap karega ya cut jaayega.

  #v(5pt)
  Isliye PDF ke liye: har character ka font, size, colour aur position padh ke
  *style profile* banaya jaata hai, phir usi style mein naya PDF render hota
  hai. Original jaisa _dikhta_ hai, ATS-clean hota hai, aur aage se sach mein
  editable ho jaata hai. UI mein saaf likha jaata hai ki rebuild hua.
]

== Do cheezein jo genuinely mushkil thin

*Wrapped bullets.* Tumhare CV mein har bullet 3–4 lines pe wrap hota tha. Parser
har physical line ko alag node maan raha tha, isliye suggestions aadhe vaakyon
pe aati thin — "and performed model". Ab hanging indent detect hota hai, jo
full-stops ke aar-paar bhi kaam karta hai.

*Bullet glyphs jo hote hi nahi.* Ek test PDF mein 5 bullets banaye, sirf 4
glyphs extract hue — subset fonts mein dingbats aksar text layer mein aate hi
nahi. Jab glyph missing ho toh do alag bullets aur ek wrapped line bilkul ek
jaise dikhte hain.

// ═══════════════════════════════════════════════════════════════════════
= Tech stack

#kicker("06", "Har choice ka kaaran")

#datatable(
  ("Layer", "Choice", "Kyun yahi"),
  [Frontend], [Next.js 16 + React 19], [SEO landing + interactive app, ek codebase],
  [Styling], [Tailwind v4], [Design doc ke exact tokens theme layer mein],
  [3D], [React Three Fiber], [Landing page ka scroll narrative],
  [Backend], [FastAPI + Python 3.12], [Async SSE streaming, uploads, Pydantic],
  [Packages], [uv], [Tumhari requirement · lockfile, reproducible],
  [Database], [SQLite → Postgres], [Ek hi schema dono pe · Supabase pe sirf URL badlegi],
  [ORM], [SQLAlchemy 2.0 async], [Portable models, real migrations],
  [Auth], [Dev sign-in → Supabase], [Ek interface, do implementations],
  [LLM], [Gemini (google-genai)], [Pydantic response\_schema se structured output],
  [DOCX], [python-docx], [MIT · run-level in-place editing],
  [PDF read], [pdfminer.six], [MIT, pure Python · per-char font data],
  [PDF write], [Typst], [Ek self-contained wheel, koi system dependency nahi],
)

== Teen library decisions jo tumhari machine ne force kiye

Ye teeno "best practice" nahi hain — ye tumhare Intel Mac (macOS 12.7, 8 GB) pe
kaam karne ki wajah se hain, aur teeno verified hain.

- *pdfplumber → pdfminer.six* — pdfplumber `pypdfium2` laata hai jiske wheels
  macOS 13+ ke hain. Is machine pe install hi nahi hota.

- *WeasyPrint → Typst* — WeasyPrint ko system cairo/pango chahiye, aur Homebrew
  macOS 12 ke liye bottle ship nahi karta. Matlab ghanton ka source build. Typst
  ko kuch nahi chahiye.

- *`cryptography<49` pinned* — v49+ se upstream ne Intel macOS wheels band kar
  diye, sirf Apple Silicon bache.

Ek aur: *PyMuPDF jaan-boojh ke avoid kiya.* Sabse fast hai par AGPL v3 —
commercial product mein ya toh poora source open karna padta ya licence
khareedni padti.

// ═══════════════════════════════════════════════════════════════════════
= Kya bana, kya baaki

#kicker("07", "Status")

== Chal raha hai

#datatable(
  ("Feature", "Kya karta hai"),
  [Tailor loop], [Two-box drop, streaming change cards, one-tap apply, undo, apply-all],
  [Live preview], [CV side mein, badli hui line amber flash karke settle hoti hai],
  [Coverage meter], [Kaunse job terms cover hain, kaunse missing — imaandari se],
  [Format preserve], [5 formats, `.docx`/`.tex` byte-identical wapas],
  [Validator], [8 layers, har suggestion pe],
  [Library], [Frozen job post + jo CV bheja + change log · search, status, notes],
  [Anonymous first], [Bina account sab kuch · sign in pe kaam saath aata hai],
  [Erase everything], [Sach mein sab delete, kuch peeche nahi],
  [Landing page], [Scroll narrative, 3D paper jo har section ke saath badalta hai],
)

== Aage ka

#datatable(
  ("Feature", "Kyun matter karta hai"),
  [Story Bank], [Har achievement ek baar likho, tagged. Tailoring usse draw kare],
  [Recruiter-Ready Card], [Product ka signature — call ke liye ek screen],
  [Gap Coach], [Har missing requirement: bridge ho sakta hai, ya asli gap hai],
  [Interview questions], [Job post se predicted, answers Story Bank se],
  [Version history], [Har job ke liye kya badla, rollback],
  [Browser clipper], [Ek click mein job post seedha record mein],
  [Payments], [Tiers aur pricing page ban chuke, processing baaki],
)

#note("RAG kahan fit hota hai")[
  Core tailoring loop mein *nahi*. Ek CV 500 shabd ka hai, poora prompt mein aa
  jaata hai — retrieve karne ko kuch nahi. Ulta validator ko poora CV chahiye,
  aur agar retrieval aadha chhod de toh woh sach ko bhi "invented" bolne lagega.

  #v(5pt)
  *Story Bank* mein bilkul fit hota hai. Jab 200 achievements likhe honge tab sab
  prompt mein nahi bhej sakte — is job ke liye top 10 relevant nikalna exactly
  retrieval ka kaam hai. Yaani tumhari instinct sahi thi, bas timing aage hai.
]

// ═══════════════════════════════════════════════════════════════════════
= Chalane ka tarika

#kicker("08", "Setup")

Do terminal:

#panel[
```
# backend — http://localhost:8000
uv sync
uv run uvicorn aptly.main:app --reload --port 8000

# frontend — http://localhost:3000
cd frontend && npm run dev
```
]

`.env` mein sirf `GEMINI_API_KEY` chahiye. Database apne aap ban jaata hai —
SQLite file, koi setup nahi.

== Jab kuch galat lage

#panel[
```
grep -E "tailor.section|tailor.rejected" /tmp/aptly-api.log | tail -20
```
]

`tailor.section` batata hai har section ne kitne suggestions diye — _zero bhi_.
Aur `tailor.rejected` batata hai kya discard hua aur kyun. Yahi do lines project
ke aadhe bugs pakad chuki hain.

== Folder structure

#panel[
```
aptly/
├── backend/     FastAPI — parsers, LLM, validator, API + tests
├── frontend/    Next.js — landing, Tailor, Library
├── docs/        design doc + demo CV/JD pair
└── .env         tumhari key
```
]

// ═══════════════════════════════════════════════════════════════════════
= Imaandari se

#kicker("09", "Kya abhi nahi hai")

Kuch cheezein jo is doc mein saaf honi chahiye, warna ye brochure ban jaayega.

== Dev sign-in asli authentication nahi hai

Email leta hai, password nahi. `APTLY_ENV=production` pe chalne se saaf mana kar
deta hai. Uska kaam sirf itna tha ki Supabase aane se pehle Library ban aur test
ho sake.

== Tenancy app code mein enforce hoti hai

SQLite mein row-level security hoti hi nahi. Har query owner se filter karti
hai, aur test hai ki ek account doosre ka data na dekh sake. Par Supabase pe RLS
policies _bhi_ lagani chahiye — dusri line of defence ke roop mein.

== PDF rebuild byte-identical nahi hai

\~80% visual match hai. Achha hai, par agar tumhara CV bahut design-heavy hai toh
`.docx` dena behtar rahega.

== Payments abhi nahi hain

Pricing page aur tiers ban chuke hain, entitlements table ready hai — par koi
checkout nahi. Page pe bhi yahi likha hai, kyunki ek "Subscribe" button jo
chupke se kuch na kare, uska hona na hone se bura hai.

== Distribution alag kaam hai

Main product quality, speed aur trust bana sakta hoon. Log aayenge ya pay karenge
— uski guarantee nahi de sakta. SEO, Reddit, Product Hunt, LinkedIn — uska plan
alag se banega.

#v(16pt)
#line(length: 100%, stroke: 0.4pt + hairline)
#v(8pt)

#text(size: 9pt, fill: slate)[
  Sab kuch verified hai: 202 backend tests pass, lint clean, TypeScript clean,
  aur tailoring loop asli Gemini API ke against chal ke check kiya gaya.
]

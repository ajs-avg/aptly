# Test pair — a deliberate mismatch

Two files designed to test Aptly on a CV that does **not** fit the job well.

- `resume.txt` — Rahul Menon, a **frontend developer** (React, Next.js, CSS)
- `job-post.txt` — a **data engineer** role (Airflow, dbt, Kafka, Spark, Snowflake)

The overlap is real but narrow: he writes some Python, some SQL, and has built
one internal dashboard. Roughly a 20–30% match — the case that was reported as
producing nothing at all.

## How to run it

1. Open <http://localhost:3000/tailor>
2. Paste `job-post.txt` into the left box
3. Paste `resume.txt` into the right box
4. Press **Show me what to change**

## What correct behaviour looks like

**Coverage should read about 2/11.** It should find SQL and Python, and report
Airflow, dbt, AWS, Spark, Kafka, Snowflake, BigQuery, Redshift and dimensional
modelling as missing. A low score here is the honest answer, not a failure.

**You should get roughly 3–5 suggestions**, all of them working the same seam:
taking the data-shaped things Rahul genuinely did and making them legible to a
data team.

| Line | What a good suggestion does |
|---|---|
| The pricing dashboard bullet | Leads with the SQL and PostgreSQL work rather than the React interface |
| The Python reconciliation script | Frames it as the data-quality check it actually is |
| The `Languages:` skills line | Moves Python and SQL to the front — **without dropping** JavaScript, TypeScript, HTML5 or CSS3 |

**What must never happen:**

- Airflow, dbt, Kafka, Spark, Snowflake, BigQuery, Redshift or Terraform
  appearing anywhere in a suggestion. He has never touched them, and the advert
  asking for them is not evidence that he has.
- Any number changing. 4.1 seconds, 1.3, 8%, 22 people, 14 sites, 3 outages —
  all of these must survive exactly or not appear at all.
- A skills line coming back shorter than it went in.
- An employer or project name disappearing from the front of a bullet.

**Expect one or two rejections.** They are logged, and the count appears under
the change cards. On this pair the model reliably tries to "focus" a skills
line by deleting PostgreSQL and SQL, and gets stopped. That rejection is the
product working.

## If something looks wrong

The server log records the reason for every discarded suggestion:

```
grep -E "tailor.section|tailor.rejected" /tmp/aptly-api.log | tail -20
```

`tailor.section` shows how many suggestions each section returned, even when
that number is zero — which is the difference between "the model had nothing to
say" and "the section was never asked".

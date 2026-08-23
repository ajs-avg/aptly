/**
 * The browser's scorer must agree with the server's, case for case.
 *
 * `score.contract.json` is written by `backend/tests/analyse/test_scoring.py`
 * from the Python implementation, which is the reference. This replays it here.
 * If the two ever disagree, somebody would otherwise watch one number while
 * editing and be handed a different one on approval — and reasonably conclude
 * the whole figure is made up.
 *
 * Run with `npm test`. No framework: Node's own test runner, and Node 24 strips
 * the types on its own.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { canonical, evaluate, namesAny, type ScoreCard, type ScoreResult } from "./score.ts";

interface Contract {
  card: ScoreCard;
  cases: { name: string; text: string; expected: ScoreResult }[];
}

const contract: Contract = JSON.parse(
  readFileSync(new URL("./score.contract.json", import.meta.url), "utf-8"),
);

test("every contract case scores exactly as the server scored it", () => {
  for (const item of contract.cases) {
    const actual = evaluate(contract.card, item.text);

    assert.equal(
      actual.score,
      item.expected.score,
      `case "${item.name}": got ${actual.score}%, server said ${item.expected.score}%`,
    );

    for (const [index, expected] of item.expected.results.entries()) {
      const got = actual.results[index];
      assert.equal(
        got.status,
        expected.status,
        `case "${item.name}", rule ${expected.id}: got ${got.status}, server said ${expected.status}`,
      );
      assert.deepEqual(got.present, expected.present, `case "${item.name}", rule ${expected.id}`);
    }
  }
});

test("the baseline travels through untouched", () => {
  const result = evaluate(contract.card, contract.cases[0].text);
  assert.equal(result.baseline, contract.card.baseline);
});

test("folding keeps the characters that live inside product names", () => {
  // Dropping these turns C++ into C, .NET into net, and scikit-learn into two
  // separate words that no longer match the alias.
  assert.equal(canonical("C++, .NET and scikit-learn!"), "c++ .net and scikit-learn");
  assert.equal(canonical("  Python   3.12  "), "python 3.12");
});

test("matching is whole-token, which a substring search is not", () => {
  assert.equal(namesAny(canonical("Used NoSQL stores."), ["sql"]), false);
  assert.equal(namesAny(canonical("Strong SQL skills."), ["sql"]), true);
  assert.equal(namesAny(canonical("Wrote JavaScript."), ["java"]), false);
  assert.equal(namesAny(canonical("C++ and Java."), ["c++"]), true);
  // A hyphen is a boundary, so a compound still names the thing inside it.
  assert.equal(namesAny(canonical("Airflow-style scheduling."), ["airflow"]), true);
});

test("an empty card scores zero rather than dividing by zero", () => {
  const empty: ScoreCard = { rules: [], baseline: 0, semantic: true };
  assert.equal(evaluate(empty, "anything").score, 0);
});

/* ── The two-panel score ─────────────────────────────────────────────────── */

test("the server's figure is the anchor, and edits move it", () => {
  // Reproduces the bug the comparison screen had: scoring both panels with the
  // card alone showed the rebuilt CV at exactly the original's figure, because
  // its whole gain was on a judged requirement the card is blind to. The card
  // now measures *movement* from the text the server scored, not the total.
  const card = contract.card;
  const anchorText = "Wrote Python scripts.";
  const serverScore = 45; // what a full analysis said about that document

  const atAnchor = evaluate(card, anchorText).score;
  const afterEdit = evaluate(card, "Wrote Python and SQL against BigQuery.").score;

  const shown = serverScore + (afterEdit - atAnchor);

  assert.ok(afterEdit > atAnchor, "the edit should raise the card's own figure");
  assert.ok(shown > serverScore, "and so should raise the number on screen");
  assert.notEqual(shown, afterEdit, "but not by discarding what the server knew");
});

test("an unedited document shows the server's figure exactly", () => {
  // No edit, no movement. A panel that opened at a different number than the
  // reveal screen had just shown would read as two contradictory answers.
  const card = contract.card;
  const text = contract.cases[1].text;
  const serverScore = 45;

  const moved = evaluate(card, text).score - evaluate(card, text).score;
  assert.equal(serverScore + moved, serverScore);
});

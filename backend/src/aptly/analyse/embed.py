"""Semantic matching between what a job asks for and what a CV says.

The problem this solves is the one that made the product look broken: a CV and a
job post can agree substantially and share almost no *characters*. "Built
dashboards in Looker" answers "experience with BI tooling". "Led a team of four"
is "people management". A literal keyword scan reports none of that, so a
genuinely strong candidate saw a coverage meter reading 2/11 and concluded the
tool could not read.

The problem it must not create is the opposite one, and the first version of this
module walked straight into it. Measured against a real pair — a frontend CV and
a data-engineering post — it reported **100% coverage**. "Kafka or another
streaming platform" matched "Frameworks: React, Next.js, Redux, Tailwind CSS" at
0.756; "Hands-on Airflow" matched a list of frontend build tools at 0.785. Every
requirement passed, and the CV contained none of them.

Two things were wrong, and both are worth stating because they are the standard
way this goes wrong:

**Embedding space is anisotropic.** Vectors do not spread over the range a
cosine can express; they cluster in a narrow cone. Any two sentences about
software sit around 0.75-0.85 whether or not they are about the same software,
so an absolute threshold is measuring the topic, not the match. The fix is to
subtract the mean of the corpus before comparing, which recentres the cone on
the origin and gives the remaining spread back its meaning.

**A named technology is not a concept.** "Kafka" is a fact about a person's
history: either they have used it or they have not, and no amount of semantic
proximity to "Redux" changes that. Requirements that name specific tools are
therefore settled *literally*, and embeddings are not allowed to vote on them.
Embeddings decide the genuinely fuzzy requirements — "can troubleshoot
independently", "comfortable with ambiguity" — which is what they are good at.

No vector database and no numpy. The index is a few hundred vectors held for the
length of one request — the "temp vector" the whole thing needs to be. Vectors
are unit length, so a cosine is a dot product, and a dot product over 768 floats
via ``sum(map(mul, ...))`` runs in tens of microseconds.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from operator import mul

from aptly.llm.client import GeminiClient
from aptly.logging import get_logger

log = get_logger(__name__)

#: Cosine on **mean-centred** vectors, above which a line is worth showing the
#: person as a possible answer to a requirement.
#:
#: Chosen by measurement, not taste. Twenty-two hand-labelled requirement/CV
#: pairs across two CVs put the best single threshold at 0.225 — and, more
#: importantly, showed that positives (0.097-0.349) and negatives (0.078-0.222)
#: genuinely overlap. A single number cannot separate them, so this deliberately
#: does not try: a similarity match can raise a requirement to *partial* and
#: never to *covered*. "Here is a line that might answer this, look" is a claim
#: the number supports. "You cover this" is not.
SUGGESTIVE_AT = 0.22


@dataclass(frozen=True, slots=True)
class Match:
    """The best answer the CV has to one thing the job asked for."""

    id: str
    text: str
    score: float
    #: How far this beat the average entry in the index. Kept for diagnostics
    #: rather than used as a gate: after centring the mean sits near zero, so
    #: margin and score track each other and a second threshold on it would be
    #: the same threshold twice.
    margin: float = 0.0

    @property
    def suggestive(self) -> bool:
        return self.score >= SUGGESTIVE_AT


class SemanticIndex:
    """Mean-centred unit vectors keyed by node id, searched by dot product."""

    __slots__ = ("_centre", "_ids", "_texts", "_vectors")

    def __init__(
        self,
        ids: Sequence[str],
        texts: Sequence[str],
        vectors: Sequence[list[float]],
    ):
        if not (len(ids) == len(texts) == len(vectors)):
            raise ValueError("ids, texts and vectors must be the same length")
        self._ids = list(ids)
        self._texts = list(texts)
        self._centre = _mean(vectors)
        self._vectors = [_unit(_subtract(vector, self._centre)) for vector in vectors]

    def __len__(self) -> int:
        return len(self._ids)

    def best(self, query: list[float]) -> Match | None:
        """The closest entry, with how far it beat the rest of the index.

        The query is centred with the *index's* mean, not its own — the point is
        to place it in the same recentred space as the documents, and a single
        query has no mean of its own to speak of.
        """
        if not self._vectors or not query:
            return None

        centred = _unit(_subtract(query, self._centre))
        scores = [sum(map(mul, centred, vector)) for vector in self._vectors]

        best_at = max(range(len(scores)), key=scores.__getitem__)
        average = sum(scores) / len(scores)
        return Match(
            id=self._ids[best_at],
            text=self._texts[best_at],
            score=scores[best_at],
            margin=scores[best_at] - average,
        )

    def top(self, query: list[float], k: int) -> list[Match]:
        """The ``k`` closest entries, best first."""
        if not self._vectors or not query:
            return []
        centred = _unit(_subtract(query, self._centre))
        scores = [sum(map(mul, centred, vector)) for vector in self._vectors]
        average = sum(scores) / len(scores)
        ranked = sorted(
            (
                Match(self._ids[i], self._texts[i], score, score - average)
                for i, score in enumerate(scores)
            ),
            key=lambda match: match.score,
            reverse=True,
        )
        return ranked[:k]


async def build_index(
    entries: Sequence[tuple[str, str]],
    *,
    client: GeminiClient,
    purpose: str = "index",
) -> SemanticIndex:
    """Embed ``(id, text)`` pairs into a searchable index.

    Embedded as *documents* rather than for generic similarity. The retrieval
    task types are trained to separate relevant from irrelevant; the similarity
    task type is trained to say how alike two texts are, which for a CV and a
    job post is almost always "both about software" — the answer that produced
    the 100% coverage bug.

    Blank and near-blank texts are dropped rather than embedded: a two-character
    line carries no meaning, and its embedding is noise that can outrank a real
    match.
    """
    usable = [(node_id, text.strip()) for node_id, text in entries if len(text.strip()) >= 3]
    if not usable:
        return SemanticIndex([], [], [])

    vectors = await client.embed(
        [text for _, text in usable],
        task_type="RETRIEVAL_DOCUMENT",
        purpose=purpose,
    )
    return SemanticIndex(
        [node_id for node_id, _ in usable],
        [text for _, text in usable],
        vectors,
    )


async def embed_queries(
    texts: Sequence[str],
    *,
    client: GeminiClient,
    purpose: str = "queries",
) -> list[list[float]]:
    """Embed the job's requirements, in order, ready to search with."""
    if not texts:
        return []
    return await client.embed(list(texts), task_type="RETRIEVAL_QUERY", purpose=purpose)


# ═══════════════════════════════════════════════════════════════════════════
# Vector arithmetic
# ═══════════════════════════════════════════════════════════════════════════


def _mean(vectors: Sequence[list[float]]) -> list[float]:
    if not vectors:
        return []
    width = len(vectors[0])
    total = [0.0] * width
    for vector in vectors:
        for index, value in enumerate(vector):
            total[index] += value
    count = len(vectors)
    return [value / count for value in total]


def _subtract(vector: list[float], centre: list[float]) -> list[float]:
    if not centre:
        return vector
    return [value - centre[index] for index, value in enumerate(vector)]


def _unit(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0.0:
        return vector
    return [value / norm for value in vector]


__all__ = [
    "SUGGESTIVE_AT",
    "Match",
    "SemanticIndex",
    "build_index",
    "embed_queries",
]

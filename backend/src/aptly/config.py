"""Application settings.

One source of truth for configuration. Read from the environment, validated on
import, so a misconfigured deployment fails at startup rather than on the first
user request.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── environment ──────────────────────────────────────────────────────────
    env: Literal["development", "test", "production"] = Field(
        default="development", alias="APTLY_ENV"
    )
    log_level: str = Field(default="INFO", alias="APTLY_LOG_LEVEL")

    # ── Gemini ───────────────────────────────────────────────────────────────
    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    gemini_model_main: str = Field(default="gemini-3.7-flash", alias="GEMINI_MODEL_MAIN")
    gemini_model_fast: str = Field(default="gemini-3.5-flash-lite", alias="GEMINI_MODEL_FAST")

    #: Reading a PDF as pages of pixels rather than as a text stream. Multimodal,
    #: so it must be a vision-capable model — the fast model is not always one.
    gemini_model_vision: str = Field(default="", alias="GEMINI_MODEL_VISION")

    #: Embeddings back semantic coverage: "K8s" has to count as Kubernetes even
    #: though the two share no characters. 768 dimensions rather than the default
    #: 3072 because the whole index is a few hundred vectors held for the length
    #: of one request — a quarter of the arithmetic, no measurable loss of
    #: ranking quality at this scale, and no numpy dependency needed to make it
    #: fast enough.
    gemini_model_embed: str = Field(default="gemini-embedding-001", alias="GEMINI_MODEL_EMBED")
    embed_dimensions: int = Field(default=768, alias="APTLY_EMBED_DIMENSIONS")

    # ── Vertex AI ────────────────────────────────────────────────────────────
    # Same SDK as the Gemini API — only the client construction differs — so
    # every prompt, schema and retry path below is shared. Vertex authenticates
    # with Application Default Credentials (a service-account JSON named by
    # GOOGLE_APPLICATION_CREDENTIALS, or a gcloud login), never with an API key.
    llm_provider: Literal["gemini", "vertex"] = Field(default="gemini", alias="APTLY_LLM_PROVIDER")
    google_cloud_project: str = Field(default="", alias="GOOGLE_CLOUD_PROJECT")
    google_cloud_location: str = Field(default="us-central1", alias="GOOGLE_CLOUD_LOCATION")

    # Google's free tier trains on submitted data. CVs are personal data, so we
    # refuse to run against a free-tier key unless someone explicitly opts out.
    require_paid_llm: bool = Field(default=True, alias="APTLY_REQUIRE_PAID_LLM")

    # Reasoning tokens are billed as output and dominate latency: one section of
    # a CV was observed spending 30 seconds and 4,400 tokens, almost all of it
    # thinking. Tailoring is a bounded, well-specified edit task rather than a
    # puzzle, so a small budget buys most of the quality for a fraction of the
    # wait. -1 leaves the decision to the model; 0 turns thinking off.
    thinking_budget: int = Field(default=512, alias="APTLY_THINKING_BUDGET")

    # ── database ─────────────────────────────────────────────────────────────
    database_url: str = Field(default="", alias="DATABASE_URL")

    # ── supabase ─────────────────────────────────────────────────────────────
    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_anon_key: str = Field(default="", alias="SUPABASE_ANON_KEY")
    supabase_jwt_secret: str = Field(default="", alias="SUPABASE_JWT_SECRET")
    supabase_storage_bucket: str = Field(default="aptly-cvs", alias="SUPABASE_STORAGE_BUCKET")

    # ── frontend ─────────────────────────────────────────────────────────────
    cors_origins: str = Field(default="http://localhost:3000", alias="CORS_ORIGINS")

    # ── cost guardrails ──────────────────────────────────────────────────────
    daily_spend_ceiling_usd: float = Field(default=5.0, alias="APTLY_DAILY_SPEND_CEILING_USD")
    anon_tailors_per_day: int = Field(default=3, alias="APTLY_ANON_TAILORS_PER_DAY")
    max_upload_mb: int = Field(default=5, alias="APTLY_MAX_UPLOAD_MB")

    #: Where the SQLite file lives when no DATABASE_URL is configured.
    sqlite_path: str = Field(default="aptly.db", alias="APTLY_SQLITE_PATH")

    # ── vision fallback ──────────────────────────────────────────────────────
    # Reading a PDF's pixels costs roughly ten times what reading its text
    # stream costs, so it is a fallback and not the default path. It runs when
    # the ordinary parser's own confidence score comes in under this threshold —
    # a scanned CV, a broken font encoding, a layout that shredded into
    # fragments. Set to 0 to disable the fallback entirely.
    vision_fallback_below: float = Field(default=0.62, alias="APTLY_VISION_FALLBACK_BELOW")

    @property
    def resolved_vision_model(self) -> str:
        return self.gemini_model_vision or self.gemini_model_main

    @property
    def uses_vertex(self) -> bool:
        return self.llm_provider == "vertex"

    @field_validator("database_url")
    @classmethod
    def _async_driver(cls, v: str) -> str:
        """Add the async driver the URL is missing.

        Supabase hands out ``postgresql://`` and people paste ``sqlite:///``;
        SQLAlchemy's async engine needs the driver named explicitly in both.
        """
        if v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        if v.startswith("sqlite://") and "+aiosqlite" not in v:
            return v.replace("sqlite://", "sqlite+aiosqlite://", 1)
        return v

    @property
    def resolved_database_url(self) -> str:
        """The database to use, falling back to a local file.

        Defaulting to SQLite means the app runs — records, Library and all —
        with no account anywhere and no network. Pointing DATABASE_URL at
        Supabase later changes nothing else: the models are portable, and
        tenancy is enforced in application code rather than by Postgres
        row-level security, so it behaves the same on both.
        """
        return self.database_url or f"sqlite+aiosqlite:///{self.sqlite_path}"

    @property
    def is_sqlite(self) -> bool:
        return self.resolved_database_url.startswith("sqlite")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def is_production(self) -> bool:
        return self.env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]

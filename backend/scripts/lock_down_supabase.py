"""Close Supabase's REST API over Aptly's tables.

Supabase publishes every table in the ``public`` schema through PostgREST, and
grants the ``anon`` and ``authenticated`` roles full access to them by default.
The anon key that authorises those requests is *meant* to be public — it ships
inside the frontend bundle, where anybody can read it.

That combination means that without row-level security, this is enough to read
every user's job records, CVs and career profiles — and to delete them:

    curl https://<project>.supabase.co/rest/v1/job_records -H "apikey: <anon key>"

Aptly does not use PostgREST at all. Every read and write goes through the API,
which connects as the table owner and filters every query by owner id. So the
correct posture is not "write policies for PostgREST" — it is to close that door
entirely and leave the API as the only way in.

This script does two things, either of which would be sufficient and both of
which are cheap:

1. **Enables row-level security with no policies.** Deny by default. The table
   owner bypasses RLS, so the API is unaffected; every other role gets nothing.
2. **Revokes the grants**, including the default privileges that would
   re-grant them on any table created later.

Run it once after creating the schema, and again after adding a table:

    DATABASE_URL=... uv run python backend/scripts/lock_down_supabase.py
"""

from __future__ import annotations

import asyncio
import sys

from aptly.db.models import Base
from aptly.db.session import get_engine
from sqlalchemy import text

#: The roles PostgREST authenticates as. `service_role` is deliberately left
#: alone: it is a server-side secret, it bypasses RLS by design, and revoking
#: its access would break the Supabase dashboard's own table editor.
_PUBLIC_ROLES = ("anon", "authenticated")


async def main() -> int:
    tables = sorted(Base.metadata.tables)
    engine = get_engine()

    async with engine.begin() as conn:
        for table in tables:
            # No policies follow. RLS with none is a closed door, and the table
            # owner — which is what the API connects as — is not subject to it.
            await conn.execute(text(f'ALTER TABLE public."{table}" ENABLE ROW LEVEL SECURITY'))

        for role in _PUBLIC_ROLES:
            await conn.execute(text(f"REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {role}"))
            await conn.execute(text(f"REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM {role}"))
            # Without this, the next table created is granted all over again.
            await conn.execute(
                text(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM {role}")
            )

    async with engine.connect() as conn:
        rows = (
            await conn.execute(
                text("""
                    select c.relname,
                           c.relrowsecurity,
                           (select count(*) from information_schema.role_table_grants g
                             where g.table_schema = 'public'
                               and g.table_name = c.relname
                               and g.grantee in ('anon', 'authenticated')) as grants
                    from pg_class c
                    join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relkind = 'r'
                    order by c.relname
                """)
            )
        ).all()

        print(f"{'table':22} {'RLS':6} grants to anon/authenticated")
        wrong = 0
        for name, rls, grants in rows:
            ok = rls and grants == 0
            wrong += not ok
            print(f"{name:22} {'ON' if rls else 'OFF':6} {grants}{'' if ok else '   ← still open'}")

    await engine.dispose()

    if wrong:
        print(f"\n{wrong} table(s) still reachable. Nothing here is safe to ship.")
        return 1

    print("\nEvery table is closed to PostgREST. The API is the only way in.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

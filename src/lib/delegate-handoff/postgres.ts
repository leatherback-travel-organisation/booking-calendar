import "server-only";

import { getSql } from "@/lib/db/neon";
import type { DelegateEmail } from "./model";

type SessionRow = {
  id: string;
  delegate_email: string;
  delegate_name: string;
  state: "awaiting_codex" | "awaiting_delegate" | "access_ready" | "blocked";
  expires_at: Date | string;
};

type MessageRow = {
  id: number | string;
  body: string;
  created_at: Date | string;
};

function iso(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Delegate handoff timestamp is invalid.");
  return date.toISOString();
}

export async function activateDelegateSession(input: {
  email: DelegateEmail;
  name: string;
  tokenHash: string;
  message: string;
}) {
  const rows = await getSql()`with session as (
      insert into delegate_agent_sessions (
        delegate_email, delegate_name, session_token_hash, state, activated_at, expires_at, last_seen_at
      ) values (
        ${input.email}, ${input.name}, ${input.tokenHash}, 'awaiting_codex', now(), now() + interval '24 hours', now()
      )
      on conflict (delegate_email) do update set
        delegate_name = excluded.delegate_name,
        session_token_hash = excluded.session_token_hash,
        state = 'awaiting_codex',
        activated_at = now(),
        expires_at = now() + interval '24 hours',
        last_seen_at = now()
      returning id, delegate_email, delegate_name, state, expires_at
    ), inbound as (
      insert into delegate_agent_messages (session_id, direction, body)
      select id, 'delegate_to_codex', ${input.message} from session
    )
    select * from session` as SessionRow[];
  const session = rows[0];
  if (!session) throw new Error("Delegate session was not created.");
  return { ...session, expires_at: iso(session.expires_at) };
}

export async function findDelegateSessionByTokenHash(hash: string) {
  const rows = await getSql()`select id, delegate_email, delegate_name, state, expires_at
    from delegate_agent_sessions
    where session_token_hash = ${hash} and expires_at > now()
    limit 1` as SessionRow[];
  const session = rows[0];
  if (!session) return null;
  await getSql()`update delegate_agent_sessions set last_seen_at = now() where id = ${session.id}::uuid`;
  return { ...session, expires_at: iso(session.expires_at) };
}

export async function addDelegateInboundMessage(sessionId: string, message: string) {
  await getSql()`with updated as (
      update delegate_agent_sessions
      set state = 'awaiting_codex', last_seen_at = now()
      where id = ${sessionId}::uuid and expires_at > now()
      returning id
    )
    insert into delegate_agent_messages (session_id, direction, body)
    select id, 'delegate_to_codex', ${message} from updated`;
}

export async function listDelegateOutboundMessages(sessionId: string, afterId: number) {
  const rows = await getSql()`select id, body, created_at
    from delegate_agent_messages
    where session_id = ${sessionId}::uuid
      and direction = 'codex_to_delegate'
      and id > ${afterId}
    order by id
    limit 50` as MessageRow[];
  return rows.map((row) => ({
    id: Number(row.id),
    message: row.body,
    createdAt: iso(row.created_at),
  }));
}

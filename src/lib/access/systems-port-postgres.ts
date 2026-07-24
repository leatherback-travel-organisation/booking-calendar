import "server-only";

import { getSql } from "@/lib/db/neon";
import {
  parseActiveCovePeopleRows,
  type ActiveCovePerson,
} from "./systems-port-model";

type Row = Record<string, unknown>;

export async function getPostgresActiveCovePeopleForSystems(): Promise<readonly ActiveCovePerson[]> {
  const rows = await getSql()`select
      u.id as user_id,
      u.display_name,
      u.email as verified_email,
      eligibility.identity_verified,
      case when eligibility.identity_verified then 'active' else 'invited' end as directory_status
    from users u
    cross join lateral (
      select exists (
        select 1 from identities i
        where i.user_id = u.id and i.email_verified_at is not null
      ) as identity_verified
    ) eligibility
    where u.population = 'employee'
      and u.status = 'active'
      and is_approved_cove_employee(u.id)
    order by u.display_name, u.email` as Row[];
  return parseActiveCovePeopleRows(rows);
}

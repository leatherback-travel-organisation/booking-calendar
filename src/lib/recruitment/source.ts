export type RecruitmentSourceRecord = {
  id: string;
  createdTime?: string;
  fields: Record<string, unknown>;
};

export type RecruitmentSourcePage = {
  records?: RecruitmentSourceRecord[];
  offset?: string;
};

export function recruitmentPageQuery(fields: readonly string[], offset?: string) {
  const query = new URLSearchParams({ pageSize: "100" });
  for (const field of fields) query.append("fields[]", field);
  query.append("sort[0][field]", "Last Updated");
  query.append("sort[0][direction]", "desc");
  if (offset) query.set("offset", offset);
  return query;
}

export async function collectAllRecruitmentRecords(
  readPage: (offset?: string) => Promise<RecruitmentSourcePage>,
) {
  const records: RecruitmentSourceRecord[] = [];
  const seenOffsets = new Set<string>();
  let offset: string | undefined;

  do {
    const page = await readPage(offset);
    records.push(...(page.records ?? []));
    const nextOffset = page.offset;
    if (nextOffset) {
      if (seenOffsets.has(nextOffset)) {
        throw new Error("Recruitment source returned a repeated pagination cursor.");
      }
      seenOffsets.add(nextOffset);
    }
    offset = nextOffset;
  } while (offset);

  return records;
}

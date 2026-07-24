import assert from "node:assert/strict";
import test from "node:test";
import {
  collectAllRecruitmentRecords,
  recruitmentPageQuery,
} from "./source.ts";

function records(start, count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `rec${start + index}`,
    fields: { Name: `Candidate ${start + index}` },
  }));
}

test("candidate query requests every page without status or record caps", () => {
  const query = recruitmentPageQuery(["Name", "Status"], "next-page");
  assert.equal(query.get("pageSize"), "100");
  assert.equal(query.get("offset"), "next-page");
  assert.equal(query.get("maxRecords"), null);
  assert.equal(query.get("filterByFormula"), null);
  assert.deepEqual(query.getAll("fields[]"), ["Name", "Status"]);
});

test("candidate pagination keeps every record across more than 250 rows", async () => {
  const pages = new Map([
    [undefined, { records: records(0, 100), offset: "page-2" }],
    ["page-2", { records: records(100, 100), offset: "page-3" }],
    ["page-3", { records: records(200, 75) }],
  ]);

  const result = await collectAllRecruitmentRecords(async (offset) => pages.get(offset));
  assert.equal(result.length, 275);
  assert.equal(new Set(result.map((record) => record.id)).size, 275);
});

test("candidate pagination fails closed on a repeated cursor", async () => {
  await assert.rejects(
    collectAllRecruitmentRecords(async () => ({ records: [], offset: "same-page" })),
    /repeated pagination cursor/,
  );
});

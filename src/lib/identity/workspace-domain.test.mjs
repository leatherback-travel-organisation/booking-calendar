import assert from "node:assert/strict";
import test from "node:test";

import { workspaceDomainForEmail } from "./workspace-domain.ts";

test("accepts team members from any Google Workspace domain", () => {
  assert.equal(
    workspaceDomainForEmail(" Person@Partner-Group.example "),
    "partner-group.example",
  );
});

test("rejects malformed email addresses", () => {
  assert.throws(() => workspaceDomainForEmail("not-an-email"), /valid work email/);
});

import assert from "node:assert/strict";
import test from "node:test";

import { ensureClerkTeamUser } from "./clerk-provisioning.ts";

test("creates a passwordless Clerk account for any approved work domain", async () => {
  const creates = [];
  const client = {
    users: {
      async getUserList() {
        return { data: [] };
      },
      async createUser(input) {
        creates.push(input);
        return { id: "user_new" };
      },
    },
  };

  const result = await ensureClerkTeamUser(client, {
    name: "Madilyn Forster",
    email: "Madilyn@CaminoWomen.com.au",
  });

  assert.deepEqual(result, { userId: "user_new", created: true });
  assert.deepEqual(creates, [{
    emailAddress: ["madilyn@caminowomen.com.au"],
    firstName: "Madilyn",
    lastName: "Forster",
    skipPasswordRequirement: true,
  }]);
});

test("reuses an existing Clerk account without creating another one", async () => {
  let createCalls = 0;
  const client = {
    users: {
      async getUserList() {
        return { data: [{ id: "user_existing" }] };
      },
      async createUser() {
        createCalls += 1;
        return { id: "unused" };
      },
    },
  };

  assert.deepEqual(
    await ensureClerkTeamUser(client, {
      name: "Existing Person",
      email: "person@example.com",
    }),
    { userId: "user_existing", created: false },
  );
  assert.equal(createCalls, 0);
});

test("recovers when another request creates the same account first", async () => {
  let reads = 0;
  const client = {
    users: {
      async getUserList() {
        reads += 1;
        return { data: reads === 1 ? [] : [{ id: "user_race_winner" }] };
      },
      async createUser() {
        throw new Error("identifier already exists");
      },
    },
  };

  assert.deepEqual(
    await ensureClerkTeamUser(client, {
      name: "Concurrent Person",
      email: "person@another.example",
    }),
    { userId: "user_race_winner", created: false },
  );
});

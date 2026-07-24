import assert from "node:assert/strict";
import test from "node:test";
import {
  CoveSignedOutError,
  CoveUnauthorizedError,
  requireCoveAccess,
  withCoveRouteAccess,
  withCoveServerActionAccess,
} from "../src/server.js";

const grant = {
  allowed: true,
  application: { id: "123e4567-e89b-42d3-a456-426614174000", slug: "money", name: "Money" },
  user: { id: "cove-user-1" },
  role: "admin",
  permissions: ["money:read"],
  checkedAt: "2026-07-16T12:00:00.000Z",
};

function signedIn(token = "current-session-token") {
  return async () => ({
    userId: "clerk-user-1",
    getToken: async () => token,
    redirectToSignIn: () => { throw new Error("not used"); },
  });
}

test("requireCoveAccess posts the server token only in Authorization", async () => {
  let observed;
  const access = await requireCoveAccess({ applicationSlug: "money" }, "user", {
    auth: signedIn(),
    accessApiUrl: "https://lbcove.vercel.app/api/cove/access",
    fetch: async (url, init) => {
      observed = { url, init };
      return Response.json(grant);
    },
  });

  assert.equal(access.role, "admin");
  assert.equal(observed.url, "https://lbcove.vercel.app/api/cove/access");
  assert.equal(observed.init.method, "POST");
  assert.equal(observed.init.headers.authorization, "Bearer current-session-token");
  assert.deepEqual(JSON.parse(observed.init.body), { applicationSlug: "money", requiredRole: "user" });
  assert.equal(observed.url.includes("current-session-token"), false);
  assert.equal(observed.init.body.includes("current-session-token"), false);
  assert.equal(observed.init.cache, "no-store");
});

test("signed-out access fails before contacting Cove", async () => {
  let contacted = false;
  await assert.rejects(
    requireCoveAccess("money", "user", {
      auth: async () => ({ userId: null, getToken: async () => null }),
      accessApiUrl: "https://lbcove.vercel.app/api/cove/access",
      fetch: async () => { contacted = true; },
    }),
    CoveSignedOutError,
  );
  assert.equal(contacted, false);
});

test("canonical denial rejects an old but still-present Clerk session", async () => {
  await assert.rejects(
    requireCoveAccess("money", "user", {
      auth: signedIn("old-session-token"),
      accessApiUrl: "https://lbcove.vercel.app/api/cove/access",
      fetch: async () => Response.json({ allowed: false, code: "access_denied", message: "Access was revoked." }, { status: 403 }),
    }),
    (error) => error instanceof CoveUnauthorizedError && error.message === "Access was revoked.",
  );
});

test("route and Server Action wrappers check access inside every invocation", async () => {
  let checks = 0;
  const options = {
    auth: signedIn(),
    accessApiUrl: "https://lbcove.vercel.app/api/cove/access",
    fetch: async () => { checks += 1; return Response.json(grant); },
  };
  const route = withCoveRouteAccess("money", "user", async (_request, _context, access) => Response.json({ role: access.role }), options);
  const action = withCoveServerActionAccess("money", "admin", async (access, value) => `${access.user.id}:${value}`, options);

  assert.deepEqual(await (await route(new Request("https://app.example/api"), {})).json(), { role: "admin" });
  assert.equal(await action("changed"), "cove-user-1:changed");
  assert.equal(checks, 2);
});

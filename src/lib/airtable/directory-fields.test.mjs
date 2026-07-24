import assert from "node:assert/strict";
import test from "node:test";
import { directoryBrands, directoryRole, directoryTeam } from "./directory-fields.ts";

test("directory role accepts Airtable lookup arrays and named selections", () => {
  assert.equal(directoryRole({ "Position description": ["Booking Manager"] }), "Booking Manager");
  assert.equal(directoryRole({ Role: [{ name: "Senior Operations Lead" }] }), "Senior Operations Lead");
});

test("directory role ignores linked record ids and continues to a readable lookup", () => {
  assert.equal(directoryRole({ Role: ["rec0123456789ABC"], "Role Name": ["Booking Manager"] }), "Booking Manager");
});

test("directory fields keep teams and brands separate", () => {
  const fields = {
    Team: "Aussie Team",
    Brands: ["Patch Adventures", { name: "Salemi Ceramics" }],
    "Team Overview per Brands": ["rec0123456789ABC"],
  };

  assert.equal(directoryTeam(fields), "Aussie Team");
  assert.deepEqual(directoryBrands(fields), ["Patch Adventures", "Salemi Ceramics"]);
});

test("directory brands find readable lookup fields without exposing record ids", () => {
  assert.deepEqual(directoryBrands({
    "Brands (lookup)": ["Patch Adventures", "rec0123456789ABC", "Patch Adventures"],
  }), ["Patch Adventures"]);
});

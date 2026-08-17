import assert from "node:assert/strict";
import test from "node:test";
import { parseTourUrl, slugKey } from "./slug.ts";

test("slugKey normalises ampersands, accents, apostrophes and punctuation", () => {
  assert.equal(slugKey("Algeria & Tunisia"), "algeria-and-tunisia");
  assert.equal(slugKey("Türkiye Culture & Aegean Coastlines"), "turkiye-culture-and-aegean-coastlines");
  assert.equal(slugKey("Japan's Ancient Pathways"), "japans-ancient-pathways");
  assert.equal(slugKey("Wander & Wine: Armenia & Georgia 16 Days"), "wander-and-wine-armenia-and-georgia-16-days");
  assert.equal(slugKey("  --Weird -- input--  "), "weird-input");
});

test("slugKey is idempotent on already-normalised slugs", () => {
  assert.equal(slugKey("fifteen-day-morocco-adventure"), "fifteen-day-morocco-adventure");
});

test("parseTourUrl handles real Airtable Website URL shapes", () => {
  assert.deepEqual(parseTourUrl("https://patchadventures.com.au/tour/fifteen-day-morocco-adventure/"), {
    host: "patchadventures.com.au",
    slug: "fifteen-day-morocco-adventure",
  });
  // Stray leading whitespace occurs in the real data.
  assert.deepEqual(parseTourUrl(" https://magnificentexplorers.com.au/tour/sumatra-and-java/"), {
    host: "magnificentexplorers.com.au",
    slug: "sumatra-and-java",
  });
  // www. is stripped so host matching stays stable.
  assert.deepEqual(parseTourUrl("https://www.magnificentexplorers.com.au/tour/balkans/"), {
    host: "magnificentexplorers.com.au",
    slug: "balkans",
  });
  // Missing protocol tolerated.
  assert.deepEqual(parseTourUrl("caminowomen.com.au/tour/greek-islands"), {
    host: "caminowomen.com.au",
    slug: "greek-islands",
  });
  // WeTravel-style hosts still parse; the last segment is the slug.
  assert.deepEqual(parseTourUrl("https://saltcaravan.wetravel.com/trips/morocco-123"), {
    host: "saltcaravan.wetravel.com",
    slug: "morocco-123",
  });
});

test("parseTourUrl rejects garbage without throwing", () => {
  assert.equal(parseTourUrl("www.na"), null);
  assert.equal(parseTourUrl(""), null);
  assert.equal(parseTourUrl(null), null);
  assert.equal(parseTourUrl(undefined), null);
  assert.equal(parseTourUrl("https://patchadventures.com.au/"), null);
  assert.equal(parseTourUrl("https://patchadventures.com.au/tour/"), null);
  assert.equal(parseTourUrl("not a url at all %%%"), null);
});

# AT Protocol Weekend Hackathon — Updated Scope

Addendum to `pantryhost-atproto-hack.docx.md`. Incorporates the
`exchange.recipe.collection` lexicon (menus), import attribution
requirements, and AT URI paste-import via the existing URL textarea.

## Weekend Scope (Updated)

### Export

- **Recipe → `exchange.recipe.recipe`**: map Pantry Host recipe schema
  to lexicon, publish to user's PDS via `@atproto/api`
- **Menu → `exchange.recipe.collection`**: publish each recipe first,
  then publish a collection record with `strongRef` pointers to each.
  Maps `name` → menu title, `text` → menu description, `recipes[]` →
  array of recipe AT URI + CID pairs
- **Auth**: app password flow (not OAuth for v1)
- **Share UI**: copy AT URI, optionally post a Bluesky skeet
- **Re-share attribution**: when sharing an imported recipe, use the
  lexicon's `attribution` union with `adaptedFrom` pointing to the
  original AT URI — never re-publish the original author's record as
  your own

### Import

- **AT URI paste**: extend the existing "paste URLs" textarea on
  `/recipes/import` to recognize `at://` URIs alongside `https://`
- **Mixed paste**: a single paste can contain `https://`, `at://`
  recipe URIs, and `at://` collection URIs — all processed in one batch
- **Recipe import**: fetch `exchange.recipe.recipe` by AT URI from the
  author's PDS (no auth required — public records), map to Pantry Host
  schema
- **Collection import**: fetch `exchange.recipe.collection`, resolve
  each `strongRef`, import all referenced recipes, create a Pantry Host
  menu linking them
- **Claude-assisted ingredient parsing**: normalize flat ingredient
  strings ("2 cups flour, sifted") into structured quantity/unit/name
- **Idempotency**: existing 60-second `createRecipe` guard applies

### Attribution & Provenance (5 requirements)

These are not optional polish — they're core to being a good AT
Protocol citizen.

#### 1. Store the AT URI as `sourceUrl`

Every imported recipe stores `sourceUrl = at://did:plc:xyz/exchange.recipe.recipe/rkey`.
This is the same field used for recipe-api.com and other import
sources. The AT URI is the canonical address of the original record.

For collections, the menu gets a `sourceUrl` pointing to the
collection's AT URI. Each recipe within it also gets its own
`sourceUrl`.

#### 2. Display attribution prominently

Imported Bluesky recipes show "Shared by @handle on Bluesky" on the
recipe detail page — not buried in metadata, but visible near the
title. Resolve the DID to a handle via `@atproto/api`'s
`resolveHandle` (or cache from import time).

The `exchange.recipe.recipe` lexicon has an `attribution` field
with structured author info — use it when available.

Tag imported recipes with `bluesky` so they're filterable.

#### 3. Imported, not mirrored

The UI must make clear this is a **local copy**, not a live reference.
Visual treatment: "Imported from Bluesky" badge on the recipe card
and detail page, same pattern as the existing `recipe-api` tag.

If the user edits the recipe locally, it's their fork — the
`sourceUrl` still points to the original for provenance, but the
content has diverged.

#### 4. Re-share with attribution, not re-publish

When a user imports a recipe and later shares it to Bluesky:
- Publish as a **new record** on the user's own PDS
- Set the `attribution` field to `adaptedFrom` with the original
  AT URI — not `originalAuthor` (that would claim someone else's
  authorship)
- This creates a proper fork chain in the AT Protocol graph

Never re-publish the original author's record verbatim as the
importing user's record.

#### 5. "Check source" affordance (weekend stretch / v2)

On the recipe detail page, the `sourceUrl` link for Bluesky imports
resolves the original AT URI. If the record has been deleted (PDS
returns 404 or `RecordNotFound`), show a subtle "Original no longer
available" note rather than a broken link.

**Weekend scope**: just link to the AT URI. The 404-detection is a
stretch goal — if time permits, add a `useEffect` that pings the
PDS on page load and updates a status indicator. Otherwise defer
to v2.

## Deferred (unchanged)

- Browse recipe.exchange community from import UI (new tab)
- Full OAuth 2.0 flow
- Contributing structured ingredient type back to the lexicon
- Feed generator collaboration with Josh @joshhuckabee.com
- Sub-recipe and cookware lexicon extensions

## Field Mapping — `exchange.recipe.collection`

| Lexicon field | Pantry Host field |
|---|---|
| `name` (string, max 100) | menu title |
| `text` (string, max 1000) | menu description |
| `recipes` (array of `strongRef`) | menu_recipes → AT URIs of recipe records |
| `createdAt` | created_at |
| `updatedAt` | updated_at |

## Example Collection Record

```json
{
  "name": "Christmas Brunch with the Family",
  "text": "The perfect blend of sweet, savory, and comforting flavors.",
  "$type": "exchange.recipe.collection",
  "recipes": [
    {
      "cid": "01JFJKBDGHYWCRVX8E244TMEPW",
      "uri": "at://did:plc:4cx7ts7lqgjtsfquo53qo3sz/exchange.recipe.recipe/01JFJKBDGHYWCRVX8E244TMEPW"
    },
    {
      "cid": "01JFMVF3T6RJZEWRSEPR1XG2W6",
      "uri": "at://did:plc:iwtmkowtwqwjumuk22qhvoqc/exchange.recipe.recipe/01JFMVF3T6RJZEWRSEPR1XG2W6"
    }
  ],
  "createdAt": "2024-12-21T14:19:00Z"
}
```

Note: collections can reference recipes from **different users'
PDSes** — a collection curates across the network, not just the
author's own recipes.

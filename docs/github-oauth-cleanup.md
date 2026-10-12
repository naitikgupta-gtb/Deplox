# GitHub OAuth App cleanup

## Why

When we built DEPLOX, two OAuth apps were created:

| Client ID | Owner | Status | Use |
|-----------|-------|--------|-----|
| `Ov23liKruWtpUuqi2Zko` | **deploxhq** (org) | ✅ **Active** | This is what production uses. Keep. |
| `Ov23liOcqU4VIHPZBu5w` | Personal `naitikgupta-gtb` | ⚠️ **Stale** | Created during initial prototyping. No longer used anywhere. Delete. |

The stale one is a hygiene issue — if it ever leaks (e.g. shows up in an old commit, screenshot, or training data), it would be a fake path to a working app. Better to delete.

## How to delete

1. Open <https://github.com/settings/applications> (signed in as `naitikgupta-gtb`)
2. Find **DEPLOX** in the "Authorized OAuth Apps" tab → click it
3. Click the green **Revoke** button on the right
4. Open <https://github.com/settings/developers> (still as personal account)
5. Under "OAuth Apps" find the entry whose Client ID is `Ov23liOcqU4VIHPZBu5w`
6. Click **Delete** → confirm

## After deleting

- [ ] No other deplox config or script references the old Client ID
  ```bash
  git grep -nE 'Ov23liOcqU4VIHPZBu5w' .
  # expected: 0 matches
  ```
- [ ] The current `.env` at repo root still has the **active** client only:
  ```
  GITHUB_OAUTH_CLIENT_ID=Ov23liKruWtpUuqi2Zko
  GITHUB_OAUTH_CLIENT_SECRET=<redacted>
  ```
- [ ] Production login (https://deplox.site → "Log in with GitHub") still works (it uses the deploxhq one, not the personal one)

## Why we still have an org-owned app

Per the deploxhq-org rebrand commit (`eb184fb`), production uses the **deploxhq** org's OAuth app. That makes the deploxhq → DEPLOX app relationship canonical and survives any individual contributor leaving. The personal-account app was the original prototype and has been replaced.

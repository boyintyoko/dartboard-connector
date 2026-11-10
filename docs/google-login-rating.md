# Google login and reference rating

## Deployment configuration

Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` on the Render service. The key must be a `sb_publishable_…` key (or a legacy JWT with role `anon`). Never use a service-role key. `/api/auth-config` returns only this public configuration at runtime.

Apply `supabase/schema.sql` once to the selected project, then verify the table, policies and authenticated/anonymous grants. The table stores only the signed-in owner's result. No opponent names, email addresses or Google tokens are stored in it. Client-submitted scores are personal reference records, not server-verified competitive ratings.

Enable Google in Supabase Auth. Google Cloud needs an OAuth Web client with callback `https://<project-ref>.supabase.co/auth/v1/callback`. Set the Client ID/Secret in Supabase's Google provider settings. Set Site URL to `https://darts-room-match.onrender.com` and permit `https://darts-room-match.onrender.com/` as a redirect. Add localhost only for development. Never commit Google secrets.

## Statistics

Each completed eligible leg has a stable UUID plus leg index. Insertions ignore duplicate IDs. Failed uploads are queued in this browser under the signed-in user ID and retried explicitly; navigating home does not cancel the queue. The account active at game creation owns the local P1 result, or the player's assigned online seat. Guest games, CPU opponents, solo games, practice and split-bull 01 do not affect rating. An unfinished game has no completed record. Undo cannot cross a completed leg boundary.

Statistics count whole player visits. 01 freezes the current and preceding players' accumulated visit averages at the end of the visit when any player reaches 20% or less of the initial score. Cricket freezes when any player has closed six numbers. Later players' unplayed visits are excluded. Misses count, invalid/closed cricket areas don't add marks, bust points are removed. Match legs reset counters while preserving completed results.

The last 30 eligible results are averaged separately by mode. Each average maps to the published DARTSLIVE 1–18 thresholds; their two levels are averaged. At least ten total results and both categories are needed. This is explicitly labelled a reference rating: DARTSLIVE's proprietary weighting cannot be reproduced exactly.

Source: https://dlservicehelp.dartslive.com/hc/ja/articles/360058145813

## Hosted project

Project: `darts-room` (`qvtscshjtxvidnpfssuj`), Tokyo, in `boyintyoko's Org`. Created with a $0/month project quote. API URL and publishable key are configured on Render; no service-role key is exposed. The `create_darts_game_results` migration is applied remotely.

Verified with two temporary test users inside a rolled-back transaction: own insert/read, duplicate-ignore inserts, other-user read denial, other-user insert denial, anonymous read denial. All passed. Security advisors returned no findings. Test data was rolled back.

Google is not enabled yet. Google Cloud Client ID/Secret and Supabase Site URL/redirects still need dashboard setup. The application checks provider readiness and keeps the login button disabled until the provider is enabled.

## Verification pending Google setup

Test real Google sign-in and callback, logout, result persistence, repeat insertion, user A/user B isolation and anonymous denial against the selected project. Database policies and security advisors have passed. Real Google sign-in and cross-device persistence require the Google provider setup above.

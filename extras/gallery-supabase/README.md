# Archived: community gallery (Supabase)

Not part of the build. BeySkin deliberately hosts **no user content** (no uploads, no accounts),
so there is nothing to moderate and no hosting liability. Sharing works via files and self-contained links.

This folder keeps the fully built gallery (upload with pre-moderation, likes, reports incl. anonymous
DSA Art. 16 notices, admin queue, rate limits, security-reviewed RLS) in case it is needed later –
e.g. to integrate into an existing Supabase project. Tables/functions are prefixed `sticker_`;
the admin check is isolated in `sticker_is_admin(uid)`.

To re-enable: move the files back to the same paths under `src/` (and `supabase/`, `docs/`),
`npm i @supabase/supabase-js`, re-add the routes (`/gallery`, `/gallery/:id`, `/me`, `/admin`),
`AuthButton` in the header, `useAuthStore().init()` in App.vue and the share dialog in the editor.
Before going live: render designs from `project.json` in the admin review (the thumbnail is client-generated),
add CAPTCHA to login, and update privacy policy/terms.

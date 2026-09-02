# Standing instructions for this project

- After any meaningful update to this project, commit and push to
  https://github.com/ZyadFri/Pipepline-Cheese- (remote `zyad`, branch `main`)
  without asking for confirmation first — the user pre-authorized this
  (2026-09-02). Follow the existing `.gitignore` (no `.env`, `venv/`,
  `node_modules/`, databases, uploads, or the stray `app.zip`/`src.zip`
  backup archives). Never include a `Co-Authored-By: Claude` line in commit
  messages for this project (matching the convention already established in
  the sibling `cheese-shelf-life-modeling` project).
- `origin` still points to the original collaborator repo
  (github.com/SafaeHaj/food-preservation-methods-predictors) — leave it
  alone; `zyad` is the new push target for ongoing work.
- No SSH key is configured for github.com on this machine — `zyad` and
  `origin` both use HTTPS via Git Credential Manager (`credential.helper =
  manager`), which already has a working cached credential. If push ever
  fails with an auth error, that credential likely needs refreshing.

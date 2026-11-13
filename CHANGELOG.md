# Changelog

Notable changes to Reactive Family Tree: the app, the project site and the
`reactive-family-tree` React package.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-14

### Added
- **tree**: A family tree drawn as a living tree, one family per install, kept up by its own relatives
- **sign-in**: Sign in with an emailed link, a passkey or Google
- **setup**: A setup wizard for a new family
- **editing**: Add and edit people, suggest changes, review them, and undo
- **members**: Members and branches to decide who sees and edits what
- **GEDCOM**: Import and export family data in GEDCOM, plus a full backup
- **MCP**: Relatives can connect their own AI assistant to the family tree
- **React package**: The tree as a React component, with a sample family to try it
- **site**: A project site with a live tree and the docs
- **photos**: A photo for each person, shown as their face on the tree, saved at once without review
- **tree**: Soft background music while playing through the years, with several melodies to choose from
- **tree**: The real moon over the tree at night, in tonight's phase, with a glow that follows how much of it is lit. It steps out while the years play
- **tree**: With the family's timezone and place set under Manage family, the moon is turned the way it is seen from there, and the sun is warmer near sunrise and sunset
- **tree**: A plain message with a Try again button when the tree cannot be loaded, and pages of their own for a wrong address and for an error
- **self-hosting**: One Docker container, with the database, the photos and the nightly snapshots in one volume. The compose file takes `PUBLIC_URL` from a `.env` file beside it and listens on `127.0.0.1:3000`, for an https proxy in front
- **app**: A new app icon, with more icon designs to choose from

### Security
- **suggestions**: Trying out a change, and the warnings an edit comes back with, no longer name relatives the person may not see
- **people**: A person's page no longer gives away who a private partner is, since when, or how the partnership stands
- **editing**: History hides what was written about an edit from readers who may not see everyone it is about
- **sign-in**: A sign-in link is mailed only to people who have an account, and the answer takes as long either way, so it does not show which emails are known
- **setup**: A `SETUP_TOKEN` that is empty or shorter than 20 characters is not used, and a fresh one is made
- **members**: Asking to join is limited to a few tries an hour per sender, and only so many requests can wait at once
- **self-hosting**: Requests over 12 MB are refused as they arrive, a server that cannot start stops so that it gets started again, and pages are sent with HSTS and a rule against being framed by other sites

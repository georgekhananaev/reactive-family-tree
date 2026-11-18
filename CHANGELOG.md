# Changelog

Notable changes to Reactive Family Tree: the app, the project site and the
`reactive-family-tree` React package.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.9.0] - 2026-11-19

### Added
- **site**: A public demo of the app and a project site, at familytree.reactatomics.com, with a robots.txt and a sitemap for search engines
- **site**: Google Analytics on the project site, only when it is built with a measurement ID (the app itself loads no analytics)
- **tree**: A link to the tree or to a person shows a picture card in chat apps and on social sites, in English, Hebrew and Russian, and the app has a new icon

### Fixed
- **tree**: Search engines can now read what a public tree needs to draw itself, so Google no longer shows it as "could not be loaded"; they are shown only what any visitor sees

## [0.8.0] - 2026-11-17

### Changed
- **backup**: A copy of the family is kept automatically just before a restore replaces it (the last five are kept), and a backup no longer carries the sign-in keys Google handed over

### Fixed
- **sign-in**: A page that cannot reach the server now says so and offers another try, instead of waiting for ever
- **editing**: A button pressed twice, or Enter followed by a click, no longer sends the same request, invitation or comment twice
- **members**: Two people opening the same invitation at the same moment are no longer both let in, an invitation is not used up when the account could not be made, and someone invited as a person who has since left the tree can still join
- **backup**: A nightly copy is written whole or not at all, and a backup is taken from one moment, so an edit made meanwhile cannot leave it half old and half new
- **GEDCOM**: A date with empty brackets or a very long remark no longer turns a whole import away

### Security
- **people**: Someone born "between 1910 and 1935", or "after 1910", is now counted as possibly living for as long as they might be, so their details stay hidden from visitors
- **self-hosting**: Requests from a page on another website can no longer act with a visitor's sign-in, and what a request may send is measured before it is read, so an enormous one cannot fill the server's memory
- **editing**: A date carrying extra data beside it, or a very long one, is refused instead of being stored

## [0.7.1] - 2026-11-15

### Security
- **sign-in**: Sign-in links are now counted for each sender, so asking for links to someone else's address no longer uses up that person's own tries, and whoever asks too often is told so
- **self-hosting**: With the Cloudflare check on, a request is refused unless Cloudflare plainly accepts its proof, and only twenty requests an hour are let through while Cloudflare cannot be reached

## [0.7.0] - 2026-11-15

### Added
- **self-hosting**: Optional Cloudflare Turnstile check that a person is asking before a stranger is sent a sign-in link, asks to join or suggests a correction, switched on by setting `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`
- **setup**: The privacy card says whether the tree loads anything from Cloudflare
- **members**: A member can be linked to their leaf on the tree, moved to another or unlinked, under Manage family

### Security
- **sign-in**: Strangers, and any one email address, are limited in how many sign-in links and suggestions they can ask for, so a family can't be pestered or have its daily mail used up

## [0.6.0] - 2026-11-15

### Added
- **tree**: A Japanese garden pond with koi beside the tree, switched on or off under Manage family

### Changed
- **tree**: The moon glow at night is cooler and softer

## [0.5.0] - 2026-11-15

### Added
- **tree**: The tree can open light or dark by the sun over the family, and the look is now chosen in its own Manage family panel

### Fixed
- **tree**: The quick tune now plays on iPhone

### Security
- **tree**: A private tree no longer lets strangers work out where the family lives from when it turns light or dark

## [0.4.0] - 2026-11-14

### Added
- **app**: Read the tree in Hebrew, Russian or English

## [0.3.0] - 2026-11-14

### Added
- **app**: A small About window shows the version and build

## [0.2.0] - 2026-11-14

### Added
- **tree**: The family can choose whether the tree opens light or dark, in the setup wizard or under Manage family, or leave it to each person's device. Each relative can still switch for themselves

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

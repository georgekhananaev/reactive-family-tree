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
- **tree**: Soft background music while playing through the years, with several music choices
- **tree**: The moon and sun are shown from your family's place
- **app**: A new app icon, with more icon designs to choose from

### Changed
- **sign-in**: Sign-in answers just as fast for every email, so it no longer shows which emails are known

### Fixed
- **members**: Join requests are never turned away when many are waiting
- **members**: Join requests are slowed down per sender and never overwritten
- **members**: Join requests from unknown senders are no longer lumped together

### Security
- **history**: Private details of living people no longer show up in history
- **search**: Private details of living people no longer show up in search
- **branches**: Connecting people across branches no longer exposes private details
- **sign-in**: Response time no longer reveals whether an email has an account

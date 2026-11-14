---
title: Docs
description: How to run Reactive Family Tree for your own family, who can change what, how privacy works, how to connect an AI assistant, and how to use the React package.
---

Reactive Family Tree is three things in one repository:

- **An app you host yourself.** One install holds one family. It draws the tree, signs relatives in, lets them edit and suggest changes, and keeps a history of every change.
- **A React component**, `reactive-family-tree`, that draws the same tree on your own site.
- **An MCP server** inside the app, so a relative can connect the AI assistant they already use.

It is open source under the MIT license. The author is George Khananaev.

## Where to start

- [Run your own](/docs/run-your-own/): start the app from source and claim it.
- [Who can do what](/docs/who-can-do-what/): owners, admins, stewards, members and visitors.
- [Privacy](/docs/privacy/): what visitors see, and what is never sent to them.
- [Connect your AI](/docs/connect-your-ai/): the MCP address, signing in, and the tools.
- [The React package](/docs/react-package/): the component, its props and its handle.
- [Contributing](/docs/contributing/): how the repository is laid out, and the checks to run.

You can also [try the demo](/demo/) first. It runs in your browser with a made-up family.

## What works today

The project is young. These docs describe what the code does now, not what is planned.

Working today:

- The tree, drawn as one view of a family's descendants, with pan, zoom, search, a year slider and keyboard travel between relatives.
- Sign-in without passwords: a link by email, a passkey, or Google if you set it up.
- Roles and branches, editing, suggestions and review, drafts, history and undo.
- Privacy rules applied on the server for every read.
- An admin area inside the app for members, branches, settings and data.
- GEDCOM import and export, and a full backup you can download and restore.
- The MCP endpoint, with sign-in or a personal token.
- English, Hebrew and Russian, with Hebrew read from the right. Each person's names, story, places and memories can be written in all three, and an admin sees what is missing in each.

Planned, and not built yet:

- Other views of the tree, beyond the one it has now.
- Galleries of photos, and sources attached to facts. One portrait per person is built, with a switch between leaves and faces.
- More languages than English, Hebrew and Russian.
- A printable poster export.
- A local bridge for AI clients that cannot reach a remote MCP server.
- The React package on npm, and a Docker image on a public registry.

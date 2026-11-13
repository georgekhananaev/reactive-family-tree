---
title: Privacy
description: How Reactive Family Tree protects living people. Who counts as living, what a visitor sees, and exactly what the server sends for a relative it has masked.
---

A family tree holds details about people who are alive. The app treats that as the main risk. The rules below run on the server for every read: the tree, a person's page, search, the path between two relatives, and what an AI client is given. The browser never receives something and then hides it.

## Three settings for the whole tree

The admin chooses one, in the setup and later under "Manage family".

| Setting | A visitor sees | A signed-in relative sees |
| --- | --- | --- |
| Private | Nothing but the family's name, its short description and a way to sign in. | The tree |
| Public, with the living hidden | The tree. Living people are unnamed leaves with no details. | The tree |
| Public | The same, and living people who chose to be shown are shown. | The tree |

A new install is private. A private tree also asks search engines not to list it.

## Who counts as living

- Someone recorded as having died, or with a death date, is not living.
- Someone marked as living is living.
- Otherwise the app goes by the birth year. A person born less than 110 years ago is treated as living. The admin can change that number, between 80 and 130.
- With no birth year either, the person is treated as living, unless one of their children was born more than 90 years ago. That is the same number less 20.

When the record is unclear, the answer is "living", because that is the safe one.

## What a visitor sees on a public tree

A living person is shown to a visitor only when all of this is true:

- the tree is set to "Public",
- the person chose to be public themselves, from their own account,
- the person is 18 or older.

No admin or steward can make that choice for someone. The server refuses it.

Someone who has died is shown to visitors, unless they were set to be seen by members only, or to be private.

Visitors never see memories.

## What a relative sees

A signed-in relative sees everyone, with one exception. A person set to private is masked for everybody except that person, the stewards of the branch they are in, and admins.

A single fact can be more private than the person it is about. A fact set to private is shown to the person, the stewards of their branch and admins. A fact set to members only is hidden from visitors.

## What a masked leaf sends

A masked person keeps their place in the tree's shape, so the tree is not misleading. Nothing that could identify them leaves the server. This is everything the browser gets for one:

```json
{ "id": "masked_3", "masked": true }
```

There is no name, no birth or death year, no sex and no privacy setting. The id is not the person's real id. It is a number given for that one answer, so it cannot be used to open their page or to follow them.

Partnerships still say who is joined to whom and who their children are, using those stand-in ids, because that is what gives the tree its shape. The year a couple came together is left out when either partner is masked.

Everywhere else the same person is equally blank:

- On the tree they are a plain leaf with no name. A screen reader calls it "Living relative".
- Search does not find them.
- Their own page answers "not found", the same as for someone who does not exist.
- In another person's list of relatives they appear as "Living relative", with no link.
- In the path between two relatives they are "a living relative".
- An AI client gets the same answers, because it sees what its owner sees.

## Live updates

Each open browser holds a stream so the tree can grow as the family changes. The stream only ever says that something changed. The browser then asks again for what it may see, through the same rules. Nothing private travels in the stream.

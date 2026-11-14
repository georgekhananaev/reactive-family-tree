---
title: Who can do what
description: The roles in Reactive Family Tree, what a branch is, and the one rule for edits. Inside your own branch a change is published at once. Anywhere else it becomes a suggestion.
---

There is one rule to remember:

**An edit inside your own branch is published at once. An edit anywhere else becomes a suggestion** for that branch's steward or an admin to review.

The same rule is used in two places. The browser uses it to label the button "Save" or "Send for review" before you press it. The server uses it to decide what really happens.

## Roles

| Role | Who | Can |
| --- | --- | --- |
| Owner | The person who set up the tree, and anyone they make an owner. There is always at least one. | Everything an admin can. Also add and remove owners, and restore a backup. |
| Admin | Trusted helpers. | Edit anywhere and review any suggestion. Invite people, change roles and branches, change settings, import and export GEDCOM, download a backup, and restore people from the compost. |
| Steward | A member who has been given one or more branches. | Edit inside those branches, with changes published at once. Review suggestions aimed at them. Suggest changes everywhere else. |
| Member | Any relative who is signed in. | Edit their own leaf. Add a memory to anyone they can see. Suggest changes everywhere else. |
| Visitor | Someone who is not signed in. | See the tree only if the admin made it public. Suggest a change only if the admin allows it, and only after leaving a name and an email. |

Steward is not a separate kind of account. It is a member with at least one branch.

Nobody can make an account for themselves. Accounts come from an invitation, from the first setup, or with the demo family. An admin can invite a member or another admin, and only an owner can invite another owner. A steward can invite people from their own branch as members, unless the admin has turned that off. An invitation works once, and for 14 days.

## What a branch is

A branch starts at one person, the anchor. It holds:

- the anchor,
- the anchor's partners,
- every descendant of the anchor,
- the partners of those descendants.

A member can hold several branches. The anchor's own parents and siblings are outside the branch.

What this means in practice:

- You can change the details of anyone in your branch, and of a partner who married into it.
- You can add a partner to the anchor or to any descendant, and children to that couple.
- A new person has to be connected to someone in your branch in the same edit. A person connected to nobody needs an admin.
- Connecting someone who is already elsewhere on the tree as a child is a suggestion, because it changes another branch too.
- A partner's other partnerships and their own parents belong to their own family, so changes there are suggestions.
- You can remove someone in your branch who has no children on the tree. Removing someone who has children, or removing your own leaf, needs an admin.

One edit can hold several changes. If any one of them needs review, the whole edit becomes a suggestion. This keeps "add a person and connect them" from being half done.

## What happens to an edit

| Who | Where | Result |
| --- | --- | --- |
| Owner or admin | Anywhere | Published |
| Steward | Inside their branch | Published |
| Steward | Outside it | Suggestion |
| Member | Their own leaf | Published |
| Member | A memory about anyone they can see | Published |
| Member | Any other change | Suggestion |
| Visitor | Anywhere, if the admin allows it | Suggestion |
| An AI client set to "review first" | Anywhere | A private draft for the member to look over. See [Connect your AI](/docs/connect-your-ai/). |

Two things nobody can do, at any role:

- Make a living person public. Only that person can, from their own account.
- Add a memory as a visitor. Memories need a signed-in relative.

## Languages

The tree speaks English, Hebrew and Russian, and each person reads it in their own. A person's names, story, places, details, notes and memories are kept in the language they were written in, and can be written in the other two beside it.

- **Writing in your language.** Anyone who may edit a person writes in the language they read the tree in. Inside their branch it is saved at once; elsewhere it becomes a suggestion, like any other change. The original in another language is left as it was.
- **A memory in another language.** Its author, the person it is about, and whoever looks after them can tell it again in another language.
- **What is missing.** Owners and admins have a Translations tab under Manage family, with every piece of the family's words in all three languages, and what is missing or out of date in each. Their AI can fill it in too.

Where a word is not written in your language yet, you see it as it was first written, marked with its language. When the original changes later, translations made from the old one are marked as out of date.

## Suggestions and review

A suggestion waits until someone reviews it. A suggested new person is drawn on the tree in pencil for the person who suggested them and for the people who can review it.

Admins can review every suggestion. A steward can review a suggestion that they could have made directly, which means it lies inside their branch. They cannot review their own. The admin can turn steward review off, so that only admins review.

A reviewer can:

- **Approve.** The change is published and credited to the person who suggested it. The reviewer's name is kept with it. A pencil leaf turns to ink.
- **Adjust and approve.** The reviewer changes the values first.
- **Decline.** This needs a short reason, which the person who suggested it can read.

The person who made a suggestion can withdraw it while it waits. Both sides can leave comments on it.

## History and undo

Every published edit keeps how things were before and how they are after. Undo is a new edit that puts things back, so nothing disappears from the history. An admin can undo any edit. Other people can undo an edit that they would be allowed to make themselves.

A removed person goes to the compost and can be restored for 30 days. After that the daily job removes them for good. Restoring someone from the compost, or removing them for good before the 30 days are up, is for admins.

# 07 Roles, editing and review

The decided rule: **edits inside your own branch publish instantly, with history and undo. Edits anywhere else become suggestions** for that branch's steward or an admin. This doc turns that into exact behaviour.

## Roles

| Role | Who | Can |
|------|-----|-----|
| Owner | The person who set up the tree, and anyone they make an owner. There can be several and there is always at least one | Everything an admin can, plus: adding and removing owners, restoring a backup, resetting or deleting the tree |
| Admin | Trusted helpers | Edit anywhere, review anything, manage members and branches, change settings, import, export, download backups |
| Steward | A member holding one or more branches | Edit live inside their branches. Review suggestions aimed at their branches. Suggest elsewhere |
| Member | Any signed-in relative | See the members' view. Edit their own leaf. Suggest fixes anywhere. Add memories, with photos, to anyone they can see |
| Visitor | Not signed in | See the public view if the tree is public. Suggest fixes only if the admin allows it |

Steward is not a separate account type. It is a member with at least one branch grant.

## What a branch is

A branch is defined by an **anchor person**. It contains:

- the anchor,
- the anchor's partners,
- every descendant of the anchor,
- every partner of those descendants.

```
              (anchor's parents)          outside: suggest
                      |
        Anchor ====== Partner             inside
           |
     +-----+------+
   Child A      Child B === Partner       inside
     |              |
  Grandchild    Grandchild                inside
```

Consequences:
- Adding a child, a grandchild or a partner anywhere below the anchor is a live edit.
- Changing who the anchor's parents are, or editing the anchor's siblings, is outside the branch and becomes a suggestion.
- A steward can hold several anchors. Giving someone their grandmother as an anchor gives them the whole clan.
- Branches may overlap. If two stewards cover the same person, both can edit, and history shows who did what.
- The parents of a partner who married in belong to that partner's own family. They are outside the branch unless granted.

Scope is computed by one function in the core package, used by the browser to decide what to offer and by the server to enforce. It is recomputed whenever the graph changes.

### The exact rule, per operation

A branch has a **core** (the anchor and every descendant, through any kind of child link: birth, adopted, step or foster) and **partners** (the partners of core people). The difference matters only for operations that connect people.

| Operation | Inside the branch when |
|-----------|------------------------|
| Change a person: names, facts, story, portrait, media | The person is core or a partner |
| Create or change a union, add or remove a partner | At least one partner of the union is core |
| Link or unlink a child | The union has a core partner, and the child is new in this edit or already in the branch |
| Create a person | The same edit connects them into the branch by one of the two rows above |
| Remove a person | The person is in the branch and has no children on the tree |
| Reorder siblings, change a union's host | The union has a core partner |

What this means in practice:
- A steward can add a partner to any descendant, and children to that couple.
- A steward can edit the details of someone who married in, but that person's other marriages and their own parents belong to their own family, so those are suggestions.
- Connecting someone who already exists elsewhere on the tree as a child is a suggestion, because it changes another branch too.
- Removing someone who has children on the tree needs an admin, because it reshapes the tree below them.
- A person created with no connection to anyone is admin only. Everyone else adds people by connecting them.

### Your own leaf

Every member linked to a person can always, regardless of grants:
- edit their own names, story, portrait and facts,
- choose their own privacy level,
- add and remove their own memories and photos.

The default invitation ("invite Daniel as himself") links the account to Daniel's leaf **and** grants Daniel's branch, so by default everyone looks after themselves and their descendants. The admin can widen or remove that per person.

A member whose grant has been removed keeps their own leaf only. Adding their own partner or child is then a suggestion like any other.

## What happens to an edit

| Who | Where | Result |
|-----|-------|--------|
| Owner, admin | Anywhere | Applied |
| Steward | Inside their branch | Applied |
| Steward | Outside | Suggestion |
| Member | Own leaf | Applied |
| Member | A memory on anyone they can see | Applied. A memory is a signed contribution beside the record, not a change to it. Its author, the person it is about, that branch's stewards and admins can remove it |
| Member | Any other change | Suggestion |
| Visitor | Anywhere, if allowed | Suggestion, after confirming an email address |
| Anyone through MCP, connection set to "review first" | Anywhere | Private draft for the member to approve, then the rows above apply |

Rules for a batch:
- An edit is atomic. If any operation in it needs review, the whole edit becomes a suggestion. This keeps "add a person and connect them" from being half applied.
- The interface avoids surprising people: before saving it already knows the outcome and labels the button "Save" or "Send for review".
- These always need an admin, whoever asks: merging two people, permanently purging, importing, and creating an unconnected person.
- Restoring a backup needs an owner.
- Nobody, at any role, can make a living person public except that person from their own account.

## Suggesting a fix

This is the "edit corrections" feature, and it must be effortless.

1. On any card or person page, every fact has a quiet "Something wrong?" affordance. For members it is always there. For stewards and admins it is replaced by direct editing where they have rights.
2. Tapping it turns the fact into an editable field with the current value filled in, plus a note ("Her gravestone says 1921") and an optional photo as evidence.
3. Sending it creates a suggestion. On the page it appears as a pencil note in the margin, visible to its author, the reviewers and admins. On the tree, a suggested new person is a pencil leaf.
4. The author can follow their suggestions under their avatar: waiting, approved, or declined with the reviewer's note. They can withdraw one that is still waiting.

Suggestions can be anything an edit can be: a corrected date, a new person, a missing connection, a photo.

## Review

**Who reviews.** A suggestion is routed to the stewards of the smallest branch that contains its target (the nearest anchor going up the tree) and to all admins. If nobody acts within 7 days, admins get a reminder. The admin can turn steward review off so that only admins review.

**The inbox.** One list for each reviewer, newest first, with a count on their avatar.

```
+-----------------------------------------------------------+
| Daniel suggests a change to Sara Khananaev                |
|                                                           |
|   Birth      1922, Baku   ->   4 March 1921, Baku         |
|   Note       "Her passport, photo attached"   [photo]     |
|   Warnings   none                                         |
|                                                           |
|   [Approve]  [Edit and approve]  [Decline…]  [Ask]        |
+-----------------------------------------------------------+
```

- **Approve** applies it as an edit credited to the author, with the reviewer recorded.
- **Edit and approve** lets the reviewer adjust values first. Both names are recorded.
- **Decline** needs a short reason, which the author sees. The edit's status becomes `declined`.
- **Ask** opens a short thread on the suggestion.
- Several suggestions can be approved together.
- If the target changed since the suggestion was written, the card shows a three-column comparison (was, is now, suggested) for the clashing fields only.
- A reviewer cannot approve their own suggestion unless they would have been allowed to make the edit directly.

**Notifications.** In-app always. By email: immediately for reviewers, as a daily digest for everyone else, both adjustable per person. Emails contain a link and a plain description, never private details of living people.

## History and undo

- Each edit shows on the affected people's history tabs and in the family-wide activity list (admins see all, stewards see their branches, members see their own edits).
- Undo is available to the author for their own applied edits inside their rights, and to stewards and admins for anything in their scope.
- Undo is a new edit. Nothing is ever erased from history except by the 30-day compost purge.
- A steward's removal of a person sends them to compost. Only an admin can purge early.

## Privacy

Privacy is enforced on the server, on every read path: pages, the tree snapshot, search, exports, the API and MCP.

### Tree visibility

| Setting | Visitors see | Members see |
|---------|--------------|-------------|
| Private (default) | A sign-in page at the home address. Every other address answers "not found" and offers sign-in, so nothing reveals who is in the tree | Everything at members level |
| Public, living masked | The tree, with living people as unnamed "Living relative" leaves and no details | Everything at members level |
| Public | The tree, with living people shown only if they opted in | Everything at members level |

### Per person and per fact

| Level | Visible to |
|-------|-----------|
| `public` | Everyone, if the tree is public |
| `members` | Signed-in relatives |
| `private` | The person themselves, stewards of their branch, admins |
| `default` | Follows the tree setting and the living rule |

Rules:
- **Living people are never shown to visitors unless they have opted in themselves** from their own account. An admin cannot opt in on someone's behalf. The opt-in is recorded with who gave it and when, and the server refuses a `public` level for a living person without that record.
- **Presumed living.** A person with no death recorded is treated as living if they were born less than 110 years ago, or if they have no birth date and none of their children was born more than 90 years ago. The admin can change the numbers.
- **Children under 18** are always masked for visitors.
- Masked people still hold their place in the tree's shape, so the tree is not misleading, but nothing identifying leaves the server: no name, no dates, no portrait, no id that links to a page.
- Sensitive facts (cause of death, adoption details, addresses) default to `private`.
- Contact details are not part of the model in v1.

### People's rights

- Any member can download everything the tree holds about them.
- Any member can delete their account. Their leaf stays, since it is family history, but reverts to an unlinked person and can be set to private.
- Public pages carry a "Request a change or removal" link that reaches the admins without needing an account.
- The admin gets a plain-language privacy checklist during setup and when switching the tree to public.

## Signing in and joining

- **Invitations.** The admin or a steward invites by email or by a link or QR code. An invitation can be tied to a leaf ("You are Daniel. Is that right?"). Stewards can invite people only within their branch, as members.
- **Requests to join.** If enabled, a visitor can ask to join and say who they are. An admin approves and links them to a leaf.
- **Sign-in.** A magic link by email, a passkey after the first sign-in, or Google. No passwords.
- **Family events.** The admin can print a sheet of QR codes, one per person, for a reunion. Scanning one starts that person's invitation.
- Sessions last 30 days and can be reviewed and ended from the account page.

# 08 Admin experience

The admin runs the family's tree entirely from the UI. No config files, no command line after the first start, no developer.

## First run: the setup wizard

A fresh install prints a one-time setup link in the server log. Opening it starts the wizard, and nobody without the link can. Five short steps. The first two are required and the rest can be skipped. The tree is visible behind the wizard from step two onward so every choice shows its effect immediately.

1. **You.** Your name and email, and a passkey created on the spot. This makes you the owner and works even before email sending is configured. If email is working, a magic link is sent as a second way in.
2. **The family.** A name ("Khananaev family").
3. **A starting point.** Two choices: start with yourself (name, birth year, and the wizard plants your leaf), or import a GEDCOM file. The made-up demo family is not offered here, so it can never end up in a real tree. It has a mode of its own, `pnpm demo`, with its own data file.
4. **The look.** Pick a leaf species for the founding lineage and day, night or follow the device. A live tree shows the result.
5. **Who can see it.** Private is selected. A plain sentence explains each option.

The wizard ends on the tree with one hint: "Pull the bud above your leaf to add a child. Pull the one below to add a parent." Email and storage health are checked silently, and a problem shows as a single banner with a fix link, not a blocker. Until email works, invitations are offered as links and QR codes only.

## The admin area

Reached from the avatar menu as "Manage family". Seven sections in a left rail (a bottom sheet on phones).

### Review

The inbox from [07](07-roles-editing-and-review.md). It is the landing section whenever anything is waiting.

### Members

A table of people with accounts and people invited.

| Column | Content |
|--------|---------|
| Person | Portrait, name, the leaf they are linked to |
| Role | Owner, admin, member. Stewards show their branches as chips |
| Status | Active, invited (with resend), request to join |
| AI | Whether they have connected an AI client, and when it was last used |
| Last seen | |

Actions: invite, change role, link or unlink a leaf, assign branches, end sessions, remove. Invite accepts an email, or produces a link or QR code. "Invite as…" pre-links a leaf and pre-grants that person's branch.

Bulk invite: select leaves on the tree, enter emails beside each name, send. "Print reunion codes" produces a sheet of QR codes, one per person.

### Branches

Assigning branches is done on the tree itself, because a branch is a shape.

```
+----------------------------------------------+--------------+
|                                              | Stewards     |
|      tree, with each steward's branch        | ● Daniel     |
|      tinted in that steward's colour         | ● Noa        |
|                                              | ● Miriam     |
|                                              | + Add        |
+----------------------------------------------+--------------+
```

- Pick a steward on the right, then tap a person on the tree. That person becomes an anchor and their whole branch tints in the steward's colour as it is granted.
- Tap an anchor again to remove the grant.
- Overlaps show as stripes of both colours.
- Uncovered parts of the tree (only admins can edit them) are drawn plain, with a count: "212 people have no steward".
- A "suggest stewards" helper proposes one anchor per active member based on where their own leaf is.

### Activity

Every edit in order, filterable by person, author, source (UI, AI, import) and type. Each row expands to before and after, and has Undo. A separate tab holds Compost with Restore and Purge.

### Tree health

A report the admin can work through, generated from the integrity warnings:

- people with no dates, people with no parents, likely duplicates,
- impossible or unlikely dates,
- living people with no linked account, leaves with no portrait,
- branches with no steward.

Each item links to the place on the tree. "Likely duplicates" opens a side-by-side merge.

### Settings

| Group | What can be set |
|-------|-----------------|
| Family | Name, short description, cover image, default view, default focus person, orientation (grow up or classic) |
| Access | Tree visibility, whether visitors can suggest fixes, whether people can ask to join, whether stewards can invite |
| Privacy | The "presumed living" ages, default privacy for new facts, which fact types are sensitive |
| Review | Whether stewards review suggestions for their branches, reminder timing, digest schedule |
| Appearance | Species and colour per lineage, palette accents, tidy to wild, each ambient effect on or off, day and night behaviour. Changes preview live on the tree before saving |
| Languages | Interface languages offered, the family's scripts and which one shows first |
| Guidelines | A short text of the family's conventions (how to transliterate names, how to record uncertain dates). Shown to people when they edit and given to connected AI clients |
| AI connections | Allow or disallow AI connections for the family, whether "apply directly" may be chosen by members, hourly limits, a list of every connection with revoke |
| Email | Sender name, test message |
| Search engines | Allow indexing (only offered when the tree is public), site title and description |

### Data

- **Import** a GEDCOM file, always staged and previewed before it is applied, and revertible afterwards.
- **Export** GEDCOM 7, or a full backup zip.
- **Backups**: the list of automatic nightly snapshots, each with download.
- **Poster**: choose view, size and whether living people are included, then download.
- **Danger zone** (owner only): add or remove owners, restore a backup or snapshot (this replaces the whole tree, and the current state is snapshotted first), reset the tree, delete everything. Each requires typing the family name.

## What a steward sees

Stewards get a reduced "Manage my branch" area: Review (for their branches), Activity (for their branches), Health (for their branches), and Invite (if allowed). No settings.

## What a member sees

Under their avatar: My leaf, My suggestions, My memories, Connect your AI, Notifications, Comfort mode, Sessions, Download my data, Delete my account.

## Notifications for admins

- A suggestion is waiting (immediately, or in the daily digest, as chosen).
- Someone asked to join.
- An AI connection made an unusually large number of changes in an hour.
- A backup failed, or email or storage is unhealthy.
- A new version is available (shown in the admin area only, with release notes. The app never updates itself).

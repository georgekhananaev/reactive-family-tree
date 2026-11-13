# Security

A family tree holds names, dates, and relationships of real people, many of them
living. Problems that could expose or change that are taken seriously.

## Reporting a problem

Please do not open a public issue. Use "Report a vulnerability" on the
repository's Security tab, which reaches the maintainer privately.

It helps to include:

- what you found and what it would let someone do,
- the steps to see it happen,
- the version or commit you tested.

Reports are read and answered as soon as the maintainer can get to them. Once a fix
is ready it is released, and you are credited in the notes unless you would prefer
not to be.

## What counts

- Seeing a living person's details without being allowed to.
- Reading or changing a tree without signing in, or outside your own branch,
  without going through review.
- Getting past an AI connection's limits: its owner's permissions, its "review
  first" setting, or its rate limit.
- Signing in as someone else, or reusing an invitation, sign-in link, or setup
  link.
- Anything that lets a web page or an imported file run code or read data it
  should not.

## How the app protects a family

- **Closed until opened.** A new tree shows strangers nothing. If the family opens
  it, living people stay unnamed for visitors unless they choose to be shown, from
  their own account. An admin cannot choose that for them.
- **One write path.** Every change, from the page, an AI, or an import, goes
  through the same checks for permission and validity, and is recorded so it can
  be undone.
- **No passwords.** Sign-in is by emailed link, passkey, or optional Google
  sign-in for people who already have an account. Links and invitations work
  once.
- **Photos follow their person.** A photo is read by person, never by its own
  address, so it is seen exactly by those who may see that person. What a
  camera writes into a file beside the picture, such as where it was taken, is
  cut out before the photo is kept.
- **Tokens are stored hashed.** Personal AI tokens, invitations, and the setup
  link are shown once and kept only as a hash.
- **AI acts as its owner.** A connection can do what that relative can do, never
  more, and can be revoked at any time.
- **Your data stays with you.** The app reports nowhere and calls no AI itself.
  Email goes through the provider you set up. The one other outside request it
  makes is to read an AI client's own description, when a client introduces
  itself by web address before a relative signs it in.

## Running it safely

- Put it behind HTTPS. Sign-in for AI clients is refused on plain HTTP except on
  localhost.
- Keep the `/data` volume backed up. It holds the database, the nightly
  snapshots and the photos.
- Never run a real family with `DEMO_MODE` on. Its accounts can be entered by
  anyone.
- Keep `AUTH_SECRET`, `SETUP_TOKEN`, and `JOBS_TOKEN` out of version control.

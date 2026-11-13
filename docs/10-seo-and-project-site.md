# 10 SEO and project site

There are two different things to be found by search engines, and they are handled in two places.

| What should be found | Where it lives | Built with |
|----------------------|----------------|------------|
| The open-source project: what it is, the demo, how to install it, how to use the React package | `apps/site`, at the project's own domain | Astro |
| A family's public tree and its people | `apps/web`, at the family's domain | Next.js, server-rendered |

**This split was confirmed** when the app was built (see the README). The instruction was to use Astro for SEO and that the app may be built on Next.js. Public family pages are kept in the Next.js app for one reason: a leaf opens into a person page as one continuous motion, and that only works when the tree and the page are the same application. Those pages are still fully server-rendered and get everything below. If the preference is one Astro application for everything, the packages are framework-free and the tree mounts as a React island, at the cost of rebuilding the app shell (routing, sign-in pages, admin) on Astro.

## The Astro project site

### Pages

| Page | Purpose |
|------|---------|
| Home | Opens on the live tree itself, full width, growing as the page loads, with the demo family. One sentence, two actions: "Try the demo" and "Run your own". Below: three short sections showing editing by pulling a twig, a suggestion turning from pencil to ink, and an AI draft growing in |
| Demo | The demo family in a full explorer that runs entirely in the browser: the React package, the demo data, and an in-memory store using the real edit and permission rules from the core package. A switch lets you try being a visitor, a member, a steward or an admin. Reloading resets it. No server is involved |
| Docs | Starlight: run your own (Docker, serverless), admin guide, steward and member guides, connect your AI, the React package, theming, the data model, the API, contributing |
| React package | Install, a live editable example, props, hooks, theming, server rendering |
| Themes | A gallery of the default theme's species and settings, and later community skins |
| Showcase | Public family trees that asked to be listed |
| Changelog | Generated from releases |

The tree on the home page is the real `reactive-family-tree` package running as an island. The site is therefore also a permanent proof that the package works outside the app.

### SEO work on the site

- Static HTML for every page, with JavaScript only for the tree islands, hydrated when visible.
- A server-rendered SVG of the demo tree in the initial HTML, so the hero is visible before any script runs and there is no layout shift.
- Titles and descriptions written per page. Canonical addresses. A sitemap and feed for the changelog.
- Structured data: `SoftwareApplication` and `SoftwareSourceCode` on the home page, `TechArticle` on docs, `FAQPage` where a page really is questions and answers.
- Social images generated at build time, each showing a tree.
- Docs available as plain Markdown and an `llms.txt` index, so AI assistants can read them. This matters for a project whose users will ask their AI how to set it up.
- Targets: all Core Web Vitals in the good range on a mid-range phone, and a total blocking time near zero outside the demo.

## SEO for public family trees in the app

Only relevant when the admin sets the tree to public and allows indexing. A private tree sends a `noindex` header on every response. Its `robots.txt` does not block crawling, because a crawler that is blocked never sees the `noindex` and may keep old addresses listed.

### Pages

| Address | Content |
|---------|---------|
| `/` | The tree explorer. The initial HTML contains a static SVG of the tree drawn at the Branch zoom level for the founders and the three generations below them, in which each public person is a real link to their page, followed by plain links to every lineage, surname and place page |
| `/people/{slug}` | A person's page: name, years, places, story, relatives as links, sources |
| `/families/{lineage}` | A lineage: its founders, its story, a list of its people |
| `/names/{surname}` | Everyone carrying a surname, with years and places |
| `/places/{place}` | Everyone connected to a place |

Slugs are readable and stable: `sara-khananaev-1921`. A changed name keeps the old address as a redirect.

### What each public person page carries

- Server-rendered content. The page reads completely without JavaScript.
- A title like "Sara Khananaev (1921 to 2009), Khananaev family" and a description written from facts: born where, married whom, how many children.
- `Person` structured data inside a `ProfilePage`: name, alternate names, birth and death dates and places, parents, spouse, children, each linked to their own page. Only for people who are public.
- A breadcrumb through the generations, also as structured data.
- A social image showing the person's portrait on their branch, drawn by the same SVG renderer.
- Canonical address, and language alternates when the family uses several languages.
- Internal links to parents, partners, children and siblings, which is what lets a crawler walk the whole family.

### Site-level

- A sitemap listing only public people, lineages, surnames and places, split into files of 10,000 and updated when edits are applied.
- Public pages are cached and revalidated when an edit touches them, so they are fast and never stale.
- No page, sitemap entry, structured data or social image is ever produced for a masked person. The privacy filter runs before rendering, so there is nothing to leak. An automated test crawls a public test tree as a visitor and fails if any living person's name, date or portrait appears anywhere in the output.
- Changing the tree from public back to private makes every address except the home page answer "not found" to visitors, with `noindex`, exactly as on a tree that was always private. Search engines drop such pages on their next visit. Signed-in members see the pages as before. The admin is told that removal from search results takes time and is given the removal links for the major engines.

### Performance on public pages

- Person pages ship no tree code until the reader opens the margin tree.
- Portraits are responsive, lazily loaded, with blurred placeholders, and the main portrait is prioritised.
- Fonts are subset and preloaded for the scripts actually on the page.

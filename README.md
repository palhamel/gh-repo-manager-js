# GitHub Repo Manager

A local browser tool for managing all your GitHub repositories in bulk. No server, no build step, no dependencies beyond the GitHub API.

Or use it from here: [GitHub Repo Manager](https://palhamel.github.io/gh-repo-manager/)

## What it does

Open `index.html` in your browser, paste a GitHub Personal Access Token, and get a full overview of every repo connected to your account. From there you can filter, sort, select, and apply bulk actions.

### Features

- **Full repo list** — fetches all repos (paginated, handles 200+) including owned, forked, org, and collaborator repos
- **Sortable table** — name, visibility, archived status, role, created date, last pushed, stars
- **Filtering** — search by name, filter by visibility (public/private), archived status, role (owner/fork/org/collaborator), and creation year range
- **Pagination** — configurable repos per page (25/50/100) with page navigation
- **Select all** — header checkbox to select/deselect all repos on the current page (with indeterminate state for partial selection)
- **Bulk actions** — make public, make private, archive, unarchive, delete (with safety confirmation)
- **Role detection** — shows your relationship to each repo: owner, fork, org member, or collaborator. Forks are only flagged for repos under your own account; collaborator repos that happen to be forks are correctly shown as collaborator
- **In-use indicators** — flags repos that have forks, GitHub Pages, a homepage, open issues, or watchers
- **Delete safety check** — before deletion, checks for deployments via the GitHub API and warns about repos that appear to be in active use
- **Live PAT validation** — recognizes token type as you paste (classic, fine-grained, OAuth, etc.)
- **API transparency** — collapsible log showing every API endpoint called with status codes
- **Repo summary** — live stats split by yours vs others (owned, forked, org, collaborator counts)

### What it does NOT do

- Store anything to disk, localStorage, or cookies
- Send data anywhere other than `api.github.com`
- Require a server, build step, or package manager
- Include analytics, tracking, or telemetry

## Getting started

1. Download or clone this repository
2. Open `index.html` in any modern browser
3. Create a GitHub Personal Access Token (instructions are on the page)
4. Paste the token and click Connect

### Token requirements

**Classic token** (recommended):
- Go to [github.com/settings/tokens/new](https://github.com/settings/tokens/new)
- Check `repo` (full control of private repositories)
- Check `delete_repo` (delete repositories)

**Fine-grained token** (alternative):
- Go to [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)
- Set Repository access to "All repositories"
- Under Repository permissions, set Administration to "Read and write"

## Project structure

```
index.html          # Main HTML page
js/app.js           # Application logic (API, filtering, rendering, actions)
css/styles.css      # Custom styles (minimal, most styling via Tailwind)
```

## Tech stack

- Vanilla JavaScript (ES6+)
- Tailwind CSS via CDN
- GitHub REST API (`api.github.com`)

## Security

- Token is stored in a JS variable in memory only, cleared on page refresh
- All API calls use HTTPS (TLS encrypted)
- No external calls beyond `api.github.com`
- No dependencies to audit beyond Tailwind CDN

## API endpoints used

```
GET    /user                              # Authenticate and get user info
GET    /user/repos?per_page=100&page=N    # List repos (paginated)
PATCH  /repos/{owner}/{repo}              # Update visibility, archive status
DELETE /repos/{owner}/{repo}              # Delete a repo
GET    /repos/{owner}/{repo}/deployments  # Check deployments (on delete)
```

## License

MIT

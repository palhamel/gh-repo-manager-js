// ── State ──
let pat = null;
let username = null;
let repos = [];
let selectedIds = new Set();
let sortField = 'pushed_at';
let sortDir = 'desc';
let deleteResolve = null;
let currentPage = 1;
let perPage = 25;

// ── DOM refs ──
const $ = (id) => document.getElementById(id);

// ── API helpers ──
const API_BASE = 'https://api.github.com';

const logApi = (method, url, status) => {
  $('apiLogSection').classList.remove('hidden');
  const el = document.createElement('div');
  const statusColor = status >= 200 && status < 300 ? 'text-emerald-600' : 'text-red-600';
  el.innerHTML = `<span class="text-grey-400">${new Date().toLocaleTimeString()}</span> `
    + `<span class="font-semibold">${method}</span> ${url} `
    + `<span class="${statusColor}">${status}</span>`;
  $('apiLog').prepend(el);
};

const ghFetch = async (path, options = {}) => {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${pat}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {})
    }
  });
  logApi(options.method || 'GET', url.replace(API_BASE, ''), res.status);
  return res;
};

// ── PAT validation ──
const PAT_PATTERNS = [
  { prefix: 'ghp_', label: 'Classic token', minLen: 40 },
  { prefix: 'github_pat_', label: 'Fine-grained token', minLen: 30 },
  { prefix: 'gho_', label: 'OAuth token', minLen: 30 },
  { prefix: 'ghu_', label: 'User-to-server token', minLen: 30 },
  { prefix: 'ghs_', label: 'Server-to-server token', minLen: 30 },
  { prefix: 'ghr_', label: 'Refresh token', minLen: 30 }
];

const validatePatInput = () => {
  const val = $('patInput').value.trim();
  const el = $('patValidation');
  const btn = $('connectBtn');

  if (!val) {
    el.innerHTML = '';
    btn.disabled = true;
    $('patInput').classList.remove('border-emerald-400', 'border-red-400');
    $('patInput').classList.add('border-grey-300');
    return;
  }

  const match = PAT_PATTERNS.find((p) => val.startsWith(p.prefix));

  if (match && val.length >= match.minLen) {
    el.innerHTML = `<span class="text-emerald-600">${match.label}</span>`;
    btn.disabled = false;
    $('patInput').classList.remove('border-grey-300', 'border-red-400');
    $('patInput').classList.add('border-emerald-400');
  } else if (match) {
    el.innerHTML = `<span class="text-amber-500">Too short</span>`;
    btn.disabled = true;
    $('patInput').classList.remove('border-grey-300', 'border-emerald-400');
    $('patInput').classList.add('border-red-400');
  } else {
    el.innerHTML = `<span class="text-red-500">Not a token</span>`;
    btn.disabled = true;
    $('patInput').classList.remove('border-grey-300', 'border-emerald-400');
    $('patInput').classList.add('border-red-400');
  }
};

const togglePatVisibility = () => {
  const input = $('patInput');
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  $('eyeIcon').classList.toggle('hidden', isPassword);
  $('eyeOffIcon').classList.toggle('hidden', !isPassword);
};

// ── Auth ──
const handleConnect = async () => {
  const input = $('patInput').value.trim();
  if (!input) return;

  $('connectBtn').disabled = true;
  $('connectBtn').textContent = 'Connecting...';
  $('authError').classList.add('hidden');

  try {
    pat = input;
    const res = await ghFetch('/user');
    if (!res.ok) {
      pat = null;
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || `HTTP ${res.status}`);
    }
    const user = await res.json();
    username = user.login;
    $('userInfo').textContent = `${user.login} (${user.public_repos} public repos)`;
    $('authSection').classList.add('hidden');
    $('aboutDetails').removeAttribute('open');
    $('repoManager').classList.remove('hidden');
    $('patInput').value = '';
    await fetchAllRepos();
  } catch (e) {
    $('authError').textContent = `Authentication failed: ${e.message}`;
    $('authError').classList.remove('hidden');
  } finally {
    $('connectBtn').textContent = 'Connect';
    validatePatInput();
  }
};

$('patInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleConnect();
});

// ── Fetch repos ──
const fetchAllRepos = async () => {
  repos = [];
  selectedIds.clear();
  $('loadingBar').classList.remove('hidden');
  $('loadingText').textContent = 'Loading repos...';
  $('loadingProgress').style.width = '0%';

  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const res = await ghFetch(`/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`);
    if (!res.ok) {
      $('loadingText').textContent = `Error loading repos: HTTP ${res.status}`;
      return;
    }
    const batch = await res.json();
    repos = repos.concat(batch);
    $('loadingText').textContent = `Loading repos... ${repos.length} fetched`;

    // Estimate progress from Link header
    const link = res.headers.get('Link') || '';
    const lastMatch = link.match(/page=(\d+)>;\s*rel="last"/);
    if (lastMatch) {
      const total = parseInt(lastMatch[1]);
      $('loadingProgress').style.width = `${Math.round((page / total) * 100)}%`;
    } else {
      $('loadingProgress').style.width = '100%';
    }

    hasMore = batch.length === 100;
    page++;
  }

  $('loadingBar').classList.add('hidden');
  renderTable();
};

// ── Repo role ──
const getRepoRole = (r) => {
  if (r.owner.login === username) return r.fork ? 'fork' : 'owner';
  if (r.owner.type === 'Organization') return 'org';
  return 'collaborator';
};

const roleBadge = (role) => {
  const styles = {
    owner: 'bg-blue-100 text-blue-700',
    fork: 'bg-purple-100 text-purple-700',
    org: 'bg-indigo-100 text-indigo-700',
    collaborator: 'bg-grey-200 text-grey-700'
  };
  const labels = {
    owner: 'owner',
    fork: 'fork',
    org: 'org member',
    collaborator: 'collaborator'
  };
  return `<span class="inline-block px-2 py-0.5 text-xs font-medium ${styles[role]} rounded-full">${labels[role]}</span>`;
};

// ── Filtering ──
const getFilteredRepos = () => {
  const search = $('searchInput').value.toLowerCase();
  const vis = $('filterVisibility').value;
  const arch = $('filterArchived').value;
  const role = $('filterRole').value;
  const yearFrom = parseInt($('filterYearFrom').value) || 0;
  const yearTo = parseInt($('filterYearTo').value) || 9999;

  return repos.filter((r) => {
    if (search && !r.full_name.toLowerCase().includes(search)) return false;
    if (vis === 'public' && r.private) return false;
    if (vis === 'private' && !r.private) return false;
    if (arch === 'archived' && !r.archived) return false;
    if (arch === 'active' && r.archived) return false;
    if (role !== 'all' && getRepoRole(r) !== role) return false;
    if (yearFrom || yearTo < 9999) {
      const year = r.created_at ? new Date(r.created_at).getFullYear() : 0;
      if (year < yearFrom || year > yearTo) return false;
    }
    return true;
  });
};

// ── Filter/sort reset page ──
const filterAndRender = () => {
  currentPage = 1;
  renderTable();
};

// ── Sorting ──
const sortBy = (field) => {
  if (sortField === field) {
    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    sortField = field;
    sortDir = field === 'name' ? 'asc' : 'desc';
  }
  currentPage = 1;
  renderTable();
};

const sortRepos = (list) => {
  return [...list].sort((a, b) => {
    let av, bv;
    switch (sortField) {
      case 'name': av = a.full_name.toLowerCase(); bv = b.full_name.toLowerCase(); break;
      case 'visibility': av = a.private ? 1 : 0; bv = b.private ? 1 : 0; break;
      case 'archived': av = a.archived ? 1 : 0; bv = b.archived ? 1 : 0; break;
      case 'role': av = getRepoRole(a); bv = getRepoRole(b); break;
      case 'created_at': av = a.created_at || ''; bv = b.created_at || ''; break;
      case 'pushed_at': av = a.pushed_at || ''; bv = b.pushed_at || ''; break;
      case 'stars': av = a.stargazers_count; bv = b.stargazers_count; break;
      default: return 0;
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });
};

// ── Pagination helpers ──
const getTotalPages = (filtered) => Math.max(1, Math.ceil(filtered.length / perPage));

const getPageSlice = (filtered) => {
  const start = (currentPage - 1) * perPage;
  return filtered.slice(start, start + perPage);
};

const changePerPage = (value) => {
  perPage = parseInt(value);
  currentPage = 1;
  renderTable();
};

const goToPage = (page) => {
  currentPage = page;
  renderTable();
};

// ── Rendering ──
const renderTable = () => {
  const filtered = sortRepos(getFilteredRepos());
  const totalPages = getTotalPages(filtered);
  if (currentPage > totalPages) currentPage = totalPages;
  const pageItems = getPageSlice(filtered);
  const tbody = $('repoTableBody');
  tbody.innerHTML = '';

  // Update sort indicators
  document.querySelectorAll('[id^="sort-"]').forEach((el) => el.textContent = '');
  const sortEl = $(`sort-${sortField}`);
  if (sortEl) sortEl.textContent = sortDir === 'asc' ? '\u25B2' : '\u25BC';

  pageItems.forEach((r) => {
    const checked = selectedIds.has(r.id) ? 'checked' : '';
    const visBadge = r.private
      ? '<span class="inline-block px-2 py-0.5 text-xs font-medium bg-grey-200 text-grey-700 rounded-full">private</span>'
      : '<span class="inline-block px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-full">public</span>';
    const archBadge = r.archived
      ? '<span class="inline-block px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">archived</span>'
      : '<span class="text-grey-400 text-xs">&mdash;</span>';
    const dateFmt = { year: 'numeric', month: 'short', day: 'numeric' };
    const pushed = r.pushed_at
      ? new Date(r.pushed_at).toLocaleDateString('en-US', dateFmt)
      : '&mdash;';
    const created = r.created_at
      ? new Date(r.created_at).toLocaleDateString('en-US', dateFmt)
      : '&mdash;';
    const role = getRepoRole(r);
    const roleHtml = roleBadge(role);
    let contextNote = '';
    if (r.fork) {
      contextNote = r.parent
        ? `<span class="block text-xs text-grey-400 mt-0.5">forked from ${r.parent.full_name}</span>`
        : `<span class="block text-xs text-grey-400 mt-0.5">forked repo</span>`;
    } else if (role === 'org') {
      contextNote = `<span class="block text-xs text-grey-400 mt-0.5">org: ${r.owner.login}</span>`;
    } else if (role === 'collaborator') {
      contextNote = `<span class="block text-xs text-grey-400 mt-0.5">owned by ${r.owner.login}</span>`;
    }

    // In-use indicators
    const indicators = [];
    if (r.forks_count > 0)
      indicators.push(`<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-orange-50 text-orange-700 border border-orange-200 rounded text-xs" title="${r.forks_count} fork(s) — others depend on this repo">&#9432; ${r.forks_count} fork${r.forks_count > 1 ? 's' : ''}</span>`);
    if (r.has_pages)
      indicators.push('<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-cyan-50 text-cyan-700 border border-cyan-200 rounded text-xs" title="GitHub Pages is deployed">Pages</span>');
    if (r.homepage)
      indicators.push(`<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-violet-50 text-violet-700 border border-violet-200 rounded text-xs" title="Homepage: ${r.homepage}">Site</span>`);
    if (r.open_issues_count > 0)
      indicators.push(`<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded text-xs" title="${r.open_issues_count} open issue(s)">${r.open_issues_count} issue${r.open_issues_count > 1 ? 's' : ''}</span>`);
    if (r.watchers_count > 1)
      indicators.push(`<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-grey-100 text-grey-600 border border-grey-200 rounded text-xs" title="${r.watchers_count} watcher(s)">${r.watchers_count} watchers</span>`);
    const indicatorsHtml = indicators.length > 0
      ? indicators.join(' ')
      : '<span class="text-grey-300 text-xs">&mdash;</span>';

    const tr = document.createElement('tr');
    tr.id = `row-${r.id}`;
    tr.className = 'hover:bg-grey-50 transition-colors relative';
    tr.innerHTML = `
      <td class="px-4 py-3 text-center">
        <input type="checkbox" ${checked} onchange="toggleSelect(${r.id})"
          class="w-4 h-4 rounded border-grey-300 text-grey-800 cursor-pointer
                 focus:ring-grey-400 focus:ring-2" />
      </td>
      <td class="px-4 py-3">
        <a href="${r.html_url}" target="_blank" rel="noopener"
          class="text-grey-900 font-medium hover:underline cursor-pointer">${r.full_name}</a>
        ${r.description ? `<span class="block text-xs text-grey-500 mt-0.5 truncate max-w-xs">${r.description}</span>` : ''}
        ${contextNote}
      </td>
      <td class="px-4 py-3">${visBadge}</td>
      <td class="px-4 py-3">${archBadge}</td>
      <td class="px-4 py-3">${roleHtml}</td>
      <td class="px-4 py-3 text-grey-600">${created}</td>
      <td class="px-4 py-3 text-grey-600">${pushed}</td>
      <td class="px-4 py-3 text-grey-600">${r.stargazers_count}</td>
      <td class="px-4 py-3">${indicatorsHtml}</td>
    `;
    tbody.appendChild(tr);
  });

  // Pagination footer
  const start = (currentPage - 1) * perPage + 1;
  const end = Math.min(currentPage * perPage, filtered.length);
  const rangeText = filtered.length > 0
    ? `Showing ${start}–${end} of ${filtered.length} repos`
    : 'No repos match filters';

  let paginationHtml = `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <span>${rangeText}${filtered.length !== repos.length ? ` (${repos.length} total)` : ''}</span>
        <span class="text-grey-300">|</span>
        <span class="flex items-center gap-1">
          Per page:
          ${[25, 50, 100].map((n) =>
            `<button onclick="changePerPage(${n})"
              class="px-2 py-0.5 rounded text-xs cursor-pointer transition-colors
                     ${perPage === n
                       ? 'bg-grey-700 text-white'
                       : 'bg-grey-100 text-grey-600 hover:bg-grey-200'}">${n}</button>`
          ).join('')}
        </span>
      </div>
      <div class="flex items-center gap-1">`;

  if (totalPages > 1) {
    paginationHtml += `
        <button onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}
          class="px-2 py-1 rounded text-xs cursor-pointer transition-colors
                 hover:bg-grey-200 disabled:opacity-30 disabled:cursor-not-allowed">&laquo; Prev</button>`;

    // Page numbers with ellipsis
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== '...') {
        pages.push('...');
      }
    }
    pages.forEach((p) => {
      if (p === '...') {
        paginationHtml += `<span class="px-1 text-grey-400">...</span>`;
      } else {
        paginationHtml += `
          <button onclick="goToPage(${p})"
            class="px-2 py-1 rounded text-xs cursor-pointer transition-colors
                   ${p === currentPage
                     ? 'bg-grey-700 text-white'
                     : 'hover:bg-grey-200'}">${p}</button>`;
      }
    });

    paginationHtml += `
        <button onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}
          class="px-2 py-1 rounded text-xs cursor-pointer transition-colors
                 hover:bg-grey-200 disabled:opacity-30 disabled:cursor-not-allowed">Next &raquo;</button>`;
  }

  paginationHtml += `</div></div>`;
  $('tableFooter').innerHTML = paginationHtml;

  updateBulkButtons();
  updateSummary();
};

// ── Summary ──
const updateSummary = () => {
  const total = repos.length;
  if (total === 0) { $('repoSummary').innerHTML = ''; return; }

  let forks = 0, owned = 0, org = 0, collab = 0, stars = 0, archived = 0;
  const yours = { pub: 0, priv: 0 };
  const others = { pub: 0, priv: 0 };

  repos.forEach((r) => {
    if (r.archived) archived++;
    stars += r.stargazers_count;
    const role = getRepoRole(r);
    const isYours = role === 'owner' || role === 'fork';
    r.private ? (isYours ? yours.priv++ : others.priv++) : (isYours ? yours.pub++ : others.pub++);
    if (role === 'owner') owned++;
    else if (role === 'fork') forks++;
    else if (role === 'org') org++;
    else collab++;
  });

  const badge = (label, count, color) =>
    `<span class="inline-flex items-center gap-1"><span class="inline-block w-2 h-2 rounded-full ${color}"></span>${count} ${label}</span>`;

  $('repoSummary').innerHTML = `
    <span class="font-medium text-grey-700">${total} repos</span>
    <span class="text-grey-300">|</span>
    ${badge('owned', owned, 'bg-blue-400')}
    ${badge('forks', forks, 'bg-purple-400')}
    ${org ? badge('org', org, 'bg-indigo-400') : ''}
    ${collab ? badge('collab', collab, 'bg-grey-400') : ''}
    <span class="text-grey-300">|</span>
    <span class="text-grey-600">Yours: ${yours.pub} public, ${yours.priv} private</span>
    <span class="text-grey-300">|</span>
    <span class="text-grey-500">Others: ${others.pub} public, ${others.priv} private</span>
    ${archived ? `<span class="text-grey-300">|</span> ${badge('archived', archived, 'bg-amber-400')}` : ''}
    <span class="text-grey-300">|</span>
    <span>${stars} total stars</span>
  `;
};

// ── Selection ──
const toggleSelect = (id) => {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  updateBulkButtons();
};

const toggleSelectAll = () => {
  const filtered = sortRepos(getFilteredRepos());
  const pageItems = getPageSlice(filtered);
  const allSelected = pageItems.length > 0 && pageItems.every((r) => selectedIds.has(r.id));

  if (allSelected) {
    pageItems.forEach((r) => selectedIds.delete(r.id));
  } else {
    pageItems.forEach((r) => selectedIds.add(r.id));
  }
  renderTable();
};

const updateSelectAllCheckbox = () => {
  const cb = $('selectAllCheckbox');
  if (!cb) return;
  const filtered = sortRepos(getFilteredRepos());
  const pageItems = getPageSlice(filtered);
  const selectedOnPage = pageItems.filter((r) => selectedIds.has(r.id)).length;

  cb.checked = pageItems.length > 0 && selectedOnPage === pageItems.length;
  cb.indeterminate = selectedOnPage > 0 && selectedOnPage < pageItems.length;
};

const updateBulkButtons = () => {
  const count = selectedIds.size;
  $('selectedCount').textContent = `${count} selected`;
  const disabled = count === 0;
  ['btnPublic', 'btnPrivate', 'btnArchive', 'btnUnarchive', 'btnDelete'].forEach((id) => {
    $(id).disabled = disabled;
  });
  updateSelectAllCheckbox();
};

// ── Status display (row overlay) ──
const setStatus = (repoId, message, type) => {
  const row = $(`row-${repoId}`);
  if (!row) return;

  // Remove any existing overlay on this row
  const existing = row.querySelector('.row-status-overlay');
  if (existing) existing.remove();

  const colors = {
    success: 'bg-emerald-50/90 text-emerald-700 border-emerald-200',
    error: 'bg-red-50/90 text-red-700 border-red-200',
    info: 'bg-grey-50/90 text-grey-600 border-grey-200'
  };
  const style = colors[type] || colors.info;
  const duration = type === 'error' ? 5000 : type === 'success' ? 3000 : 0;

  const overlay = document.createElement('td');
  overlay.colSpan = 9;
  overlay.className = 'row-status-overlay absolute inset-0 z-10';
  overlay.innerHTML = `
    <div class="h-full flex items-center justify-center text-xs font-medium ${style} border-l-4 px-4">
      ${message}
    </div>
  `;
  row.style.position = 'relative';
  row.appendChild(overlay);

  if (duration > 0) {
    setTimeout(() => {
      overlay.style.transition = 'opacity 0.5s';
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 500);
    }, duration);
  }
};

// ── Bulk actions ──
const getSelectedRepos = () => repos.filter((r) => selectedIds.has(r.id));

const bulkAction = async (action) => {
  if (action === 'delete') {
    showDeleteModal();
    return;
  }

  const selected = getSelectedRepos();
  for (const repo of selected) {
    setStatus(repo.id, 'Processing...', 'info');
    try {
      let body;
      switch (action) {
        case 'public': body = { visibility: 'public' }; break;
        case 'private': body = { visibility: 'private' }; break;
        case 'archive': body = { archived: true }; break;
        case 'unarchive': body = { archived: false }; break;
      }
      const res = await ghFetch(`/repos/${repo.full_name}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `HTTP ${res.status}`);
      }
      const updated = await res.json();
      const idx = repos.findIndex((r) => r.id === repo.id);
      if (idx !== -1) repos[idx] = { ...repos[idx], ...updated };
      setStatus(repo.id, 'Done', 'success');
    } catch (e) {
      setStatus(repo.id, e.message, 'error');
    }
  }
  selectedIds.clear();
  renderTable();
};

// ── Delete modal ──
const showDeleteModal = async () => {
  const selected = getSelectedRepos();
  const count = selected.length;
  $('deleteModalText').innerHTML = `You are about to <strong>permanently delete ${count} repo${count > 1 ? 's' : ''}</strong>:`
    + `<ul class="mt-2 list-disc list-inside text-grey-700 max-h-32 overflow-y-auto">`
    + selected.map((r) => `<li class="font-mono text-xs">${r.full_name}</li>`).join('')
    + `</ul>`;
  $('deleteConfirmInput').value = '';
  $('deleteConfirmBtn').disabled = true;
  $('deleteWarnings').classList.add('hidden');
  $('deleteWarnings').innerHTML = '';
  $('deleteModal').classList.remove('hidden');

  $('deleteConfirmInput').oninput = () => {
    $('deleteConfirmBtn').disabled = $('deleteConfirmInput').value.trim() !== 'DELETE';
  };
  $('deleteConfirmInput').focus();

  // Safety check: gather warnings from local data + fetch deployments
  const warnings = [];

  selected.forEach((r) => {
    const flags = [];
    if (r.forks_count > 0) flags.push(`${r.forks_count} fork${r.forks_count > 1 ? 's' : ''}`);
    if (r.has_pages) flags.push('GitHub Pages deployed');
    if (r.homepage) flags.push(`has homepage (${r.homepage})`);
    if (r.open_issues_count > 0) flags.push(`${r.open_issues_count} open issue${r.open_issues_count > 1 ? 's' : ''}`);
    if (r.stargazers_count > 0) flags.push(`${r.stargazers_count} star${r.stargazers_count > 1 ? 's' : ''}`);
    if (flags.length > 0) {
      warnings.push({ name: r.full_name, flags });
    }
  });

  // Fetch deployment environments for selected repos
  $('deleteCheckingDeploys').classList.remove('hidden');
  for (const r of selected) {
    try {
      const res = await ghFetch(`/repos/${r.full_name}/deployments?per_page=5`);
      if (res.ok) {
        const deploys = await res.json();
        if (deploys.length > 0) {
          const envs = [...new Set(deploys.map((d) => d.environment))];
          const existing = warnings.find((w) => w.name === r.full_name);
          const deployFlag = `deployed to: ${envs.join(', ')}`;
          if (existing) {
            existing.flags.push(deployFlag);
          } else {
            warnings.push({ name: r.full_name, flags: [deployFlag] });
          }
        }
      }
    } catch (e) {
      // Silently skip deployment check failures
    }
  }
  $('deleteCheckingDeploys').classList.add('hidden');

  if (warnings.length > 0) {
    $('deleteWarnings').innerHTML = `
      <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm space-y-2">
        <p class="font-medium text-amber-800">Warning: some repos appear to be in use</p>
        <ul class="space-y-1 text-amber-700">
          ${warnings.map((w) => `
            <li>
              <span class="font-mono text-xs font-medium">${w.name}</span>
              <span class="text-amber-600">&mdash; ${w.flags.join(', ')}</span>
            </li>
          `).join('')}
        </ul>
      </div>
    `;
    $('deleteWarnings').classList.remove('hidden');
  }
};

const closeDeleteModal = () => {
  $('deleteModal').classList.add('hidden');
};

const confirmDelete = async () => {
  if ($('deleteConfirmInput').value.trim() !== 'DELETE') return;
  closeDeleteModal();

  const selected = getSelectedRepos();
  for (const repo of selected) {
    setStatus(repo.id, 'Deleting...', 'info');
    try {
      const res = await ghFetch(`/repos/${repo.full_name}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `HTTP ${res.status}`);
      }
      repos = repos.filter((r) => r.id !== repo.id);
      selectedIds.delete(repo.id);
    } catch (e) {
      setStatus(repo.id, e.message, 'error');
    }
  }
  selectedIds.clear();
  renderTable();
};

// Close modal on backdrop click
$('deleteModal').addEventListener('click', (e) => {
  if (e.target === $('deleteModal')) closeDeleteModal();
});

// Close modal on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('deleteModal').classList.contains('hidden')) closeDeleteModal();
});

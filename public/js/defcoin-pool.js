(function() {
  const poolApiBase = window.location.origin + '/poolapi';
  const explorerBase = window.location.origin + '/explorer';
  const refreshIntervalMs = 30000;
  const inactiveThresholdSeconds = 24 * 60 * 60;
  const blockMaxPerPage = 1000;
  const blockMaxDirectPageCount = 20;
  const blockPerPageOptions = [10, 25, 50, 100, 250, 500, 1000];
  const p2poolDonationFixUrl = 'https://github.com/turnkit/defcoin-p2pool/blob/master/docs/TECHNICAL_GUIDE.md#share-version-36-donation-dust-fix';
  const genesisTimestamp = 1394002925;
  const halvingInterval = 840000;
  const targetSpacingSeconds = 120;
  const blockState = {
    page: 1,
    perPage: 10,
    totalItems: 0,
    view: 'simple'
  };
  const minerSortState = {
    key: 'payoutWeight',
    direction: 'desc'
  };
  let lastMinerTableArgs = null;

  function formatHashrate(value) {
    const units = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s'];
    let rate = Number(value || 0);
    let unitIndex = 0;

    while (rate >= 1000 && unitIndex < units.length - 1) {
      rate /= 1000;
      unitIndex += 1;
    }

    if (!Number.isFinite(rate) || rate <= 0) {
      return '-';
    }

    return `${rate.toFixed(rate >= 100 ? 0 : 2)} ${units[unitIndex]}`;
  }

  function formatDuration(totalSeconds) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds || 0)));
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const parts = [];

    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (!parts.length || secs) parts.push(`${secs}s`);

    return parts.join(' ');
  }

  function formatCalendarAge(fromTimestamp, toDate) {
    let cursor = new Date(fromTimestamp * 1000);
    const end = toDate instanceof Date ? toDate : new Date();
    if (cursor > end) return '0y 0m 0d 00:00:00';

    let years = 0;
    let months = 0;

    function addMonths(date, count) {
      const next = new Date(date.getTime());
      const day = next.getDate();
      next.setMonth(next.getMonth() + count);
      if (next.getDate() !== day) next.setDate(0);
      return next;
    }

    while (addMonths(cursor, 12) <= end) {
      cursor = addMonths(cursor, 12);
      years += 1;
    }

    while (addMonths(cursor, 1) <= end) {
      cursor = addMonths(cursor, 1);
      months += 1;
    }

    const remainingSeconds = Math.max(0, Math.floor((end.getTime() - cursor.getTime()) / 1000));
    const days = Math.floor(remainingSeconds / 86400);
    const hours = Math.floor((remainingSeconds % 86400) / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;
    const clock = [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
    return `${years}y ${months}m ${days}d ${clock}`;
  }

  function formatCoin(value, symbol) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) {
      return '-';
    }

    return `${amount.toFixed(8)} ${symbol || 'DFC'}`;
  }

  function formatDifficulty(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return '-';
    }
    return numeric.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
  }

  function formatPercent(value) {
    const percent = Number(value || 0) * 100;
    if (!Number.isFinite(percent) || percent <= 0) {
      return '-';
    }

    return `${percent.toFixed(percent >= 10 ? 2 : 3)}%`;
  }

  function formatDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    return date.toLocaleString([], {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });
  }

  function formatTimestamp(ts) {
    if (!ts) return 'Never';
    return formatDateTime(ts * 1000);
  }

  function formatRelativeTime(ts) {
    if (!ts) return 'Never';
    const delta = Math.max(0, Math.floor(Date.now() / 1000) - ts);
    return `${formatDuration(delta)} ago`;
  }

  function formatShareAge(ts) {
    const timestamp = Number(ts || 0);
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      return {
        label: 'unknown',
        seconds: Number.POSITIVE_INFINITY
      };
    }

    const seconds = Math.max(0, Math.floor((Date.now() / 1000) - timestamp));
    if (seconds >= 86400) {
      const days = Math.floor(seconds / 86400);
      return {
        label: `${days} ${days === 1 ? 'Day' : 'Days'}`,
        seconds
      };
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const pad = (value) => String(value).padStart(2, '0');
    const clock = `${pad(hours)}h${pad(minutes)}m${pad(secs)}s`;
    return {
      label: clock,
      seconds
    };
  }

  function isRecentActivity(ts) {
    if (!ts) return false;
    return ((Date.now() / 1000) - Number(ts)) < inactiveThresholdSeconds;
  }

  function formatP2PoolVersion(version) {
    if (!version) return '-';
    return String(version).replace(/-dirty$/, ' (local patches)');
  }

  function formatDormantLabel(latestPoolBlockTs) {
    if (!latestPoolBlockTs) {
      return 'No current estimate';
    }

    return `No current estimate (${formatRelativeTime(latestPoolBlockTs)})`;
  }

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function setLink(id, label, url) {
    const node = document.getElementById(id);
    if (!node) return;
    node.textContent = '';
    const link = document.createElement('a');
    link.href = url;
    link.textContent = label;
    link.rel = 'noopener noreferrer';
    node.appendChild(link);
  }

  function setDonationFixLink(id) {
    const node = document.getElementById(id);
    if (!node) return;
    node.textContent = '';
    const value = document.createElement('span');
    value.textContent = 'None';
    node.appendChild(value);
    node.appendChild(document.createElement('br'));
    const link = document.createElement('a');
    link.href = p2poolDonationFixUrl;
    link.textContent = 'Operator fix';
    link.rel = 'noopener noreferrer';
    link.target = '_blank';
    link.className = 'small';
    node.appendChild(link);
  }

  function setPoolShares(total, orphaned, dead) {
    const node = document.getElementById('poolShares');
    if (!node) return;

    node.textContent = '';

    const totalText = document.createElement('span');
    totalText.textContent = `total ${Number(total || 0).toLocaleString()}, `;
    node.appendChild(totalText);

    const link = document.createElement('a');
    link.href = '#pool-share-status-note';
    link.textContent = `orphaned shares ${Number(orphaned || 0).toLocaleString()}, dead/stale shares ${Number(dead || 0).toLocaleString()}`;
    link.title = 'P2Pool share counters. These are not the same as blockchain orphaned blocks.';
    node.appendChild(link);
  }

  function renderChainDateCards(summary) {
    const blockCount = Number(summary && summary.blockcount);
    const now = new Date();
    setText('poolChainAge', formatCalendarAge(genesisTimestamp, now));
    setText('poolTargetSpacing', '2 min');

    if (!Number.isFinite(blockCount) || blockCount < 0) {
      setText('poolNextHalving', 'Waiting for block height');
      setText('poolBlockHeight', '-');
      return;
    }

    setText('poolBlockHeight', blockCount.toLocaleString());
    const nextHeight = (Math.floor(blockCount / halvingInterval) + 1) * halvingInterval;
    const blocksRemaining = Math.max(0, nextHeight - blockCount);
    const estimatedDate = new Date(now.getTime() + (blocksRemaining * targetSpacingSeconds * 1000));
    setText('poolNextHalving', `${formatDateTime(estimatedDate)} · block ${nextHeight.toLocaleString()}`);
  }

  function clampInteger(value, fallback, min, max) {
    let parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) parsed = fallback;
    parsed = Math.max(min, parsed);
    if (Number.isFinite(max)) parsed = Math.min(max, parsed);
    return parsed;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(char) {
      return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char];
    });
  }

  function shortHash(value) {
    const text = String(value || '');
    if (text.length <= 18) return text;
    return `${text.slice(0, 10)}...${text.slice(-8)}`;
  }

  function defaultMinerSortDirection(key) {
    return key === 'address' || key === 'shareAge' ? 'asc' : 'desc';
  }

  function minerSortLabel(key) {
    const labels = {
      address: 'address',
      recentRate: 'recent rate',
      payoutWeight: 'payout weight',
      windowRate: 'window rate',
      rejected: 'rejected rate',
      shareAge: 'share age',
      payout: 'predicted payout'
    };
    return labels[key] || 'payout weight';
  }

  function minerSortDirectionLabel() {
    if (minerSortState.key === 'shareAge') {
      return minerSortState.direction === 'asc' ? 'newest first' : 'oldest first';
    }
    return minerSortState.direction === 'asc' ? 'ascending' : 'descending';
  }

  function compareSortNumber(left, right, directionFactor) {
    const leftKnown = Number.isFinite(left);
    const rightKnown = Number.isFinite(right);
    if (!leftKnown && !rightKnown) return 0;
    // Unknown values should remain at the bottom even when sorting descending.
    if (!leftKnown) return 1;
    if (!rightKnown) return -1;
    const result = left - right;
    return result === 0 ? 0 : result * directionFactor;
  }

  function compareMinerRows(left, right) {
    const directionFactor = minerSortState.direction === 'asc' ? 1 : -1;
    let result = 0;

    switch (minerSortState.key) {
      case 'address':
        result = left.address.localeCompare(right.address) * directionFactor;
        break;
      case 'recentRate':
        result = compareSortNumber(left.hashrate, right.hashrate, directionFactor);
        break;
      case 'windowRate':
        result = compareSortNumber(left.windowRate, right.windowRate, directionFactor);
        break;
      case 'rejected':
        result = compareSortNumber(left.rejected, right.rejected, directionFactor);
        break;
      case 'shareAge':
        result = compareSortNumber(left.shareAge.seconds, right.shareAge.seconds, directionFactor);
        break;
      case 'payout':
        result = compareSortNumber(left.payoutAmount, right.payoutAmount, directionFactor);
        break;
      case 'payoutWeight':
      default:
        result = compareSortNumber(left.payoutWeight, right.payoutWeight, directionFactor);
        break;
    }

    if (result !== 0) return result;
    return (right.payoutWeight - left.payoutWeight)
      || (right.hashrate - left.hashrate)
      || left.address.localeCompare(right.address);
  }

  function updateMinerSortHeaderState() {
    document.querySelectorAll('#pool-active-miners th[data-miner-sort]').forEach((header) => {
      const key = header.dataset.minerSort;
      const label = header.dataset.sortLabel || header.textContent.trim();
      const active = key === minerSortState.key;
      header.textContent = active ? `${label} ${minerSortState.direction === 'asc' ? '▲' : '▼'}` : label;
      header.setAttribute('aria-sort', active ? (minerSortState.direction === 'asc' ? 'ascending' : 'descending') : 'none');
      header.style.cursor = 'pointer';
    });
  }

  function rerenderMinerTable() {
    if (!lastMinerTableArgs) return;
    renderMinerTable(
      lastMinerTableArgs.localStats,
      lastMinerTableArgs.currentPayouts,
      lastMinerTableArgs.payoutWeights,
      lastMinerTableArgs.poolRate,
      lastMinerTableArgs.symbol
    );
  }

  function bindMinerSortHeaders() {
    document.querySelectorAll('#pool-active-miners th[data-miner-sort]').forEach((header) => {
      if (header.dataset.boundMinerSort) return;
      header.dataset.boundMinerSort = '1';
      header.addEventListener('click', function() {
        const nextKey = this.dataset.minerSort || 'payoutWeight';
        if (minerSortState.key === nextKey) {
          minerSortState.direction = minerSortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
          minerSortState.key = nextKey;
          minerSortState.direction = defaultMinerSortDirection(nextKey);
        }
        rerenderMinerTable();
      });
      header.addEventListener('keydown', function(event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        this.click();
      });
    });
    updateMinerSortHeaderState();
  }

  function readBlockPagingFromUrl() {
    const params = new URLSearchParams(window.location.search);
    blockState.page = clampInteger(params.get('block_page') || params.get('tx_page'), 1, 1, Number.MAX_SAFE_INTEGER);
    blockState.perPage = clampInteger(params.get('block_per_page') || params.get('tx_per_page'), 10, 1, blockMaxPerPage);
    blockState.view = params.get('block_view') === 'detailed' ? 'detailed' : 'simple';
  }

  function writeBlockPagingToUrl() {
    if (!window.history || !window.history.replaceState) return;
    const params = new URLSearchParams(window.location.search);
    params.set('block_page', String(blockState.page));
    params.set('block_per_page', String(blockState.perPage));
    params.set('block_view', blockState.view);
    params.delete('tx_page');
    params.delete('tx_per_page');
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? '?' + query : ''}${window.location.hash || ''}`;
    window.history.replaceState({}, '', nextUrl);
  }

  function reloadWithBlockView(view) {
    const params = new URLSearchParams(window.location.search);
    params.set('block_page', String(blockState.page));
    params.set('block_per_page', String(blockState.perPage));
    params.set('block_view', view === 'detailed' ? 'detailed' : 'simple');
    params.delete('tx_page');
    params.delete('tx_per_page');
    const query = params.toString();
    window.location.href = `${window.location.pathname}${query ? '?' + query : ''}${window.location.hash || ''}`;
  }

  function renderBlockViewToggle() {
    document.querySelectorAll('[data-block-view]').forEach((button) => {
      const active = button.dataset.blockView === blockState.view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      if (!button.dataset.boundBlockView) {
        button.dataset.boundBlockView = '1';
        button.addEventListener('click', function() {
          const nextView = this.dataset.blockView === 'detailed' ? 'detailed' : 'simple';
          if (nextView === blockState.view) return;
          reloadWithBlockView(nextView);
        });
      }
    });
  }

  function showAlert(message) {
    const alert = document.getElementById('pool-api-alert');
    if (!alert) return;
    alert.textContent = message;
    alert.classList.remove('d-none');
  }

  function hideAlert() {
    const alert = document.getElementById('pool-api-alert');
    if (!alert) return;
    alert.classList.add('d-none');
  }

  async function fetchExplorerSummary() {
    const response = await fetch(explorerBase + '/ext/getsummary', {
      headers: {
        Accept: 'application/json'
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Explorer summary returned ${response.status}`);
    }

    return response.json();
  }

  function buildUnavailableMessage(summary) {
    if (summary && summary.blockcount && summary.blockcount !== '-') {
      return `Pool API is currently unavailable. The explorer is reachable at block ${summary.blockcount}, but the upstream p2pool HTTP service is not responding right now.`;
    }

    return 'Pool API is currently unavailable. The upstream p2pool HTTP service is not responding right now.';
  }

  async function fetchJson(path) {
    const response = await fetch(poolApiBase + path, {
      headers: {
        Accept: 'application/json'
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Pool API returned ${response.status}`);
    }

    return response.json();
  }

  function renderMinerTable(localStats, currentPayouts, payoutWeights, poolRate, symbol) {
    const tbody = document.querySelector('#pool-active-miners tbody');
    if (!tbody) return;
    lastMinerTableArgs = {localStats, currentPayouts, payoutWeights, poolRate, symbol};

    const minerRates = localStats.miner_hash_rates || {};
    const deadRates = localStats.miner_dead_hash_rates || {};
    const lastSeenTimes = localStats.miner_last_seen_times || {};
    const addresses = Array.from(new Set([
      ...Object.keys(minerRates),
      ...Object.keys(lastSeenTimes),
      ...Object.keys(payoutWeights || {}),
      ...Object.keys(currentPayouts || {}).filter((address) => Number(currentPayouts[address] || 0) > 0.000001)
    ]));

    setText('poolMinerCount', String(addresses.length));

    if (!addresses.length) {
      setText('poolMinerTableMeta', 'No active miners reported on this node');
      tbody.innerHTML = '<tr><td class="text-center" colspan="7">No active miners reported yet</td></tr>';
      updateMinerSortHeaderState();
      return;
    }

    const rows = addresses.map((address) => {
      const hashrate = Number(minerRates[address] || 0);
      const rejected = Number(deadRates[address] || 0);
      const payoutAmount = Number(currentPayouts[address] || 0);
      const payoutWeight = Number((payoutWeights || {})[address] || 0);
      const windowRate = payoutWeight > 0 ? payoutWeight * Number(poolRate || 0) : 0;
      const shareAge = formatShareAge(lastSeenTimes[address]);
      const explorerUrl = `${explorerBase}/address/${encodeURIComponent(address)}`;

      return {
        address,
        hashrate,
        rejected,
        payoutAmount,
        payoutWeight,
        windowRate,
        shareAge,
        explorerUrl
      };
    }).sort(compareMinerRows).map((row) => {
      return `<tr>
        <td class="breakWord"><a href="${row.explorerUrl}">${escapeHtml(row.address)}</a></td>
        <td class="text-center" data-sort-value="${Number.isFinite(row.shareAge.seconds) ? row.shareAge.seconds : ''}">${escapeHtml(row.shareAge.label)}</td>
        <td class="text-center">${escapeHtml(formatHashrate(row.hashrate))}</td>
        <td class="text-center">${escapeHtml(formatPercent(row.payoutWeight))}</td>
        <td class="text-center">${escapeHtml(formatHashrate(row.windowRate))}</td>
        <td class="text-center">${escapeHtml(formatHashrate(row.rejected))}</td>
        <td class="text-center">${escapeHtml(row.payoutAmount > 0 ? formatCoin(row.payoutAmount, symbol) : 'No shares yet')}</td>
      </tr>`;
    });

    tbody.innerHTML = rows.join('');
    setText('poolMinerTableMeta', `Sorted by ${minerSortLabel(minerSortState.key)} (${minerSortDirectionLabel()})`);
    updateMinerSortHeaderState();
  }

  function renderBlockTable(recentBlocks) {
    const tbody = document.querySelector('#pool-recent-blocks tbody');

    if (!recentBlocks || !recentBlocks.length) {
      setText('poolLastBlock', 'None yet');
      if (tbody) {
        tbody.innerHTML = '<tr><td class="text-center" colspan="3">No recent blocks reported yet</td></tr>';
      }
      return;
    }

    setText('poolLastBlock', formatRelativeTime(recentBlocks[0].ts));
    if (!tbody) return;

    const rows = recentBlocks.map((block) => {
      const hash = block.hash || '';
      const height = block.number || '-';
      const blockUrl = `${explorerBase}/block/${encodeURIComponent(hash)}`;

      return `<tr>
        <td class="text-center">${escapeHtml(formatRelativeTime(block.ts))}</td>
        <td class="text-center">${escapeHtml(formatTimestamp(block.ts))}</td>
        <td class="text-center"><a href="${blockUrl}">${escapeHtml(height)}</a></td>
      </tr>`;
    });

    tbody.innerHTML = rows.join('');
  }

  function pagerAvailableWidth() {
    const pager = document.getElementById('poolBlockPagerBottom');
    const layoutViewport = document.documentElement.clientWidth || window.innerWidth || 1200;
    const visualViewport = window.innerWidth || layoutViewport;
    const viewport = Math.min(layoutViewport, visualViewport);
    const pagerWidth = pager && pager.clientWidth ? pager.clientWidth : viewport;
    const baseWidth = Math.max(300, Math.floor(Math.min(pagerWidth, viewport)));
    const formReserve = baseWidth >= 760 ? 285 : 0;
    return Math.max(300, baseWidth - formReserve);
  }

  function jumpStepsForWidth(width, direction) {
    if (direction === 'negative') {
      if (width < 430) return [['100', 100]];
      if (width < 700) return [['1K', 1000], ['100', 100]];
      if (width < 900) return [['10K', 10000], ['1K', 1000], ['100', 100]];
      return [['100K', 100000], ['10K', 10000], ['1K', 1000], ['100', 100]];
    }
    if (width < 430) return [['100', 100]];
    if (width < 700) return [['100', 100], ['1K', 1000]];
    if (width < 900) return [['100', 100], ['1K', 1000], ['10K', 10000]];
    return [['100', 100], ['1K', 1000], ['10K', 10000], ['100K', 100000]];
  }

  function estimatedButtonWidth(label, width) {
    const text = String(label || '');
    const padding = width < 576 ? 17 : 22;
    const charWidth = width < 576 ? 6.2 : 7.2;
    return Math.max(width < 576 ? 30 : 34, Math.ceil(text.length * charWidth) + padding);
  }

  function estimatedButtonsWidth(labels, width) {
    if (!labels.length) return 0;
    const gap = width < 576 ? 4 : 7;
    return labels.reduce((sum, label) => sum + estimatedButtonWidth(label, width), 0) + ((labels.length - 1) * gap);
  }

  function directBlockPageCount(totalPages, negativeSteps, positiveSteps, includeTenStep, includePrevNext, width) {
    const coreLabels = ['First'].concat(negativeSteps.map((step) => `-${step[0]}`)).concat(['1']);
    if (includeTenStep) coreLabels.push('-10');
    if (includePrevNext) coreLabels.push('Prev', 'Next');
    if (includeTenStep) coreLabels.push('+10');
    coreLabels.push('Last');
    positiveSteps.forEach((step) => coreLabels.push(`+${step[0]}`));
    const available = width - estimatedButtonsWidth(coreLabels, width) - 10;
    const pageWidth = Math.max(estimatedButtonWidth(String(totalPages), width), estimatedButtonWidth(String(blockState.page), width));
    return Math.max(0, Math.min(blockMaxDirectPageCount, Math.floor(available / pageWidth)));
  }

  function blockPageWindow(totalPages, directPageCount) {
    directPageCount = Math.max(0, Math.min(blockMaxDirectPageCount, directPageCount));
    if (directPageCount <= 0) {
      return {start: 1, end: 0};
    }
    if (totalPages <= directPageCount) {
      return {start: 1, end: totalPages};
    }
    const start = Math.max(1, Math.min(blockState.page - Math.floor(directPageCount / 2), totalPages - directPageCount + 1));
    return {start, end: start + directPageCount - 1};
  }

  function fitBlockPagerLinks(pager) {
    const links = pager.querySelector('.jump-links');
    if (!links) return;
    links.querySelectorAll('.hidden-by-fit').forEach((node) => node.classList.remove('hidden-by-fit'));
    const candidates = Array.from(links.querySelectorAll('[data-jump-priority]')).sort((a, b) => {
      return Number(b.dataset.jumpPriority || 0) - Number(a.dataset.jumpPriority || 0);
    });
    for (let index = 0; index < candidates.length && links.scrollWidth > links.clientWidth + 1; index += 1) {
      candidates[index].classList.add('hidden-by-fit');
    }
  }

  function renderBlockPager() {
    const totalPages = Math.max(1, Math.ceil((blockState.totalItems || 0) / blockState.perPage));
    blockState.page = clampInteger(blockState.page, 1, 1, totalPages);
    const startItem = blockState.totalItems ? ((blockState.page - 1) * blockState.perPage) + 1 : 0;
    const endItem = blockState.totalItems ? Math.min(blockState.totalItems, blockState.page * blockState.perPage) : 0;
    const width = pagerAvailableWidth();
    const negativeSteps = jumpStepsForWidth(width, 'negative');
    const positiveSteps = jumpStepsForWidth(width, 'positive');
    const includeTenStep = width >= 430;
    const includePrevNext = width >= 430;
    const windowRange = blockPageWindow(totalPages, directBlockPageCount(totalPages, negativeSteps, positiveSteps, includeTenStep, includePrevNext, width));

    function pageButton(label, page, disabled, active, priority) {
      const classes = [active ? 'active' : '', disabled ? 'disabled' : ''].filter(Boolean).join(' ');
      const priorityAttr = priority ? ` data-jump-priority="${priority}"` : '';
      return `<button type="button" class="${classes}" data-block-page="${page}"${priorityAttr} ${disabled ? 'disabled aria-disabled="true"' : ''}>${escapeHtml(label)}</button>`;
    }

    let buttons = [];
    buttons.push(pageButton('First', 1, blockState.page === 1, blockState.page === 1, null));
    negativeSteps.forEach((step) => {
      const label = step[0];
      const distance = step[1];
      buttons.push(pageButton(`-${label}`, blockState.page - distance, blockState.page <= distance, false, distance === 100 ? null : 40 + String(distance).length));
    });
    buttons.push(pageButton('1', 1, blockState.page === 1, blockState.page === 1, null));
    if (includeTenStep) {
      buttons.push(pageButton('-10', blockState.page - 10, blockState.page <= 10, false, 80));
    }
    if (includePrevNext) {
      buttons.push(pageButton('Prev', blockState.page - 1, blockState.page <= 1, false, null));
    }
    for (let page = windowRange.start; page <= windowRange.end; page += 1) {
      if (page !== 1 && page !== totalPages) {
        buttons.push(pageButton(String(page), page, false, page === blockState.page, 100 + Math.abs(page - blockState.page)));
      }
    }
    if (includePrevNext) {
      buttons.push(pageButton('Next', blockState.page + 1, blockState.page >= totalPages, false, null));
    }
    if (includeTenStep) {
      buttons.push(pageButton('+10', blockState.page + 10, blockState.page + 10 > totalPages, false, 80));
    }
    buttons.push(pageButton('Last', totalPages, blockState.page === totalPages, blockState.page === totalPages, null));
    positiveSteps.forEach((step) => {
      const label = step[0];
      const distance = step[1];
      buttons.push(pageButton(`+${label}`, blockState.page + distance, blockState.page + distance > totalPages, false, distance === 100 ? null : 40 + String(distance).length));
    });

    const options = blockPerPageOptions.map((size) => `<option value="${size}" ${size === blockState.perPage ? 'selected' : ''}>${size}</option>`).join('');
    const html = `
      <div class="jump-meta">
        <strong>Jump to Page</strong>
        <span class="defcoin-pill">${startItem}-${endItem} of ${blockState.totalItems || 0} blocks</span>
      </div>
      <div class="jump-controls">
        <div class="jump-links">${buttons.join('')}</div>
        <form class="block-page-form">
          <label class="defcoin-table-meta">Page
            <input type="number" min="1" max="${totalPages}" value="${blockState.page}" data-block-page-input>
          </label>
          <label class="defcoin-table-meta">Per page
            <select data-block-per-page>${options}</select>
          </label>
          <button type="submit" class="secondary">Go</button>
        </form>
      </div>`;

    document.querySelectorAll('#poolBlockPagerBottom').forEach((pager) => {
      pager.innerHTML = html;
      pager.querySelectorAll('[data-block-page]').forEach((button) => {
        button.addEventListener('click', function() {
          blockState.page = clampInteger(this.dataset.blockPage, blockState.page, 1, totalPages);
          loadRecentBlocksPage();
        });
      });
      const perPageSelect = pager.querySelector('[data-block-per-page]');
      if (perPageSelect) {
        perPageSelect.addEventListener('change', function() {
          const previousPerPage = blockState.perPage;
          blockState.perPage = clampInteger(this.value, blockState.perPage, 1, blockMaxPerPage);
          const preservedOffset = Math.max(0, ((blockState.page - 1) * previousPerPage));
          blockState.page = Math.floor(preservedOffset / blockState.perPage) + 1;
          loadRecentBlocksPage();
        });
      }
      const form = pager.querySelector('.block-page-form');
      if (form) {
        form.addEventListener('submit', function(event) {
          event.preventDefault();
          const previousPerPage = blockState.perPage;
          const pageInput = form.querySelector('[data-block-page-input]');
          blockState.page = clampInteger(pageInput && pageInput.value, blockState.page, 1, totalPages);
          blockState.perPage = clampInteger(perPageSelect && perPageSelect.value, blockState.perPage, 1, blockMaxPerPage);
          if (previousPerPage !== blockState.perPage) {
            const preservedOffset = Math.max(0, ((blockState.page - 1) * previousPerPage));
            blockState.page = Math.floor(preservedOffset / blockState.perPage) + 1;
          }
          loadRecentBlocksPage();
        });
      }
      fitBlockPagerLinks(pager);
    });
  }

  function renderRecentBlockTable(blockRows) {
    const table = document.querySelector('#pool-recent-chain-blocks');
    const tbody = table && table.querySelector('tbody');
    const theadRow = table && table.querySelector('thead tr');
    if (!tbody) return;
    const detailed = blockState.view === 'detailed';
    const colspan = detailed ? 6 : 3;
    if (theadRow) {
      theadRow.innerHTML = detailed
        ? '<th class="text-center">When</th><th class="text-center">Date/Time</th><th class="text-center">Height</th><th class="text-center">Transaction</th><th class="text-center">Recipient Count</th><th class="text-center">Amount</th>'
        : '<th class="text-center">When</th><th class="text-center">Date/Time</th><th class="text-center">Height</th>';
    }

    if (!Array.isArray(blockRows) || !blockRows.length) {
      tbody.innerHTML = `<tr><td class="text-center" colspan="${colspan}">No blocks found for this page</td></tr>`;
      setText('poolBlockTableMeta', 'No blocks on this page');
      return;
    }

    const rows = blockRows.map((entry) => {
      const blockHash = entry.blockhash || '';
      const txid = entry.txid || '';
      const txUrl = `${explorerBase}/tx/${encodeURIComponent(txid)}`;
      const blockUrl = `${explorerBase}/block/${encodeURIComponent(blockHash)}`;
      const baseColumns = `
        <td class="text-center defcoin-nowrap">${escapeHtml(formatRelativeTime(entry.timestamp))}</td>
        <td class="text-center defcoin-nowrap">${escapeHtml(formatTimestamp(entry.timestamp))}</td>
        <td class="text-center defcoin-nowrap"><a href="${blockUrl}">${escapeHtml(entry.blockindex || '-')}</a></td>`;
      const detailColumns = detailed
        ? `<td class="text-center defcoin-nowrap"><a href="${txUrl}" title="${escapeHtml(txid)}">${escapeHtml(shortHash(txid))}</a></td>
        <td class="text-center defcoin-nowrap">${escapeHtml(entry.recipients || '-')}</td>
        <td class="text-center defcoin-nowrap">${escapeHtml(formatCoin(entry.amount, 'DFC'))}</td>`
        : '';
      return `<tr>${baseColumns}${detailColumns}
      </tr>`;
    });

    tbody.innerHTML = rows.join('');
    setText('poolBlockTableMeta', `Page ${blockState.page} · ${blockState.perPage} per page · ${blockState.view === 'detailed' ? 'Detailed' : 'Simple'}`);
  }

  async function loadRecentBlocksPage() {
    const tbody = document.querySelector('#pool-recent-chain-blocks tbody');
    if (!tbody) return;
    blockState.perPage = clampInteger(blockState.perPage, 10, 1, blockMaxPerPage);
    renderBlockViewToggle();
    try {
      tbody.innerHTML = '<tr><td class="text-center" colspan="3">Loading blocks</td></tr>';
      const summary = await fetchExplorerSummary();
      blockState.totalItems = clampInteger(summary && summary.blockcount, 0, 0, Number.MAX_SAFE_INTEGER);
      const totalPages = Math.max(1, Math.ceil((blockState.totalItems || 0) / blockState.perPage));
      blockState.page = clampInteger(blockState.page, 1, 1, totalPages);
      const offset = (blockState.page - 1) * blockState.perPage;
      const response = await fetch(`${explorerBase}/ext/getlasttxs/0/${offset}/${blockState.perPage}`, {
        headers: {Accept: 'application/json'},
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(`Recent blocks returned ${response.status}`);
      const blockRows = await response.json();
      renderRecentBlockTable(blockRows);
      renderBlockPager();
      writeBlockPagingToUrl();
    } catch (error) {
      const colspan = blockState.view === 'detailed' ? 6 : 3;
      tbody.innerHTML = `<tr><td class="text-center" colspan="${colspan}">Recent blocks are unavailable right now</td></tr>`;
      setText('poolBlockTableMeta', 'Unavailable');
      renderBlockPager();
    }
  }

  function renderStats(currencyInfo, localStats, globalStats, recentBlocks, summary) {
    const symbol = (currencyInfo && currencyInfo.symbol) || 'DFC';
    const localHashrate = Object.values(localStats.miner_hash_rates || {}).reduce((sum, rate) => sum + Number(rate || 0), 0);
    const poolHashrate = Number(globalStats.pool_hash_rate || 0);
    const poolNonstaleHashrate = Number(globalStats.pool_nonstale_hash_rate || 0);
    const walletNetworkEstimate = Number(globalStats.network_hashrate || 0);
    const incoming = localStats.peers && Number(localStats.peers.incoming || 0);
    const outgoing = localStats.peers && Number(localStats.peers.outgoing || 0);
    const attemptsToShare = Number(localStats.attempts_to_share || 0);
    const attemptsToBlock = Number(localStats.attempts_to_block || 0);
    const recentShareCount = Number((localStats.my_share_counts_in_last_hour || {}).shares || 0);
    const recentLocalHashrate = Number((localStats.my_hash_rates_in_last_hour || {}).actual || 0);
    const latestPoolBlockTs = (recentBlocks && recentBlocks.length > 0 ? Number(recentBlocks[0].ts || 0) : 0);
    const poolActivityIsCurrent = isRecentActivity(latestPoolBlockTs);
    const liveShareActivity = recentShareCount > 0 || recentLocalHashrate > 0 || localHashrate > 0 || poolNonstaleHashrate > 0;
    const localMinersActive = localHashrate > 0;
    const globalPoolActive = (poolHashrate > 0) && (poolActivityIsCurrent || liveShareActivity);
    const networkRateCurrent = walletNetworkEstimate > 0 && poolActivityIsCurrent;
    const observedLiveNetworkFloor = Math.max(localHashrate, poolNonstaleHashrate, poolHashrate);
    const historicalEstimate = formatDormantLabel(latestPoolBlockTs);

    setText('poolUpdatedAt', formatDateTime(new Date()));
    renderChainDateCards(summary);
    setText('poolNodePeers', `${incoming || 0} in / ${outgoing || 0} out`);
    setText('poolGlobalHashrate', globalPoolActive ? formatHashrate(poolHashrate) : historicalEstimate);
    setText('poolLocalHashrate', localMinersActive ? formatHashrate(localHashrate) : 'No active miners');
    if (networkRateCurrent) {
      setText('poolNetworkHashrate', formatHashrate(walletNetworkEstimate));
    } else if (liveShareActivity && observedLiveNetworkFloor > 0) {
      setText('poolNetworkHashrate', `>= ${formatHashrate(observedLiveNetworkFloor)} observed live`);
    } else {
      setText('poolNetworkHashrate', historicalEstimate);
    }
    setText('poolShareDifficulty', Number(globalStats.min_difficulty || 0).toFixed(8));
    setText('poolCurrentDifficulty', formatDifficulty((globalStats && globalStats.network_block_difficulty) || (summary && summary.difficulty)));
    setText('poolBlockValue', formatCoin(localStats.block_value, symbol));
    setPoolShares(localStats.shares.total, localStats.shares.orphan, localStats.shares.dead);
    setText('poolExpectedShare', localMinersActive ? formatDuration(attemptsToShare / localHashrate) : '∞ never');
    setText('poolExpectedBlock', globalPoolActive ? formatDuration(attemptsToBlock / poolHashrate) : '∞ never');
    setText('poolVersion', formatP2PoolVersion(localStats.version));
    setText('poolProtocol', localStats.protocol_version || '-');
    setText('poolFee', `${Number(localStats.fee || 0).toFixed(2)}%`);
    if (Number(localStats.donation_proportion || 0) > 0) {
      setText('poolDonation', `${(Number(localStats.donation_proportion || 0) * 100).toFixed(2)}%`);
    } else {
      setDonationFixLink('poolDonation');
    }

    if (poolActivityIsCurrent) {
      setText('poolActivityNote', 'Recent pool shares were found within the last 24 hours, so current hashrate estimates are being shown.');
    } else if (liveShareActivity && globalPoolActive) {
      setText('poolActivityNote', `This pool is receiving live shares right now, even though it has not found a block for ${formatRelativeTime(latestPoolBlockTs)}. Expected Time To Block assumes today's pool pace continues. Because the usual wallet estimate is stale, the Network Hashrate box shows the minimum live rate we can actually see instead.`);
    } else if (latestPoolBlockTs) {
      setText('poolActivityNote', `No pool block has been found for ${formatRelativeTime(latestPoolBlockTs)}. Global Pool Hashrate and Network Hashrate are historical only, so Expected Time To Block is shown as ∞ never.`);
    } else {
      setText('poolActivityNote', 'No pool blocks have been reported yet, so live hashrate and block-time estimates are unavailable.');
    }
  }

  async function refreshPoolPage() {
    try {
      const [currencyInfo, localStats, currentPayouts, payoutWeights, poolRate, globalStats, recentBlocks, summary] = await Promise.all([
        fetchJson('/web/currency_info'),
        fetchJson('/local_stats'),
        fetchJson('/current_payouts'),
        fetchJson('/users'),
        fetchJson('/rate'),
        fetchJson('/global_stats'),
        fetchJson('/recent_blocks'),
        fetchExplorerSummary()
      ]);

      hideAlert();
      renderStats(currencyInfo, localStats, globalStats, recentBlocks || [], summary);
      renderMinerTable(localStats, currentPayouts || {}, payoutWeights || {}, poolRate || 0, (currencyInfo && currencyInfo.symbol) || 'DFC');
      renderBlockTable(recentBlocks || []);
    } catch (error) {
      try {
        const summary = await fetchExplorerSummary();
        showAlert(buildUnavailableMessage(summary));
      } catch (summaryError) {
        showAlert(buildUnavailableMessage(null));
      }
      setText('poolUpdatedAt', 'Unavailable');
      setText('poolLastBlock', 'Unavailable');
    }
  }

  document.addEventListener('DOMContentLoaded', function() {
    readBlockPagingFromUrl();
    bindMinerSortHeaders();
    renderBlockViewToggle();
    refreshPoolPage();
    loadRecentBlocksPage();
    let resizeTimer = null;
    window.addEventListener('resize', function() {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(renderBlockPager, 120);
    });
    window.setInterval(refreshPoolPage, refreshIntervalMs);
  });
})();

(function() {
  const poolApiBase = window.location.origin + '/poolapi';
  const explorerBase = window.location.origin + '/explorer';
  const refreshIntervalMs = 30000;
  const inactiveThresholdSeconds = 24 * 60 * 60;

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

  function formatCoin(value, symbol) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) {
      return '-';
    }

    return `${amount.toFixed(8)} ${symbol || 'DFC'}`;
  }

  function formatTimestamp(ts) {
    if (!ts) return 'Never';
    return new Date(ts * 1000).toLocaleString();
  }

  function formatRelativeTime(ts) {
    if (!ts) return 'Never';
    const delta = Math.max(0, Math.floor(Date.now() / 1000) - ts);
    return `${formatDuration(delta)} ago`;
  }

  function isRecentActivity(ts) {
    if (!ts) return false;
    return ((Date.now() / 1000) - Number(ts)) < inactiveThresholdSeconds;
  }

  function formatP2PoolVersion(version) {
    if (!version) return '-';
    return String(version).replace(/-dirty$/, ' (local patches)');
  }

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
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

  function renderMinerTable(localStats, currentPayouts, symbol) {
    const tbody = document.querySelector('#pool-active-miners tbody');
    if (!tbody) return;

    const minerRates = localStats.miner_hash_rates || {};
    const deadRates = localStats.miner_dead_hash_rates || {};
    const addresses = Object.keys(minerRates).sort((a, b) => Number(minerRates[b] || 0) - Number(minerRates[a] || 0));

    setText('poolMinerCount', String(addresses.length));

    if (!addresses.length) {
      setText('poolMinerTableMeta', 'No active miners reported on this node');
      tbody.innerHTML = '<tr><td class="text-center" colspan="4">No active miners reported yet</td></tr>';
      return;
    }

    setText('poolMinerTableMeta', 'Sorted by hashrate');

    const rows = addresses.map((address) => {
      const hashrate = Number(minerRates[address] || 0);
      const rejected = Number(deadRates[address] || 0);
      const payout = currentPayouts[address];
      const explorerUrl = `${explorerBase}/address/${encodeURIComponent(address)}`;

      return `<tr>
        <td class="breakWord"><a href="${explorerUrl}">${address}</a></td>
        <td class="text-center">${formatHashrate(hashrate)}</td>
        <td class="text-center">${formatHashrate(rejected)}</td>
        <td class="text-center">${payout ? formatCoin(payout, symbol) : 'No shares yet'}</td>
      </tr>`;
    });

    tbody.innerHTML = rows.join('');
  }

  function renderBlockTable(recentBlocks) {
    const tbody = document.querySelector('#pool-recent-blocks tbody');
    if (!tbody) return;

    if (!recentBlocks || !recentBlocks.length) {
      tbody.innerHTML = '<tr><td class="text-center" colspan="3">No recent blocks reported yet</td></tr>';
      setText('poolLastBlock', 'None yet');
      return;
    }

    const rows = recentBlocks.map((block) => {
      const hash = block.hash || '';
      const height = block.number || '-';
      const blockUrl = `${explorerBase}/block/${encodeURIComponent(hash)}`;

      return `<tr>
        <td class="text-center">${formatRelativeTime(block.ts)}</td>
        <td class="text-center">${formatTimestamp(block.ts)}</td>
        <td class="text-center"><a href="${blockUrl}">${height}</a></td>
      </tr>`;
    });

    tbody.innerHTML = rows.join('');
    setText('poolLastBlock', formatRelativeTime(recentBlocks[0].ts));
  }

  function renderStats(currencyInfo, localStats, globalStats, recentBlocks) {
    const symbol = (currencyInfo && currencyInfo.symbol) || 'DFC';
    const localHashrate = Object.values(localStats.miner_hash_rates || {}).reduce((sum, rate) => sum + Number(rate || 0), 0);
    const poolHashrate = Number(globalStats.pool_hash_rate || 0);
    const incoming = localStats.peers && Number(localStats.peers.incoming || 0);
    const outgoing = localStats.peers && Number(localStats.peers.outgoing || 0);
    const attemptsToShare = Number(localStats.attempts_to_share || 0);
    const attemptsToBlock = Number(localStats.attempts_to_block || 0);
    const latestPoolBlockTs = (recentBlocks && recentBlocks.length > 0 ? Number(recentBlocks[0].ts || 0) : 0);
    const poolActivityIsCurrent = isRecentActivity(latestPoolBlockTs);
    const localMinersActive = localHashrate > 0;
    const globalPoolActive = poolActivityIsCurrent && poolHashrate > 0;
    const networkRateCurrent = poolActivityIsCurrent && Number(globalStats.network_hashrate || 0) > 0;

    setText('poolUpdatedAt', new Date().toLocaleString());
    setText('poolNodePeers', `${incoming || 0} in / ${outgoing || 0} out`);
    setText('poolGlobalHashrate', globalPoolActive ? formatHashrate(poolHashrate) : 'Stale estimate');
    setText('poolLocalHashrate', localMinersActive ? formatHashrate(localHashrate) : 'No active miners');
    setText('poolNetworkHashrate', networkRateCurrent ? formatHashrate(globalStats.network_hashrate || 0) : 'Stale estimate');
    setText('poolShareDifficulty', Number(globalStats.min_difficulty || 0).toFixed(8));
    setText('poolBlockValue', formatCoin(localStats.block_value, symbol));
    setText('poolShares', `Total ${localStats.shares.total}, orphan ${localStats.shares.orphan}, dead ${localStats.shares.dead}`);
    setText('poolExpectedShare', localMinersActive ? formatDuration(attemptsToShare / localHashrate) : '∞ inactive');
    setText('poolExpectedBlock', globalPoolActive ? formatDuration(attemptsToBlock / poolHashrate) : '∞ inactive');
    setText('poolVersion', formatP2PoolVersion(localStats.version));
    setText('poolProtocol', localStats.protocol_version || '-');
    setText('poolFee', `${Number(localStats.fee || 0).toFixed(2)}%`);
    setText('poolDonation', Number(localStats.donation_proportion || 0) > 0 ? `${(Number(localStats.donation_proportion || 0) * 100).toFixed(2)}%` : 'None');
  }

  async function refreshPoolPage() {
    try {
      const [currencyInfo, localStats, currentPayouts, globalStats, recentBlocks] = await Promise.all([
        fetchJson('/web/currency_info'),
        fetchJson('/local_stats'),
        fetchJson('/current_payouts'),
        fetchJson('/global_stats'),
        fetchJson('/recent_blocks')
      ]);

      hideAlert();
      renderStats(currencyInfo, localStats, globalStats, recentBlocks || []);
      renderMinerTable(localStats, currentPayouts || {}, (currencyInfo && currencyInfo.symbol) || 'DFC');
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
    refreshPoolPage();
    window.setInterval(refreshPoolPage, refreshIntervalMs);
  });
})();

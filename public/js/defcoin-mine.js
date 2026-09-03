(function() {
  function parseEmbeddedJson(id) {
    const node = document.getElementById(id);
    if (!node) {
      return null;
    }

    try {
      return JSON.parse(node.textContent);
    } catch (error) {
      return null;
    }
  }

  function formatMoney(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) {
      return '-';
    }

    return '$' + amount.toFixed(2);
  }

  function createLinkList(sources) {
    if (!Array.isArray(sources) || !sources.length) {
      return '—';
    }

    return sources.map(function(source) {
      return `<a href="${source.url}">${source.label}</a>`;
    }).join('<br>');
  }

  function renderFallbackCatalog(catalog) {
    const tbody = document.querySelector('#mining-estimates-table tbody');
    if (!tbody || !catalog || !Array.isArray(catalog.rigs)) {
      return;
    }

    tbody.innerHTML = catalog.rigs.map(function(rig) {
      return `<tr>
        <td>${rig.name}</td>
        <td>${rig.classLabel || rig.class || '-'}</td>
        <td>${rig.hashrateLabel || '-'}</td>
        <td class="text-center">${rig.watts || '-'}</td>
        <td>${rig.priceRangeLabel || '-'}</td>
        <td class="text-center">Loading</td>
        <td class="text-center">Live endpoint unavailable</td>
        <td class="text-center">Live endpoint unavailable</td>
        <td>${createLinkList(rig.sources)}</td>
      </tr>`;
    }).join('');
  }

  function renderMiningData(payload) {
    const tbody = document.querySelector('#mining-estimates-table tbody');
    if (!tbody || !payload || !Array.isArray(payload.rigs)) {
      return;
    }

    document.getElementById('miningCatalogChecked').textContent = payload.checkedOn || '-';
    document.getElementById('miningPowerCostDefault').textContent = '$' + Number(payload.defaultPowerCostUsdPerKwh || 0).toFixed(2) + ' / kWh';
    document.getElementById('miningPoolContext').textContent = payload.context && payload.context.poolContextLabel ? payload.context.poolContextLabel : 'Unavailable';
    document.getElementById('miningNetworkContext').textContent = payload.context && payload.context.networkContextLabel ? payload.context.networkContextLabel : 'Unavailable';

    tbody.innerHTML = payload.rigs.map(function(rig) {
      return `<tr>
        <td>
          <strong>${rig.name}</strong><br>
          <span class="defcoin-tool-subtext">${rig.summary || ''}</span>
        </td>
        <td>${rig.classLabel || rig.class || '-'}</td>
        <td>${rig.hashrateLabel || '-'}</td>
        <td class="text-center">${rig.watts || '-'}</td>
        <td>${rig.priceRangeLabel || '-'}</td>
        <td class="text-center">${formatMoney(rig.powerCostPerDayUsd)}</td>
        <td class="text-center">${rig.observedRecentDfCPerDayLabel || 'Unavailable'}</td>
        <td class="text-center">${rig.expectedDfCPerDayLabel || 'Unavailable'}</td>
        <td>${createLinkList(rig.sources)}</td>
      </tr>`;
    }).join('');
  }

  async function refreshMiningEstimates() {
    const catalog = parseEmbeddedJson('defcoinMiningCatalogData');

    try {
      const response = await fetch('/ext/mining-estimates', {
        headers: {
          Accept: 'application/json'
        },
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error('Mining estimate endpoint returned ' + response.status);
      }

      renderMiningData(await response.json());
    } catch (error) {
      renderFallbackCatalog(catalog);
      if (document.getElementById('miningPoolContext')) {
        document.getElementById('miningPoolContext').textContent = 'Live mining estimates unavailable';
      }
      if (document.getElementById('miningNetworkContext')) {
        document.getElementById('miningNetworkContext').textContent = 'Showing catalog only';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', function() {
    refreshMiningEstimates();
  });
})();

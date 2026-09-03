(function() {
  const poolApiBase = window.location.origin + '/poolapi';
  const explorerBase = window.location.origin + '/explorer';
  const touchedFields = {
    rewardDifficulty: false,
    rewardBlockValue: false
  };

  function formatValue(value) {
    if (!Number.isFinite(value) || value <= 0) {
      return '0 DFC/day';
    }

    return `${value.toFixed(8)} DFC/day`;
  }

  function formatNumber(value, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return fallback;
    }
    return String(Number(numeric.toFixed(8)));
  }

  function setNumericField(id, value) {
    const field = document.getElementById(id);
    const numeric = Number(value);
    if (!field || touchedFields[id] || !Number.isFinite(numeric) || numeric <= 0) {
      return false;
    }
    field.value = formatNumber(numeric, field.value);
    return true;
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      headers: {Accept: 'application/json'},
      cache: 'no-store'
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  }

  async function hydrateCurrentDefaults() {
    const helper = document.getElementById('rewardHelper');

    try {
      const [localStats, globalStats, summary] = await Promise.all([
        fetchJson(poolApiBase + '/local_stats'),
        fetchJson(poolApiBase + '/global_stats'),
        fetchJson(explorerBase + '/ext/getsummary')
      ]);
      const rewardUpdated = setNumericField('rewardBlockValue', localStats && localStats.block_value);
      const difficultyUpdated = setNumericField(
        'rewardDifficulty',
        (globalStats && globalStats.network_block_difficulty) || (summary && summary.difficulty)
      );
      if ((rewardUpdated || difficultyUpdated) && helper) {
        helper.textContent = 'Current block reward and difficulty were loaded from this server. Edit any field to run a what-if estimate.';
      }
      calculateReward();
    } catch (error) {
      if (helper) {
        helper.textContent = 'Using built-in current defaults because live pool data is unavailable. Edit any field to run a what-if estimate.';
      }
    }
  }

  function calculateReward() {
    const difficulty = Number(document.getElementById('rewardDifficulty').value || 0);
    const hashrate = Number(document.getElementById('rewardHashrate').value || 0);
    const blockReward = Number(document.getElementById('rewardBlockValue').value || 0);
    const output = document.getElementById('rewardOutput');
    const helper = document.getElementById('rewardHelper');

    if (!output || !helper) {
      return;
    }

    if (difficulty <= 0 || hashrate <= 0 || blockReward <= 0) {
      output.textContent = '0 DFC/day';
      helper.textContent = 'Enter positive values for network difficulty, hashrate, and block reward to calculate a daily estimate.';
      return;
    }

    const secondsPerBlock = (difficulty * 4294967296) / (hashrate * 1000);
    const blocksPerDay = 86400 / secondsPerBlock;
    const coinsPerDay = blocksPerDay * blockReward;

    output.textContent = formatValue(coinsPerDay);
    helper.textContent = `At ${hashrate} KH/s and difficulty ${difficulty}, the original DC903 formula estimates about ${coinsPerDay.toFixed(4)} DFC each day.`;
  }

  document.addEventListener('DOMContentLoaded', function() {
    ['rewardDifficulty', 'rewardHashrate', 'rewardBlockValue'].forEach(function(id) {
      const field = document.getElementById(id);
      if (!field) return;
      if (Object.prototype.hasOwnProperty.call(touchedFields, id)) {
        field.addEventListener('input', function() {
          touchedFields[id] = true;
        });
      }
      field.addEventListener('input', calculateReward);
      field.addEventListener('blur', calculateReward);
    });

    calculateReward();
    hydrateCurrentDefaults();
  });
})();

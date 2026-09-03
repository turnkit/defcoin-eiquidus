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

  function setResult(message, isError) {
    const node = document.getElementById('faucetClaimResult');
    if (!node) {
      return;
    }

    node.textContent = message;
    node.classList.toggle('text-danger', !!isError);
    node.classList.toggle('text-success', !isError);
  }

  async function submitClaim(event) {
    event.preventDefault();

    const addressField = document.getElementById('faucetAddress');
    const submitButton = document.getElementById('faucetSubmit');
    const address = addressField ? addressField.value.trim() : '';

    if (!address) {
      setResult('Enter a Defcoin destination address first.', true);
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Submitting';
    setResult('Submitting faucet request…', false);

    try {
      const response = await fetch('/faucet/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          address: address
        })
      });

      const payload = await response.json().catch(function() {
        return { ok: false, message: 'Unexpected faucet response.' };
      });

      setResult(payload.message || 'Faucet request completed.', !payload.ok);
    } catch (error) {
      setResult('Faucet request failed before the server could reply.', true);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Request Faucet Coins';
    }
  }

  document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('defcoinFaucetClaimForm');
    const status = parseEmbeddedJson('defcoinFaucetStatusData');

    if (status && status.config && status.config.enabled !== true) {
      setResult('The faucet is currently disabled. Requests will be rejected cleanly until a dedicated payout chest is configured and funded.', true);
    }

    if (form) {
      form.addEventListener('submit', submitClaim);
    }
  });
})();

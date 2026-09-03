(function() {
  function buildUri(address, amount, label, message) {
    const params = new URLSearchParams();
    if (amount) params.set('amount', amount);
    if (label) params.set('label', label);
    if (message) params.set('message', message);

    const query = params.toString();
    return `defcoin:${address}${query ? `?${query}` : ''}`;
  }

  function renderQr() {
    const address = document.getElementById('qrAddress').value.trim();
    const amount = document.getElementById('qrAmount').value.trim();
    const label = document.getElementById('qrLabel').value.trim();
    const message = document.getElementById('qrMessage').value.trim();
    const uriNode = document.getElementById('qrUri');
    const previewNode = document.getElementById('qrPreview');

    if (!address) {
      uriNode.textContent = 'Enter a Defcoin address to generate a payment QR code.';
      if (previewNode) {
        previewNode.removeAttribute('src');
        previewNode.setAttribute('alt', 'QR preview unavailable until a Defcoin address is entered');
      }
      return;
    }

    const uri = buildUri(address, amount, label, message);
    uriNode.textContent = uri;

    if (previewNode) {
      previewNode.setAttribute('src', '/qr/' + encodeURIComponent(uri));
      previewNode.setAttribute('alt', 'Defcoin payment QR preview for ' + address);
    }
  }

  async function copyUri() {
    const uri = document.getElementById('qrUri').textContent;
    if (!uri || uri.indexOf('defcoin:') !== 0) {
      return;
    }

    try {
      await navigator.clipboard.writeText(uri);
      document.getElementById('qrCopy').textContent = 'Copied';
      window.setTimeout(function() {
        document.getElementById('qrCopy').textContent = 'Copy URI';
      }, 1400);
    } catch (error) {
      document.getElementById('qrCopy').textContent = 'Copy Failed';
      window.setTimeout(function() {
        document.getElementById('qrCopy').textContent = 'Copy URI';
      }, 1400);
    }
  }

  function resetForm() {
    document.getElementById('qrAddress').value = 'DKKcPE99YsjHCSd6YaXAmJB2gbGhWietzP';
    document.getElementById('qrAmount').value = '';
    document.getElementById('qrLabel').value = '';
    document.getElementById('qrMessage').value = '';
    renderQr();
  }

  document.addEventListener('DOMContentLoaded', function() {
    ['qrAddress', 'qrAmount', 'qrLabel', 'qrMessage'].forEach(function(id) {
      const field = document.getElementById(id);
      if (!field) return;
      field.addEventListener('input', renderQr);
      field.addEventListener('blur', renderQr);
    });

    document.getElementById('qrCopy').addEventListener('click', copyUri);
    document.getElementById('qrReset').addEventListener('click', resetForm);

    renderQr();
  });
})();

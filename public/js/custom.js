function defcoinEscapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function(char) {
    return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char];
  });
}

if (typeof window !== 'undefined')
  window.defcoinEscapeHtml = defcoinEscapeHtml;

if (typeof module !== 'undefined' && module.exports)
  module.exports = { defcoinEscapeHtml };

if (typeof document !== 'undefined' && typeof $ === 'function') {
  $(document).ready(function() {
    /* Add custom javascript code here */
  });
}

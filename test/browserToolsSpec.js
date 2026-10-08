'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('payment QR browser controls', function() {
  let fields;
  let ready;
  let codes;
  let context;

  beforeEach(function() {
    fields = {};
    ['qrAddress', 'qrAmount', 'qrLabel', 'qrMessage', 'qrUri', 'qrCopy', 'qrReset', 'qrcode'].forEach(function(id) {
      fields[id] = {value: '', textContent: '', hidden: false, listeners: {}, addEventListener: function(event, action) {
        this.listeners[event] = action;
      }};
    });
    fields.qrAddress.value = 'DKKcPE99YsjHCSd6YaXAmJB2gbGhWietzP';
    codes = [];
    function FakeQr(node, options) {
      this.node = node;
      this.options = options;
      this.makeCode = function(uri) {
        if (uri.length > 2400) throw new Error('Too long data');
        codes.push(uri);
      };
    }
    FakeQr.CorrectLevel = {M: 0};
    context = {
      QRCode: FakeQr,
      URLSearchParams: URLSearchParams,
      document: {
        getElementById: function(id) { return fields[id] || null; },
        addEventListener: function(event, action) {
          expect(event).toBe('DOMContentLoaded');
          ready = action;
        }
      },
      navigator: {clipboard: {writeText: async function() {}}},
      window: {setTimeout: function() {}}
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/defcoin-qr-generator.js'), 'utf8'), context);
    ready();
  });

  it('renders a QR in the container present in the Pug template', function() {
    const template = fs.readFileSync(path.join(__dirname, '../views/qr_generator.pug'), 'utf8');
    expect(template).toContain('#qrcode');
    expect(codes).toEqual(['defcoin:DKKcPE99YsjHCSd6YaXAmJB2gbGhWietzP']);
    expect(fields.qrcode.hidden).toBeFalse();
  });

  it('updates the image payload and URI with encoded optional fields', function() {
    fields.qrAmount.value = '1.25';
    fields.qrLabel.value = 'Test & sample';
    fields.qrMessage.value = '雪 <script>';
    fields.qrMessage.listeners.input();
    expect(codes[codes.length - 1]).toBe('defcoin:DKKcPE99YsjHCSd6YaXAmJB2gbGhWietzP?amount=1.25&label=Test+%26+sample&message=%E9%9B%AA+%3Cscript%3E');
    expect(fields.qrUri.textContent).toBe(codes[codes.length - 1]);
  });

  it('clears and hides a previous QR when the address becomes empty', function() {
    fields.qrAddress.value = '  ';
    fields.qrAddress.listeners.input();
    expect(fields.qrcode.hidden).toBeTrue();
    expect(fields.qrcode.textContent).toBe('');
    expect(fields.qrUri.textContent).toContain('Enter a Defcoin address');
    expect(codes.length).toBe(1);
  });

  it('restores the default payload after Reset', function() {
    fields.qrAmount.value = '3';
    fields.qrAmount.listeners.input();
    fields.qrReset.listeners.click();
    expect(fields.qrAmount.value).toBe('');
    expect(codes[codes.length - 1]).toBe('defcoin:DKKcPE99YsjHCSd6YaXAmJB2gbGhWietzP');
  });

  it('shows a bounded-input failure and recovers on a shorter URI', function() {
    fields.qrLabel.value = 'x'.repeat(2500);
    expect(function() { fields.qrLabel.listeners.input(); }).not.toThrow();
    expect(fields.qrcode.textContent).toContain('Shorten the label or message');
    fields.qrLabel.value = 'Short';
    fields.qrLabel.listeners.input();
    expect(fields.qrcode.textContent).toBe('');
    expect(codes[codes.length - 1]).toContain('label=Short');
  });

  it('copies the current URI without sending a payment', async function() {
    const write = spyOn(context.navigator.clipboard, 'writeText').and.resolveTo();
    await fields.qrCopy.listeners.click();
    expect(write).toHaveBeenCalledOnceWith(fields.qrUri.textContent);
    expect(fields.qrCopy.textContent).toBe('Copied');
  });
});

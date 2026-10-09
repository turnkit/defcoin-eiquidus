'use strict';

const fs = require('fs');
const path = require('path');
const pug = require('pug');
const history = require('../lib/defcoin_history_data');
const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public/css/defcoin-integrated.css'), 'utf8');
const design = fs.readFileSync(path.join(root, 'DESIGN.md'), 'utf8');
const tokens = Object.fromEntries([...css.matchAll(/(--dc34-[\w-]+):\s*([^;]+);/g)]
  .map(function(match) { return [match[1], match[2].trim()]; }));

function hex(value) {
  const raw = value.replace('#', '');
  return raw.length === 3 ? raw.split('').map(function(char) { return char + char; }).join('').toLowerCase() : raw.toLowerCase();
}

function luminance(value) {
  const rgb = hex(value).match(/../g).map(function(channel) {
    const component = Number.parseInt(channel, 16) / 255;
    return component <= 0.04045 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort(function(a, b) { return b - a; });
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function render(view, data) {
  const filename = path.join(root, 'views', view + '.pug');
  const source = fs.readFileSync(filename, 'utf8').replace(/^extends layout\n/, '');
  return pug.render('mixin defcoinPageBranding(className)\n  span Defcoin\n' + source, { ...data, filename });
}

describe('History reading surface and private security-report boundary', function() {
  it('keeps documented palette values tied to the canonical runtime source', function() {
    const mapping = {
      primary: 'gold', secondary: 'cyan', background: 'charcoal', surface: 'panel',
      foreground: 'text', muted: 'muted', scrollbar: 'scroll-thumb'
    };
    Object.entries(mapping).forEach(function(entry) {
      const recorded = design.match(new RegExp('^  ' + entry[0] + ': "(#[0-9A-Fa-f]{6})"', 'm'));
      expect(recorded).not.toBeNull();
      expect(hex(recorded[1])).toEqual(hex(tokens['--dc34-' + entry[1]]));
    });
    expect(tokens['--dc34-scroll-active']).toEqual('var(--dc34-cyan)');
  });

  it('meets the normal-text contrast target for the reading palette', function() {
    ['text', 'muted', 'cyan', 'gold'].forEach(function(foreground) {
      ['panel', 'charcoal', 'panel-strong'].forEach(function(background) {
        expect(contrast(tokens['--dc34-' + foreground], tokens['--dc34-' + background]))
          .withContext(foreground + ' on ' + background).toBeGreaterThanOrEqual(4.5);
      });
    });
    expect(contrast(tokens['--dc34-scroll-thumb'], tokens['--dc34-charcoal']))
      .toBeGreaterThanOrEqual(3);
  });

  it('shares readable measure and focus tokens without a fixed reading viewport', function() {
    expect(tokens['--dc34-reading-measure']).toEqual('66ch');
    expect(tokens['--dc34-reading-size']).toEqual('1rem');
    expect(Number(tokens['--dc34-reading-leading'])).toBeGreaterThanOrEqual(1.5);
    expect(tokens['--dc34-focus-width']).toEqual('3px');
    expect(css).toContain('grid-template-columns: 8.5rem minmax(0, var(--dc34-reading-measure))');
    const readingRules = css.substring(css.indexOf('/* Shared focus and scrollbar owners;'));
    expect(readingRules).not.toMatch(/(?:height:\s*(?:100vh|100dvh)|overflow:\s*hidden)/);
  });

  it('has a global scrollbar baseline with forced-colors and reduced-motion paths', function() {
    expect(css).toContain('scrollbar-color: var(--dc34-scroll-thumb) var(--dc34-charcoal)');
    expect(css).toContain('scrollbar-width: auto');
    expect(css).toContain('*::-webkit-scrollbar-thumb');
    expect(css).toContain('@media (forced-colors: active)');
    expect(css).toContain('scrollbar-color: auto');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('outline-color: Highlight');
  });

  it('renders one history h1, evidence section headings and six dated chapters', function() {
    const html = render('history', history);
    expect((html.match(/<h1\b/g) || []).length).toEqual(1);
    expect((html.match(/class="defcoin-story-chapter"/g) || []).length).toEqual(6);
    expect((html.match(/<h3\b/g) || []).length).toEqual(6);
    expect(html).toContain('<time datetime="2014-08-07">2014-08-07</time>');
    expect(html).not.toContain('<time datetime="2021"');
    expect(html).toContain('<h2 id="chain-records">');
  });

  it('keeps every history table named and keyboard-scrollable without losing headers', function() {
    const html = render('history', history);
    const regions = [...html.matchAll(/<div class="table-responsive"([^>]*)>/g)];
    expect(regions.length).toEqual(7);
    regions.forEach(function(match) {
      expect(match[1]).toContain('role="region"');
      expect(match[1]).toContain('tabindex="0"');
      const label = match[1].match(/aria-labelledby="([^"]+)"/);
      expect(label).not.toBeNull();
      expect(html).toContain('id="' + label[1] + '"');
    });
    expect(html).not.toMatch(/<th>/);
    expect(html).toContain('<th scope="col">Original URL</th>');
  });

  it('exposes timeline links as a scroll region rather than hiding them in an image role', function() {
    const html = render('history', history);
    expect(html).toContain('class="defcoin-pool-timeline" role="region" tabindex="0"');
    expect(html).not.toContain('role="img"');
    expect(html).toContain("Use the bar endpoints to find each pool's first and last dated observation.");
    expect(html).toContain('Look in the directory below for pools whose dates remain unknown.');
  });

  it('resolves all new internal contents links to an actual heading', function() {
    [render('history', history)].forEach(function(html) {
      [...html.matchAll(/href="#([^"]+)"/g)].forEach(function(link) {
        expect(html).toContain('id="' + link[1] + '"');
      });
      const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(function(match) { return match[1]; });
      expect(new Set(ids).size).toEqual(ids.length);
    });
  });

  it('keeps report links and banners out of the shared public shell', function() {
    const layout = fs.readFileSync(path.join(root, 'views/layout.pug'), 'utf8');
    expect(layout).not.toContain('security-review');
    expect(layout).not.toContain('securityReviewUrl');
    expect(layout).not.toContain('.defcoin-review-note');
    expect(layout).not.toContain('Security & code-quality addendum');
    expect(layout).toContain('li#history.nav-item');
    expect(layout).toContain('/css/defcoin-integrated.css?v=20261008a');
  });

  it('withdraws all registered report aliases while preserving History and tool routes', function() {
    const router = fs.readFileSync(path.join(root, 'routes/index.js'), 'utf8');
    expect(router).not.toContain('security-review');
    expect(router).not.toContain('defcoinSecurityReviewData');
    expect(router).not.toContain('security_review');
    expect(router).toContain("router.get(['/history', '/standalone/history']");
    expect(router).toContain("router.get(['/calc', '/reward-calculator', '/standalone/calc']");
    expect(router).toContain("router.get(['/qrgen', '/qr-generator', '/standalone/qrgen']");
  });

  it('excludes the detailed report data and template from current public source', function() {
    expect(fs.existsSync(path.join(root, 'lib/defcoin_security_review_data.js'))).toBeFalse();
    expect(fs.existsSync(path.join(root, 'views/security_review.pug'))).toBeFalse();
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    expect(readme).not.toContain('/security-review');
  });
});

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pug = require('pug');
const data = require('../lib/defcoin_history_data');

describe('community history evidence', function() {
  // Original archive URLs, dates, names and transaction identifiers are retained.
  const evidenceKeys = [
    'name', 'label', 'operator', 'originalUrl', 'url', 'alternateUrls',
    'archiveUrl', 'bestUrl', 'firstSeen', 'lastSeen', 'time'
  ];
  const originalEvidence = {
    retiredPools: 'dd71362794283ec2258d3857a95ca9bb0d03a60d1ba7d3300198efff5bc06f38',
    retiredProjectSites: '24cc2de3442dfa9bb76007546f529056f508e17344498d5ecc4ad2f612e8d990',
    shutteredUtilities: 'e3de548ee0e17e0ed048e948718c4adbd674858fac0cf2b4695b126c08757746',
    semiRetiredSnapshots: '1b88cf540c1b89a34fc63c69589a65381537628aae3c4c5de6cec333a71bc3b9',
    chainTimeline: '1205620158404d2959551577dedfd0316d57d9ca77050e420cec9562a1c11ff7'
  };
  Object.keys(originalEvidence).forEach(function(key) {
    it('preserves original evidence in ' + key, function() {
      const values = data[key].map(function(item) {
        return Object.fromEntries(Object.entries(item).filter(function(entry) {
          return evidenceKeys.includes(entry[0]);
        }));
      });
      const digest = crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex');
      expect(digest).toEqual(originalEvidence[key]);
    });
  });

  it('keeps research and original inventory dates separate', function() {
    expect(data.generatedOn).toEqual('2026-04-27');
    expect(data.researchUpdatedOn).toEqual('2026-10-08');
    expect(data.communityStory.map(function(chapter) { return chapter.date; })).toEqual([
      '2014-08-07', '2018-06-19', '2019-08-18', '2020-08-10', '2021', '2026'
    ]);
  });

  it('cites a safe source for every community-history chapter', function() {
    data.communityStory.forEach(function(chapter) {
      expect(chapter.paragraphs.length).toBeGreaterThan(0);
      expect(chapter.sources.length).toBeGreaterThan(0);
      chapter.sources.forEach(function(source) {
        const url = new URL(source.url);
        expect(url.protocol).toEqual('https:');
        expect(url.username + url.password).toEqual('');
        expect(source.label.length).toBeGreaterThan(0);
      });
    });
  });

  it('ends pool bars at recorded evidence, not an assumed current status', function() {
    data.activePools.forEach(function(pool) {
      const timeline = data.poolTimeline.items.find(function(item) { return item.name === pool.name; });
      expect(timeline.endLabel).toEqual(pool.lastSeen.label);
      expect(timeline.endYear).toEqual(Number.parseInt(pool.lastSeen.label.substring(0, 4), 10));
    });
    expect(data.activePools.find(function(pool) { return pool.name === 'defcoin.host'; }).lastSeen.label)
      .toEqual('2026-05-26');
  });

  it('does not advertise the disabled faucet as a current page', function() {
    expect(data.currentSurfaces.some(function(item) { return item.url.endsWith('/faucet'); })).toBeFalse();
    expect(data.currentSurfaces.some(function(item) {
      return item.url === 'https://dfcexplorer.dc903.org/';
    })).toBeTrue();
  });

  it('retains unknown pool dates and avoids a false first-ever claim', function() {
    const unknown = data.retiredPools.find(function(pool) { return pool.name === 'DC801 Defcoin Pool'; });
    expect(unknown.firstSeen).toBeNull();
    expect(unknown.lastSeen).toBeNull();
    expect(data.chainTimeline[0].note).toContain('not proof of the exact public launch date');
    expect(data.communityStory[3].paragraphs[1]).toContain('does not establish the first-ever use');
  });

  it('renders history facts and source links while escaping paragraph text', function() {
    const filename = path.resolve(__dirname, '../views/history.pug');
    const source = fs.readFileSync(filename, 'utf8').replace(/^extends layout\n/, '');
    const fixture = {
      ...data,
      communityStory: data.communityStory.map(function(chapter, index) {
        return index === 0 ? { ...chapter, paragraphs: chapter.paragraphs.concat(['<script>untrusted</script>']) } : chapter;
      })
    };
    const html = pug.render('mixin defcoinPageBranding(className)\n  span Defcoin\n' + source, {
      ...fixture, filename
    });
    expect(html).toContain('The community story');
    expect(html).toContain('Jeff Thomas (Xaphan)');
    expect(html).toContain('https://blog.coindroids.com/introducing-coindroids-2014/');
    expect(html).toContain('&lt;script&gt;untrusted&lt;/script&gt;');
    expect(html).not.toContain('<script>untrusted</script>');
  });
});

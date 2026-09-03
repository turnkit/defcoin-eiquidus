const DAY_MS = 24 * 60 * 60 * 1000;

const VERIFIED_TIMELINE_EVENTS = [
  {
    id: 'defcoin-first-mined-block',
    category: 'history',
    subcategory: 'chain',
    label: 'First mined block evidence',
    eventAt: '2014-03-07T07:54:37Z',
    sourceUrl: 'https://defcoin.dc903.org/explorer/tx/3e0f05acf458c2af86a4d85f2efeeacfb8c699529c449f313b6123bd126884aa',
    note: 'Earliest mined-block evidence pinned in this explorer catalog.',
    color: '#facc15'
  },
  {
    id: 'defcoin-qt-v0-8-6-2-mac-build',
    category: 'history',
    subcategory: 'release',
    topic: 'Defcoin Core',
    label: 'Defcoin-Qt v0.8.6.2 Mac build',
    eventAt: '2014-03-31',
    eventAtText: 'Monday, March 31, 2014 at 6:56 PM (timezone unknown)',
    sourceUrl: 'https://defcoin.dc903.org/history',
    note: 'First public Defcoin-Qt release evidence supplied from the preserved Mac build metadata; timezone remains unverified.',
    color: '#45cd94'
  },
  {
    id: 'defcoin-public-forum-discussion',
    category: 'history',
    subcategory: 'project',
    label: 'Public Defcoin discussion on DEF CON Forums',
    eventAt: '2014-04-02T23:43:58-07:00',
    sourceUrl: 'https://forum.defcon.org/node/14905',
    note: 'DEF CON forum post published 2014-04-02T23:43:58-07:00.',
    color: '#22d3ee'
  },
  {
    id: 'defcoin-p2pool-first-template',
    category: 'history',
    subcategory: 'chain',
    label: 'First observed P2Pool coinbase template',
    eventAt: '2014-04-13T19:27:00Z',
    sourceUrl: 'https://defcoin.dc903.org/explorer/tx/72ac97603e2bb7d3a240ffaa1e8f2a9e49e29f3eba80f2a7449e6caef4bb0150',
    note: 'Explorer evidence of the legacy P2Pool coinbase template on chain.',
    color: '#facc15'
  },
  {
    id: 'android-defcoin-wallet-v1-07-release',
    category: 'history',
    subcategory: 'release',
    topic: 'Android Wallet',
    label: 'Android Defcoin Wallet v1.07 released',
    eventAt: '2014-04-15T21:40:31Z',
    sourceUrl: 'https://github.com/jjculber/defcoin-wallet/releases/tag/v1.07',
    note: 'GitHub release by Justin Culbertson (jjculber) for Defcoin Wallet v1.07 for Android.',
    color: '#45cd94'
  },
  {
    id: 'defcoinstats-first-historical-sample',
    category: 'history',
    subcategory: 'stats',
    label: 'DefcoinStats first hashrate sample',
    eventAt: '2014-03-07T07:40:04Z',
    sourceUrl: 'http://defcoinstats.com/hash-net.php?period=8',
    note: 'First imported DefcoinStats network/other sample: 2014-03-07 07:40:04 UTC.',
    color: '#9ca3af'
  },
  {
    id: 'defcoinstats-final-historical-sample',
    category: 'history',
    subcategory: 'stats',
    label: 'DefcoinStats final hashrate sample',
    eventAt: '2017-05-17T17:15:01Z',
    sourceUrl: 'http://defcoinstats.com/hash-net.php?period=8',
    note: 'Final plotted DefcoinStats historical chart sample: 2017-05-17 17:15:01 UTC.',
    color: '#9ca3af'
  },
  {
    id: 'defcon-22',
    category: 'conference',
    subcategory: 'defcon',
    label: 'DEF CON 22',
    startDate: '2014-08-07',
    endDate: '2014-08-10',
    sourceUrl: 'https://infocondb.org/con/def-con/def-con-22/',
    color: '#d946ef'
  },
  {
    id: 'the-making-of-defcoin',
    category: 'history',
    subcategory: 'project',
    label: 'The Making of DEFCOIN talk',
    eventAt: '2014-08-07',
    eventAtText: 'August 7, 2014 at 5:00 PM (event timezone from DEF CON schedule context)',
    sourceUrl: 'https://infocondb.org/con/def-con/def-con-22/the-making-of-defcoin',
    note: 'DEF CON 22 talk archive lists the talk on Aug. 7, 2014 at 5 p.m.',
    color: '#22d3ee'
  },
  {
    id: 'coindroids-twitter-defcon22-announcement',
    category: 'history',
    subcategory: 'project',
    topic: 'Coindroids',
    label: 'Twitter Coindroids DEF CON 22 announcement',
    eventAt: '2014-07-07',
    eventAtText: 'July 7, 2014 at 3:42 PM (X display timezone)',
    sourceUrl: 'https://x.com/Coindroids/status/486173336662069248',
    note: 'Coindroids announced one month until launch at DEF CON 22 with Defcoin and Robot Battles.',
    color: '#2dd4bf'
  },
  {
    id: 'defcoin-twitter-android-wallet-source',
    category: 'history',
    subcategory: 'release',
    topic: 'Android Wallet',
    label: 'Twitter announcement: Android wallet source',
    eventAt: '2014-07-14',
    eventAtText: 'July 14, 2014 at 2:43 AM (X display timezone; July 13 in some local timezones)',
    sourceUrl: 'https://x.com/defcoin/status/488514012275961858',
    note: 'DEFCOIN account linked the Android Defcoin Wallet source repository by Justin Culbertson.',
    color: '#45cd94'
  },
  {
    id: 'coindroids-defcon-22',
    category: 'history',
    subcategory: 'project',
    label: 'Coindroids at DEF CON 22',
    startDate: '2014-08-07',
    endDate: '2014-08-10',
    sourceUrl: 'https://forum.defcon.org/node/14987',
    note: 'Forum evidence says the Defcoin-related Coindroids game would be playable at DEF CON 22.',
    color: '#2dd4bf'
  },
  {
    id: 'defcoinpool-announced',
    category: 'history',
    subcategory: 'pool',
    label: 'defcoinpool.com announced online',
    eventAt: '2014-08-20',
    sourceUrl: 'https://bitcointalk.org/index.php?topic=748812.0',
    note: 'Bitcointalk announcement says defcoinpool.com was officially online.',
    color: '#58a6ff'
  },
  {
    id: 'defcon-23',
    category: 'conference',
    subcategory: 'defcon',
    label: 'DEF CON 23',
    startDate: '2015-08-06',
    endDate: '2015-08-09',
    sourceUrl: 'https://infocondb.org/con/def-con/def-con-23/',
    color: '#d946ef'
  },
  {
    id: 'defcon-24',
    category: 'conference',
    subcategory: 'defcon',
    label: 'DEF CON 24',
    startDate: '2016-08-04',
    endDate: '2016-08-07',
    sourceUrl: 'https://infocondb.org/con/def-con/def-con-24/',
    color: '#d946ef'
  },
  {
    id: 'defcon-25',
    category: 'conference',
    subcategory: 'defcon',
    label: 'DEF CON 25',
    startDate: '2017-07-27',
    endDate: '2017-07-30',
    sourceUrl: 'https://infocondb.org/con/def-con/def-con-25/',
    color: '#d946ef'
  },
  {
    id: 'defcoin-core-v1-0-0-release',
    category: 'history',
    subcategory: 'release',
    label: 'Defcoin Core v1.0.0 released',
    eventAt: '2018-06-19T22:19:28Z',
    sourceUrl: 'https://github.com/mspicer/Defcoin/releases/tag/v1.0.0',
    note: 'GitHub release published 2018-06-19T22:19:28Z by NaH012 / Michael Julander; the release record also shows later repository metadata from July 2018.',
    color: '#45cd94'
  },
  {
    id: 'coindroids-dogecoin-support-added',
    category: 'history',
    subcategory: 'project',
    topic: 'Coindroids',
    label: 'Dogecoin support added to Coindroids',
    eventAt: '2018-10-25T18:03:04Z',
    sourceUrl: 'https://blog.coindroids.com/dogecoin-support-added/',
    note: 'Coindroids blog post by Abstrct / Josh McDougall announcing Dogecoin support; included as project-history context for Coindroids maturation.',
    color: '#2dd4bf'
  },
  {
    id: 'defcon-26',
    category: 'conference',
    subcategory: 'defcon',
    label: 'DEF CON 26',
    startDate: '2018-08-09',
    endDate: '2018-08-12',
    sourceUrl: 'https://infocondb.org/con/def-con/def-con-26/',
    color: '#d946ef'
  },
  {
    id: 'defcon-27',
    category: 'conference',
    subcategory: 'defcon',
    label: 'DEF CON 27',
    startDate: '2019-08-08',
    endDate: '2019-08-11',
    sourceUrl: 'https://infocondb.org/con/def-con/def-con-27/',
    color: '#d946ef'
  },
  {
    id: 'defcon-28',
    category: 'conference',
    subcategory: 'defcon',
    label: 'DEF CON 28 Safe Mode',
    startDate: '2020-08-06',
    endDate: '2020-08-09',
    sourceUrl: 'https://infocondb.org/con/def-con/def-con-28/',
    color: '#d946ef'
  },
  {
    id: 'g4tekeep3r-defcon28-l3plus-mining',
    category: 'history',
    subcategory: 'mining',
    topic: 'Mining',
    label: 'g4tekeep3r DEF CON 28 L3+ Defcoin mining',
    startDate: '2020-08-06',
    endDate: '2020-08-10',
    sourceUrl: 'https://www.g4tekeep3r.com/2020/08/16/dfc-p2pool/',
    note: 'g4tekeep3r reported renting an Antminer L3+ during DEF CON 28 and mining Defcoin at roughly 500 MH/s for five days.',
    color: '#58a6ff'
  },
  {
    id: 'g4tekeep3r-dfc-p2pool-post',
    category: 'history',
    subcategory: 'pool',
    topic: 'P2Pool',
    label: 'g4tekeep3r DFC P2Pool post',
    eventAt: '2020-08-16',
    sourceUrl: 'https://www.g4tekeep3r.com/2020/08/16/dfc-p2pool/',
    note: 'Public DFC P2Pool writeup listing two historical stratum/static endpoints on port 9355 and documenting renewed Defcoin P2Pool mining around DEF CON 28.',
    color: '#58a6ff'
  },
  {
    id: 'charlesrocket-defcoin-p2pool-port-credit',
    category: 'history',
    subcategory: 'pool',
    topic: 'P2Pool',
    label: 'charlesrocket credited for Defcoin P2Pool port',
    eventAt: '2020-08-16',
    sourceUrl: 'https://www.g4tekeep3r.com/2020/08/16/dfc-p2pool/',
    note: 'g4tekeep3r credited charlesrocket for spearheading the Defcoin P2Pool port and linked the charlesrocket/p2pool-defcoin repository.',
    color: '#58a6ff'
  },
  {
    id: 'coindroids-paused',
    category: 'history',
    subcategory: 'project',
    topic: 'Coindroids',
    label: 'Coindroids paused',
    eventAt: '2021-01-23T15:54:00Z',
    sourceUrl: 'https://blog.coindroids.com/hitting-pause-on-the-droids/',
    note: 'Coindroids blog post by Abstrct / Josh McDougall reflecting on the project and pausing active operation.',
    color: '#2dd4bf'
  },
  {
    id: 'defcoin-core-v1-0-1-release',
    category: 'history',
    subcategory: 'release',
    label: 'Defcoin Core v1.0.1 released',
    eventAt: '2021-04-15T04:41:27Z',
    sourceUrl: 'https://github.com/mspicer/Defcoin/releases/tag/v1.0.1',
    note: 'GitHub release published 2021-04-15T04:41:27Z by miketweaver / Mike Weaver.',
    color: '#45cd94'
  },
  {
    id: 'defcoin-node-docker-created',
    category: 'history',
    subcategory: 'release',
    topic: 'Wider ecosystem',
    label: 'Defcoin Node Docker repository created',
    eventAt: '2021-04-15T03:24:51Z',
    sourceUrl: 'https://github.com/defcoin-ng/defcoin-node-docker',
    note: 'Wider ecosystem evidence for defcoin-ng/defcoin-node-docker repository creation. This is tracked as related infrastructure history, not as direct Defcoin Core Nu ancestry.',
    color: '#45cd94'
  },
  {
    id: 'hellbyte-p2pool-defcoin-dc1b4af',
    category: 'history',
    subcategory: 'pool',
    topic: 'P2Pool',
    label: 'hellbyte p2pool-defcoin update',
    eventAt: '2021-06-12T08:18:24Z',
    sourceUrl: 'https://github.com/hellbyte/p2pool-defcoin/commit/dc1b4af980cb6d662069fd302651b50997a8aa8c',
    note: 'Commit dc1b4af by G4te-Keep3r adjusted CPU/USB pool instructions in the Defcoin P2Pool fork.',
    color: '#58a6ff'
  },
  {
    id: 'docker-droid-dc29-update',
    category: 'history',
    subcategory: 'project',
    topic: 'Coindroids',
    label: 'docker-droid DEF CON 29 update',
    eventAt: '2021-08-07T17:12:02Z',
    sourceUrl: 'https://github.com/Abstrct/docker-droid/commit/82a26b06d7d08cf880d9ffd58da84d5f23310f1a',
    note: 'Abstrct / Josh McDougall merged DEF CON 29 updates into docker-droid.',
    color: '#2dd4bf'
  },
  {
    id: 'beerwallet-ios-defcoin-target-spacing',
    category: 'history',
    subcategory: 'release',
    topic: 'BeerWallet',
    label: 'BeerWallet iOS Defcoin target-spacing update',
    eventAt: '2016-08-07T18:08:07Z',
    sourceUrl: 'https://github.com/mperklin/beerwallet/commit/25d3f5a847ae27a7f42ea69ed33a865bc7908abd',
    note: 'Michael Perklin / mperklin updated BeerWallet target spacing and timespan to match defcoin-qt.',
    color: '#45cd94'
  },
  {
    id: 'hellbyte-p2pool-defcoin-archived',
    category: 'history',
    subcategory: 'pool',
    topic: 'P2Pool',
    label: 'hellbyte p2pool-defcoin archived',
    eventAt: '2023-02-16',
    sourceUrl: 'https://github.com/hellbyte/p2pool-defcoin',
    note: 'Repository is archived. The Feb. 16, 2023 archive date is tracked from project notes until GitHub exposes primary archived-at metadata.',
    color: '#58a6ff'
  },
  {
    id: 'packetloss404-defcoin-v1-0-2-release',
    category: 'history',
    subcategory: 'release',
    topic: 'Defcoin Core',
    label: 'packetloss404 / Ian S. Walmsley Defcoin v1.0.2 release',
    eventAt: '2026-01-28',
    sourceUrl: 'https://github.com/packetloss404/Defcoin/blob/master/CHANGELOG.md',
    note: 'packetloss404 / Ian S. Walmsley changelog release: domain migration, chain-state updates, DNS seed updates, v1.0.2 versioning, debug-window network health, and compiler compatibility fixes.',
    color: '#45cd94'
  },
  {
    id: 'defcon-29',
    category: 'conference',
    subcategory: 'defcon',
    label: 'DEF CON 29',
    startDate: '2021-08-05',
    endDate: '2021-08-08',
    sourceUrl: 'https://infocondb.org/con/def-con/def-con-29/',
    color: '#d946ef'
  },
  {
    id: 'defcon-30',
    category: 'conference',
    subcategory: 'defcon',
    label: 'DEF CON 30',
    startDate: '2022-08-11',
    endDate: '2022-08-14',
    sourceUrl: 'https://infocondb.org/con/def-con/def-con-30/',
    color: '#d946ef'
  },
  {
    id: 'defcon-31',
    category: 'conference',
    subcategory: 'defcon',
    label: 'DEF CON 31',
    startDate: '2023-08-10',
    endDate: '2023-08-13',
    sourceUrl: 'https://infocondb.org/con/def-con/def-con-31/',
    color: '#d946ef'
  },
  {
    id: 'defcon-32',
    category: 'conference',
    subcategory: 'defcon',
    label: 'DEF CON 32',
    startDate: '2024-08-08',
    endDate: '2024-08-11',
    sourceUrl: 'https://infocondb.org/con/def-con/def-con-32/',
    color: '#d946ef'
  },
  {
    id: 'defcon-33',
    category: 'conference',
    subcategory: 'defcon',
    label: 'DEF CON 33',
    startDate: '2025-08-07',
    endDate: '2025-08-10',
    sourceUrl: 'https://infocondb.org/con/def-con/def-con-33/',
    color: '#d946ef'
  },
  {
    id: 'defcoin-core-nu-v26-3-0-release',
    category: 'history',
    subcategory: 'release',
    label: 'Defcoin Core Nu v26.3.0 build 20260523_035528Z released',
    eventAt: '2026-05-23T03:55:28Z',
    eventAtText: 'May 22, 2026 at 10:55:28 PM CDT (2026-05-23 03:55:28 UTC)',
    buildNumber: '20260523_035528Z',
    sourceUrl: 'https://github.com/defcoincore/Defcoin-Core-Nu/releases/tag/v26.3.0',
    note: 'GitHub release published at this instant. Tracked as a release event, not a date range.',
    color: '#45cd94'
  },
  {
    id: 'defcoin-core-nu-v26-3-1-release',
    category: 'history',
    subcategory: 'release',
    label: 'Defcoin Core Nu v26.3.1 build 20260523_035554Z released',
    eventAt: '2026-05-23T03:55:54Z',
    eventAtText: 'May 22, 2026 at 10:55:54 PM CDT (2026-05-23 03:55:54 UTC)',
    buildNumber: '20260523_035554Z',
    sourceUrl: 'https://github.com/defcoincore/Defcoin-Core-Nu/releases/tag/v26.3.1',
    note: 'GitHub release published at this instant. Tracked as a release event, not a date range.',
    color: '#45cd94'
  },
  {
    id: 'defcoin-core-nu-v26-3-4-build',
    category: 'history',
    subcategory: 'release',
    label: 'Defcoin Core Nu v26.3.4 build 20260527_102056 generated',
    eventAt: '2026-05-27T15:20:56Z',
    eventAtText: 'May 27, 2026 at 10:20:56 AM CDT (2026-05-27 15:20:56 UTC)',
    buildNumber: '20260527_102056',
    sourceUrl: 'https://github.com/defcoincore/Defcoin-Core-Nu',
    note: 'Local 26.3.4 package build generated. Tracked as a build event, not a release date range.',
    color: '#45cd94'
  },
  {
    id: 'defcon-34',
    category: 'conference',
    subcategory: 'defcon',
    label: 'DEF CON 34',
    startDate: '2026-08-06',
    endDate: '2026-08-09',
    sourceUrl: 'https://forum.defcon.org/node/253965',
    color: '#d946ef'
  }
];

const ENERGY_DEVICES = [
  {
    id: 'cpu-2015',
    name: '2015 desktop CPU baseline (Intel Core i7-4790K estimate)',
    hashrateHps: 25000,
    watts: 88,
    note: 'Rough Scrypt CPU-era placeholder; editable until a better benchmark is verified.'
  },
  {
    id: 'gridseed-usb',
    name: 'Gridseed 5-chip USB Scrypt ASIC',
    hashrateHps: 350000,
    watts: 7,
    note: 'Common 2014-era small USB Scrypt ASIC class.'
  },
  {
    id: 'antminer-l3-plus',
    name: 'Bitmain Antminer L3+',
    hashrateHps: 504000000,
    watts: 800,
    note: 'Well-known Scrypt ASIC reference point.'
  },
  {
    id: 'custom',
    name: 'Custom miner',
    hashrateHps: 1000000,
    watts: 100,
    note: 'Editable user-defined hardware profile.'
  }
];

function parseDateValue(value) {
  if (!value) {
    return null;
  }

  const match = String(value).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function parseTimeValue(value) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function addEvent(events, event) {
  const eventAt = event.eventAt || null;
  const startDate = parseDateValue(event.startDate || event.startAt || eventAt || event.date);
  if (!startDate) {
    return;
  }

  const isPointEvent = Boolean(eventAt) || (!event.endDate && !event.endAt && !event.startAt);
  const endDate = isPointEvent ? null : (parseDateValue(event.endDate || event.endAt) || startDate);
  const id = event.id || `${event.category}-${event.subcategory || 'event'}-${event.label}-${startDate}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const normalized = Object.assign({
    id,
    category: 'history',
    subcategory: 'event',
    label: 'Untitled event',
    startDate,
    color: event.category === 'conference' ? '#d946ef' : '#22d3ee',
    draft: false,
    evidenceQuality: 'source-backed',
    chartVisible: true
  }, event, {id, startDate, isPointEvent});

  if (endDate) {
    normalized.endDate = endDate;
  } else {
    delete normalized.endDate;
    delete normalized.endAt;
  }

  events.push(normalized);
}

function buildTimelineEvents() {
  const events = [];

  VERIFIED_TIMELINE_EVENTS.forEach((event) => addEvent(events, event));

  return events
    .filter((event) => event.startDate && event.chartVisible !== false)
    .map((event) => {
      const eventInstant = parseTimeValue(event.eventAt);
      const preciseStart = Date.parse(event.startAt || '');
      const preciseEnd = Date.parse(event.endAt || '');
      const start = Number.isFinite(eventInstant) ? eventInstant
        : (Number.isFinite(preciseStart) ? preciseStart : Date.parse(`${event.startDate}T00:00:00Z`));
      const end = Number.isFinite(eventInstant) ? eventInstant
        : (Number.isFinite(preciseEnd) ? preciseEnd : Date.parse(`${event.endDate || event.startDate}T23:59:59Z`));
      return Object.assign({}, event, {
        startMs: Number.isFinite(start) ? start : 0,
        endMs: Number.isFinite(end) && end >= start ? end : (event.isPointEvent ? start : start + DAY_MS - 1)
      });
    })
    .sort((a, b) => {
      if (a.startMs !== b.startMs) return a.startMs - b.startMs;
      return a.label.localeCompare(b.label);
    });
}

function getEnergyDefaults() {
  return {
    defaultUsdPerKwh: 0.15,
    devices: ENERGY_DEVICES
  };
}

module.exports = {
  VERIFIED_TIMELINE_EVENTS,
  ENERGY_DEVICES,
  buildTimelineEvents,
  getEnergyDefaults
};

function archiveCapture(originalUrl, timestamp) {
  if (!originalUrl || !timestamp) {
    return null;
  }

  return {
    label: timestamp.slice(0, 4) + '-' + timestamp.slice(4, 6) + '-' + timestamp.slice(6, 8),
    url: `https://web.archive.org/web/${timestamp}/${originalUrl}`
  };
}

function archiveSearch(originalUrl) {
  if (!originalUrl) {
    return null;
  }

  return `https://web.archive.org/web/*/${originalUrl}`;
}

function yearFromEvidence(evidence) {
  if (!evidence || !evidence.label) {
    return null;
  }

  const year = Number.parseInt(String(evidence.label).slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

function timelineLabel(evidence, fallback) {
  if (evidence && evidence.label) {
    return evidence.label;
  }

  return fallback;
}

function buildPoolTimeline(activePools, retiredPools) {
  const currentYear = new Date().getFullYear();
  const poolItems = [];

  (activePools || []).forEach((pool) => {
    const startYear = yearFromEvidence(pool.firstSeen) || yearFromEvidence(pool.lastSeen) || currentYear;
    const endYear = yearFromEvidence(pool.lastSeen) || startYear;
    poolItems.push({
      name: pool.name,
      url: pool.websiteUrl || pool.originalUrl || pool.statsUrl || null,
      startYear,
      endYear,
      startLabel: timelineLabel(pool.firstSeen, 'First seen unknown'),
      endLabel: timelineLabel(pool.lastSeen, 'Last check unknown'),
      active: true,
      note: pool.note || ''
    });
  });

  (retiredPools || []).forEach((pool) => {
    const startYear = yearFromEvidence(pool.firstSeen);
    const endYear = yearFromEvidence(pool.lastSeen) || startYear;
    if (!startYear) {
      return;
    }

    poolItems.push({
      name: pool.name,
      url: pool.originalUrl || null,
      startYear,
      endYear,
      startLabel: timelineLabel(pool.firstSeen, 'First seen unknown'),
      endLabel: timelineLabel(pool.lastSeen, 'Last seen unknown'),
      active: false,
      note: pool.note || ''
    });
  });

  if (!poolItems.length) {
    return {items: [], ticks: [], startYear: currentYear, endYear: currentYear};
  }

  const startYear = Math.min(...poolItems.map((pool) => pool.startYear));
  const endYear = Math.max(currentYear, ...poolItems.map((pool) => pool.endYear));
  const range = Math.max(1, endYear - startYear);
  const tickStep = range > 10 ? 2 : 1;
  const ticks = [];

  for (let year = startYear; year <= endYear; year += tickStep) {
    ticks.push({
      label: String(year),
      pct: ((year - startYear) / range * 100).toFixed(2)
    });
  }

  if (ticks[ticks.length - 1].label !== String(endYear)) {
    ticks.push({label: String(endYear), pct: '100.00'});
  }

  return {
    startYear,
    endYear,
    ticks,
    items: poolItems
      .sort((a, b) => {
        if (a.startYear !== b.startYear) return a.startYear - b.startYear;
        if (a.endYear !== b.endYear) return a.endYear - b.endYear;
        return a.name.localeCompare(b.name);
      })
      .map((pool) => {
        const startPct = ((pool.startYear - startYear) / range * 100);
        const spanPct = ((pool.endYear - pool.startYear) / range * 100);
        return Object.assign({}, pool, {
          startPct: startPct.toFixed(2),
          spanPct: Math.max(2.2, spanPct).toFixed(2)
        });
      })
  };
}

module.exports = {
  generatedOn: '2026-04-27',
  researchUpdatedOn: '2026-10-08',
  communityStory: [
    {
      date: '2014-08-07',
      title: 'A cryptocurrency for learning at DEF CON',
      paragraphs: [
        'Defcoin grew out of the DEF CON community. At DEF CON 22, Jeff Thomas (Xaphan), Seth Van Ommen (Beaker), and Mike Guthrie (Anch) presented The Making of DEFCOIN. Their talk explained creating the coin, early development problems, and how cryptocurrency works.',
        'That same conference, Coindroids launched a game on Defcoin. Players sent transactions to attack other droids, buy items, and upgrade their characters. The developers described the launch in an article published on 12 August 2014.'
      ],
      sources: [
        {label: 'DEF CON 22 speakers and talk description', url: 'https://defcon.org/html/defcon-22/dc-22-speakers.html'},
        {label: 'DEF CON 22 Thursday schedule', url: 'https://defcon.org/html/defcon-22/dc-22-schedule.html'},
        {label: 'Coindroids launch account, 12 August 2014', url: 'https://blog.coindroids.com/introducing-coindroids-2014/'}
      ]
    },
    {
      date: '2018-06-19',
      title: 'The wallet software was updated',
      paragraphs: [
        'Defcoin v1.0.0 was published on 19 June 2018. Its release announcement described bringing the software up to the Litecoin v0.15 codebase. This was a software update to Defcoin, which continued to use its own blockchain.'
      ],
      sources: [
        {label: 'Defcoin v1.0.0 release', url: 'https://github.com/mspicer/Defcoin/releases/tag/v1.0.0'}
      ]
    },
    {
      date: '2019-08-18',
      title: 'Coindroids returned with player-built bots',
      paragraphs: [
        'The Coindroids team reported its sixth DEF CON contest at DEF CON 27. A docker-droid package combined a Defcoin client with a game bot, making automation available to more players. Their account also credited g4te_keep3r for improvements to its configuration.'
      ],
      sources: [
        {label: 'Coindroids DEF CON 27 report, 18 August 2019', url: 'https://blog.coindroids.com/coindroids-defcon-27/'}
      ]
    },
    {
      date: '2020-08-10',
      title: 'Community miners published P2Pool nodes',
      paragraphs: [
        'An August 2020 community announcement shared a Defcoin P2Pool node and the charlesrocket/p2pool-defcoin repository, now redirected to hellbyte/p2pool-defcoin. P2Pool lets miners run connected pool nodes rather than depend on one pool operator.',
        'The older chain record below already contains a P2Pool-style coinbase from April 2014. The 2020 announcement documents that later community effort; it does not establish the first-ever use of P2Pool on Defcoin.'
      ],
      sources: [
        {label: 'Community P2Pool announcement, 10 August 2020', url: 'https://www.reddit.com/r/Defcon/comments/i6yipm/'},
        {label: 'Defcoin P2Pool source', url: 'https://github.com/hellbyte/p2pool-defcoin'}
      ]
    },
    {
      date: '2021',
      title: 'The game paused; wallet maintenance continued',
      paragraphs: [
        'Coindroids published a pause announcement dated 23 January 2021. That records a change to the game, not a shutdown date for the Defcoin network.',
        'Defcoin v1.0.1 followed on 15 April 2021 with a DNS-seeder fix. Seeders help wallets find peers. The release lists source archives but no wallet binaries; the older v1.0.0 release still holds its binary downloads.'
      ],
      sources: [
        {label: 'Coindroids pause announcement', url: 'https://blog.coindroids.com/hitting-pause-on-the-droids/'},
        {label: 'Defcoin v1.0.1 release', url: 'https://github.com/mspicer/Defcoin/releases/tag/v1.0.1'}
      ]
    },
    {
      date: '2026',
      title: 'New wallet work and the DC903 node',
      paragraphs: [
        'Defcoin Core Nu published v26.6.8-alpha on 20 June 2026. The alpha label matters: this is a development release, not a claim that every feature or platform is ready for production.',
        'DC903 runs a Defcoin peer, P2Pool node, and explorer. Those services were checked on 8 October 2026. Other pools below retain their own last-check dates, so this page does not imply that every listed endpoint was rechecked today.'
      ],
      sources: [
        {label: 'Defcoin Core Nu v26.6.8-alpha release', url: 'https://github.com/defcoincore/Defcoin-Core-Nu/releases/tag/v26.6.8-alpha'},
        {label: 'DC903 pool and node status', url: 'https://defcoin.dc903.org/pool'}
      ]
    }
  ],
  currentSurfaces: [
    { label: 'defcoin.dc903.org', url: 'https://defcoin.dc903.org/' },
    { label: 'Pool', url: 'https://defcoin.dc903.org/pool' },
    { label: 'Explorer: eIquidus', url: 'https://defcoin.dc903.org/explorer/' },
    { label: 'Reward Calculator', url: 'https://defcoin.dc903.org/calc' },
    { label: 'QR Generator', url: 'https://defcoin.dc903.org/qrgen' },
    { label: 'How to Mine', url: 'https://defcoin.dc903.org/mine' },
    { label: 'Paper Wallet', url: 'https://defcoin.dc903.org/paperwallet' },
    { label: 'History', url: 'https://defcoin.dc903.org/history' },
    { label: 'explorer.dc903.org redirect alias', url: 'https://explorer.dc903.org/' },
    { label: 'dfcexplorer.dc903.org redirect alias', url: 'https://dfcexplorer.dc903.org/' }
  ],
  activeReferences: [
    {
      label: 'Discord invite',
      url: 'https://discord.gg/AhpJWkhjVs',
      note: 'Checked live on 2026-04-18.'
    },
    {
      label: 'reddit.com/r/defcoin',
      url: 'https://www.reddit.com/r/defcoin/',
      note: 'Community subreddit. Activity was not measured in this research pass.'
    },
    {
      label: 'x.com/defcoin',
      url: 'https://x.com/defcoin',
      note: 'Project social account. Recent activity was not rechecked in this pass.'
    },
    {
      label: 'GitHub source tree',
      url: 'https://github.com/mspicer/Defcoin',
      note: 'Surviving v1.0.1 source repository; GitHub redirects the older NaH012 namespace to this account.'
    },
    {
      label: 'GitHub releases',
      url: 'https://github.com/mspicer/Defcoin/releases',
      note: 'Historical v1.0.0 binaries and v1.0.1 source release. Newer Nu releases are listed separately.'
    },
    {
      label: 'wiki.defcoin.io',
      url: 'http://wiki.defcoin.io/',
      note: 'Older project documentation; retained as a history reference.'
    },
    {
      label: 'InfoCon talk: The Making of Defcoin',
      url: 'https://infocondb.org/con/def-con/def-con-22/the-making-of-defcoin',
      note: 'Archive listing for the 7 August 2014 talk by Xaphan, Beaker, and Anch.'
    },
    {
      label: 'Medium: The Honeypot of Cryptocurrencies',
      url: 'https://medium.com/@abstrct/the-honeypot-of-cryptocurrencies-defcoin-eb8158d01725',
      note: 'Retrospective essay. Reachability was not rechecked in this pass.'
    },
    {
      label: 'g4tekeep3r DFC P2Pool post',
      url: 'https://www.g4tekeep3r.com/2020/08/16/dfc-p2pool/',
      note: 'The preserved 2020 reference lists two P2Pool endpoints and credits charlesrocket. The page could not be fetched in this research pass.'
    },
    {
      label: 'Defcoin Core Nu releases',
      url: 'https://github.com/defcoincore/Defcoin-Core-Nu/releases',
      note: 'Newer wallet work. Check each release label and platform notes; alpha builds are development releases.'
    }
  ],
  activePools: [
    {
      name: 'DC903 Defcoin P2Pool',
      operator: 'DC903',
      websiteUrl: 'https://defcoin.dc903.org/pool',
      stratumUrl: 'stratum+tcp://defcoin.dc903.org:13372',
      backend: 'P2Pool',
      lastSeen: {
        label: '2026-10-08',
        url: 'https://defcoin.dc903.org/pool'
      },
      note: 'Defcoin peer, P2Pool peer, Stratum work, and public page checks passed on 2026-10-08.'
    },
    {
      name: 'Defcoin.io P2Pool Node',
      operator: 'Unknown',
      websiteUrl: 'https://defcoin.io/',
      stratumUrl: 'stratum+tcp://135.148.43.189:13372',
      backend: 'P2Pool',
      firstSeen: archiveCapture('http://defcoin.io', '20140402032331'),
      lastSeen: {
        label: '2026-05-26',
        url: 'https://defcoin.io/'
      },
      note: 'This domain has older archive evidence; the published P2Pool node was checked on 2026-05-26.'
    },
    {
      name: 'defcoin.host',
      operator: 'Unknown',
      websiteUrl: 'https://defcoin.host/',
      stratumUrl: 'stratum+tcp://135.148.43.188:13371',
      backend: 'P2Pool',
      firstSeen: archiveCapture('http://defcoin.host/', '20250405212630'),
      lastSeen: {
        label: '2026-05-26',
        url: 'https://defcoin.host/'
      },
      note: 'A bounded cpuminer-opt test accepted shares on 2026-05-26. No newer live check is claimed here.'
    }
  ],
  sourceAuthority: [
    {
      label: '2014 official defcoin.org archive',
      url: 'https://web.archive.org/web/20140404045326/http://defcoin.org/',
      note: 'Archived official site snapshot linking its GitHub footer to tiabguls/defcoin.'
    },
    {
      label: 'Original tiabguls/defcoin source',
      url: 'https://github.com/tiabguls/defcoin/tree/b7464ebf0e16f67cd38ef55d8c4b0a5410d467a7',
      note: 'Original-source reference linked from the archived 2014 official site.'
    },
    {
      label: '2018 official defcoin-ng.org archive',
      url: 'https://web.archive.org/web/20180708034200/http://defcoin-ng.org/',
      note: 'Archived official successor site linking its GitHub footer to NaH012/defcoin.'
    },
    {
      label: 'mspicer/Defcoin source',
      url: 'https://github.com/mspicer/Defcoin',
      note: 'Current GitHub location for the old NaH012/Defcoin repository.'
    },
    {
      label: 'DefCoinCore v2.0.0 chainparams',
      url: 'https://github.com/packetloss404/DefCoinCore/blob/933fdd80637ed7a1f54b0256238d9b62896b483f/src/chainparams.cpp',
      note: 'Pinned Litecoin Core-based v2.0.0 source, with seed.defcoin.io and seed2.defcoin.io listed as DNS seeds.'
    },
    {
      label: 'Defcoin Core Nu source',
      url: 'https://github.com/defcoincore/Defcoin-Core-Nu',
      note: 'Nu source retains the 120-second mainnet target spacing and adds Defcoin-specific P2P message bytes.'
    },
    {
      label: 'wiki.defcoin.io',
      url: 'http://wiki.defcoin.io/',
      note: 'Historical wiki/documentation surface.'
    }
  ],
  networkIdentityNotes: [
    'The mainnet wallet peer port is consistently 1337 in the v1.0.1 and v2.0.0 source trees.',
    'The Defcoin mainnet target block spacing is 120 seconds, or 2 minutes. The original source sets nTargetSpacing = 2 * 60, and the later chainparams.cpp based releases set nPowTargetSpacing = 2 * 60.',
    'The first public source tree includes mainnet message bytes fb c0 b6 db in the global pchMessageStart initializer and fc c1 b7 dc in the testnet initialization path.',
    'The v1.0.1 and v2.0.0 chainparams.cpp files use fb c0 b6 db for mainnet on port 1337, fc c1 b7 dc for testnet on port 31337, and fa bf b5 da for regtest on port 19444.',
    'Port 19444 belongs to regtest, a local testing network, in the v1.0.1 and v2.0.0 source trees.',
    'Modern Defcoin Core Nu compatible nodes use defc014e as the Defcoin-specific P2P packet magic while compatibility mode can still accept legacy fbc0b6db.'
  ],
  semiRetiredSnapshots: [
    {
      label: 'defcoinstats.com',
      url: 'https://www.defcoinstats.com/',
      note: 'Historical statistics reference. Imported hashrate samples end in 2017; that data is not a live network measurement.',
      firstSeen: archiveCapture('http://www.defcoinstats.com/', '20140317072612'),
      lastSeen: archiveCapture('http://defcoinstats.com/', '20260208141313')
    }
  ],
  retiredProjectSites: [
    {
      label: 'defcoin-ng.org',
      originalUrl: 'https://defcoin-ng.org/',
      archiveUrl: archiveSearch('https://defcoin-ng.org/'),
      note: 'Retired domain; the archived footer is still useful for tracing later project links.',
      firstSeen: archiveCapture('https://defcoin-ng.org/', '20200409143022'),
      lastSeen: archiveCapture('https://defcoin-ng.org/', '20250405212630')
    },
    {
      label: 'explorer.def-coin.org',
      originalUrl: 'https://explorer.def-coin.org/',
      archiveUrl: archiveSearch('https://explorer.def-coin.org/'),
      note: 'The 2026-04-26 DNS check returned NXDOMAIN. Archive dates below describe saved pages, not continuous service.',
      firstSeen: archiveCapture('https://explorer.def-coin.org/', '20200409134507'),
      lastSeen: archiveCapture('https://explorer.def-coin.org/', '20240206165559')
    },
    {
      label: 'miningpoolstats.stream/defcoin',
      originalUrl: 'https://miningpoolstats.stream/defcoin',
      archiveUrl: archiveSearch('https://miningpoolstats.stream/defcoin'),
      note: 'The earlier site review recorded a 404 for the Defcoin page; it was not rechecked in this pass.',
      firstSeen: archiveCapture('https://miningpoolstats.stream/defcoin', '20210202115335'),
      lastSeen: archiveCapture('https://miningpoolstats.stream/defcoin', '20221218131501')
    },
    {
      label: 'defcoin.org',
      originalUrl: 'http://defcoin.org/',
      archiveUrl: archiveSearch('http://defcoin.org/'),
      note: 'The earlier site review recorded this domain as parked; use its archive for project history.',
      firstSeen: archiveCapture('http://defcoin.org/', '20140402050813'),
      lastSeen: archiveCapture('http://defcoin.org/', '20240318154058')
    }
  ],
  shutteredUtilities: [
    {
      name: 'def.coindroids.com',
      purpose: 'DFC-based browser game',
      originalUrl: 'https://def.coindroids.com/',
      bestUrl: archiveSearch('https://def.coindroids.com/'),
      status: 'Offline',
      firstSeen: archiveCapture('https://def.coindroids.com/', '20150226124349'),
      lastSeen: archiveCapture('https://def.coindroids.com/', '20240814220540')
    },
    {
      name: 'Create Your Own Defcoin Vanity Address',
      purpose: 'Forum thread and vanity-address instructions',
      originalUrl: 'http://defcointalk.org/threads/create-your-own-defcoin-vanity-address.1',
      bestUrl: archiveSearch('http://defcointalk.org/threads/create-your-own-defcoin-vanity-address.1'),
      status: 'Forum offline',
      firstSeen: archiveCapture('http://defcointalk.org/threads/create-your-own-defcoin-vanity-address.1', '20140406100339'),
      lastSeen: archiveCapture('http://defcointalk.org/threads/create-your-own-defcoin-vanity-address.1', '20160820112034')
    },
    {
      name: 'defcoin.assmeow.org',
      purpose: 'Legacy block explorer',
      originalUrl: 'http://defcoin.assmeow.org/',
      bestUrl: archiveSearch('http://defcoin.assmeow.org/'),
      status: 'Offline',
      firstSeen: archiveCapture('http://defcoin.assmeow.org/', '20140519064354'),
      lastSeen: archiveCapture('http://defcoin.assmeow.org/', '20160220112151')
    },
    {
      name: 'Defcoin Difficulty and Network Hashrate',
      purpose: 'Difficulty / network-hashrate page',
      originalUrl: 'http://defcoin.jculb.com',
      bestUrl: archiveSearch('http://defcoin.jculb.com'),
      status: 'Offline',
      firstSeen: archiveCapture('http://defcoin.jculb.com', '20140407114723'),
      lastSeen: archiveCapture('http://defcoin.jculb.com', '20150206124546')
    },
    {
      name: 'Defcoin Faucet',
      purpose: 'Giveaway faucet',
      originalUrl: 'http://defcoinfaucet.com/',
      bestUrl: archiveSearch('http://defcoinfaucet.com/'),
      status: 'Offline',
      firstSeen: archiveCapture('http://defcoinfaucet.com/', '20140401160352'),
      lastSeen: archiveCapture('http://defcoinfaucet.com/', '20150304045940')
    },
    {
      name: 'lostboy.net',
      purpose: 'Badge developer reference',
      originalUrl: 'http://lostboy.net/',
      bestUrl: archiveSearch('http://lostboy.net/'),
      status: 'Redirected/parked',
      firstSeen: archiveCapture('http://lostboy.net/', '20140404014453'),
      lastSeen: archiveCapture('http://lostboy.net/', '20240525130753')
    },
    {
      name: 'beerwallet.org',
      purpose: 'iOS wallet site',
      originalUrl: 'http://beerwallet.org/',
      bestUrl: archiveSearch('http://beerwallet.org/'),
      status: 'Offline',
      firstSeen: archiveCapture('http://beerwallet.org/', '20140402043230'),
      lastSeen: archiveCapture('http://beerwallet.org/', '20160306175128')
    },
    {
      name: 'defcointalk.org',
      purpose: 'Community forum',
      originalUrl: 'http://defcointalk.org/',
      bestUrl: archiveSearch('http://defcointalk.org/'),
      status: 'Offline',
      firstSeen: archiveCapture('http://defcointalk.org/', '20140403223333'),
      lastSeen: archiveCapture('http://defcointalk.org/', '20160821063752')
    },
    {
      name: 'wallet.ribbit.me:3000/status',
      purpose: 'Ribbit Rewards status / explorer surface',
      originalUrl: 'http://wallet.ribbit.me:3000/status',
      bestUrl: archiveSearch('http://wallet.ribbit.me:3000/status'),
      status: 'Offline',
      firstSeen: archiveCapture('http://wallet.ribbit.me:3000/status', '20140429011822'),
      lastSeen: archiveCapture('http://wallet.ribbit.me:3000/status', '20140526015054')
    }
  ],
  retiredPools: [
    {
      name: 'RedBaron Defcoin Pool',
      operator: 'RedBaron',
      originalUrl: 'https://www.redbaron.us',
      alternateUrls: ['https://redbaron.us'],
      archiveUrl: archiveSearch('https://www.redbaron.us'),
      note: 'Named on defcoinstats and community pool lists.',
      firstSeen: archiveCapture('https://www.redbaron.us', '20140929074511'),
      lastSeen: archiveCapture('https://www.redbaron.us', '20210325173029')
    },
    {
      name: 'Subba Defcoin Pool',
      operator: 'Subba',
      originalUrl: 'https://defcoin-pool.subba.net',
      archiveUrl: archiveSearch('https://defcoin-pool.subba.net'),
      note: 'Named on defcoinstats and preserved community lists.',
      firstSeen: archiveCapture('https://defcoin-pool.subba.net', '20140405022052'),
      lastSeen: archiveCapture('https://defcoin-pool.subba.net/', '20210318015942')
    },
    {
      name: 'Chunky Pools',
      operator: 'Chunky',
      originalUrl: 'http://chunkypools.com/def',
      alternateUrls: ['http://chunkypools.com', 'http://ww3.chunkypools.com'],
      archiveUrl: archiveSearch('http://chunkypools.com/def'),
      note: 'defcoinstats listed Chunky Pools at chunkypools.com; older alias also appeared as http://ww3.chunkypools.com.',
      firstSeen: archiveCapture('http://ww3.chunkypools.com', '20140401165321'),
      lastSeen: archiveCapture('http://ww3.chunkypools.com', '20160309074630')
    },
    {
      name: 'Defcoin.US',
      operator: 'Unknown',
      originalUrl: 'http://defcoin.us',
      archiveUrl: archiveSearch('http://defcoin.us'),
      note: 'Named separately in the defcoinstats pool list.',
      firstSeen: archiveCapture('http://defcoin.us', '20140402142801'),
      lastSeen: archiveCapture('http://defcoin.us', '20210318192220')
    },
    {
      name: 'coin.iptron.net',
      operator: 'IPTron',
      originalUrl: 'http://coin.iptron.net:13370',
      archiveUrl: archiveSearch('http://coin.iptron.net:13370'),
      note: 'Referenced by defcoinstats with port 13370.',
      firstSeen: archiveCapture('http://coin.iptron.net', '20140401160731'),
      lastSeen: archiveCapture('http://coin.iptron.net', '20150225054303')
    },
    {
      name: 'Beardpool Defcoin Pool',
      operator: 'Acor / Beardpool',
      originalUrl: 'https://pool.acor.to',
      archiveUrl: archiveSearch('https://pool.acor.to'),
      note: 'Historical HTTPS and HTTP forms both existed.',
      firstSeen: archiveCapture('https://pool.acor.to', '20170311102716'),
      lastSeen: archiveCapture('https://pool.acor.to', '20210318185045')
    },
    {
      name: 'DC801 Defcoin Pool',
      operator: 'DC801',
      originalUrl: 'http://defcoin.dc801.org/',
      archiveUrl: archiveSearch('http://defcoin.dc801.org/'),
      note: 'The earlier review found an unrelated redirect. Pool operation dates remain unknown.',
      firstSeen: null,
      lastSeen: null
    },
    {
      name: 'defcoinpool.com',
      operator: 'Unknown',
      originalUrl: 'http://www.defcoinpool.com/',
      alternateUrls: ['http://defcoinpool.com/'],
      archiveUrl: archiveSearch('http://www.defcoinpool.com/'),
      backend: 'MPOS',
      note: 'Listed by DefcoinStats as “DEFCOIN Pool” and announced on Bitcointalk as “[ANN][POOL][DFC] defcoinpool.com | New DEFCOIN Pool”; defcoinpool.com and www.defcoinpool.com are both tracked.',
      firstSeen: {label: '2014-08-20', url: 'https://bitcointalk.org/index.php?topic=748812.0'},
      lastSeen: archiveCapture('http://defcoinpool.com/index.php?page=statistics&action=blockfinder', '20161023211240')
    },
    {
      name: 'g4tekeep3r DFC P2Pool',
      operator: 'g4tekeep3r',
      originalUrl: 'https://www.g4tekeep3r.com/2020/08/16/dfc-p2pool/',
      alternateUrls: [
        'stratum+tcp://104.156.229.155:9355',
        'stratum+tcp://dfcp2pool.g4tekeep3r.com:9355',
        'stratum+tcp://157.245.252.251:9355'
      ],
      archiveUrl: archiveSearch('https://www.g4tekeep3r.com/2020/08/16/dfc-p2pool/'),
      backend: 'P2Pool',
      note: 'The preserved 2020 post lists two nodes on port 9355 and credits charlesrocket. These are historical endpoints, not instructions to connect to a currently verified pool.',
      firstSeen: {label: '2020-08-16', url: 'https://www.g4tekeep3r.com/2020/08/16/dfc-p2pool/'},
      lastSeen: {label: '2020-08-16', url: 'https://www.g4tekeep3r.com/2020/08/16/dfc-p2pool/'}
    },
    {
      name: "Poltergeek's Pool",
      operator: 'Poltergeek',
      originalUrl: 'http://defcoin.cloudapp.net',
      archiveUrl: archiveSearch('http://defcoin.cloudapp.net'),
      note: 'Preserved in community pool lists.',
      firstSeen: archiveCapture('http://defcoin.cloudapp.net', '20140402183326'),
      lastSeen: archiveCapture('http://defcoin.cloudapp.net', '20150205183811')
    },
    {
      name: 'Cryptoheater',
      operator: 'Unknown',
      originalUrl: 'http://cryptoheater.com/',
      archiveUrl: archiveSearch('http://cryptoheater.com/'),
      note: 'Listed as down on the preserved defcoinstats page.',
      firstSeen: archiveCapture('http://cryptoheater.com/', '20140404014918'),
      lastSeen: archiveCapture('http://cryptoheater.com/', '20140929075333')
    },
    {
      name: 'SecDSM Defcoin Pool',
      operator: 'SecDSM',
      originalUrl: 'https://web.archive.org/web/20250405212630/https://defcoin-ng.org/',
      archiveUrl: archiveSearch('https://defcoin-ng.org/'),
      note: 'Named in the 2025-04-05 defcoin-ng.org archive. The original pool URL is unknown, so the link goes to that source page.',
      firstSeen: archiveCapture('https://defcoin-ng.org/', '20250405212630'),
      lastSeen: archiveCapture('https://defcoin-ng.org/', '20250405212630')
    },
    {
      name: 'Unknown Mining Pool',
      operator: 'Unknown',
      originalUrl: 'http://unknownminingpool.com/',
      archiveUrl: archiveSearch('http://unknownminingpool.com/'),
      note: 'An operator note records it as inactive by 2023-08-10. The name still appeared in a 2025 site archive; that mention does not prove the pool restarted. HTTP did not answer in the 2026-04-26 check.',
      firstSeen: archiveCapture('https://defcoin-ng.org/', '20250405212630'),
      lastSeen: null
    },
    {
      name: 'Laiw Pool',
      operator: 'LAIW',
      originalUrl: 'https://mine.laiw.com/',
      archiveUrl: archiveSearch('https://mine.laiw.com/'),
      note: 'The 2026-04-26 DNS check returned NXDOMAIN. Later status was not rechecked.',
      firstSeen: archiveCapture('https://defcoin-ng.org/', '20250405212630'),
      lastSeen: null
    }
  ],
  chainTimeline: [
    {
      time: '2014-03-07 07:54:37 UTC',
      title: 'Block 25: an early chain record',
      url: 'https://defcoin.dc903.org/explorer/tx/3e0f05acf458c2af86a4d85f2efeeacfb8c699529c449f313b6123bd126884aa',
      note: 'A block 25 coinbase transaction. This is an early record linked by this page, not proof of the exact public launch date.'
    },
    {
      time: '2014-04-13 19:27:00 UTC',
      title: 'P2Pool-style coinbase recorded',
      url: 'https://defcoin.dc903.org/explorer/tx/72ac97603e2bb7d3a240ffaa1e8f2a9e49e29f3eba80f2a7449e6caef4bb0150',
      note: 'The coinbase includes a legacy P2Pool donation output and OP_RETURN share marker. This identifies a transaction pattern, not the first-ever P2Pool session.'
    }
  ],
  researchNotes: [
    'Community history was researched on 2026-10-08. Each paragraph links to its source; an article publication date can differ from the date of the event it describes.',
    'First and last evidence dates are observations, not proven launch or shutdown dates. A saved website does not establish uninterrupted mining between captures.',
    'DC903 and its explorer redirects were checked on 2026-10-08. Other endpoint checks retain their original dates; social activity and retired-site status were not broadly rechecked.',
    'The local faucet is disabled and returns 404, so it is excluded from current pages. Older faucet records remain in the archive tables.',
    'The original launch date, complete contributor list, and several pool operation dates remain unresolved. The linked block 25 record alone cannot settle them.'
  ]
};

module.exports.poolTimeline = buildPoolTimeline(module.exports.activePools, module.exports.retiredPools);

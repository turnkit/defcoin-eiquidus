module.exports = {
  checkedOn: '2026-04-18',
  defaultPowerCostUsdPerKwh: 0.12,
  releases: {
    version: 'v1.0.0',
    publishedAt: '2018-06-19',
    githubReleaseUrl: 'https://github.com/mspicer/Defcoin/releases/tag/v1.0.0',
    downloads: [
      {
        id: 'windows-x64',
        label: 'Windows x86_64 wallet zip',
        url: 'https://github.com/mspicer/Defcoin/releases/download/v1.0.0/x86_64-windows-defcoin-1.0.0.zip',
        compatibility: 'Windows x86_64 era build. Best fit for older Intel/AMD Windows systems.'
      },
      {
        id: 'linux-x64',
        label: 'Linux x86_64 wallet tarball',
        url: 'https://github.com/mspicer/Defcoin/releases/download/v1.0.0/x86_64-linux-defcoin-1.0.0.tar.gz',
        compatibility: 'Linux x86_64 build for older glibc-era desktops and servers.'
      },
      {
        id: 'mac-dmg',
        label: 'macOS Intel dmg',
        url: 'https://github.com/mspicer/Defcoin/releases/download/v1.0.0/x86_64-apple-defcoin-1.0.0.dmg',
        compatibility: 'Intel macOS build. Apple Silicon is not currently supported by a published native build.'
      },
      {
        id: 'mac-app-zip',
        label: 'macOS 10.12 app zip',
        url: 'https://github.com/mspicer/Defcoin/releases/download/v1.0.0/Defcoin-Qt.app.for_Mac_OS_10.12_with_SSE2_enabled_in_Scrypt_libraries.zip',
        compatibility: 'Older macOS Intel app build called out for macOS 10.12 with SSE2-enabled libraries.'
      },
      {
        id: 'mac-tarball',
        label: 'macOS Intel tarball',
        url: 'https://github.com/mspicer/Defcoin/releases/download/v1.0.0/x86_64-apple-darwin15-defcoin-1.0.0.tar.gz',
        compatibility: 'Raw Intel macOS tarball for older manual installs.'
      }
    ]
  },
  obtainMethods: [
    'Mine directly to your own wallet or to a paper wallet you control.',
    'Receive coins as a gift from another wallet holder using the normal send/receive flow.',
    'Import or sweep an older paper wallet if you already have one.',
    'Use badge automation or person-to-person transfers when a community event or local trade makes that easier than mining.'
  ],
  rigs: [
    {
      id: 'ryzen-9-3900x',
      class: 'CPU',
      name: 'AMD Ryzen 9 3900X',
      summary: 'A reasonable hobbyist CPU option if you already own the box and want to learn the process.',
      hashrateHps: 45000,
      watts: 105,
      priceRangeUsd: '$150-$210 used',
      priceSourceLabel: 'eBay used search',
      priceSourceUrl: 'https://www.ebay.com/sch/i.html?_nkw=Ryzen+9+3900X+used',
      specSourceLabel: 'AMD product page',
      specSourceUrl: 'https://www.amd.com/en/products/processors/desktops/ryzen/amd-ryzen-9-3900x.html'
    },
    {
      id: 'radeon-rx-580-8gb',
      class: 'GPU',
      name: 'Radeon RX 580 8GB',
      summary: 'Still common on the used market and approachable for a first GPU experiment.',
      hashrateHps: 500000,
      watts: 150,
      priceRangeUsd: '$80-$120 used',
      priceSourceLabel: 'eBay used search',
      priceSourceUrl: 'https://www.ebay.com/sch/i.html?_nkw=Radeon+RX+580+8GB+used',
      specSourceLabel: 'AMD product page',
      specSourceUrl: 'https://www.amd.com/en/products/graphics/desktops/radeon-rx/radeon-rx-580.html'
    },
    {
      id: 'goldshell-mini-doge-iii',
      class: 'ASIC',
      name: 'Goldshell Mini-DOGE III',
      summary: 'Quiet-ish small Scrypt ASIC. More practical than CPU/GPU if you want meaningful hashrate without rack gear.',
      hashrateHps: 700000000,
      watts: 400,
      priceRangeUsd: '$320-$480 used',
      priceSourceLabel: 'eBay used search',
      priceSourceUrl: 'https://www.ebay.com/sch/i.html?_nkw=Goldshell+Mini+DOGE+III+used',
      specSourceLabel: 'Goldshell product family',
      specSourceUrl: 'https://www.goldshell.com/product-category/home-miner-box/'
    },
    {
      id: 'antminer-l3-plus',
      class: 'ASIC',
      name: 'Bitmain Antminer L3+',
      summary: 'An older but still recognizable Scrypt workhorse if you can tolerate noise and power draw.',
      hashrateHps: 504000000,
      watts: 800,
      priceRangeUsd: '$150-$320 used',
      priceSourceLabel: 'eBay used search',
      priceSourceUrl: 'https://www.ebay.com/sch/i.html?_nkw=Antminer+L3%2B+used',
      specSourceLabel: 'ASIC Miner Value reference',
      specSourceUrl: 'https://www.asicminervalue.com/miners/bitmain/antminer-l3-504mh'
    }
  ]
};

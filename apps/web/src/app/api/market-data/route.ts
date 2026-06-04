const ETH_KEY = 'coingecko:ethereum';
const METH_KEY = 'mantle:0xcDA86A272531e8640cD7F1a92c01839911B90bb0';
const USDY_KEY = 'mantle:0x5bE26527e817998A7206475496fDE1E68957c5A6';
const COINGECKO_IDS = 'ethereum,mantle-staked-ether,ondo-us-dollar-yield';

async function readChartChange(
  result: PromiseSettledResult<Response>,
  key: string
): Promise<number | null> {
  if (result.status !== 'fulfilled' || !result.value.ok) return null;

  const chart = await result.value.json();
  const points = chart?.coins?.[key]?.prices ?? [];
  const first = points[0]?.price;
  const last = points[points.length - 1]?.price;

  if (!first || !last) return null;
  return ((last - first) / first) * 100;
}

function round(value: number | null, digits = 2): number | null {
  return value === null ? null : parseFloat(value.toFixed(digits));
}

function readNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readMantleChainChange(chains: { name?: string; change_1d?: number }[]): number | null {
  const mantle = chains.find((c) => c.name?.toLowerCase() === 'mantle');
  return typeof mantle?.change_1d === 'number' ? mantle.change_1d : null;
}

function readMantleChartChange(chart: { totalLiquidityUSD?: number }[]): number | null {
  if (chart.length < 2) return null;
  const latest = chart[chart.length - 1]?.totalLiquidityUSD;
  const previous = chart[chart.length - 2]?.totalLiquidityUSD;
  if (!latest || !previous) return null;
  return ((latest - previous) / previous) * 100;
}

function readHyperliquidEthFunding(payload: unknown): number | null {
  if (!Array.isArray(payload) || payload.length < 2) return null;
  const universe = payload[0]?.universe;
  const contexts = payload[1];
  if (!Array.isArray(universe) || !Array.isArray(contexts)) return null;

  const ethIndex = universe.findIndex((market) => market?.name === 'ETH');
  const parsed = parseFloat(contexts[ethIndex]?.funding ?? '');
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET() {
  try {
    const [
      coingeckoRes,
      priceRes,
      ethChartRes,
      methChartRes,
      usdyChartRes,
      llamaChainsRes,
      llamaMantleChartRes,
      fearRes,
      binanceRes,
      hyperliquidRes,
    ] = await Promise.allSettled([
        fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${COINGECKO_IDS}&vs_currencies=usd&include_24hr_change=true`,
          { next: { revalidate: 60 } }
        ),
        fetch(`https://coins.llama.fi/prices/current/${ETH_KEY},${METH_KEY},${USDY_KEY}`, {
          next: { revalidate: 60 },
        }),
        fetch(`https://coins.llama.fi/chart/${ETH_KEY}?span=2&period=1d`, {
          next: { revalidate: 60 },
        }),
        fetch(`https://coins.llama.fi/chart/${METH_KEY}?span=2&period=1d`, {
          next: { revalidate: 60 },
        }),
        fetch(`https://coins.llama.fi/chart/${USDY_KEY}?span=2&period=1d`, {
          next: { revalidate: 60 },
        }),
        fetch('https://api.llama.fi/v2/chains', { next: { revalidate: 120 } }),
        fetch('https://api.llama.fi/charts/Mantle', { next: { revalidate: 120 } }),
        fetch('https://api.alternative.me/fng/?limit=1', { next: { revalidate: 300 } }),
        fetch('https://fapi.binance.com/fapi/v1/fundingRate?symbol=ETHUSDT&limit=1', {
          next: { revalidate: 60 },
        }),
        fetch('https://api.hyperliquid.xyz/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
          next: { revalidate: 60 },
        }),
      ]);

    let ethPrice: number | null = null;
    let methPrice: number | null = null;
    let usdyPrice: number | null = null;
    let ethChange: number | null = null;
    let methChange: number | null = null;
    let usdyChange: number | null = null;

    if (coingeckoRes.status === 'fulfilled' && coingeckoRes.value.ok) {
      const coingecko = await coingeckoRes.value.json();
      ethPrice = readNumber(coingecko?.ethereum?.usd);
      ethChange = readNumber(coingecko?.ethereum?.usd_24h_change);
      methPrice = readNumber(coingecko?.['mantle-staked-ether']?.usd);
      methChange = readNumber(coingecko?.['mantle-staked-ether']?.usd_24h_change);
      usdyPrice = readNumber(coingecko?.['ondo-us-dollar-yield']?.usd);
      usdyChange = readNumber(coingecko?.['ondo-us-dollar-yield']?.usd_24h_change);
    }

    if (
      (ethPrice === null || methPrice === null || usdyPrice === null) &&
      priceRes.status === 'fulfilled' &&
      priceRes.value.ok
    ) {
      const prices = await priceRes.value.json();
      const coins = prices?.coins ?? {};
      ethPrice = ethPrice ?? coins[ETH_KEY]?.price ?? null;
      methPrice = methPrice ?? coins[METH_KEY]?.price ?? null;
      usdyPrice = usdyPrice ?? coins[USDY_KEY]?.price ?? null;
    }

    ethChange = ethChange ?? (await readChartChange(ethChartRes, ETH_KEY));
    methChange = methChange ?? (await readChartChange(methChartRes, METH_KEY));
    usdyChange = usdyChange ?? (await readChartChange(usdyChartRes, USDY_KEY));

    let mantleTvlChange: number | null = null;
    if (llamaChainsRes.status === 'fulfilled' && llamaChainsRes.value.ok) {
      mantleTvlChange = readMantleChainChange(await llamaChainsRes.value.json());
    }
    if (
      mantleTvlChange === null &&
      llamaMantleChartRes.status === 'fulfilled' &&
      llamaMantleChartRes.value.ok
    ) {
      mantleTvlChange = readMantleChartChange(await llamaMantleChartRes.value.json());
    }

    let sentimentRaw: number | null = null;
    let sentimentLabel: string | null = null;
    if (fearRes.status === 'fulfilled' && fearRes.value.ok) {
      const fear = await fearRes.value.json();
      const parsed = parseInt(fear?.data?.[0]?.value ?? '', 10);
      sentimentRaw = Number.isFinite(parsed) ? parsed : null;
      sentimentLabel = fear?.data?.[0]?.value_classification ?? null;
    }
    const sentimentScore =
      sentimentRaw === null ? null : parseFloat(((sentimentRaw - 50) / 50).toFixed(2));

    let fundingRate: number | null = null;
    if (binanceRes.status === 'fulfilled' && binanceRes.value.ok) {
      const funding = await binanceRes.value.json();
      const parsed = parseFloat(funding?.[0]?.fundingRate ?? '');
      fundingRate = Number.isFinite(parsed) ? parsed : null;
    }
    if (fundingRate === null && hyperliquidRes.status === 'fulfilled' && hyperliquidRes.value.ok) {
      fundingRate = readHyperliquidEthFunding(await hyperliquidRes.value.json());
    }

    const usdyPegDeviation = null;

    return Response.json({
      ethPrice,
      ethChange: round(ethChange),
      methPrice,
      methChange: round(methChange),
      usdyPrice,
      usdyChange: round(usdyChange),
      usdyPegDeviation,
      mantleTvlChange: round(mantleTvlChange),
      sentimentScore,
      sentimentLabel,
      fundingRate: fundingRate === null ? null : parseFloat((fundingRate * 100).toFixed(4)),
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('market-data error:', err);
    return Response.json({ error: 'Failed to fetch market data' }, { status: 500 });
  }
}

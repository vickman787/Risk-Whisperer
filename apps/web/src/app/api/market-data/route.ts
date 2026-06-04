const ETH_KEY = 'coingecko:ethereum';
const METH_KEY = 'mantle:0xcDA86A272531e8640cD7F1a92c01839911B90bb0';
const USDY_KEY = 'mantle:0x5bE26527e817998A7206475496fDE1E68957c5A6';

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

export async function GET() {
  try {
    const [priceRes, ethChartRes, methChartRes, usdyChartRes, llamaRes, fearRes, binanceRes] =
      await Promise.allSettled([
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
        fetch('https://api.alternative.me/fng/?limit=1', { next: { revalidate: 300 } }),
        fetch('https://fapi.binance.com/fapi/v1/fundingRate?symbol=ETHUSDT&limit=1', {
          next: { revalidate: 60 },
        }),
      ]);

    let ethPrice: number | null = null;
    let methPrice: number | null = null;
    let usdyPrice: number | null = null;

    if (priceRes.status === 'fulfilled' && priceRes.value.ok) {
      const prices = await priceRes.value.json();
      const coins = prices?.coins ?? {};
      ethPrice = coins[ETH_KEY]?.price ?? null;
      methPrice = coins[METH_KEY]?.price ?? null;
      usdyPrice = coins[USDY_KEY]?.price ?? null;
    }

    const ethChange = await readChartChange(ethChartRes, ETH_KEY);
    const methChange = await readChartChange(methChartRes, METH_KEY);
    const usdyChange = await readChartChange(usdyChartRes, USDY_KEY);

    let mantleTvlChange: number | null = null;
    if (llamaRes.status === 'fulfilled' && llamaRes.value.ok) {
      const chains: { name: string; change_1d?: number }[] = await llamaRes.value.json();
      const mantle = chains.find((c) => c.name?.toLowerCase() === 'mantle');
      mantleTvlChange = mantle?.change_1d ?? null;
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

    const usdyPegDeviation =
      usdyPrice === null ? null : parseFloat(Math.abs(usdyPrice - 1.0).toFixed(4));

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

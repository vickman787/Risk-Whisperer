export async function GET() {
  try {
    const [priceRes, ethChartRes, llamaRes, fearRes, binanceRes] = await Promise.allSettled([
      // ETH, mETH, and USDY prices from DeFiLlama (free, no key)
      fetch(
        'https://coins.llama.fi/prices/current/coingecko:ethereum,mantle:0xcDA86A272531e8640cD7F1a92c01839911B90bb0,mantle:0x5bE26527e817998A7206475496fDE1E68957c5A6',
        { next: { revalidate: 60 } }
      ),
      // ETH 24h change from DeFiLlama chart data
      fetch('https://coins.llama.fi/chart/coingecko:ethereum?span=2&period=1d', {
        next: { revalidate: 60 },
      }),
      // Mantle TVL from DeFiLlama (free, no key)
      fetch('https://api.llama.fi/v2/chains', { next: { revalidate: 120 } }),
      // Fear & Greed Index (free, no key)
      fetch('https://api.alternative.me/fng/?limit=1', { next: { revalidate: 300 } }),
      // ETH perpetual funding rate from Binance (free, no key)
      fetch('https://fapi.binance.com/fapi/v1/fundingRate?symbol=ETHUSDT&limit=1', {
        next: { revalidate: 60 },
      }),
    ]);

    // --- Prices ---
    let ethPrice = 3218;
    let ethChange = 0;
    let methPrice = 3280;
    let usdyPrice = 1.0004;
    let usdyChange = 0.01;

    if (priceRes.status === 'fulfilled' && priceRes.value.ok) {
      const prices = await priceRes.value.json();
      const coins = prices?.coins ?? {};
      ethPrice = coins['coingecko:ethereum']?.price ?? ethPrice;
      methPrice =
        coins['mantle:0xcDA86A272531e8640cD7F1a92c01839911B90bb0']?.price ?? methPrice;
      usdyPrice =
        coins['mantle:0x5bE26527e817998A7206475496fDE1E68957c5A6']?.price ?? usdyPrice;
    }

    if (ethChartRes.status === 'fulfilled' && ethChartRes.value.ok) {
      const chart = await ethChartRes.value.json();
      const points = chart?.coins?.['coingecko:ethereum']?.prices ?? [];
      const first = points[0]?.price;
      const last = points[points.length - 1]?.price;
      if (first && last) {
        ethChange = ((last - first) / first) * 100;
      }
    }

    // --- Mantle TVL change ---
    let mantleTvlChange = 0;
    if (llamaRes.status === 'fulfilled' && llamaRes.value.ok) {
      const chains: { name: string; change_1d?: number }[] = await llamaRes.value.json();
      const mantle = chains.find((c) => c.name?.toLowerCase() === 'mantle');
      mantleTvlChange = mantle?.change_1d ?? 0;
    }

    // --- Fear & Greed (0-100 → remap to -1 to 1 sentiment) ---
    let sentimentRaw = 50;
    let sentimentLabel = 'Neutral';
    if (fearRes.status === 'fulfilled' && fearRes.value.ok) {
      const fear = await fearRes.value.json();
      sentimentRaw = parseInt(fear?.data?.[0]?.value ?? '50', 10);
      sentimentLabel = fear?.data?.[0]?.value_classification ?? 'Neutral';
    }
    // Remap 0-100 → -1 to +1
    const sentimentScore = parseFloat(((sentimentRaw - 50) / 50).toFixed(2));

    // --- ETH Funding Rate ---
    let fundingRate = 0.00032;
    if (binanceRes.status === 'fulfilled' && binanceRes.value.ok) {
      const funding = await binanceRes.value.json();
      fundingRate = parseFloat(funding?.[0]?.fundingRate ?? '0.00032');
    }

    // USDY peg deviation (distance from $1.00)
    const usdyPegDeviation = parseFloat(Math.abs(usdyPrice - 1.0).toFixed(4));

    return Response.json({
      ethPrice,
      ethChange: parseFloat(ethChange.toFixed(2)),
      methPrice,
      usdyPrice,
      usdyChange: parseFloat(usdyChange.toFixed(2)),
      usdyPegDeviation,
      mantleTvlChange: parseFloat(mantleTvlChange.toFixed(2)),
      sentimentScore,
      sentimentLabel,
      fundingRate: parseFloat((fundingRate * 100).toFixed(4)),
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('market-data error:', err);
    return Response.json({ error: 'Failed to fetch market data' }, { status: 500 });
  }
}

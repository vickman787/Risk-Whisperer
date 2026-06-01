import sql from '@/app/api/utils/sql';
import { ensureOwnerColumns, getOrCreatePortfolio, getOwnerKey } from '@/app/api/utils/owner';

type MarketSnapshot = {
  ethPrice: number;
  ethChange: number;
  methPrice: number;
  usdyPrice: number;
  usdyChange: number;
  usdyPegDeviation: number;
  mantleTvlChange: number;
  sentimentScore: number;
  sentimentLabel: string;
  fundingRate: number;
  fetchedAt: string;
};

type PortfolioState = {
  id?: number;
  meth_allocation: number;
  usdy_allocation: number;
  total_value_usd: number;
};

type ResearchSource = {
  label: string;
  category: 'Price' | 'Peg' | 'Liquidity' | 'Sentiment' | 'Leverage' | 'Portfolio';
  url: string;
  summary: string;
  signal: 'Bullish' | 'Bearish' | 'Neutral' | 'Risk';
};

type AgentDecision = {
  trigger: string;
  action: string;
  from_asset: string | null;
  to_asset: string | null;
  amount: string | null;
  reallocation_pct: number;
  risk_score: number;
  confidence: number;
  research_brief?: string;
  key_findings?: string[];
  sources_used?: string[];
  reasoning: string;
};

function generateTxHash(): string {
  const hex = '0123456789abcdef';
  const full = Array.from({ length: 10 }, () => hex[Math.floor(Math.random() * 16)]).join('');
  return `0x${full.slice(0, 4)}...${full.slice(6)}`;
}

function formatPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function buildResearchDossier(
  market: MarketSnapshot,
  portfolio: PortfolioState,
  recentContext: string
) {
  const usdyPegBps = market.usdyPegDeviation * 10_000;
  const sources: ResearchSource[] = [
    {
      label: 'DeFiLlama token prices',
      category: 'Price',
      url: 'https://coins.llama.fi/prices/current/coingecko:ethereum,mantle:0xcDA86A272531e8640cD7F1a92c01839911B90bb0,mantle:0x5bE26527e817998A7206475496fDE1E68957c5A6',
      summary: `ETH is $${market.ethPrice.toLocaleString()} (${formatPct(market.ethChange)} 24h), mETH is $${market.methPrice.toLocaleString()}, and USDY is $${market.usdyPrice.toFixed(4)}.`,
      signal: market.ethChange > 2 ? 'Bullish' : market.ethChange < -2 ? 'Bearish' : 'Neutral',
    },
    {
      label: 'USDY peg monitor',
      category: 'Peg',
      url: 'https://coins.llama.fi/prices/current/mantle:0x5bE26527e817998A7206475496fDE1E68957c5A6',
      summary: `USDY is ${usdyPegBps.toFixed(1)} bps away from $1.00; emergency hold threshold is 50 bps.`,
      signal: market.usdyPegDeviation > 0.005 ? 'Risk' : 'Neutral',
    },
    {
      label: 'DeFiLlama Mantle TVL',
      category: 'Liquidity',
      url: 'https://api.llama.fi/v2/chains',
      summary: `Mantle TVL changed ${formatPct(market.mantleTvlChange)} over 24h, a proxy for chain liquidity pressure.`,
      signal:
        market.mantleTvlChange > 1 ? 'Bullish' : market.mantleTvlChange < -1 ? 'Bearish' : 'Neutral',
    },
    {
      label: 'Alternative.me Fear and Greed',
      category: 'Sentiment',
      url: 'https://api.alternative.me/fng/?limit=1',
      summary: `Crypto sentiment is ${market.sentimentLabel} (${Math.round((market.sentimentScore + 1) * 50)}/100).`,
      signal:
        market.sentimentScore > 0.25
          ? 'Bullish'
          : market.sentimentScore < -0.25
            ? 'Bearish'
            : 'Neutral',
    },
    {
      label: 'Binance ETH perpetual funding',
      category: 'Leverage',
      url: 'https://fapi.binance.com/fapi/v1/fundingRate?symbol=ETHUSDT&limit=1',
      summary: `ETH perpetual funding is ${formatPct(market.fundingRate)}, showing current long/short leverage pressure.`,
      signal: market.fundingRate > 0.03 ? 'Risk' : market.fundingRate < -0.01 ? 'Bearish' : 'Neutral',
    },
    {
      label: 'Portfolio constraints and memory',
      category: 'Portfolio',
      url: 'internal://portfolio-state-and-recent-decisions',
      summary: `Portfolio is ${portfolio.meth_allocation}% mETH and ${portfolio.usdy_allocation}% USDY. Recent memory: ${recentContext}`,
      signal: 'Neutral',
    },
  ];

  const risks = sources.filter((source) => source.signal === 'Risk' || source.signal === 'Bearish');
  const opportunities = sources.filter((source) => source.signal === 'Bullish');

  return {
    generatedAt: new Date().toISOString(),
    objective:
      'Autonomously research Mantle RWA portfolio risk before making a bounded allocation recommendation.',
    sources,
    riskHypotheses: risks.map((source) => `${source.category}: ${source.summary}`),
    opportunityHypotheses: opportunities.map((source) => `${source.category}: ${source.summary}`),
  };
}

export async function POST(request: Request) {
  try {
    await ensureOwnerColumns();
    const ownerKey = await getOwnerKey(request);
    const baseUrl = process.env.NEXT_PUBLIC_CREATE_APP_URL ?? new URL(request.url).origin;
    const marketRes = await fetch(`${baseUrl}/api/market-data`);
    if (!marketRes.ok) throw new Error('Failed to fetch market data');
    const market = (await marketRes.json()) as MarketSnapshot;

    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not set');
    }

    const portfolio = (await getOrCreatePortfolio(ownerKey)) as PortfolioState;

    const recentDecisions = await sql`
      SELECT action, reasoning, risk_after, created_at
      FROM decisions
      WHERE owner_key = ${ownerKey}
      ORDER BY created_at DESC
      LIMIT 3
    `;

    const recentContext =
      recentDecisions.length > 0
        ? recentDecisions
            .map(
              (d) =>
                `- ${String(d.action)}: ${String(d.reasoning).slice(0, 120)}...`
            )
            .join('\n')
        : 'No previous decisions yet.';

    const researchDossier = buildResearchDossier(market, portfolio, recentContext);
    const researchContext = researchDossier.sources
      .map(
        (source, index) =>
          `${index + 1}. ${source.label} [${source.category}, ${source.signal}]\n   URL: ${source.url}\n   Finding: ${source.summary}`
      )
      .join('\n');

    const systemPrompt = `You are Risk Whisperer - an autonomous AI research agent and risk manager for a DeFi portfolio focused on Mantle RWA assets. You manage two assets:
- mETH (Mantle Staked Ether): currently ${portfolio.meth_allocation}% of portfolio. Medium risk, reference yield ~4.8% APY.
- USDY (Ondo US Dollar Yield): currently ${portfolio.usdy_allocation}% of portfolio. Low risk, reference yield ~5.1% APY. Backed by US Treasuries.

Your operating loop:
1. Inspect every supplied source and separate evidence from speculation.
2. Form risk and opportunity hypotheses.
3. Check portfolio constraints and cooldown memory.
4. Decide only when the evidence clears the confidence threshold.
5. Produce an auditable research trail with source names.

Your rules:
- mETH must stay between 40% and 75%
- USDY must stay above 25%
- Max single reallocation: 15%
- Don't execute if confidence < 70%
- 2-hour cooldown between trades (check recent decisions)
- If USDY peg deviation > 0.5%, trigger emergency Hold
- All decisions must be explainable and verifiable

You must output ONLY valid JSON in this exact format, no extra text:
{
  "trigger": "News Signal" | "On-chain Anomaly" | "Market Scan" | "Sentiment Alert",
  "action": "Reallocate" | "Increase" | "Reduce" | "Hold",
  "from_asset": "mETH" | "USDY" | null,
  "to_asset": "mETH" | "USDY" | null,
  "amount": "e.g. 2,500 USDY" | null,
  "reallocation_pct": number between 0 and 15 (percentage of portfolio to move, 0 if Hold),
  "risk_score": number between 1 and 100,
  "confidence": number between 50 and 99,
  "research_brief": "2-4 sentences summarizing the independent evidence review",
  "key_findings": ["3-5 concise evidence-backed findings"],
  "sources_used": ["source labels that directly influenced the decision"],
  "reasoning": "2-3 sentences explaining the portfolio decision with specific evidence from the research brief"
}`;

    const userPrompt = `Research dossier:
${researchContext}

Current portfolio:
- mETH: ${portfolio.meth_allocation}%
- USDY: ${portfolio.usdy_allocation}%
- Total value: $${portfolio.total_value_usd}

Recent decisions (for cooldown context):
${recentContext}

Autonomously research the evidence, then decide what to do. Output only the JSON.`;

    const openRouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': baseUrl,
        'X-Title': 'Risk Whisperer',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-haiku',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 900,
      }),
    });

    if (!openRouterRes.ok) {
      const errText = await openRouterRes.text();
      throw new Error(`OpenRouter error: ${errText}`);
    }

    const openRouterData = await openRouterRes.json();
    const rawContent = openRouterData.choices?.[0]?.message?.content ?? '';

    let decision: AgentDecision;

    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in AI response');
      decision = JSON.parse(jsonMatch[0]);
    } catch {
      throw new Error(`Failed to parse AI response: ${rawContent}`);
    }

    let newMeth = portfolio.meth_allocation;
    let newUsdy = portfolio.usdy_allocation;

    if (decision.action !== 'Hold' && decision.reallocation_pct > 0) {
      const pct = Math.min(decision.reallocation_pct, 15);
      if (decision.from_asset === 'USDY' && decision.to_asset === 'mETH') {
        newMeth = Math.min(75, newMeth + pct);
        newUsdy = Math.max(25, newUsdy - pct);
      } else if (decision.from_asset === 'mETH' && decision.to_asset === 'USDY') {
        newMeth = Math.max(40, newMeth - pct);
        newUsdy = Math.min(60, newUsdy + pct);
      }
    }

    const riskBefore =
      decision.action === 'Hold'
        ? decision.risk_score
        : Math.min(
            100,
            Math.max(1, decision.risk_score + (decision.from_asset === 'mETH' ? -5 : 5))
          );
    const riskAfter = decision.risk_score;
    const txHash = generateTxHash();

    const [saved] = await sql`
      INSERT INTO decisions (
        owner_key, tx_hash, trigger_type, reasoning, action,
        from_asset, to_asset, amount,
        risk_before, risk_after, confidence, status, market_snapshot
      ) VALUES (
        ${ownerKey},
        ${txHash},
        ${decision.trigger},
        ${decision.reasoning},
        ${decision.action},
        ${decision.from_asset ?? '-'},
        ${decision.to_asset ?? '-'},
        ${decision.amount ?? '-'},
        ${riskBefore},
        ${riskAfter},
        ${decision.confidence},
        ${decision.confidence >= 70 ? 'Recommended' : 'Skipped'},
        ${JSON.stringify({
          market,
          research: researchDossier,
          ai: {
            research_brief: decision.research_brief ?? '',
            key_findings: decision.key_findings ?? [],
            sources_used: decision.sources_used ?? [],
          },
        })}
      )
      RETURNING *
    `;

    if (decision.confidence >= 70 && decision.action !== 'Hold' && portfolio.id) {
      await sql`
        UPDATE portfolio_state
        SET meth_allocation = ${newMeth},
            usdy_allocation = ${newUsdy},
            updated_at = NOW()
        WHERE id = ${portfolio.id}
          AND owner_key = ${ownerKey}
      `;
    }

    return Response.json({ success: true, decision: saved, market, research: researchDossier });
  } catch (err) {
    console.error('agent/run error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Agent run failed' },
      { status: 500 }
    );
  }
}

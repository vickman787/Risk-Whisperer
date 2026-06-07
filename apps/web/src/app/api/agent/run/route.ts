import sql from '@/app/api/utils/sql';
import { ensureOwnerColumns, getOrCreatePortfolio, getOwnerKey } from '@/app/api/utils/owner';

type MarketSnapshot = {
  ethPrice: number | null;
  ethChange: number | null;
  methPrice: number | null;
  methChange: number | null;
  usdyPrice: number | null;
  usdyChange: number | null;
  usdyPegDeviation: number | null;
  mantleTvlChange: number | null;
  sentimentScore: number | null;
  sentimentLabel: string | null;
  fundingRate: number | null;
  fetchedAt: string;
};

type PortfolioState = {
  id?: number;
  meth_allocation: number;
  usdy_allocation: number;
  total_value_usd: number;
};

type RecentDecision = {
  action: string;
  from_asset: string;
  to_asset: string;
  reasoning: string;
  risk_after: number;
  created_at: string;
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

const TRIGGERS = ['News Signal', 'On-chain Anomaly', 'Market Scan', 'Sentiment Alert'] as const;
const ACTIONS = ['Reallocate', 'Increase', 'Reduce', 'Hold'] as const;
const ASSETS = ['mETH', 'USDY'] as const;

function generateTxHash(): string {
  const hex = '0123456789abcdef';
  const full = Array.from({ length: 10 }, () => hex[Math.floor(Math.random() * 16)]).join('');
  return `0x${full.slice(0, 4)}...${full.slice(6)}`;
}

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'unavailable';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatUsd(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'unavailable';
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: digits })}`;
}

function signalFromChange(value: number | null | undefined): ResearchSource['signal'] {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Neutral';
  return value > 1 ? 'Bullish' : value < -1 ? 'Bearish' : 'Neutral';
}

function createUnavailableMarketSnapshot(): MarketSnapshot {
  return {
    ethPrice: null,
    ethChange: null,
    methPrice: null,
    methChange: null,
    usdyPrice: null,
    usdyChange: null,
    usdyPegDeviation: null,
    mantleTvlChange: null,
    sentimentScore: null,
    sentimentLabel: null,
    fundingRate: null,
    fetchedAt: new Date().toISOString(),
  };
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePortfolio(portfolio: PortfolioState): PortfolioState {
  return {
    ...portfolio,
    meth_allocation: toNumber(portfolio.meth_allocation),
    usdy_allocation: toNumber(portfolio.usdy_allocation),
    total_value_usd: toNumber(portfolio.total_value_usd),
  };
}

function isRecentTrade(decision: RecentDecision, now = Date.now()): boolean {
  const createdAt = new Date(decision.created_at).getTime();
  if (!Number.isFinite(createdAt)) return false;
  return now - createdAt < 2 * 60 * 60 * 1000;
}

function forceHold(decision: AgentDecision, reason: string): AgentDecision {
  return {
    ...decision,
    action: 'Hold',
    from_asset: null,
    to_asset: null,
    amount: null,
    reallocation_pct: 0,
    confidence: Math.min(decision.confidence, 69),
    reasoning: `${reason} ${decision.reasoning}`,
  };
}

function appendReason(decision: AgentDecision, reason: string): AgentDecision {
  return {
    ...decision,
    reasoning: `${reason} ${decision.reasoning}`,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cleanText(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text.slice(0, 1500) : fallback;
}

function cleanStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 240))
    .slice(0, 5);
  return cleaned.length > 0 ? cleaned : fallback;
}

function cleanEnum<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]) {
  return allowed.includes(value as T[number]) ? (value as T[number]) : fallback;
}

function cleanAsset(value: unknown): AgentDecision['from_asset'] {
  return ASSETS.includes(value as (typeof ASSETS)[number])
    ? (value as (typeof ASSETS)[number])
    : null;
}

function extractJsonObject(rawContent: string): unknown | null {
  try {
    return JSON.parse(rawContent);
  } catch {
    const start = rawContent.indexOf('{');
    const end = rawContent.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;

    try {
      return JSON.parse(rawContent.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function createFallbackDecision(researchDossier: ReturnType<typeof buildResearchDossier>): AgentDecision {
  const riskSources = researchDossier.sources.filter(
    (source) => source.signal === 'Risk' || source.signal === 'Bearish'
  );
  const bullishSources = researchDossier.sources.filter((source) => source.signal === 'Bullish');
  const riskScore = clamp(45 + riskSources.length * 12 - bullishSources.length * 4, 35, 88);
  const keyFindings =
    riskSources.length > 0
      ? riskSources.map((source) => source.summary).slice(0, 5)
      : researchDossier.sources.map((source) => source.summary).slice(0, 3);

  return {
    trigger: riskSources.some((source) => source.category === 'Liquidity')
      ? 'On-chain Anomaly'
      : riskSources.some((source) => source.category === 'Sentiment')
        ? 'Sentiment Alert'
        : 'Market Scan',
    action: 'Hold',
    from_asset: null,
    to_asset: null,
    amount: null,
    reallocation_pct: 0,
    risk_score: riskScore,
    confidence: riskScore >= 65 ? 72 : 66,
    research_brief:
      'The autonomous fallback engine reviewed the live research dossier because the model response was malformed. It recommends holding until wallet balances are available and the evidence can support a verifiable allocation change.',
    key_findings: keyFindings,
    sources_used: researchDossier.sources.map((source) => source.label),
    reasoning:
      'No connected wallet balances are available to verify an allocation change. The agent is preserving the current position and logging the researched market context instead of acting on an invalid model response.',
  };
}

function normalizeDecision(
  parsed: unknown,
  researchDossier: ReturnType<typeof buildResearchDossier>
): AgentDecision {
  const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const fallback = createFallbackDecision(researchDossier);
  const action = cleanEnum(record.action, ACTIONS, 'Hold');
  const riskScore = clamp(toNumber(record.risk_score), 1, 100);
  const confidence = clamp(toNumber(record.confidence), 50, 99);
  const fromAsset = cleanAsset(record.from_asset);
  const toAsset = cleanAsset(record.to_asset);

  return {
    trigger: cleanEnum(record.trigger, TRIGGERS, 'Market Scan'),
    action,
    from_asset: action === 'Hold' ? null : fromAsset,
    to_asset: action === 'Hold' ? null : toAsset,
    amount: action === 'Hold' ? null : cleanText(record.amount, ''),
    reallocation_pct:
      action === 'Hold' ? 0 : clamp(toNumber(record.reallocation_pct), 0, 15),
    risk_score: Number.isFinite(riskScore) && riskScore > 0 ? riskScore : fallback.risk_score,
    confidence: Number.isFinite(confidence) && confidence > 0 ? confidence : fallback.confidence,
    research_brief: cleanText(record.research_brief, fallback.research_brief ?? ''),
    key_findings: cleanStringArray(record.key_findings, fallback.key_findings ?? []),
    sources_used: cleanStringArray(record.sources_used, fallback.sources_used ?? []),
    reasoning: cleanText(record.reasoning, fallback.reasoning),
  };
}

function buildResearchDossier(
  market: MarketSnapshot,
  portfolio: PortfolioState,
  recentContext: string
) {
  const usdyPegBps =
    market.usdyPegDeviation === null || market.usdyPegDeviation === undefined
      ? null
      : market.usdyPegDeviation * 10_000;
  const sources: ResearchSource[] = [
    {
      label: 'DeFiLlama token prices',
      category: 'Price',
      url: 'https://coins.llama.fi/prices/current/coingecko:ethereum,mantle:0xcDA86A272531e8640cD7F1a92c01839911B90bb0,mantle:0x5bE26527e817998A7206475496fDE1E68957c5A6',
      summary: `ETH is ${formatUsd(market.ethPrice)} (${formatPct(market.ethChange)} 24h), mETH is ${formatUsd(market.methPrice)}, and USDY is ${formatUsd(market.usdyPrice, 4)}.`,
      signal: signalFromChange(market.ethChange),
    },
    {
      label: 'USDY peg monitor',
      category: 'Peg',
      url: 'https://coins.llama.fi/prices/current/mantle:0x5bE26527e817998A7206475496fDE1E68957c5A6',
      summary:
        usdyPegBps === null
          ? 'USDY peg data is unavailable from the live price feed.'
          : `USDY is ${usdyPegBps.toFixed(1)} bps away from $1.00; emergency hold threshold is 50 bps.`,
      signal:
        market.usdyPegDeviation !== null &&
        market.usdyPegDeviation !== undefined &&
        market.usdyPegDeviation > 0.005
          ? 'Risk'
          : 'Neutral',
    },
    {
      label: 'DeFiLlama Mantle TVL',
      category: 'Liquidity',
      url: 'https://api.llama.fi/v2/chains and https://api.llama.fi/charts/Mantle',
      summary: `Mantle TVL changed ${formatPct(market.mantleTvlChange)} over 24h, a proxy for chain liquidity pressure.`,
      signal: signalFromChange(market.mantleTvlChange),
    },
    {
      label: 'Alternative.me Fear and Greed',
      category: 'Sentiment',
      url: 'https://api.alternative.me/fng/?limit=1',
      summary:
        market.sentimentScore === null || market.sentimentScore === undefined
          ? 'Crypto sentiment data is unavailable from the live sentiment feed.'
          : `Crypto sentiment is ${market.sentimentLabel ?? 'unclassified'} (${Math.round((market.sentimentScore + 1) * 50)}/100).`,
      signal:
        market.sentimentScore !== null &&
        market.sentimentScore !== undefined &&
        market.sentimentScore > 0.25
          ? 'Bullish'
          : market.sentimentScore !== null &&
              market.sentimentScore !== undefined &&
              market.sentimentScore < -0.25
            ? 'Bearish'
            : 'Neutral',
    },
    {
      label: 'ETH perpetual funding',
      category: 'Leverage',
      url: 'https://fapi.binance.com/fapi/v1/fundingRate?symbol=ETHUSDT&limit=1 and https://api.hyperliquid.xyz/info',
      summary: `ETH perpetual funding is ${formatPct(market.fundingRate)}, showing current long/short leverage pressure.`,
      signal:
        market.fundingRate !== null &&
        market.fundingRate !== undefined &&
        market.fundingRate > 0.03
          ? 'Risk'
          : market.fundingRate !== null &&
              market.fundingRate !== undefined &&
              market.fundingRate < -0.01
            ? 'Bearish'
            : 'Neutral',
    },
    {
      label: 'Portfolio constraints and memory',
      category: 'Portfolio',
      url: 'internal://portfolio-state-and-recent-decisions',
      summary: `No wallet allocation data is supplied to this server route. Recent memory: ${recentContext}`,
      signal: 'Neutral',
    },
  ];

  const risks = sources.filter((source) => source.signal === 'Risk' || source.signal === 'Bearish');
  const opportunities = sources.filter((source) => source.signal === 'Bullish');

  return {
    generatedAt: new Date().toISOString(),
    objective:
      'Autonomously research Mantle RWA risk before making an evidence-backed recommendation.',
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
    let market: MarketSnapshot;
    try {
      const marketRes = await fetch(`${baseUrl}/api/market-data`);
      market = marketRes.ok
        ? ((await marketRes.json()) as MarketSnapshot)
        : createUnavailableMarketSnapshot();
    } catch (err) {
      console.warn('agent/run market data fallback:', err);
      market = createUnavailableMarketSnapshot();
    }

    const portfolio = normalizePortfolio((await getOrCreatePortfolio(ownerKey)) as PortfolioState);

    const recentDecisions = await sql`
      SELECT action, from_asset, to_asset, reasoning, risk_after, created_at
      FROM decisions
      WHERE owner_key = ${ownerKey}
      ORDER BY created_at DESC
      LIMIT 3
    ` as RecentDecision[];

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

    const systemPrompt = `You are Risk Whisperer - an autonomous AI research agent for Mantle RWA assets. You monitor two assets:
- mETH (Mantle Staked Ether).
- USDY (Ondo US Dollar Yield).

Your operating loop:
1. Inspect every supplied source and separate evidence from speculation.
2. Form risk and opportunity hypotheses.
3. Check portfolio constraints and cooldown memory.
4. Decide only when the evidence clears the confidence threshold.
5. Produce an auditable research trail with source names.

Your rules:
- Do not assume wallet balances or portfolio allocations unless they are explicitly provided
- Do not recommend a reallocation amount when wallet balances are unavailable
- If wallet balances are unavailable, action must be "Hold"
- Do not execute if confidence < 70%
- 2-hour cooldown between trades (check recent decisions)
- If USDY peg deviation > 0.5%, trigger emergency Hold
- All decisions must be explainable and verifiable

You must output ONLY a valid JSON object. No markdown, no comments, no prose before or after the object.
Use this exact shape:
{
  "trigger": "Market Scan",
  "action": "Hold",
  "from_asset": null,
  "to_asset": null,
  "amount": null,
  "reallocation_pct": 0,
  "risk_score": 75,
  "confidence": 80,
  "research_brief": "2-4 sentences summarizing the independent evidence review",
  "key_findings": ["3-5 concise evidence-backed findings"],
  "sources_used": ["source labels that directly influenced the decision"],
  "reasoning": "2-3 sentences explaining the portfolio decision with specific evidence from the research brief"
}`;

    const userPrompt = `Research dossier:
${researchContext}

Wallet data:
- Wallet balances are not supplied to this server route. Use only the research dossier and recent saved decisions.

Recent decisions (for cooldown context):
${recentContext}

Autonomously research the evidence, then decide what to do. Output only the JSON.`;

    const openRouterBody = {
      model: 'anthropic/claude-3.5-haiku',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 650,
      response_format: { type: 'json_object' },
    };
    const openRouterHeaders = {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': baseUrl,
      'X-Title': 'Risk Whisperer',
    };

    let decision: AgentDecision;
    let aiProviderStatus = 'ok';

    if (!process.env.OPENROUTER_API_KEY) {
      aiProviderStatus = 'missing_api_key';
      decision = appendReason(
        createFallbackDecision(researchDossier),
        'Skipped AI provider call: OPENROUTER_API_KEY is not configured.'
      );
    } else {
      try {
        let openRouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: openRouterHeaders,
          body: JSON.stringify(openRouterBody),
        });

        if (!openRouterRes.ok) {
          const errText = await openRouterRes.text();
          if (errText.toLowerCase().includes('response_format')) {
            const { response_format: _responseFormat, ...retryBody } = openRouterBody;
            openRouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: openRouterHeaders,
              body: JSON.stringify(retryBody),
            });
            if (!openRouterRes.ok) {
              const retryErrText = await openRouterRes.text();
              throw new Error(`OpenRouter error: ${retryErrText}`);
            }
          } else {
            throw new Error(`OpenRouter error: ${errText}`);
          }
        }

        const openRouterData = await openRouterRes.json();
        const rawContent = openRouterData.choices?.[0]?.message?.content ?? '';
        const parsedDecision = extractJsonObject(rawContent);
        decision = parsedDecision
          ? normalizeDecision(parsedDecision, researchDossier)
          : appendReason(
              createFallbackDecision(researchDossier),
              'Skipped AI provider decision: the model response was empty or not valid JSON.'
            );
      } catch (err) {
        console.warn('agent/run AI provider fallback:', err);
        aiProviderStatus = err instanceof Error ? err.message.slice(0, 240) : 'provider_error';
        decision = appendReason(
          createFallbackDecision(researchDossier),
          'Skipped AI provider decision: the model provider was unavailable, so the deterministic fallback reviewed the research dossier.'
        );
      }
    }

    if (decision.action !== 'Hold') {
      decision = forceHold(
        decision,
        'Skipped execution: connected wallet balances are not supplied to the agent route, so no allocation change can be verified.'
      );
    }

    const latestTrade = recentDecisions.find(
      (entry) => entry.action !== 'Hold' && entry.action !== 'Skipped'
    );
    const duplicatesLatestTrade =
      latestTrade &&
      latestTrade.action === decision.action &&
      latestTrade.from_asset === (decision.from_asset ?? '-') &&
      latestTrade.to_asset === (decision.to_asset ?? '-');

    if (latestTrade && isRecentTrade(latestTrade)) {
      decision = forceHold(
        decision,
        'Skipped duplicate execution: a non-hold recommendation was already made inside the 2-hour cooldown window.'
      );
    } else if (duplicatesLatestTrade) {
      decision = forceHold(
        decision,
        'Skipped duplicate execution: the latest non-hold recommendation already used the same action and asset direction.'
      );
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
            provider_status: aiProviderStatus,
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
      {
        error: err instanceof Error ? err.message : 'Agent run failed',
        publicError: 'Agent run failed. Please try again in a moment.',
      },
      { status: 500 }
    );
  }
}

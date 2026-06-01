import sql from '@/app/api/utils/sql';

function generateTxHash(): string {
  const hex = '0123456789abcdef';
  const full = Array.from({ length: 10 }, () => hex[Math.floor(Math.random() * 16)]).join('');
  return `0x${full.slice(0, 4)}...${full.slice(6)}`;
}

export async function POST(request: Request) {
  try {
    // 1. Fetch live market data
    const baseUrl = process.env.NEXT_PUBLIC_CREATE_APP_URL ?? new URL(request.url).origin;
    const marketRes = await fetch(`${baseUrl}/api/market-data`);
    if (!marketRes.ok) throw new Error('Failed to fetch market data');
    const market = await marketRes.json();

    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not set');
    }

    // 2. Get current portfolio state
    const portfolioRows = await sql`SELECT * FROM portfolio_state ORDER BY id DESC LIMIT 1`;
    const portfolio = portfolioRows[0] ?? {
      meth_allocation: 0,
      usdy_allocation: 0,
      total_value_usd: 0,
    };

    // 3. Get last 3 decisions for context
    const recentDecisions = await sql`
      SELECT action, reasoning, risk_after, created_at
      FROM decisions
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

    // 4. Build the AI prompt
    const systemPrompt = `You are Risk Whisperer — an autonomous AI risk manager for a DeFi portfolio focused on Mantle RWA assets. You manage two assets:
- mETH (Mantle Staked Ether): currently ${portfolio.meth_allocation}% of portfolio. Medium risk, reference yield ~4.8% APY.
- USDY (Ondo US Dollar Yield): currently ${portfolio.usdy_allocation}% of portfolio. Low risk, reference yield ~5.1% APY. Backed by US Treasuries.

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
  "reasoning": "2-3 sentences explaining the decision with specific data points from the market signals"
}`;

    const userPrompt = `Current market signals:
- ETH Price: $${market.ethPrice} (${market.ethChange > 0 ? '+' : ''}${market.ethChange}% 24h)
- mETH Price: $${market.methPrice}
- USDY Price: $${market.usdyPrice} (peg deviation: ${market.usdyPegDeviation}%)
- USDY 24h change: ${market.usdyChange}%
- ETH Funding Rate: ${market.fundingRate > 0 ? '+' : ''}${market.fundingRate}%
- Crypto Fear & Greed: ${market.sentimentScore} (${market.sentimentLabel}, raw: ${Math.round((market.sentimentScore + 1) * 50)}/100)
- Mantle TVL 24h change: ${market.mantleTvlChange > 0 ? '+' : ''}${market.mantleTvlChange}%

Current portfolio:
- mETH: ${portfolio.meth_allocation}% 
- USDY: ${portfolio.usdy_allocation}%
- Total value: $${portfolio.total_value_usd}

Recent decisions (for cooldown context):
${recentContext}

Analyse the market signals and decide what to do. Output only the JSON.`;

    // 5. Call OpenRouter
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
        temperature: 0.3,
        max_tokens: 512,
      }),
    });

    if (!openRouterRes.ok) {
      const errText = await openRouterRes.text();
      throw new Error(`OpenRouter error: ${errText}`);
    }

    const openRouterData = await openRouterRes.json();
    const rawContent = openRouterData.choices?.[0]?.message?.content ?? '';

    // 6. Parse AI response
    let decision: {
      trigger: string;
      action: string;
      from_asset: string | null;
      to_asset: string | null;
      amount: string | null;
      reallocation_pct: number;
      risk_score: number;
      confidence: number;
      reasoning: string;
    };

    try {
      // Extract JSON even if there's extra text
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in AI response');
      decision = JSON.parse(jsonMatch[0]);
    } catch {
      throw new Error(`Failed to parse AI response: ${rawContent}`);
    }

    // 7. Apply reallocation to portfolio state
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

    // 8. Save decision to DB
    const txHash = generateTxHash();
    const [saved] = await sql`
      INSERT INTO decisions (
        tx_hash, trigger_type, reasoning, action,
        from_asset, to_asset, amount,
        risk_before, risk_after, confidence, status, market_snapshot
      ) VALUES (
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
        ${JSON.stringify(market)}
      )
      RETURNING *
    `;

    // 9. Update the model portfolio if the recommendation clears the threshold
    if (decision.confidence >= 70 && decision.action !== 'Hold') {
      await sql`
        UPDATE portfolio_state
        SET meth_allocation = ${newMeth},
            usdy_allocation = ${newUsdy},
            updated_at = NOW()
        WHERE id = ${portfolio.id}
      `;
    }

    return Response.json({ success: true, decision: saved, market });
  } catch (err) {
    console.error('agent/run error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Agent run failed' },
      { status: 500 }
    );
  }
}

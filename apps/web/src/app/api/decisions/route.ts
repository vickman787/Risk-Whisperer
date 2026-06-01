import sql from '@/app/api/utils/sql';

export async function GET() {
  try {
    const decisions = await sql`
      SELECT * FROM decisions
      ORDER BY created_at DESC
      LIMIT 20
    `;

    const portfolio = await sql`
      SELECT * FROM portfolio_state
      ORDER BY id DESC
      LIMIT 1
    `;

    return Response.json({
      decisions,
      portfolio: portfolio[0] ?? {
        meth_allocation: 62,
        usdy_allocation: 38,
        total_value_usd: 77830,
      },
    });
  } catch (err) {
    console.error('decisions GET error:', err);
    return Response.json({ error: 'Failed to fetch decisions' }, { status: 500 });
  }
}

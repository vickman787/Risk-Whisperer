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
        meth_allocation: 0,
        usdy_allocation: 0,
        total_value_usd: 0,
      },
    });
  } catch (err) {
    console.error('decisions GET error:', err);
    return Response.json({ error: 'Failed to fetch decisions' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id'));

    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ error: 'A valid decision id is required' }, { status: 400 });
    }

    const deleted = await sql`
      DELETE FROM decisions
      WHERE id = ${id}
      RETURNING id
    `;

    if (deleted.length === 0) {
      return Response.json({ error: 'Decision not found' }, { status: 404 });
    }

    return Response.json({ success: true, id });
  } catch (err) {
    console.error('decisions DELETE error:', err);
    return Response.json({ error: 'Failed to delete decision' }, { status: 500 });
  }
}

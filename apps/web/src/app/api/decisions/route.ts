import sql from '@/app/api/utils/sql';
import { ensureOwnerColumns, getOrCreatePortfolio, getOwnerKey } from '@/app/api/utils/owner';

export async function GET(request: Request) {
  try {
    await ensureOwnerColumns();
    const ownerKey = await getOwnerKey(request);

    const decisions = await sql`
      SELECT * FROM decisions
      WHERE owner_key = ${ownerKey}
      ORDER BY created_at DESC
      LIMIT 20
    `;

    const portfolio = await getOrCreatePortfolio(ownerKey);

    return Response.json({
      decisions,
      portfolio,
    });
  } catch (err) {
    console.error('decisions GET error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch decisions' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureOwnerColumns();
    const ownerKey = await getOwnerKey(request);
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id'));

    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ error: 'A valid decision id is required' }, { status: 400 });
    }

    const deleted = await sql`
      DELETE FROM decisions
      WHERE id = ${id}
        AND owner_key = ${ownerKey}
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

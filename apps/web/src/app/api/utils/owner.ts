import { auth } from '@/lib/auth';
import sql from './sql';

const OWNER_HEADER = 'x-risk-owner-key';
const OWNER_KEY_PATTERN = /^(user|anon):[a-zA-Z0-9._:-]{8,160}$/;

export async function ensureOwnerColumns() {
  await sql`ALTER TABLE decisions ADD COLUMN IF NOT EXISTS owner_key TEXT NOT NULL DEFAULT 'legacy:global'`;
  await sql`ALTER TABLE portfolio_state ADD COLUMN IF NOT EXISTS owner_key TEXT NOT NULL DEFAULT 'legacy:global'`;
  await sql`CREATE INDEX IF NOT EXISTS decisions_owner_created_idx ON decisions (owner_key, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS portfolio_state_owner_updated_idx ON portfolio_state (owner_key, updated_at DESC)`;
}

export async function getOwnerKey(request: Request): Promise<string> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (session?.user?.id) return `user:${session.user.id}`;
  } catch (err) {
    console.warn('Session lookup skipped for anonymous owner fallback:', err);
  }

  const anonymousOwner = request.headers.get(OWNER_HEADER);
  if (anonymousOwner && OWNER_KEY_PATTERN.test(anonymousOwner)) {
    return anonymousOwner;
  }

  throw new Error('Missing visitor identity');
}

export async function getOrCreatePortfolio(ownerKey: string) {
  const portfolioRows = await sql`
    SELECT *
    FROM portfolio_state
    WHERE owner_key = ${ownerKey}
    ORDER BY id DESC
    LIMIT 1
  `;

  if (portfolioRows[0]) return portfolioRows[0];

  const [portfolio] = await sql`
    INSERT INTO portfolio_state (owner_key, meth_allocation, usdy_allocation, total_value_usd)
    VALUES (${ownerKey}, 0, 0, 0)
    RETURNING *
  `;

  return portfolio;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Minimal, dependency-free HS256 JWT signer for Payvexo custom auth.
 *
 * Payvexo authenticates members with a member ID + bcrypt password (not
 * Supabase Auth). To make Postgres Row Level Security work, the login
 * endpoint mints a Supabase-compatible JWT signed with the project's
 * SUPABASE_JWT_SECRET. PostgREST validates the signature + expiry and
 * exposes `sub` as `auth.uid()` and `role` as `auth.role()`, so the
 * strict RLS policies (migration 022) can enforce isolation server-side.
 *
 * The secret never reaches the browser — only this server code signs.
 */

import crypto from 'crypto';

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export interface MemberTokenClaims {
  /** organization_members.id (UUID) — becomes auth.uid() */
  memberId: string;
  organizationId: string;
  groupId: string | null;
  /** human-readable member ID (matric/staff), for convenience claims */
  memberHumanId?: string | null;
  /** token lifetime in seconds (default 7 days) */
  ttlSeconds?: number;
}

/**
 * Sign a Supabase-compatible JWT for a member session.
 * Returns a compact JWS string (header.payload.signature).
 */
export function signMemberToken(claims: MemberTokenClaims, secret: string): { token: string; expiresAt: number } {
  if (!secret) throw new Error('SUPABASE_JWT_SECRET is not configured');
  if (!claims.memberId) throw new Error('memberId is required to sign a token');

  const now = Math.floor(Date.now() / 1000);
  const ttl = claims.ttlSeconds ?? 60 * 60 * 24 * 7; // 7 days
  const exp = now + ttl;

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    aud: 'authenticated',
    role: 'authenticated',
    sub: claims.memberId,
    iat: now,
    exp,
    // Custom claims (available via auth.jwt() / request.jwt.claims in SQL)
    org_id: claims.organizationId,
    group_id: claims.groupId,
    member_human_id: claims.memberHumanId ?? null,
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = base64url(
    crypto.createHmac('sha256', secret).update(signingInput).digest(),
  );

  return { token: `${signingInput}.${signature}`, expiresAt: exp };
}

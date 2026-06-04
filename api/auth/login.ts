/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/auth/login
 *
 * Server-side credential verification + JWT minting for Payvexo custom auth.
 *
 * Flow:
 *   1. Resolve the organization by slug.
 *   2. Resolve the member by their human member ID within that org.
 *   3. Verify the password with the verify_member_password RPC (bcrypt).
 *   4. Mint a Supabase-compatible JWT (sub = member.id) so RLS can enforce
 *      isolation server-side. The browser stores this and sends it on every
 *      Supabase request via the accessToken callback.
 *
 * The service-role key and JWT secret never leave the server.
 */

import { createClient } from '@supabase/supabase-js';

function aggregatePermissions(admins: any[]) {
  const some = (k: string) => admins.some((a) => a?.[k]);
  return {
    can_create_payments: some('can_create_payments'),
    can_approve_payments: some('can_approve_payments'),
    can_manage_members: some('can_manage_members'),
    can_manage_admins: some('can_manage_admins'),
    can_manage_expenses: some('can_manage_expenses'),
    can_view_analytics: some('can_view_analytics'),
    can_export_data: some('can_export_data'),
    can_manage_settings: some('can_manage_settings'),
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;

  if (!supabaseUrl || !serviceRole) {
    return res.status(500).json({ ok: false, error: 'Server config error: Supabase env missing' });
  }
  if (!jwtSecret) {
    return res.status(500).json({ ok: false, error: 'Server config error: SUPABASE_JWT_SECRET missing' });
  }

  const body = req.body || {};
  const mode = String(body.mode ?? 'login');
  const supabase = createClient(supabaseUrl, serviceRole);

  // ── Org switch: re-mint a JWT for another org the SAME account owns. The
  //    current valid token proves identity, so no password is needed. ──
  if (mode === 'switch') {
    try {
      const currentToken = String(body.token ?? '');
      const targetMemberId = String(body.targetMemberId ?? '').trim();
      if (!currentToken || !targetMemberId) {
        return res.status(400).json({ ok: false, error: 'Missing switch parameters' });
      }
      const { verifyMemberToken, signMemberToken } = await import('../_lib/jwt.js');
      const claims = verifyMemberToken(currentToken, jwtSecret);
      if (!claims?.sub) return res.status(401).json({ ok: false, error: 'Session expired. Please sign in again.' });

      const { data: cur } = await supabase
        .from('organization_members').select('id, account_id').eq('id', claims.sub).single();
      const { data: target } = await supabase
        .from('organization_members').select('*').eq('id', targetMemberId).single();

      if (!cur || !target) return res.status(404).json({ ok: false, error: 'Membership not found' });
      if (!cur.account_id || cur.account_id !== target.account_id) {
        return res.status(403).json({ ok: false, error: 'That organization is not linked to your account.' });
      }
      if (!target.is_active) return res.status(403).json({ ok: false, error: 'That membership is inactive.' });
      if (target.is_suspended) return res.status(403).json({ ok: false, error: 'That membership is suspended.' });

      const [{ data: org }, { data: grp }, { data: adminRecords }] = await Promise.all([
        supabase.from('organizations').select('*').eq('id', target.organization_id).single(),
        supabase.from('organization_groups').select('*').eq('id', target.group_id).single(),
        supabase.from('member_admins').select('*').eq('member_id', target.id).eq('is_active', true),
      ]);
      const admins = adminRecords || [];

      const { token, expiresAt } = signMemberToken({
        memberId: target.id,
        organizationId: target.organization_id,
        groupId: target.group_id ?? null,
        memberHumanId: target.member_id,
      }, jwtSecret);

      const safeTarget = { ...target };
      delete (safeTarget as any).password_hash;

      return res.status(200).json({
        ok: true, token, expiresAt,
        member: { ...safeTarget, admin_records: admins, admin_permissions: aggregatePermissions(admins) },
        organization: org,
        group: grp || { id: target.group_id },
        adminRecords: admins,
      });
    } catch (err) {
      console.error('[auth/login switch] error:', (err as Error)?.stack);
      return res.status(500).json({ ok: false, error: 'Could not switch organization.' });
    }
  }

  const memberHumanId = String(body.memberId ?? '').trim();
  const password = String(body.password ?? '');
  const orgSlug = String(body.orgSlug ?? '').trim().toLowerCase();
  const selectedGroupId = String(body.groupId ?? '').trim();

  if (!memberHumanId) return res.status(400).json({ ok: false, error: 'Please enter your ID' });
  if (!password) return res.status(400).json({ ok: false, error: 'Please enter your password' });
  if (!orgSlug) return res.status(400).json({ ok: false, error: 'Organization is required' });

  try {
    // Step 1: Organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('slug', orgSlug)
      .eq('is_active', true)
      .single();

    if (orgError || !org) {
      return res.status(404).json({ ok: false, error: 'Organization not found or inactive' });
    }

    // Step 2: Member (match on human-readable member_id, case-insensitive to be safe)
    const { data: member, error: memberError } = await supabase
      .from('organization_members')
      .select('*')
      .eq('organization_id', org.id)
      .eq('member_id', memberHumanId)
      .single();

    if (memberError || !member) {
      return res.status(401).json({ ok: false, error: 'Invalid credentials. Please check your ID and try again.' });
    }

    // Step 3: Status
    if (!member.is_active) {
      return res.status(403).json({ ok: false, error: 'Your account has been deactivated. Contact your administrator.' });
    }
    if (member.is_suspended) {
      return res.status(403).json({
        ok: false,
        error: `Your account is suspended${member.suspension_reason ? ': ' + member.suspension_reason : '. Contact your administrator.'}`,
      });
    }

    // Step 4: Password
    const { data: passwordValid, error: pwError } = await supabase.rpc('verify_member_password', {
      p_member_id: member.id,
      p_password: password,
    });

    if (pwError || !passwordValid) {
      return res.status(401).json({ ok: false, error: 'Invalid credentials. Please check your ID and password.' });
    }

    // Note (identity rework, Chunk A): we used to reject the login when
    // selectedGroupId didn't match member.group_id. That made sense when
    // a member was tied to exactly one group with no exec layering — but
    // now a dept/faculty exec legitimately lands on a group-scoped login
    // URL whose group differs from their primary class. The server now
    // authenticates the *person*; the URL's group is treated as UI hint
    // only. Cross-org guard (group must belong to org) stays.
    if (selectedGroupId) {
      const { data: selectedGroup } = await supabase
        .from('organization_groups')
        .select('id, organization_id')
        .eq('id', selectedGroupId)
        .eq('organization_id', org.id)
        .single();
      if (!selectedGroup) {
        return res.status(404).json({
          ok: false,
          error: `The selected ${org.group_label || 'department'} could not be found for this organization.`,
        });
      }
    }

    // Step 5: Group + admin records
    const [{ data: grp }, { data: adminRecords }] = await Promise.all([
      supabase.from('organization_groups').select('*').eq('id', member.group_id).single(),
      supabase.from('member_admins').select('*').eq('member_id', member.id).eq('is_active', true),
    ]);

    const admins = adminRecords || [];

    // Step 6: Login bookkeeping (non-blocking)
    void supabase
      .from('organization_members')
      .update({
        last_login_at: new Date().toISOString(),
        login_count: (member.login_count || 0) + 1,
      })
      .eq('id', member.id);

    // Step 7: Mint the session token (sub = member.id → auth.uid())
    // Imported dynamically so a load failure surfaces as a JSON error here
    // (caught below) instead of an opaque module-load crash.
    const { signMemberToken } = await import('../_lib/jwt.js');
    const { token, expiresAt } = signMemberToken(
      {
        memberId: member.id,
        organizationId: member.organization_id,
        groupId: member.group_id ?? null,
        memberHumanId: member.member_id,
      },
      jwtSecret,
    );

    // Never return the password hash
    const safeMember = { ...member };
    delete (safeMember as any).password_hash;

    return res.status(200).json({
      ok: true,
      token,
      expiresAt,
      member: { ...safeMember, admin_records: admins, admin_permissions: aggregatePermissions(admins) },
      organization: org,
      group: grp || { id: member.group_id },
      adminRecords: admins,
      mustChangePassword: !!member.force_password_change,
    });
  } catch (err) {
    const e = err as Error;
    console.error('[auth/login] error:', e?.stack || e);
    return res.status(500).json({ ok: false, error: 'Login failed. Please try again.' });
  }
}

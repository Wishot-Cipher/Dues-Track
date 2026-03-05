/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shared authentication & security utilities for API endpoints.
 *
 * Since Payvexo uses **custom auth** (not Supabase Auth), these helpers
 * verify callers by looking up the member/admin record with the
 * service-role Supabase client.  The `memberId` (UUID) is sent from
 * the frontend — because UUIDs are random (v4) and never exposed in
 * URLs, they act as an unguessable session credential.
 *
 * Every public-facing API must call one of these before touching data.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ────────────────────────────────────────────────────

export interface VerifiedMember {
  id: string
  organization_id: string
  group_id: string
  full_name: string
  email: string | null
  member_id: string        // human-readable ID (e.g. REG/2021/001)
  is_active: boolean
}

export interface VerifiedAdmin extends VerifiedMember {
  adminRecordId: string
  role: string
  permissions: {
    can_create_payments: boolean
    can_approve_payments: boolean
    can_manage_members: boolean
    can_manage_admins: boolean
    can_manage_expenses: boolean
    can_view_analytics: boolean
    can_export_data: boolean
    can_manage_settings: boolean
  }
}

export interface AuthResult<T = VerifiedMember> {
  valid: boolean
  data?: T
  error?: string
  status?: number   // HTTP status code to return
}

// ── Member verification ──────────────────────────────────────

/**
 * Verify that `memberId` refers to a real, active member.
 * Returns their organization_id so subsequent queries can be scoped.
 */
export async function verifyMember(
  supabase: SupabaseClient,
  memberId: string | undefined | null,
): Promise<AuthResult<VerifiedMember>> {
  if (!memberId || typeof memberId !== 'string') {
    return { valid: false, error: 'Authentication required', status: 401 }
  }

  // Basic UUID format check
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memberId)) {
    return { valid: false, error: 'Invalid credentials', status: 401 }
  }

  const { data: member, error } = await supabase
    .from('organization_members')
    .select('id, organization_id, group_id, full_name, email, member_id, is_active, is_suspended')
    .eq('id', memberId)
    .single()

  if (error || !member) {
    return { valid: false, error: 'Invalid credentials', status: 401 }
  }

  if (!member.is_active) {
    return { valid: false, error: 'Account deactivated', status: 403 }
  }

  if (member.is_suspended) {
    return { valid: false, error: 'Account suspended', status: 403 }
  }

  return {
    valid: true,
    data: {
      id: member.id,
      organization_id: member.organization_id,
      group_id: member.group_id,
      full_name: member.full_name,
      email: member.email,
      member_id: member.member_id,
      is_active: member.is_active,
    },
  }
}

// ── Admin verification ───────────────────────────────────────

/**
 * Verify that `memberId` is an active **admin** in their organization,
 * optionally requiring a specific permission.
 */
export async function verifyAdmin(
  supabase: SupabaseClient,
  memberId: string | undefined | null,
  requiredPermission?: string,
): Promise<AuthResult<VerifiedAdmin>> {
  // First verify they're a valid member
  const memberResult = await verifyMember(supabase, memberId)
  if (!memberResult.valid || !memberResult.data) {
    return memberResult as AuthResult<VerifiedAdmin>
  }

  const member = memberResult.data

  // Fetch their admin record(s) for this org
  const { data: adminRecords, error: adminError } = await supabase
    .from('member_admins')
    .select('*')
    .eq('member_id', member.id)
    .eq('organization_id', member.organization_id)
    .eq('is_active', true)

  if (adminError || !adminRecords || adminRecords.length === 0) {
    return { valid: false, error: 'Admin access required', status: 403 }
  }

  // Aggregate permissions across all admin roles
  const permissions = {
    can_create_payments: adminRecords.some((a: any) => a.can_create_payments),
    can_approve_payments: adminRecords.some((a: any) => a.can_approve_payments),
    can_manage_members: adminRecords.some((a: any) => a.can_manage_members),
    can_manage_admins: adminRecords.some((a: any) => a.can_manage_admins),
    can_manage_expenses: adminRecords.some((a: any) => a.can_manage_expenses),
    can_view_analytics: adminRecords.some((a: any) => a.can_view_analytics),
    can_export_data: adminRecords.some((a: any) => a.can_export_data),
    can_manage_settings: adminRecords.some((a: any) => a.can_manage_settings),
  }

  // If a specific permission is required, check it
  if (requiredPermission && requiredPermission in permissions) {
    if (!(permissions as any)[requiredPermission]) {
      return { valid: false, error: `Missing permission: ${requiredPermission}`, status: 403 }
    }
  }

  return {
    valid: true,
    data: {
      ...member,
      adminRecordId: adminRecords[0].id,
      role: adminRecords[0].role,
      permissions,
    },
  }
}

// ── Same-org check ───────────────────────────────────────────

/**
 * Verify that a target entity belongs to the same organization as the caller.
 */
export async function verifySameOrg(
  supabase: SupabaseClient,
  table: string,
  entityId: string,
  callerOrgId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from(table)
    .select('organization_id')
    .eq('id', entityId)
    .single()

  if (error || !data) return false
  return data.organization_id === callerOrgId
}

// ── HTML escaping ────────────────────────────────────────────

/**
 * Escape HTML special characters to prevent injection in email templates.
 */
export function escapeHtml(str: string | null | undefined): string {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ── CORS helper ──────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  process.env.VITE_APP_URL,
  process.env.NEXT_PUBLIC_APP_URL,
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean) as string[]

/**
 * Set restrictive CORS headers. Returns true if origin is allowed.
 */
export function setCorsHeaders(req: any, res: any): boolean {
  const origin = req.headers?.origin || ''
  const allowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o)) ? origin : ''
  if (allowed) res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Vary', 'Origin')
  return !!allowed
}

// ── Internal API secret ──────────────────────────────────────

const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET

/**
 * Verify an internal server-to-server call using a shared secret.
 * Used for endpoints that should NOT be publicly callable.
 */
export function verifyInternalSecret(req: any): boolean {
  if (!INTERNAL_API_SECRET) return true  // If not configured, allow (dev mode)
  const provided = req.headers?.['x-api-secret'] || req.headers?.['X-Api-Secret']
  return provided === INTERNAL_API_SECRET
}

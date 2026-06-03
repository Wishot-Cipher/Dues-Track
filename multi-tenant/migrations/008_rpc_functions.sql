-- ============================================================
-- RPC Functions for Organization Group Management
-- 
-- These functions provide an alternative to direct table
-- updates and help avoid CORS issues with PATCH requests
-- ============================================================

-- Ensure any prior variants of the function are dropped (matches older signatures)
DROP FUNCTION IF EXISTS update_organization_group(uuid, uuid, text, text, text, text[], uuid, uuid);
DROP FUNCTION IF EXISTS update_organization_group(UUID, UUID, TEXT, TEXT, TEXT[], UUID, UUID);
DROP FUNCTION IF EXISTS update_organization_group(UUID, TEXT, TEXT, TEXT, TEXT[], UUID, UUID);
CREATE OR REPLACE FUNCTION update_organization_group(
  p_caller_id UUID,
  p_group_id UUID,
  p_short_name TEXT DEFAULT NULL,
  p_kind TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_levels TEXT[] DEFAULT NULL,
  p_parent_group_id UUID DEFAULT NULL
)
RETURNS organization_groups AS $$
DECLARE
  v_group organization_groups;
  v_is_admin BOOLEAN;
BEGIN
  -- Get the group and verify ownership
  SELECT og.* INTO v_group FROM organization_groups og WHERE og.id = p_group_id;
  
  IF v_group IS NULL THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  -- Verify the caller is an admin in this organization
  SELECT EXISTS (
    SELECT 1 FROM member_admins ma
    JOIN organization_members om ON om.id = ma.member_id
    WHERE om.organization_id::text = v_group.organization_id::text
    AND ma.member_id::text = p_caller_id::text
    AND ma.is_active = true
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Unauthorized: must be an organization admin';
  END IF;

  -- Update the group with provided fields
  UPDATE organization_groups
  SET
    short_name = COALESCE(p_short_name, short_name),
    kind = COALESCE(p_kind, kind),
    description = COALESCE(p_description, description),
    levels = COALESCE(p_levels, levels),
    parent_group_id = COALESCE(p_parent_group_id, parent_group_id),
    updated_at = NOW()
  WHERE id = p_group_id
  RETURNING * INTO v_group;

  RETURN v_group;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Toggle organization active state
DROP FUNCTION IF EXISTS set_organization_status(UUID, BOOLEAN);
CREATE OR REPLACE FUNCTION set_organization_status(
  p_org_id UUID,
  p_is_active BOOLEAN
)
RETURNS organizations AS $$
DECLARE
  v_org organizations;
BEGIN
  UPDATE organizations
  SET is_active = p_is_active,
      updated_at = NOW()
  WHERE id = p_org_id
  RETURNING * INTO v_org;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  RETURN v_org;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update organization billing/subscription fields
DROP FUNCTION IF EXISTS update_organization_subscription(UUID, TEXT, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ);
CREATE OR REPLACE FUNCTION update_organization_subscription(
  p_org_id UUID,
  p_plan TEXT,
  p_max_groups INTEGER DEFAULT NULL,
  p_max_members INTEGER DEFAULT NULL,
  p_max_admins INTEGER DEFAULT NULL,
  p_subscription_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_is_on_trial BOOLEAN DEFAULT NULL,
  p_trial_ends_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS organizations AS $$
DECLARE
  v_org organizations;
BEGIN
  UPDATE organizations
  SET subscription_plan = p_plan,
      max_groups = COALESCE(p_max_groups, max_groups),
      max_members = COALESCE(p_max_members, max_members),
      max_admins = COALESCE(p_max_admins, max_admins),
      subscription_expires_at = COALESCE(p_subscription_expires_at, subscription_expires_at),
      is_on_trial = COALESCE(p_is_on_trial, is_on_trial),
      trial_ends_at = COALESCE(p_trial_ends_at, trial_ends_at),
      updated_at = NOW()
  WHERE id = p_org_id
  RETURNING * INTO v_org;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  RETURN v_org;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Extend organization trial period
DROP FUNCTION IF EXISTS extend_organization_trial(UUID, INTEGER);
CREATE OR REPLACE FUNCTION extend_organization_trial(
  p_org_id UUID,
  p_days INTEGER
)
RETURNS organizations AS $$
DECLARE
  v_org organizations;
  v_trial_end TIMESTAMPTZ;
BEGIN
  v_trial_end := NOW() + (p_days || ' days')::INTERVAL;

  UPDATE organizations
  SET is_on_trial = true,
      trial_ends_at = v_trial_end,
      updated_at = NOW()
  WHERE id = p_org_id
  RETURNING * INTO v_org;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  RETURN v_org;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set or replace a member's admin role without using REST PATCH
DROP FUNCTION IF EXISTS set_member_admin_role(UUID, UUID, TEXT, JSONB, BOOLEAN);
CREATE OR REPLACE FUNCTION set_member_admin_role(
  p_member_id UUID,
  p_organization_id UUID,
  p_role TEXT,
  p_permissions JSONB DEFAULT '{}'::JSONB,
  p_is_active BOOLEAN DEFAULT true
)
RETURNS member_admins AS $$
DECLARE
  v_admin member_admins;
  v_group_id UUID;
  v_role TEXT;
BEGIN
  -- Normalize legacy/frontend role aliases to DB canonical roles
  v_role := p_role;
  IF lower(v_role) = 'class_rep' THEN
    v_role := 'group_admin';
  ELSIF lower(v_role) = 'admin' THEN
    v_role := 'org_admin';
  END IF;
  SELECT group_id INTO v_group_id
  FROM organization_members
  WHERE id::text = p_member_id::text
    AND organization_id::text = p_organization_id::text;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found in organization';
  END IF;

  -- Avoid unique conflicts when the same member already has the target role
  DELETE FROM member_admins
  WHERE member_id::text = p_member_id::text
    AND organization_id::text = p_organization_id::text
    AND role = v_role
    AND (v_group_id IS NULL OR group_id::text = v_group_id::text);

  SELECT * INTO v_admin
  FROM member_admins
  WHERE member_id::text = p_member_id::text
    AND organization_id::text = p_organization_id::text
  ORDER BY updated_at DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE member_admins
    SET
      group_id = v_group_id,
      role = v_role,
      can_create_payments = COALESCE((p_permissions->>'can_create_payments')::boolean, false),
      can_approve_payments = COALESCE((p_permissions->>'can_approve_payments')::boolean, false),
      can_manage_members = COALESCE((p_permissions->>'can_manage_members')::boolean, (p_permissions->>'can_manage_students')::boolean, false),
      can_manage_admins = COALESCE((p_permissions->>'can_manage_admins')::boolean, false),
      can_manage_expenses = COALESCE((p_permissions->>'can_manage_expenses')::boolean, false),
      can_view_analytics = COALESCE((p_permissions->>'can_view_analytics')::boolean, false),
      can_export_data = COALESCE((p_permissions->>'can_export_data')::boolean, false),
      can_manage_settings = COALESCE((p_permissions->>'can_manage_settings')::boolean, false),
      is_active = p_is_active,
      updated_at = NOW()
    WHERE id = v_admin.id
    RETURNING * INTO v_admin;
  ELSE
    INSERT INTO member_admins (
      member_id,
      organization_id,
      group_id,
      role,
      can_create_payments,
      can_approve_payments,
      can_manage_members,
      can_manage_admins,
      can_manage_expenses,
      can_view_analytics,
      can_export_data,
      can_manage_settings,
      is_active,
      updated_at
    )
    VALUES (
    p_member_id,
    p_organization_id,
    v_group_id,
    v_role,
      COALESCE((p_permissions->>'can_create_payments')::boolean, false),
      COALESCE((p_permissions->>'can_approve_payments')::boolean, false),
      COALESCE((p_permissions->>'can_manage_members')::boolean, (p_permissions->>'can_manage_students')::boolean, false),
      COALESCE((p_permissions->>'can_manage_admins')::boolean, false),
      COALESCE((p_permissions->>'can_manage_expenses')::boolean, false),
      COALESCE((p_permissions->>'can_view_analytics')::boolean, false),
      COALESCE((p_permissions->>'can_export_data')::boolean, false),
      COALESCE((p_permissions->>'can_manage_settings')::boolean, false),
      p_is_active,
      NOW()
    )
    RETURNING * INTO v_admin;
  END IF;

  RETURN v_admin;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Console-safe member list for the platform dashboard
DROP FUNCTION IF EXISTS get_console_organization_members(UUID);
CREATE OR REPLACE FUNCTION get_console_organization_members(
  p_org_id UUID
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  group_id UUID,
  full_name TEXT,
  member_id TEXT,
  email TEXT,
  phone TEXT,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  member_admins JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    om.id,
    om.organization_id,
    om.group_id,
    om.full_name,
    om.member_id,
    om.email,
    om.phone,
    om.is_active,
    om.created_at,
    om.updated_at,
    COALESCE(
      jsonb_agg(to_jsonb(ma)) FILTER (WHERE ma.id IS NOT NULL),
      '[]'::jsonb
    ) AS member_admins
  FROM organization_members om
  LEFT JOIN member_admins ma
    ON ma.member_id = om.id
   AND ma.organization_id = om.organization_id
  WHERE om.organization_id::text = p_org_id::text
    AND om.is_active = true
  GROUP BY
    om.id,
    om.organization_id,
    om.group_id,
    om.full_name,
    om.member_id,
    om.email,
    om.phone,
    om.is_active,
    om.created_at,
    om.updated_at
  ORDER BY om.full_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_console_organization_members(UUID) TO anon, authenticated;

-- Remove a member's admin role without using REST DELETE in the browser
DROP FUNCTION IF EXISTS remove_member_admin_role_with_fallback(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS remove_member_admin_role(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS remove_member_admin_role(UUID, UUID);
CREATE OR REPLACE FUNCTION remove_member_admin_role_with_fallback(
  p_member_id UUID,
  p_organization_id UUID,
  p_fallback_admin_id UUID DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_fallback UUID;
BEGIN
  -- Determine fallback admin: prefer caller-provided, else pick any other active admin
  v_fallback := p_fallback_admin_id;
  IF v_fallback IS NULL THEN
    SELECT id INTO v_fallback FROM member_admins
    WHERE organization_id::text = p_organization_id::text
      AND member_id::text <> p_member_id::text
      AND is_active = true
    LIMIT 1;
  END IF;

  IF v_fallback IS NULL THEN
    RAISE EXCEPTION 'Cannot remove admin: no other active admin to reassign invites to. Provide p_fallback_admin_id.';
  END IF;

  -- Reassign any invites created by the target's admin rows to the fallback admin
  UPDATE organization_invites
  SET created_by = v_fallback
  WHERE created_by IN (
    SELECT id FROM member_admins
    WHERE member_id::text = p_member_id::text
      AND organization_id::text = p_organization_id::text
  );

  -- Now remove the admin rows for the member
  DELETE FROM member_admins
  WHERE member_id::text = p_member_id::text
    AND organization_id::text = p_organization_id::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Compatibility wrapper: allow calls with two args (no fallback provided)
CREATE OR REPLACE FUNCTION remove_member_admin_role(
  p_member_id UUID,
  p_organization_id UUID
)
RETURNS void AS $$
BEGIN
  PERFORM remove_member_admin_role_with_fallback(p_member_id, p_organization_id, NULL::UUID);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION set_member_admin_role(UUID, UUID, TEXT, JSONB, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION remove_member_admin_role(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION remove_member_admin_role_with_fallback(UUID, UUID, UUID) TO anon, authenticated;

-- Verify a super admin account for emergency platform access
DROP FUNCTION IF EXISTS verify_super_admin(TEXT, TEXT);
CREATE OR REPLACE FUNCTION verify_super_admin(
  p_email TEXT,
  p_password TEXT
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  can_manage_organizations BOOLEAN,
  can_manage_subscriptions BOOLEAN,
  can_view_all_data BOOLEAN,
  can_manage_platform_admins BOOLEAN,
  is_active BOOLEAN,
  last_login_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sa.id,
    sa.email,
    sa.full_name,
    true AS can_manage_organizations,
    true AS can_manage_subscriptions,
    true AS can_view_all_data,
    true AS can_manage_platform_admins,
    sa.is_active,
    sa.last_login_at
  FROM super_admins sa
  WHERE LOWER(sa.email) = LOWER(p_email)
    AND sa.is_active = true
    AND sa.password_hash = crypt(p_password, sa.password_hash)
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create academic session with authorization check
DROP FUNCTION IF EXISTS create_academic_session(UUID, TEXT, TEXT, DATE, DATE, BOOLEAN);
CREATE OR REPLACE FUNCTION create_academic_session(
  p_caller_id UUID,
  p_org_id UUID,
  p_session_name TEXT,
  p_session_year TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_is_active BOOLEAN DEFAULT false
)
RETURNS academic_sessions AS $$
DECLARE
  v_session academic_sessions;
  v_is_admin BOOLEAN;
BEGIN
  -- Verify current user is admin in this organization
  SELECT EXISTS (
    SELECT 1 FROM member_admins ma
    JOIN organization_members om ON om.id = ma.member_id
    WHERE om.organization_id::text = p_org_id::text
    AND ma.member_id::text = p_caller_id::text
    AND ma.is_active = true
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Unauthorized: must be an organization admin';
  END IF;

  INSERT INTO academic_sessions (
    organization_id,
    session_name,
    session_year,
    start_date,
    end_date,
    is_active
  )
  VALUES (p_org_id, p_session_name, p_session_year, p_start_date, p_end_date, p_is_active)
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update academic session with authorization check
DROP FUNCTION IF EXISTS update_academic_session(UUID, UUID, TEXT, TEXT, DATE, DATE, BOOLEAN, BOOLEAN);
CREATE OR REPLACE FUNCTION update_academic_session(
  p_caller_id UUID,
  p_session_id UUID,
  p_session_name TEXT DEFAULT NULL,
  p_session_year TEXT DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL,
  p_is_locked BOOLEAN DEFAULT NULL
)
RETURNS academic_sessions AS $$
DECLARE
  v_session academic_sessions;
  v_is_admin BOOLEAN;
BEGIN
  SELECT * INTO v_session
  FROM academic_sessions
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Academic session not found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM member_admins ma
    JOIN organization_members om ON om.id = ma.member_id
    WHERE om.organization_id::text = v_session.organization_id::text
      AND ma.member_id::text = p_caller_id::text
      AND ma.is_active = true
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Unauthorized: must be an organization admin';
  END IF;

  UPDATE academic_sessions
  SET
    session_name = COALESCE(p_session_name, session_name),
    session_year = COALESCE(p_session_year, session_year),
    start_date = COALESCE(p_start_date, start_date),
    end_date = COALESCE(p_end_date, end_date),
    is_active = COALESCE(p_is_active, is_active),
    is_locked = COALESCE(p_is_locked, is_locked),
    updated_at = NOW()
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set active academic session and sync org settings
DROP FUNCTION IF EXISTS set_active_academic_session(UUID, UUID, UUID);
CREATE OR REPLACE FUNCTION set_active_academic_session(
  p_caller_id UUID,
  p_org_id UUID,
  p_session_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_active_session academic_sessions;
  v_is_admin BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM member_admins ma
    JOIN organization_members om ON om.id = ma.member_id
    WHERE om.organization_id::text = p_org_id::text
      AND ma.member_id::text = p_caller_id::text
      AND ma.is_active = true
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Unauthorized: must be an organization admin';
  END IF;

  UPDATE academic_sessions
  SET is_active = (id = p_session_id),
      updated_at = NOW()
  WHERE organization_id::text = p_org_id::text;

  SELECT * INTO v_active_session
  FROM academic_sessions
  WHERE id = p_session_id
    AND organization_id::text = p_org_id::text;

  IF v_active_session IS NULL THEN
    RAISE EXCEPTION 'Academic session not found';
  END IF;

  UPDATE organization_settings
  SET
    current_period_label = v_active_session.label,
    period_type = 'academic_session',
    updated_at = NOW()
  WHERE organization_id::text = p_org_id::text;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update organization settings with authorization
DROP FUNCTION IF EXISTS update_org_settings(UUID, BOOLEAN, BOOLEAN, INTEGER);
CREATE OR REPLACE FUNCTION update_org_settings(
  p_org_id UUID,
  p_auto_promotion_enabled BOOLEAN DEFAULT NULL,
  p_promotion_requires_approval BOOLEAN DEFAULT NULL,
  p_promotion_grace_days INTEGER DEFAULT NULL
)
RETURNS organization_settings AS $$
DECLARE
  v_settings organization_settings;
  v_custom_settings JSONB;
BEGIN
  -- Verify current user is admin in this organization
  IF NOT EXISTS (
    SELECT 1 FROM member_admins ma
    JOIN organization_members om ON om.id = ma.member_id
    WHERE om.organization_id = p_org_id
    AND ma.member_id = auth.uid()::uuid
    AND ma.is_active = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized: must be an organization admin';
  END IF;

  -- Get existing settings
  SELECT custom_settings INTO v_custom_settings FROM organization_settings WHERE organization_id::text = p_org_id::text;
  v_custom_settings := COALESCE(v_custom_settings, '{}'::JSONB);

  -- Update promotion settings in custom_settings
  IF p_auto_promotion_enabled IS NOT NULL THEN
    v_custom_settings := jsonb_set(v_custom_settings, '{promotion,auto_promotion_enabled}', to_jsonb(p_auto_promotion_enabled));
  END IF;
  
  IF p_promotion_requires_approval IS NOT NULL THEN
    v_custom_settings := jsonb_set(v_custom_settings, '{promotion,requires_approval}', to_jsonb(p_promotion_requires_approval));
  END IF;
  
  IF p_promotion_grace_days IS NOT NULL THEN
    v_custom_settings := jsonb_set(v_custom_settings, '{promotion,grace_days}', to_jsonb(p_promotion_grace_days));
  END IF;

  UPDATE organization_settings
  SET custom_settings = v_custom_settings, updated_at = NOW()
  WHERE organization_id::text = p_org_id::text
  RETURNING * INTO v_settings;

  RETURN v_settings;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update member profile securely via RPC (prevents direct REST PATCH issues)
DROP FUNCTION IF EXISTS update_member_profile(UUID, JSONB);
CREATE OR REPLACE FUNCTION update_member_profile(
  p_member_id UUID,
  p_profile JSONB
)
RETURNS organization_members AS $$
DECLARE
  v_member organization_members;
BEGIN
  -- Ensure the caller is the member.
  IF p_member_id::text <> auth.uid()::text THEN
    RAISE EXCEPTION 'Unauthorized: can only update own profile';
  END IF;

  UPDATE organization_members
  SET
    full_name = COALESCE(NULLIF(p_profile->>'full_name',''), full_name),
    email = CASE WHEN (p_profile ? 'email') THEN NULLIF(p_profile->>'email','')::text ELSE email END,
    phone = CASE WHEN (p_profile ? 'phone') THEN NULLIF(p_profile->>'phone','')::text ELSE phone END,
    section = CASE WHEN (p_profile ? 'section') THEN NULLIF(p_profile->>'section','')::text ELSE section END,
    level = CASE WHEN (p_profile ? 'level') THEN NULLIF(p_profile->>'level','')::text ELSE level END,
    avatar_url = CASE WHEN (p_profile ? 'avatar_url') THEN NULLIF(p_profile->>'avatar_url','')::text ELSE avatar_url END,
    date_of_birth = CASE WHEN (p_profile ? 'date_of_birth') THEN NULLIF(p_profile->>'date_of_birth','')::date ELSE date_of_birth END,
    gender = CASE WHEN (p_profile ? 'gender') THEN NULLIF(p_profile->>'gender','')::text ELSE gender END,
    address = CASE WHEN (p_profile ? 'address') THEN NULLIF(p_profile->>'address','')::text ELSE address END,
    updated_at = NOW()
  WHERE id = p_member_id
  RETURNING * INTO v_member;

  RETURN v_member;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION update_member_profile(UUID, JSONB) TO authenticated;

-- ============================================================
-- Migration 007: RLS Policies for New Multi-Tenant Schema
--
-- This migration creates Row Level Security policies for the
-- new multi-tenant tables (organizations, organization_members, 
-- organization_groups, etc.)
-- ============================================================

-- ============================================================
-- Helper Functions for Auth
-- ============================================================

-- Get the current member's organization ID from organization_members
CREATE OR REPLACE FUNCTION get_current_member_org_id()
RETURNS UUID AS $$
BEGIN
    RETURN (
        SELECT organization_id
        FROM organization_members
        WHERE id::text = auth.uid()::text
        LIMIT 1
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Check if current user is an admin in their organization
CREATE OR REPLACE FUNCTION is_current_user_admin()
RETURNS BOOLEAN AS $$
DECLARE
    user_org_id UUID;
BEGIN
    user_org_id := get_current_member_org_id();
    IF user_org_id IS NULL THEN
        RETURN false;
    END IF;
    
    RETURN EXISTS (
        SELECT 1 FROM member_admins
        WHERE member_id::text = auth.uid()::text
        AND is_active = true
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- Organizations Table - RLS Policies
-- ============================================================

-- Enable RLS on organizations
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Allow anyone to view organizations (they're public for discovery)
DROP POLICY IF EXISTS org_view_policy ON organizations;
CREATE POLICY org_view_policy ON organizations
    FOR SELECT
    USING (true);

-- Only admins can insert organizations
DROP POLICY IF EXISTS org_create_policy ON organizations;
CREATE POLICY org_create_policy ON organizations
    FOR INSERT
    WITH CHECK (
        -- For now, allow authenticated users
        -- In future, check for specific "can_create_org" role/permission
        auth.uid() IS NOT NULL
    );

-- Only org admins can update their own organization
DROP POLICY IF EXISTS org_update_policy ON organizations;
CREATE POLICY org_update_policy ON organizations
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM organization_members
            WHERE organization_id::text = organizations.id::text
            AND id::text = auth.uid()::text
        )
        AND EXISTS (
            SELECT 1 FROM member_admins
            WHERE member_id::text = auth.uid()::text
            AND is_active = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM organization_members
            WHERE organization_id::text = organizations.id::text
            AND id::text = auth.uid()::text
        )
        AND EXISTS (
            SELECT 1 FROM member_admins
            WHERE member_id::text = auth.uid()::text
            AND is_active = true
        )
    );

-- ============================================================
-- Organization Members Table - RLS Policies
-- ============================================================

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- Members can view themselves and org members in their organization
DROP POLICY IF EXISTS member_view_policy ON organization_members;
CREATE POLICY member_view_policy ON organization_members
    FOR SELECT
    USING (
        organization_id::text = get_current_member_org_id()::text
    );

-- Only org admins can insert members
DROP POLICY IF EXISTS member_create_policy ON organization_members;
CREATE POLICY member_create_policy ON organization_members
    FOR INSERT
    WITH CHECK (
        organization_id::text = get_current_member_org_id()::text
        AND is_current_user_admin()
    );

-- Only org admins can update members
DROP POLICY IF EXISTS member_update_policy ON organization_members;
CREATE POLICY member_update_policy ON organization_members
    FOR UPDATE
    USING (
        organization_id::text = get_current_member_org_id()::text
        AND is_current_user_admin()
    )
    WITH CHECK (
        organization_id::text = get_current_member_org_id()::text
        AND is_current_user_admin()
    );

-- ============================================================
-- Organization Groups Table - RLS Policies
-- ============================================================

ALTER TABLE organization_groups ENABLE ROW LEVEL SECURITY;

-- Members can view groups in their organization
DROP POLICY IF EXISTS group_view_policy ON organization_groups;
CREATE POLICY group_view_policy ON organization_groups
    FOR SELECT
    USING (
        organization_id::text = get_current_member_org_id()::text
    );

-- Only org admins can create groups
DROP POLICY IF EXISTS group_create_policy ON organization_groups;
CREATE POLICY group_create_policy ON organization_groups
    FOR INSERT
    WITH CHECK (
        organization_id::text = get_current_member_org_id()::text
        AND is_current_user_admin()
    );

-- Only org admins can update groups (THIS FIXES THE CORS PATCH ERROR)
DROP POLICY IF EXISTS group_update_policy ON organization_groups;
CREATE POLICY group_update_policy ON organization_groups
    FOR UPDATE
    USING (
        organization_id::text = get_current_member_org_id()::text
        AND is_current_user_admin()
    )
    WITH CHECK (
        organization_id::text = get_current_member_org_id()::text
        AND is_current_user_admin()
    );

-- Only org admins can delete groups
DROP POLICY IF EXISTS group_delete_policy ON organization_groups;
CREATE POLICY group_delete_policy ON organization_groups
    FOR DELETE
    USING (
        organization_id::text = get_current_member_org_id()::text
        AND is_current_user_admin()
    );

-- ============================================================
-- Member Admins Table - RLS Policies
-- ============================================================

ALTER TABLE member_admins ENABLE ROW LEVEL SECURITY;

-- Members can view admin records in their organization
DROP POLICY IF EXISTS admin_view_policy ON member_admins;
CREATE POLICY admin_view_policy ON member_admins
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.id::text = member_id::text
            AND om.organization_id::text = get_current_member_org_id()::text
        )
    );

-- Only super-admins can manage admin records
DROP POLICY IF EXISTS admin_create_policy ON member_admins;
CREATE POLICY admin_create_policy ON member_admins
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.id::text = member_id::text
            AND om.organization_id::text = get_current_member_org_id()::text
        )
        AND is_current_user_admin()
    );

DROP POLICY IF EXISTS admin_update_policy ON member_admins;
CREATE POLICY admin_update_policy ON member_admins
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.id::text = member_id::text
            AND om.organization_id::text = get_current_member_org_id()::text
        )
        AND is_current_user_admin()
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.id::text = member_id::text
            AND om.organization_id::text = get_current_member_org_id()::text
        )
        AND is_current_user_admin()
    );

-- ============================================================
-- Academic Sessions Table - RLS Policies
-- ============================================================

ALTER TABLE academic_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS session_view_policy ON academic_sessions;
DROP POLICY IF EXISTS session_create_policy ON academic_sessions;
DROP POLICY IF EXISTS session_update_policy ON academic_sessions;

CREATE POLICY session_view_policy ON academic_sessions
    FOR SELECT
    USING (
        organization_id::text = get_current_member_org_id()::text
    );

CREATE POLICY session_create_policy ON academic_sessions
    FOR INSERT
    WITH CHECK (
        organization_id::text = get_current_member_org_id()::text
        AND is_current_user_admin()
    );

CREATE POLICY session_update_policy ON academic_sessions
    FOR UPDATE
    USING (
        organization_id::text = get_current_member_org_id()::text
        AND is_current_user_admin()
    )
    WITH CHECK (
        organization_id::text = get_current_member_org_id()::text
        AND is_current_user_admin()
    );

-- ============================================================
-- Academic Terms Table - RLS Policies
-- ============================================================

ALTER TABLE academic_terms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS term_view_policy ON academic_terms;
DROP POLICY IF EXISTS term_create_policy ON academic_terms;
DROP POLICY IF EXISTS term_update_policy ON academic_terms;

CREATE POLICY term_view_policy ON academic_terms
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM academic_sessions
            WHERE id::text = academic_terms.session_id::text
            AND organization_id::text = get_current_member_org_id()::text
        )
    );

CREATE POLICY term_create_policy ON academic_terms
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM academic_sessions
            WHERE id::text = academic_terms.session_id::text
            AND organization_id::text = get_current_member_org_id()::text
        )
        AND is_current_user_admin()
    );

CREATE POLICY term_update_policy ON academic_terms
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM academic_sessions
            WHERE id::text = academic_terms.session_id::text
            AND organization_id::text = get_current_member_org_id()::text
        )
        AND is_current_user_admin()
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM academic_sessions
            WHERE id::text = academic_terms.session_id::text
            AND organization_id::text = get_current_member_org_id()::text
        )
        AND is_current_user_admin()
    );

-- ============================================================
-- Organization Settings Table - RLS Policies
-- ============================================================

ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settings_view_policy ON organization_settings;
DROP POLICY IF EXISTS settings_update_policy ON organization_settings;

CREATE POLICY settings_view_policy ON organization_settings
    FOR SELECT
    USING (
        organization_id::text = get_current_member_org_id()::text
    );

CREATE POLICY settings_update_policy ON organization_settings
    FOR UPDATE
    USING (
        organization_id::text = get_current_member_org_id()::text
        AND is_current_user_admin()
    )
    WITH CHECK (
        organization_id::text = get_current_member_org_id()::text
        AND is_current_user_admin()
    );

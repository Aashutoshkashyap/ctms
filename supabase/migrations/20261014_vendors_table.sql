-- =============================================================================
-- CTMS Migration: vendors table
-- =============================================================================
-- Safe to apply: new table, no existing data affected.
-- Idempotent: uses IF NOT EXISTS.
-- Target: Supabase project eabovphqhdpjzfqburtk (production)
-- Review required before applying to production.
-- =============================================================================

BEGIN;

-- Create vendors table matching the Vendor interface in storage.ts
CREATE TABLE IF NOT EXISTS public.vendors (
  id                 text        PRIMARY KEY,
  organization_id    text        NOT NULL,
  project_id         text,       -- nullable: vendors can be org-wide
  name               text        NOT NULL,
  contact_person     text,
  phone              text,
  email              text,
  pan_vat            text,
  address            text,
  category           text        NOT NULL,
  status             text        NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'pending_verification', 'blacklisted', 'inactive')),
  rating             integer     CHECK (rating >= 1 AND rating <= 5),
  notes              text,
  created_by         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.vendors IS 'Approved vendor / supplier register scoped per organization.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vendors_org ON public.vendors (organization_id);
CREATE INDEX IF NOT EXISTS idx_vendors_org_project ON public.vendors (organization_id, project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendors_status ON public.vendors (organization_id, status);

-- Enable RLS
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

-- RLS policies: service_role bypasses RLS; authenticated users access their organization only
-- Policy: authenticated users can read vendors in their organization
CREATE POLICY "vendors_select_authenticated"
  ON public.vendors
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.auth_user_id = auth.uid() AND om.status = 'active'
      UNION
      SELECT p.organization_id
      FROM public.projects p
      JOIN public.project_users pu ON pu.project_id = p.id
      WHERE pu.auth_user_id = auth.uid()
    )
  );

-- Policy: store officers, project managers, directors, and business admins can manage vendors
CREATE POLICY "vendors_write_store_officer"
  ON public.vendors
  FOR ALL
  TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.auth_user_id = auth.uid() AND om.status = 'active'
        AND om.role IN ('business_admin', 'project_director')
      UNION
      SELECT p.organization_id
      FROM public.projects p
      JOIN public.project_users pu ON pu.project_id = p.id
      WHERE pu.auth_user_id = auth.uid()
        AND pu.role IN ('project_director', 'project_manager', 'store_officer', 'business_admin')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.auth_user_id = auth.uid() AND om.status = 'active'
        AND om.role IN ('business_admin', 'project_director')
      UNION
      SELECT p.organization_id
      FROM public.projects p
      JOIN public.project_users pu ON pu.project_id = p.id
      WHERE pu.auth_user_id = auth.uid()
        AND pu.role IN ('project_director', 'project_manager', 'store_officer', 'business_admin')
    )
  );

COMMIT;

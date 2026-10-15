-- =============================================================================
-- CTMS Migration: phase1g — Daily Report Optimistic Concurrency
-- =============================================================================
-- Safe to apply: adds columns with defaults/nullable, no existing data loss.
-- Idempotent: all steps use IF NOT EXISTS / OR REPLACE / DO $$ guards.
-- Target: Supabase project eabovphqhdpjzfqburtk (production)
-- Author: CTMS automated migration preparation
-- Review required before applying to production.
-- =============================================================================

BEGIN;

-- 1. Add organization_id column if missing (nullable for backward compatibility)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'daily_reports' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.daily_reports ADD COLUMN organization_id text;
    COMMENT ON COLUMN public.daily_reports.organization_id IS 'Tenant scope for multi-tenant RLS enforcement.';
  END IF;
END $$;

-- 2. Add revision column for optimistic concurrency (default 0 for existing rows)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'daily_reports' AND column_name = 'revision'
  ) THEN
    ALTER TABLE public.daily_reports ADD COLUMN revision integer NOT NULL DEFAULT 0;
    COMMENT ON COLUMN public.daily_reports.revision IS 'Monotonic revision counter for compare-and-set concurrency.';
  END IF;
END $$;

-- 3. Add operation_key for idempotency (nullable — prevents duplicate replay)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'daily_reports' AND column_name = 'operation_key'
  ) THEN
    ALTER TABLE public.daily_reports ADD COLUMN operation_key text;
    COMMENT ON COLUMN public.daily_reports.operation_key IS 'Last accepted operation ID for idempotent replay protection.';
  END IF;
END $$;

-- 4. Index for efficient lookup by project + date (idempotent)
CREATE INDEX IF NOT EXISTS idx_daily_reports_project_date
  ON public.daily_reports (project_id, report_date);

-- 5. Index for organization scope (used by RPC)
CREATE INDEX IF NOT EXISTS idx_daily_reports_org_project
  ON public.daily_reports (organization_id, project_id)
  WHERE organization_id IS NOT NULL;

-- =============================================================================
-- 6. phase1g_apply_daily_report_update stored procedure
--
-- Implements server-side optimistic locking for daily report updates:
-- - Checks expectedRevision matches current revision (concurrency guard)
-- - Checks operation_key for replay idempotency
-- - Returns typed outcome: UPDATED | CONFLICT | NOT_FOUND | UNAUTHORIZED
-- - SECURITY DEFINER executes as owner (bypasses RLS for atomic CAS update)
--   but validates organization + project scope explicitly before mutating.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.phase1g_apply_daily_report_update(
  p_organization_id  text,
  p_project_id       text,
  p_actor_id         text,
  p_operation_key    text,
  p_expected_revision integer,
  p_report           jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report        public.daily_reports%ROWTYPE;
  v_report_id     text;
  v_new_revision  integer;
  v_result        jsonb;
BEGIN
  -- Extract and validate report ID from patch
  v_report_id := p_report->>'id';
  IF v_report_id IS NULL OR trim(v_report_id) = '' THEN
    RETURN jsonb_build_object(
      'code', 'VALIDATION_ERROR',
      'message', 'Report ID is required.'
    );
  END IF;

  -- Load the existing report with explicit tenant scope check
  SELECT * INTO v_report
  FROM public.daily_reports
  WHERE id = v_report_id
    AND project_id = p_project_id
  FOR UPDATE;  -- Lock for atomic CAS

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'code', 'NOT_FOUND',
      'message', 'The daily report was not found in this project.'
    );
  END IF;

  -- Organization scope guard: if organization_id is populated, enforce tenant isolation
  IF v_report.organization_id IS NOT NULL AND v_report.organization_id <> p_organization_id THEN
    RETURN jsonb_build_object(
      'code', 'UNAUTHORIZED',
      'message', 'The daily report belongs to a different organization.'
    );
  END IF;

  -- Idempotency: if operation_key already applied, return previous result
  IF v_report.operation_key IS NOT NULL AND v_report.operation_key = p_operation_key THEN
    RETURN jsonb_build_object(
      'code', 'UPDATED',
      'message', 'Operation already applied (idempotent replay).',
      'revision', v_report.revision,
      'record', row_to_json(v_report)::jsonb
    );
  END IF;

  -- Optimistic concurrency check
  IF v_report.revision <> p_expected_revision THEN
    RETURN jsonb_build_object(
      'code', 'CONFLICT',
      'message', 'The daily report was modified by another update. Reload and retry.',
      'revision', v_report.revision
    );
  END IF;

  -- Compute new revision
  v_new_revision := v_report.revision + 1;

  -- Apply the patch — only the permitted fields from DailyReportPatch
  UPDATE public.daily_reports SET
    weather             = COALESCE((p_report->>'weather'), weather),
    manpower_total      = COALESCE((p_report->>'manpower_total')::integer, manpower_total),
    equipment_total     = COALESCE((p_report->>'equipment_total')::integer, equipment_total),
    site_instructions   = COALESCE((p_report->>'site_instructions'), site_instructions),
    obstruction_reasons = COALESCE((p_report->>'obstruction_reasons'), obstruction_reasons),
    next_day_plan       = COALESCE((p_report->>'next_day_plan'), next_day_plan),
    submitted_by        = COALESCE((p_report->>'submitted_by'), submitted_by),
    submitted_by_email  = COALESCE((p_report->>'submitted_by_email'), submitted_by_email),
    submitted_at        = now(),
    organization_id     = p_organization_id,
    revision            = v_new_revision,
    operation_key       = p_operation_key
  WHERE id = v_report_id
    AND project_id = p_project_id
    AND revision = p_expected_revision  -- Secondary CAS guard at SQL level
  RETURNING * INTO v_report;

  IF NOT FOUND THEN
    -- Another concurrent update beat us between the SELECT FOR UPDATE and UPDATE
    RETURN jsonb_build_object(
      'code', 'CONFLICT',
      'message', 'A concurrent update was applied before this one. Reload and retry.'
    );
  END IF;

  RETURN jsonb_build_object(
    'code', 'UPDATED',
    'message', 'Daily report updated successfully.',
    'revision', v_new_revision,
    'record', row_to_json(v_report)::jsonb
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'code', 'PERSISTENCE_ERROR',
    'message', 'An unexpected database error occurred: ' || SQLERRM
  );
END;
$$;

-- Grant execute to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.phase1g_apply_daily_report_update(text, text, text, text, integer, jsonb)
  TO authenticated, service_role;

COMMIT;

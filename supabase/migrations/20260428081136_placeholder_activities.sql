-- Placeholder activities for project leaders
-- Keep calendar bars separate from finance projects until an admin completes them.

ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS is_placeholder boolean NOT NULL DEFAULT false;

UPDATE public.projects
SET is_placeholder = false
WHERE is_placeholder IS NULL;

CREATE OR REPLACE FUNCTION public.enforce_project_placeholder_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_admin() THEN
    NEW.is_placeholder := COALESCE(NEW.is_placeholder, false);
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_placeholder := true;
    NEW.amount := 0;
    NEW.a_konto_percent := 0;
    NEW.fakturert := 0;
    NEW.billing_type := 'tilbud';

    IF NEW.project_leader_id IS NULL THEN
      NEW.project_leader_id := public.my_worker_id();
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.is_placeholder IS DISTINCT FROM OLD.is_placeholder THEN
      RAISE EXCEPTION 'Only admins can change placeholder status';
    END IF;

    IF NEW.amount IS DISTINCT FROM OLD.amount
      OR NEW.a_konto_percent IS DISTINCT FROM OLD.a_konto_percent
      OR NEW.fakturert IS DISTINCT FROM OLD.fakturert
      OR NEW.billing_type IS DISTINCT FROM OLD.billing_type THEN
      RAISE EXCEPTION 'Only admins can update project finance fields';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_project_placeholder_rules ON public.projects;

CREATE TRIGGER trg_enforce_project_placeholder_rules
BEFORE INSERT OR UPDATE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.enforce_project_placeholder_rules();

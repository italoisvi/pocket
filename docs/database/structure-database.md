-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.budgets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category_id text NOT NULL,
  amount numeric NOT NULL,
  period_type text NOT NULL CHECK (period_type = ANY (ARRAY['monthly'::text, 'weekly'::text, 'yearly'::text])),
  start_date date NOT NULL,
  end_date date,
  rollover_enabled boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  notifications_enabled boolean NOT NULL DEFAULT true,
  CONSTRAINT budgets_pkey PRIMARY KEY (id),
  CONSTRAINT budgets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.conversations (
  id text NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  CONSTRAINT conversations_pkey PRIMARY KEY (id),
  CONSTRAINT conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  establishment_name text NOT NULL,
  amount numeric NOT NULL,
  date date NOT NULL,
  items jsonb DEFAULT '[]'::jsonb,
  image_url text,
  notes text,
  category USER-DEFINED NOT NULL DEFAULT 'outros'::expense_category,
  subcategory text NOT NULL DEFAULT 'Outros'::text,
  CONSTRAINT expenses_pkey PRIMARY KEY (id),
  CONSTRAINT expenses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  name text,
  monthly_salary numeric,
  salary_payment_day integer DEFAULT 1 CHECK (salary_payment_day >= 1 AND salary_payment_day <= 31),
  avatar_url text,
  income_source text,
  payment_day integer,
  income_cards jsonb DEFAULT '[]'::jsonb,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
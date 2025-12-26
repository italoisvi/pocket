-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

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
CONSTRAINT profiles_pkey PRIMARY KEY (id),
CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);

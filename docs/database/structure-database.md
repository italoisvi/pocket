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
CREATE TABLE public.pluggy_accounts (
id uuid NOT NULL DEFAULT gen_random_uuid(),
user_id uuid NOT NULL,
item_id uuid NOT NULL,
pluggy_account_id text NOT NULL UNIQUE,
type text NOT NULL CHECK (type = ANY (ARRAY['BANK'::text, 'CREDIT'::text])),
subtype text,
name text NOT NULL,
number text,
balance numeric,
currency_code text DEFAULT 'BRL'::text,
credit_limit numeric,
available_credit_limit numeric,
created_at timestamp without time zone DEFAULT now(),
updated_at timestamp without time zone DEFAULT now(),
last_sync_at timestamp with time zone DEFAULT now(),
CONSTRAINT pluggy_accounts_pkey PRIMARY KEY (id),
CONSTRAINT pluggy_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
CONSTRAINT pluggy_accounts_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.pluggy_items(id)
);
CREATE TABLE public.pluggy_items (
id uuid NOT NULL DEFAULT gen_random_uuid(),
user_id uuid NOT NULL,
pluggy_item_id text NOT NULL UNIQUE,
connector_id integer NOT NULL,
connector_name text NOT NULL,
status text NOT NULL CHECK (status = ANY (ARRAY['PENDING'::text, 'UPDATING'::text, 'UPDATED'::text, 'LOGIN_ERROR'::text, 'OUTDATED'::text, 'WAITING_USER_INPUT'::text])),
last_updated_at timestamp without time zone,
error_message text,
created_at timestamp without time zone DEFAULT now(),
updated_at timestamp without time zone DEFAULT now(),
CONSTRAINT pluggy_items_pkey PRIMARY KEY (id),
CONSTRAINT pluggy_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.pluggy_transactions (
id uuid NOT NULL DEFAULT gen_random_uuid(),
user_id uuid NOT NULL,
account_id uuid NOT NULL,
pluggy_transaction_id text NOT NULL UNIQUE,
expense_id uuid,
description text NOT NULL,
description_raw text,
amount numeric NOT NULL,
date date NOT NULL,
status text NOT NULL CHECK (status = ANY (ARRAY['PENDING'::text, 'POSTED'::text])),
type text NOT NULL CHECK (type = ANY (ARRAY['DEBIT'::text, 'CREDIT'::text])),
category text,
provider_code text,
synced boolean DEFAULT false,
created_at timestamp without time zone DEFAULT now(),
CONSTRAINT pluggy_transactions_pkey PRIMARY KEY (id),
CONSTRAINT pluggy_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
CONSTRAINT pluggy_transactions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.pluggy_accounts(id),
CONSTRAINT pluggy_transactions_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES public.expenses(id)
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
debt_notifications_enabled boolean DEFAULT false,
salary_bank_account_id uuid,
CONSTRAINT profiles_pkey PRIMARY KEY (id),
CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
CONSTRAINT profiles_salary_bank_account_id_fkey FOREIGN KEY (salary_bank_account_id) REFERENCES public.pluggy_accounts(id)
);
CREATE TABLE public.user_financial_patterns (
id uuid NOT NULL DEFAULT gen_random_uuid(),
user_id uuid,
pattern_type text NOT NULL,
pattern_key text NOT NULL,
category text,
pattern_value jsonb NOT NULL,
confidence double precision DEFAULT 0.5,
occurrences integer DEFAULT 1,
analysis_period_start date,
analysis_period_end date,
first_detected_at timestamp with time zone DEFAULT now(),
last_updated_at timestamp with time zone DEFAULT now(),
last_used_at timestamp with time zone,
CONSTRAINT user_financial_patterns_pkey PRIMARY KEY (id),
CONSTRAINT user_financial_patterns_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.walts_analyses (
id uuid NOT NULL DEFAULT gen_random_uuid(),
user_id uuid,
analysis_type text NOT NULL DEFAULT 'raio_x_financeiro'::text,
content text NOT NULL,
context_data jsonb,
created_at timestamp with time zone DEFAULT now(),
CONSTRAINT walts_analyses_pkey PRIMARY KEY (id),
CONSTRAINT walts_analyses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.walts_memory (
id uuid NOT NULL DEFAULT gen_random_uuid(),
user_id uuid NOT NULL,
memory_type text NOT NULL CHECK (memory_type = ANY (ARRAY['preference'::text, 'context'::text, 'insight'::text])),
key text NOT NULL,
value jsonb NOT NULL,
confidence numeric NOT NULL DEFAULT 1.0 CHECK (confidence >= 0::numeric AND confidence <= 1::numeric),
source text,
created_at timestamp with time zone DEFAULT now(),
updated_at timestamp with time zone DEFAULT now(),
last_used_at timestamp with time zone,
use_count integer NOT NULL DEFAULT 0,
CONSTRAINT walts_memory_pkey PRIMARY KEY (id),
CONSTRAINT walts_memory_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

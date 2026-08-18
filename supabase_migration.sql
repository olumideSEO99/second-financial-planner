-- Run this once in the Supabase SQL Editor (Project > SQL Editor > New query).

create extension if not exists pgcrypto;

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('income', 'expense')),
  amount numeric not null,
  category text,
  description text,
  date date not null,
  created_at timestamptz not null default now()
);

create table if not exists budgets (
  month text primary key,
  limit_amount numeric not null,
  updated_at timestamptz not null default now()
);

-- Migrate existing data from data.json (safe to skip if you'd rather start fresh).
-- created_at is staggered so the list keeps its current newest-first order.
insert into transactions (id, type, amount, category, description, date, created_at) values
  ('1c0d7b56-906a-4f80-b75d-0f4751527aac', 'expense', 100.0, 'utilities',     'HDMI cable',      '2026-08-18', now() - interval '0 seconds'),
  ('4d06a508-9415-49f9-9423-1094c0f1e842', 'income',  500.0, 'gift',          'Birthday',        '2026-08-18', now() - interval '1 seconds'),
  ('17f76d18-18cc-4afb-93eb-973f3eae8b46', 'expense', 40.0,  'food',          'Eba',             '2026-08-18', now() - interval '2 seconds'),
  ('a0ca372f-e9d1-4f9b-afe0-fdb37326a5c7', 'income',  1000.0,'freelance',     'Amne',            '2026-08-18', now() - interval '3 seconds'),
  ('c623acff-1727-46ca-b2ad-c8efbb6efd5c', 'expense', 30.0,  'entertainment', 'Cinema Tickets',  '2026-08-18', now() - interval '4 seconds'),
  ('2f9b7708-0667-4b1e-b2bf-af6c8b5d24b4', 'expense', 50.0,  'food',          'Groceries',       '2026-08-18', now() - interval '5 seconds')
on conflict (id) do nothing;

insert into budgets (month, limit_amount) values
  ('2026-08', 300.0)
on conflict (month) do update set limit_amount = excluded.limit_amount;

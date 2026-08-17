-- ECHO 단어/복습 테이블
-- Supabase Dashboard → SQL Editor 에서 이 파일 전체를 붙여넣고 Run 하세요.

create table if not exists public.vocab_words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  en text not null,
  ko text not null default '',
  en_key text not null,
  streak integer not null default 0,
  interval_index integer not null default 0,
  last_reviewed bigint not null default 0,
  next_review bigint not null default 0,
  wrong_count integer not null default 0,
  correct_count integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, en_key)
);

create index if not exists vocab_words_user_next_review_idx
  on public.vocab_words (user_id, next_review);

alter table public.vocab_words enable row level security;

drop policy if exists "vocab_words_select_own" on public.vocab_words;
drop policy if exists "vocab_words_insert_own" on public.vocab_words;
drop policy if exists "vocab_words_update_own" on public.vocab_words;
drop policy if exists "vocab_words_delete_own" on public.vocab_words;

create policy "vocab_words_select_own"
  on public.vocab_words for select
  using (auth.uid() = user_id);

create policy "vocab_words_insert_own"
  on public.vocab_words for insert
  with check (auth.uid() = user_id);

create policy "vocab_words_update_own"
  on public.vocab_words for update
  using (auth.uid() = user_id);

create policy "vocab_words_delete_own"
  on public.vocab_words for delete
  using (auth.uid() = user_id);

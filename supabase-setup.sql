-- ECHO 단어 테이블 (모든 로그인한 사용자가 같은 목록을 사용)
-- Supabase Dashboard → SQL Editor 에서 이 파일 전체를 붙여넣고 Run 하세요.
--
-- GitHub 로그인도 쓰려면:
-- 1) GitHub → Settings → Developer settings → OAuth Apps → New
--    Homepage: https://bongeunku.github.io/echo-english/
--    Callback: https://htcvxueozynpnmoirwyr.supabase.co/auth/v1/callback
-- 2) Supabase → Authentication → Providers → GitHub 켜기 (Client ID/Secret 입력)
-- 3) Authentication → URL Configuration → Redirect URLs 에 추가
--    https://bongeunku.github.io/echo-english/
--    http://127.0.0.1:5173/

create table if not exists public.vocab_words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  en text not null,
  ko text not null default '',
  en_key text not null,
  pool_id integer not null default 1,
  streak integer not null default 0,
  interval_index integer not null default 0,
  last_reviewed bigint not null default 0,
  next_review bigint not null default 0,
  wrong_count integer not null default 0,
  correct_count integer not null default 0,
  updated_at timestamptz not null default now()
);

delete from public.vocab_words a
using public.vocab_words b
where a.en_key = b.en_key
  and a.updated_at < b.updated_at;

delete from public.vocab_words a
using public.vocab_words b
where a.en_key = b.en_key
  and a.updated_at = b.updated_at
  and a.id < b.id;

create index if not exists vocab_words_updated_at_idx
  on public.vocab_words (updated_at desc);

alter table public.vocab_words add column if not exists pool_id integer not null default 1;
update public.vocab_words set pool_id = 1 where pool_id is null or pool_id < 1;

alter table public.vocab_words drop constraint if exists vocab_words_user_id_en_key_key;
alter table public.vocab_words drop constraint if exists vocab_words_en_key_key;
drop index if exists vocab_words_user_id_en_key_key;
drop index if exists vocab_words_en_key_uidx;
alter table public.vocab_words drop constraint if exists vocab_words_pool_en_key_key;
alter table public.vocab_words add constraint vocab_words_pool_en_key_key unique (pool_id, en_key);
create index if not exists vocab_words_pool_id_idx on public.vocab_words (pool_id);

alter table public.vocab_words enable row level security;

drop policy if exists "vocab_words_select_own" on public.vocab_words;
drop policy if exists "vocab_words_insert_own" on public.vocab_words;
drop policy if exists "vocab_words_update_own" on public.vocab_words;
drop policy if exists "vocab_words_delete_own" on public.vocab_words;
drop policy if exists "vocab_words_select_all" on public.vocab_words;
drop policy if exists "vocab_words_insert_all" on public.vocab_words;
drop policy if exists "vocab_words_update_all" on public.vocab_words;
drop policy if exists "vocab_words_delete_all" on public.vocab_words;

create policy "vocab_words_select_all"
  on public.vocab_words for select
  using (auth.role() = 'authenticated');

create policy "vocab_words_insert_all"
  on public.vocab_words for insert
  with check (auth.role() = 'authenticated');

create policy "vocab_words_update_all"
  on public.vocab_words for update
  using (auth.role() = 'authenticated');

create policy "vocab_words_delete_all"
  on public.vocab_words for delete
  using (auth.role() = 'authenticated');

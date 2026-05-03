# Kitchen Activity Dashboard (Next.js + Supabase)

This dashboard shows **zone cards** (Working/Idle + motion_score) from the Supabase `kitchen_activity` table and updates in realtime.

## 1) Supabase setup

### Auth
- Create users in **Supabase Auth** (email/password).
- For password reset, set **Auth → URL Configuration**:
  - **Site URL**: your deployed URL (or `http://localhost:3000` for local)
  - **Redirect URLs**: add `http://localhost:3000/reset` and `https://<your-vercel-domain>/reset`

### RLS policy (authenticated read)
If you enabled RLS on `public.kitchen_activity`, make sure authenticated users can read:

```sql
alter table public.kitchen_activity enable row level security;

create policy allow_authenticated_read
  on public.kitchen_activity
  for select
  to authenticated
  using (true);
```

### Realtime
Enable Realtime for `public.kitchen_activity` in Supabase Dashboard:
- Database → Replication (Realtime) → add `kitchen_activity`

## 2) Local dev

Copy env:
- `dashboard/.env.local.example` → `dashboard/.env.local`

Set:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Run:

```bash
npm i
npm run dev
```

Open:
- `http://localhost:3000`

## 3) Vercel deploy

- Push repo to GitHub
- Import into Vercel
- Set **Project → Environment Variables**:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Deploy

## Routes
- `/login`: email/password login
- `/forgot`: request password reset email
- `/reset`: set new password (opened from email link)
- `/`: dashboard (redirects to `/login` if not logged in)

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

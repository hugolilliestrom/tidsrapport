# Tidsrapport

Next.js tidsrapport (App Router) + Supabase (`months` / `tasks` / `invoice_items`).

## Deploy till Vercel

1. Importera detta repo: https://vercel.com/new/import?s=https://github.com/hugolilliestrom/tidsrapport  
   (fungerar när repot finns under `hugolilliestrom/tidsrapport`)
2. Under **Environment Variables** sätt:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Deploy. Verifiera `/api/cloud-status` → `configured: true`.

Schema: `supabase/schema.sql`

## Lokal utveckling

```bash
npm install
cp .env.example .env.local   # fyll i nycklar lokalt
npm run dev
```

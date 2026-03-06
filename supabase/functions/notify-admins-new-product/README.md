# notify-admins-new-product

Notifies admin users (push) when a new reuse product is submitted for approval.

## Deploy (fixes 404)

From the project root, with [Supabase CLI](https://supabase.com/docs/guides/cli) installed and logged in:

```bash
# Link project if not already (use your project ref from dashboard URL)
npx supabase link --project-ref nsiebgjaskrcdwotgbvr

# Deploy this function
npx supabase functions deploy notify-admins-new-product
```

If you use a different project ref, use that instead of `nsiebgjaskrcdwotgbvr`. After deploy, the URL `https://nsiebgjaskrcdwotgbvr.supabase.co/functions/v1/notify-admins-new-product` will respond (no more 404).

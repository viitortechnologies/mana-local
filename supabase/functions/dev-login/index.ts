// Dev-only: sign in with same number + static OTP (1234) by returning a magic link for the existing user.
// No Phone provider needed. For production, use real Phone OTP and remove or disable this function.
// POST /functions/v1/dev-login
// Body: { phone: string }
// Returns: { link: string } – open in browser; app will receive redirect with session.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEV_EMAIL_DOMAIN = 'mana-local.dev';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, supabaseServiceKey);

  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  if (!phone) {
    return new Response(JSON.stringify({ error: 'phone is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .eq('phone', phone)
    .limit(1)
    .maybeSingle();

  if (profileError || !profile?.id) {
    return new Response(
      JSON.stringify({ error: 'No account found for this number. Sign up first with OTP 1234.' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const userId = profile.id;
  const { data: authUser, error: userError } = await admin.auth.admin.getUserById(userId);
  if (userError || !authUser?.user) {
    return new Response(JSON.stringify({ error: 'User not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let email = authUser.user.email ?? '';
  if (!email) {
    email = `dev+${phone.replace(/\+/g, '')}@${DEV_EMAIL_DOMAIN}`;
    await admin.auth.admin.updateUserById(userId, { email });
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: 'manalocal://auth/callback' },
  });

  if (linkError || !linkData?.properties?.action_link) {
    return new Response(
      JSON.stringify({ error: linkError?.message ?? 'Could not generate sign-in link' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ link: linkData.properties.action_link }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});

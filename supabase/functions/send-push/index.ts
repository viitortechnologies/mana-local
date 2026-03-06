// Supabase Edge Function: send push notifications (admin only)
// Invoke with: POST /functions/v1/send-push
// Body: { title: string, body: string, imageUrl?: string, link?: string }
// Headers: Authorization: Bearer <user access token>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  // Use ANON_KEY secret if set (Supabase disallows SUPABASE_ prefix for custom secrets); else use auto-injected SUPABASE_ANON_KEY if available
  const supabaseAnonKey = Deno.env.get('ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!supabaseAnonKey) {
    return new Response(
      JSON.stringify({
        error: 'Server misconfiguration: anon key not set. Add a secret named ANON_KEY with your project anon key (Dashboard → Project Settings → API).',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceKey);
  const { data: adminRoles } = await adminClient
    .from('user_roles')
    .select('role_id')
    .eq('user_id', user.id);
  const roleIds = (adminRoles ?? []).map((r) => r.role_id);
  if (roleIds.length === 0) {
    return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const { data: roles } = await adminClient.from('roles').select('code').in('id', roleIds);
  const isAdmin = (roles ?? []).some((r) => r.code === 'admin');
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { title?: string; body?: string; imageUrl?: string; link?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const notificationBody = typeof body.body === 'string' ? body.body.trim() : title;
  if (!title) {
    return new Response(JSON.stringify({ error: 'title is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: tokens } = await adminClient
    .from('push_tokens')
    .select('expo_push_token');
  const expoTokens = (tokens ?? []).map((t) => t.expo_push_token).filter(Boolean);
  if (expoTokens.length === 0) {
    return new Response(
      JSON.stringify({ message: 'No push tokens registered', sent: 0 }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const data: Record<string, string> = {};
  if (body.imageUrl) data.imageUrl = body.imageUrl;
  if (body.link) data.link = body.link;

  const messages = expoTokens.map((to) => ({
    to,
    title,
    body: notificationBody,
    ...(Object.keys(data).length > 0 && { data }),
  }));

  // Expo accepts up to 100 messages per request; send in chunks
  const chunkSize = 100;
  let totalSent = 0;
  for (let i = 0; i < messages.length; i += chunkSize) {
    const chunk = messages.slice(i, i + chunkSize);
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(chunk.length === 1 ? chunk[0] : chunk),
    });
    if (!res.ok) {
      const errText = await res.text();
      return new Response(
        JSON.stringify({ error: 'Expo push failed', details: errText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const result = await res.json();
    const okCount = (result.data ?? []).filter((t: { status?: string }) => t.status === 'ok').length;
    totalSent += okCount;
  }

  return new Response(
    JSON.stringify({ message: 'Notifications sent', sent: totalSent, total: expoTokens.length }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});

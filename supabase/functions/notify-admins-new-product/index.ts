// Notify admin users when a new reuse product is submitted for approval.
// POST /functions/v1/notify-admins-new-product
// Body: { reuse_item_id: string, title: string }
// Headers: Authorization: Bearer <seller access token>
// Caller must be the seller of the item; sends push to all users with admin role.

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
  const supabaseAnonKey = Deno.env.get('ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

  let body: { reuse_item_id?: string; title?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const reuseItemId = typeof body.reuse_item_id === 'string' ? body.reuse_item_id.trim() : '';
  const title = typeof body.title === 'string' ? body.title.trim() : 'New product';
  if (!reuseItemId) {
    return new Response(JSON.stringify({ error: 'reuse_item_id is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  const { data: row, error: itemError } = await adminClient
    .from('reuse_items')
    .select('id, seller_id, approved_at')
    .eq('id', reuseItemId)
    .single();

  if (itemError || !row) {
    return new Response(JSON.stringify({ error: 'Item not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if ((row as { seller_id: string }).seller_id !== user.id) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if ((row as { approved_at: string | null }).approved_at != null) {
    return new Response(JSON.stringify({ message: 'Item already approved', sent: 0 }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: adminRoles } = await adminClient
    .from('roles')
    .select('id')
    .eq('code', 'admin');
  const adminRoleIds = (adminRoles ?? []).map((r) => r.id);
  if (adminRoleIds.length === 0) {
    return new Response(JSON.stringify({ message: 'No admin role found', sent: 0 }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: adminUserRows } = await adminClient
    .from('user_roles')
    .select('user_id')
    .in('role_id', adminRoleIds);
  const adminUserIds = [...new Set((adminUserRows ?? []).map((r) => r.user_id))];
  if (adminUserIds.length === 0) {
    return new Response(JSON.stringify({ message: 'No admin users', sent: 0 }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: tokens } = await adminClient
    .from('push_tokens')
    .select('expo_push_token')
    .in('user_id', adminUserIds);
  const expoTokens = (tokens ?? []).map((t) => t.expo_push_token).filter(Boolean);

  if (expoTokens.length === 0) {
    return new Response(
      JSON.stringify({ message: 'No push tokens registered for admins', sent: 0 }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const pushTitle = 'New product submitted';
  const pushBody = `"${title}" – please review and approve.`;

  const messages = expoTokens.map((to) => ({
    to,
    title: pushTitle,
    body: pushBody,
    data: { screen: 'approve-reuse', reuse_item_id: reuseItemId },
  }));

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
    JSON.stringify({ message: 'Admins notified', sent: totalSent, total: expoTokens.length }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});

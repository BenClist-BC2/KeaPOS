// Supabase Edge Function: Create Terminal
// Creates a Supabase auth user for a terminal device + profile

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateTerminalRequest {
  name: string;
  location_id: string;
  company_id: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create client with anon key - this reads auth from request automatically
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's profile to verify role and company
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('company_id, role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'Profile not found' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!['owner', 'manager'].includes(profile.role)) {
      return new Response(
        JSON.stringify({ error: 'Only owners and managers can create terminals' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get request body
    const { name, location_id } = await req.json();

    if (!name || !location_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: name, location_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use company_id from authenticated user's profile (not from request)
    const company_id = profile.company_id;

    // Create admin client for privileged operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Generate terminal credentials
    const terminalId = crypto.randomUUID();
    const terminalEmail = `terminal-${terminalId}@keapos.internal`;

    // Generate secure random password (16 chars, alphanumeric)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const passwordBytes = new Uint8Array(16);
    crypto.getRandomValues(passwordBytes);
    const terminalPassword = Array.from(passwordBytes)
      .map(byte => chars[byte % chars.length])
      .join('');

    // Create terminal auth user
    const { data: terminalUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email: terminalEmail,
      password: terminalPassword,
      email_confirm: true,
    });

    if (createUserError || !terminalUser.user) {
      return new Response(
        JSON.stringify({ error: createUserError?.message ?? 'Failed to create terminal user' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create terminal profile
    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: terminalUser.user.id,
      company_id,
      location_id,
      role: 'terminal',
      full_name: name,
      active: true,
    });

    if (profileError) {
      return new Response(
        JSON.stringify({ error: profileError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create terminal record
    const { data: terminal, error: terminalError } = await supabaseAdmin.from('terminals').insert({
      id: terminalId,
      company_id,
      location_id,
      name,
    }).select('id').single();

    if (terminalError || !terminal) {
      return new Response(
        JSON.stringify({ error: terminalError?.message ?? 'Failed to create terminal record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate pairing code (base64 JSON)
    const pairingData = {
      terminal_id: terminal.id,
      email: terminalEmail,
      password: terminalPassword,
    };
    const pairingCode = btoa(JSON.stringify(pairingData));

    return new Response(
      JSON.stringify({ terminal_id: terminal.id, pairing_code: pairingCode }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

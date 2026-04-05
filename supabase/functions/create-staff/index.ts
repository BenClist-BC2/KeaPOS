// Supabase Edge Function: Create Staff
// Creates staff member with optional email (admin access) or PIN-only (terminal access)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateStaffRequest {
  full_name: string;
  pin: string;
  email?: string;
  role: 'owner' | 'manager' | 'staff';
  location_id?: string;
  company_id: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { full_name, pin, email, role, location_id, company_id }: CreateStaffRequest = await req.json();

    if (!full_name || !pin || !role || !company_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: full_name, pin, role, company_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (pin.length < 4) {
      return new Response(
        JSON.stringify({ error: 'PIN must be at least 4 digits' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Hash PIN
    const pin_hash = await bcrypt.hash(pin);

    // If email provided: create full auth user
    if (email) {
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);

      if (createError) {
        return new Response(
          JSON.stringify({ error: createError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!newUser.user) {
        return new Response(
          JSON.stringify({ error: 'Failed to create user' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create profile
      const { error: profileError } = await supabaseAdmin.from('profiles').insert({
        id: newUser.user.id,
        company_id,
        location_id: location_id || null,
        role,
        full_name,
        pin_hash,
      });

      if (profileError) {
        return new Response(
          JSON.stringify({ error: profileError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ staff_id: newUser.user.id, email_sent: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // PIN-only user: no auth.users row
      const profileId = crypto.randomUUID();
      const { error: profileError } = await supabaseAdmin.from('profiles').insert({
        id: profileId,
        company_id,
        location_id: location_id || null,
        role,
        full_name,
        pin_hash,
      });

      if (profileError) {
        return new Response(
          JSON.stringify({ error: profileError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ staff_id: profileId, email_sent: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

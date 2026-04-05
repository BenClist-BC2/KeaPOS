/**
 * Test script to diagnose Edge Function authentication
 * Run with: npx tsx scripts/test-edge-function.ts
 */

import { createClient } from '@supabase/supabase-js';

async function testEdgeFunction() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Missing environment variables');
    process.exit(1);
  }

  // Create a regular client (not SSR)
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  console.log('🔐 Testing Edge Function Authentication\n');

  // Sign in to get a session
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: process.env.TEST_USER_EMAIL || '',
    password: process.env.TEST_USER_PASSWORD || '',
  });

  if (authError || !authData.session) {
    console.error('❌ Failed to authenticate:', authError?.message);
    console.log('\n💡 Set TEST_USER_EMAIL and TEST_USER_PASSWORD environment variables');
    process.exit(1);
  }

  console.log('✅ Authenticated as:', authData.user.email);
  console.log('📝 Access token (first 50 chars):', authData.session.access_token.substring(0, 50) + '...');

  // Test 1: Call via functions.invoke()
  console.log('\n--- Test 1: Using functions.invoke() ---');
  const { data: invokeData, error: invokeError } = await supabase.functions.invoke('create-terminal', {
    body: { name: 'Test Terminal', location_id: 'test-location-id' },
  });

  console.log('Result:', invokeError ? `❌ ${invokeError.message}` : '✅ Success');
  console.log('Data:', JSON.stringify(invokeData || invokeError, null, 2));

  // Test 2: Call via manual fetch with Authorization header
  console.log('\n--- Test 2: Using manual fetch with Authorization ---');
  const response = await fetch(`${supabaseUrl}/functions/v1/create-terminal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authData.session.access_token}`,
      'apikey': supabaseAnonKey,
    },
    body: JSON.stringify({
      name: 'Test Terminal 2',
      location_id: 'test-location-id',
    }),
  });

  const fetchResult = await response.json();
  console.log('Status:', response.status);
  console.log('Result:', response.ok ? '✅ Success' : `❌ ${fetchResult.error || 'Failed'}`);
  console.log('Data:', JSON.stringify(fetchResult, null, 2));

  // Test 3: Verify session in SSR context would work
  console.log('\n--- Test 3: Session info ---');
  const { data: { session } } = await supabase.auth.getSession();
  console.log('Session exists:', !!session);
  console.log('Access token exists:', !!session?.access_token);
  console.log('Access token length:', session?.access_token?.length || 0);

  await supabase.auth.signOut();
  console.log('\n✅ Test complete');
}

testEdgeFunction().catch(console.error);

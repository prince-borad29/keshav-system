import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // We now expect the 'email' to be passed from the React frontend
    const { memberId, projectId, email, fullName, gender, mandalId } = await req.json()

    // 1. Generate secure password: Keshav@ + 6 random numbers
    const randomNums = Math.floor(100000 + Math.random() * 900000);
    const generatedPassword = `Keshav@${randomNums}`;

    // 2. Initialize Supabase Admin Client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 3. Create the user in Supabase Auth using the provided email
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: generatedPassword,
      email_confirm: true, 
    })

    if (authError) throw authError;
    const newUserId = authData.user.id;

    // 4. Create their User Profile
    const { error: profileError } = await supabaseAdmin.from('user_profiles').insert({
      id: newUserId,
      email: email,
      full_name: fullName,
      gender: gender,
      role: 'sanchalak', // Default role for Gosthi managers
      assigned_mandal_id: mandalId,
      member_id: memberId
    })
    if (profileError) throw profileError;

    // 5. Assign them strictly to this Gosthi project
    const { error: assignmentError } = await supabaseAdmin.from('project_assignments').insert({
      project_id: projectId,
      user_id: newUserId,
      role: 'Gosthi Manager',
      permissions: { "view_data": true, "create_event": true, "mark_attendance": true, "register_members": true }
    })
    if (assignmentError) throw assignmentError;

    // 6. Return the credentials to React so the Admin can see the password
    return new Response(
      JSON.stringify({ 
        success: true, 
        email: email, 
        password: generatedPassword 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
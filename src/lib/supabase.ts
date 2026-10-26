import { createClient } from '@supabase/supabase-js'

// Both values are public by design. Row-level security in the database keeps each workspace's rows private.
const SUPABASE_URL = 'https://abkufmshzvkgqrfdsdof.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_OD8g1NO3Fh1mX8KB_XbiKw_27wVhbSf'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

// Where Supabase email links (confirm, reset password) send people back to.
export const appUrl = window.location.origin + import.meta.env.BASE_URL

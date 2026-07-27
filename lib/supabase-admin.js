import { createClient } from '@supabase/supabase-js'
// ⚠️ 只能在 app/api/ 目录下的文件里 import
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
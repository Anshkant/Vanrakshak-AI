'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { rateLimit, getIP } from '@/utils/rate-limiter'
import { headers } from 'next/headers'

export async function resolveAlert(alertId: string) {
  // 1. Rate Limiting
  const headerList = await headers()
  const ip = getIP(headerList)
  const limit = await rateLimit(`resolve-alert-${ip}`, 10, 60000)

  if (!limit.success) {
    return { error: 'Too many requests. Please wait a minute.' }
  }

  const supabase = await createClient()
  
  // 2. Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // 3. Security Check: Ensure user is Super Admin or Alert is in their zone
  const [{ data: profile }, { data: alert }] = await Promise.all([
    supabase.from('profiles').select('role, zone_id').eq('id', user.id).single(),
    supabase.from('alerts').select('zone_id').eq('id', alertId).single()
  ])

  if (!profile || !alert) return { error: 'Entity not found' }

  const isAuthorized = 
    profile.role === 'super_admin' || 
    profile.zone_id === alert.zone_id

  if (!isAuthorized) {
    return { error: 'Access denied. You can only resolve alerts in your assigned zone.' }
  }

  // 4. Update alert status to 'resolved'
  const { error } = await supabase
    .from('alerts')
    .update({ status: 'resolved' })
    .eq('id', alertId)

  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  revalidatePath('/live-alerts')
  return { success: true }
}

'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { rateLimit, getIP } from '@/utils/rate-limiter'
import { headers } from 'next/headers'

// 1. Validation Schemas
const CreatePersonnelSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Full name is too short'),
  role: z.enum(['super_admin', 'field_ranger']),
  zone_id: z.string().min(1, 'Zone ID is required'),
  chatId: z.string().min(1, 'Telegram Chat ID is required'),
})

const CameraSchema = z.object({
  name: z.string().min(2, 'Camera name is too short'),
  location: z.string().min(2, 'Location is required'),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  status: z.enum(['online', 'offline', 'maintenance']).default('online'),
  feed_url: z.string().url('Invalid camera feed URL'),
  zone_id: z.string().min(1, 'Zone ID is required'),
})

export async function createPersonnel(formData: FormData) {
  // 2. Rate Limiting (Server Side)
  const headerList = await headers()
  const ip = getIP(headerList)
  const limit = await rateLimit(`admin-action-${ip}`, 5, 60000) // 5 creations per min

  if (!limit.success) {
    return { error: 'Too many requests. Please wait a minute.' }
  }

  const supabase = await createClient()
  
  // 3. Verify requester is a Super Admin
  const { data: { user: requester } } = await supabase.auth.getUser()
  if (!requester) return { error: 'Unauthorized' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', requester.id)
    .single()

  if (profile?.role !== 'super_admin') {
    return { error: 'Access denied. Super Admin privileges required.' }
  }

  // 4. Data Validation
  const validatedFields = CreatePersonnelSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
    role: formData.get('role'),
    zone_id: formData.get('zone_id'),
    chatId: formData.get('chatId'),
  })

  if (!validatedFields.success) {
    return { error: validatedFields.error.flatten().fieldErrors }
  }

  const { email, password, fullName, role, zone_id, chatId } = validatedFields.data

  // 5. Create User via Admin Client
  const adminClient = createAdminClient()
  const { data: newUser, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName }
  })

  if (authError) return { error: authError.message }

  // 6. Create Profile
  const { error: profileError } = await adminClient
    .from('profiles')
    .insert([
      {
        id: newUser.user.id,
        full_name: fullName,
        role,
        zone_id: zone_id,
        chat_id: chatId
      }
    ])

  if (profileError) {
    await adminClient.auth.admin.deleteUser(newUser.user.id)
    return { error: profileError.message }
  }

  // 7. AUDIT LOGGING
  await adminClient.from('audit_logs').insert({
    user_id: requester.id,
    action: 'CREATE_PERSONNEL',
    target_id: newUser.user.id,
    details: { fullName, email, role, zone_id },
    ip_address: ip
  })

  revalidatePath('/team')
  return { success: `Personnel '${fullName}' created successfully.` }
}

export async function deletePersonnel(userId: string) {
  const headerList = await headers()
  const ip = getIP(headerList)
  const supabase = await createClient()
  
  // 1. Verify requester is a Super Admin
  const { data: { user: requester } } = await supabase.auth.getUser()
  if (!requester) return { error: 'Unauthorized' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', requester.id)
    .single()

  if (profile?.role !== 'super_admin') {
    return { error: 'Access denied. Super Admin privileges required.' }
  }

  // 2. Prevent self-deletion
  if (requester.id === userId) return { error: 'You cannot delete yourself.' }

  // 3. Delete via Admin Client
  const adminClient = createAdminClient()
  const { error } = await adminClient.auth.admin.deleteUser(userId)

  if (error) return { error: error.message }

  // 4. AUDIT LOGGING
  await adminClient.from('audit_logs').insert({
    user_id: requester.id,
    action: 'DELETE_PERSONNEL',
    target_id: userId,
    ip_address: ip
  })

  revalidatePath('/team')
  return { success: 'Personnel removed successfully.' }
}

export async function updatePersonnelChatId(userId: string, chatId: string) {
  const headerList = await headers()
  const ip = getIP(headerList)
  const supabase = await createClient()
  
  // 1. Verify requester is a Super Admin
  const { data: { user: requester } } = await supabase.auth.getUser()
  if (!requester) return { error: 'Unauthorized' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', requester.id)
    .single()

  if (profile?.role !== 'super_admin') {
    return { error: 'Access denied. Super Admin privileges required.' }
  }

  // 2. Update via Admin Client
  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('profiles')
    .update({ chat_id: chatId })
    .eq('id', userId)

  if (error) return { error: error.message }

  // 3. AUDIT LOGGING
  await adminClient.from('audit_logs').insert({
    user_id: requester.id,
    action: 'UPDATE_PERSONNEL_CHAT_ID',
    target_id: userId,
    details: { chatId },
    ip_address: ip
  })

  revalidatePath('/team')
  return { success: 'Personnel Telegram ID updated successfully.' }
}

export async function createCamera(formData: FormData) {
  const headerList = await headers()
  const ip = getIP(headerList)
  const supabase = await createClient()
  
  const { data: { user: requester } } = await supabase.auth.getUser()
  if (!requester) return { error: 'Unauthorized' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', requester.id)
    .single()

  if (profile?.role !== 'super_admin') {
    return { error: 'Access denied. Super Admin privileges required.' }
  }

  const validatedFields = CameraSchema.safeParse({
    name: formData.get('name'),
    location: formData.get('location'),
    latitude: Number(formData.get('latitude')) || undefined,
    longitude: Number(formData.get('longitude')) || undefined,
    status: formData.get('status') || 'online',
    feed_url: formData.get('feed_url'),
    zone_id: formData.get('zone_id'),
  })

  if (!validatedFields.success) {
    return { error: validatedFields.error.flatten().fieldErrors }
  }

  const { error } = await supabase
    .from('cameras')
    .insert([validatedFields.data])

  if (error) return { error: error.message }

  await supabase.from('audit_logs').insert({
    user_id: requester.id,
    action: 'CREATE_CAMERA',
    details: validatedFields.data,
    ip_address: ip
  })

  revalidatePath('/settings')
  return { success: 'Camera registered successfully.' }
}

export async function updateCamera(id: string, formData: FormData) {
  const headerList = await headers()
  const ip = getIP(headerList)
  const supabase = await createClient()
  
  const { data: { user: requester } } = await supabase.auth.getUser()
  if (!requester) return { error: 'Unauthorized' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', requester.id)
    .single()

  if (profile?.role !== 'super_admin') {
    return { error: 'Access denied. Super Admin privileges required.' }
  }

  const validatedFields = CameraSchema.safeParse({
    name: formData.get('name'),
    location: formData.get('location'),
    latitude: Number(formData.get('latitude')) || undefined,
    longitude: Number(formData.get('longitude')) || undefined,
    status: formData.get('status'),
    feed_url: formData.get('feed_url'),
    zone_id: formData.get('zone_id'),
  })

  if (!validatedFields.success) {
    return { error: validatedFields.error.flatten().fieldErrors }
  }

  const { error } = await supabase
    .from('cameras')
    .update(validatedFields.data)
    .eq('id', id)

  if (error) return { error: error.message }

  await supabase.from('audit_logs').insert({
    user_id: requester.id,
    action: 'UPDATE_CAMERA',
    target_id: id,
    details: validatedFields.data,
    ip_address: ip
  })

  revalidatePath('/settings')
  return { success: 'Camera updated successfully.' }
}

export async function deleteCamera(id: string) {
  const headerList = await headers()
  const ip = getIP(headerList)
  const supabase = await createClient()
  
  const { data: { user: requester } } = await supabase.auth.getUser()
  if (!requester) return { error: 'Unauthorized' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', requester.id)
    .single()

  if (profile?.role !== 'super_admin') {
    return { error: 'Access denied. Super Admin privileges required.' }
  }

  const { error } = await supabase
    .from('cameras')
    .delete()
    .eq('id', id)

  if (error) return { error: error.message }

  await supabase.from('audit_logs').insert({
    user_id: requester.id,
    action: 'DELETE_CAMERA',
    target_id: id,
    ip_address: ip
  })

  revalidatePath('/settings')
  return { success: 'Camera removed from network.' }
}

export async function toggleCameraStatus(id: string, currentStatus: string) {
  const headerList = await headers()
  const ip = getIP(headerList)
  const supabase = await createClient()
  
  const { data: { user: requester } } = await supabase.auth.getUser()
  if (!requester) return { error: 'Unauthorized' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', requester.id)
    .single()

  if (profile?.role !== 'super_admin') {
    return { error: 'Access denied. Super Admin privileges required.' }
  }

  const newStatus = currentStatus === 'online' ? 'offline' : 'online'

  const { error } = await supabase
    .from('cameras')
    .update({ status: newStatus })
    .eq('id', id)

  if (error) return { error: error.message }

  await supabase.from('audit_logs').insert({
    user_id: requester.id,
    action: 'TOGGLE_CAMERA_STATUS',
    target_id: id,
    details: { oldStatus: currentStatus, newStatus },
    ip_address: ip
  })

  revalidatePath('/settings')
  return { success: `Camera ${newStatus === 'online' ? 'Activated' : 'Switched Off'}` }
}

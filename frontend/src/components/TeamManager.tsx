'use client'

import { useState } from 'react'
import { Navigation } from "@/components/Navigation"
import { createPersonnel, deletePersonnel, updatePersonnelChatId } from '@/app/actions/admin'

interface TeamMember {
  id: string
  full_name: string
  email?: string
  role: string
  zone_id: string
  chat_id?: string
}

interface TeamManagerProps {
  initialMembers: TeamMember[]
  userProfile: { id: string, role: string, zone_id: string }
}

export function TeamManager({ initialMembers, userProfile }: TeamManagerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editChatId, setEditChatId] = useState('')

  const isSuperAdmin = userProfile.role.toLowerCase() === 'super_admin'

  const filteredMembers = initialMembers.filter(m => 
    m.full_name?.toLowerCase().includes(search.toLowerCase()) || 
    m.role?.toLowerCase().includes(search.toLowerCase())
  )

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete ${name}? This action is permanent.`)) {
      const result = await deletePersonnel(id)
      if (result.error) setMessage({ type: 'error', text: result.error })
      else setMessage({ type: 'success', text: result.success || 'Deleted' })
    }
  }

  return (
    <div className="layout-container flex h-full grow flex-col">
      <Navigation />
      
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 md:px-10 py-6 md:py-8 space-y-8 w-full">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Team Management</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">Conservation task force for Zone {userProfile.zone_id}.</p>
          </div>
          <div className="flex gap-3">
            {isSuperAdmin && (
              <button 
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl font-black text-sm shadow-xl shadow-primary/20 hover:brightness-110 transition-all"
              >
                <span className="material-symbols-outlined text-lg">person_add</span> Recruit Sentinel
              </button>
            )}
          </div>
        </div>

        {/* Message HUD */}
        {message && (
          <div className={`p-4 rounded-xl border animate-in slide-in-from-top-4 duration-300 ${
            message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-red-500/10 border-red-500/20 text-red-500'
          }`}>
            <div className="flex items-center justify-between font-bold text-sm">
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined">{message.type === 'success' ? 'check_circle' : 'error'}</span>
                {message.text}
              </span>
              <button onClick={() => setMessage(null)} className="opacity-50 hover:opacity-100">
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Total Force</p>
            <h3 className="text-3xl font-black tracking-tight">{initialMembers.length}</h3>
          </div>
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Field Rangers</p>
            <h3 className="text-3xl font-black tracking-tight">{initialMembers.filter(m => m.role === 'field_ranger').length}</h3>
          </div>
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Commanders</p>
            <h3 className="text-3xl font-black tracking-tight">{initialMembers.filter(m => m.role === 'super_admin').length}</h3>
          </div>
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Online Now</p>
            <h3 className="text-3xl font-black tracking-tight text-emerald-500 flex items-center gap-2">
              {Math.max(1, Math.round(initialMembers.length * 0.1))} 
              <span className="size-3 rounded-full bg-emerald-500 block animate-pulse"></span>
            </h3>
          </div>
        </div>

        {/* Directory Container */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden min-h-[400px]">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-wrap gap-4 items-center justify-between">
            <h3 className="text-xl font-black tracking-tight">Personnel Directory</h3>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
              <input 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search team members..." 
                className="pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary w-64 transition-all"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/10 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                  <th className="px-8 py-4">Sentinel Identity</th>
                  <th className="px-8 py-4">Role</th>
                  <th className="px-8 py-4">Telegram ID</th>
                  <th className="px-8 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredMembers.map((member) => (
                  <tr key={member.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                         <div className="size-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-black text-slate-500 text-xs">
                           {member.full_name?.substring(0,2).toUpperCase()}
                         </div>
                         <div>
                            <p className="font-bold text-slate-900 dark:text-white capitalize">{member.full_name}</p>
                            <p className="text-[10px] font-mono text-slate-400">{member.id.substring(0,8)}</p>
                         </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${member.role === 'super_admin' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-600'}`}>
                        {member.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      {isSuperAdmin ? (
                        <div className="flex items-center gap-2">
                          {editingId === member.id ? (
                            <>
                              <input 
                                value={editChatId}
                                onChange={(e) => setEditChatId(e.target.value)}
                                className="w-24 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs"
                                placeholder="Chat ID"
                              />
                              <button 
                                onClick={async () => {
                                  const res = await updatePersonnelChatId(member.id, editChatId)
                                  if (res.error) setMessage({ type: 'error', text: res.error })
                                  else {
                                    setMessage({ type: 'success', text: res.success || 'Updated' })
                                    setEditingId(null)
                                  }
                                }}
                                className="text-emerald-500 hover:text-emerald-600"
                              >
                                <span className="material-symbols-outlined text-sm">check</span>
                              </button>
                              <button onClick={() => setEditingId(null)} className="text-slate-400">
                                <span className="material-symbols-outlined text-sm">close</span>
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="text-xs font-mono text-slate-500">{member.chat_id || 'Not Set'}</span>
                              <button 
                                onClick={() => {
                                  setEditingId(member.id)
                                  setEditChatId(member.chat_id || '')
                                }}
                                className="text-slate-400 hover:text-primary transition-colors"
                              >
                                <span className="material-symbols-outlined text-[14px]">edit</span>
                              </button>
                            </>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs font-mono text-slate-500">{member.chat_id || 'Not Set'}</span>
                      )}
                    </td>
                    <td className="px-8 py-5 text-right">
                      {isSuperAdmin && member.id !== userProfile.id && (
                        <button 
                          onClick={() => handleDelete(member.id, member.full_name)}
                          className="size-8 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all flex items-center justify-center ml-auto"
                        >
                          <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Recruit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-[2rem] p-8 border border-white/10 shadow-2xl overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-primary"></div>
            
            <div className="mb-6">
              <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Recruit Sentinel</h3>
              <p className="text-sm text-slate-500 font-medium">Register new authorized personnel to Zone {userProfile.zone_id}.</p>
            </div>

            <form action={async (formData) => {
              setFormLoading(true)
              const result = await createPersonnel(formData)
              setFormLoading(false)
              if (result.error) {
                const errorText = typeof result.error === 'string' 
                  ? result.error 
                  : Object.values(result.error).flat().join(', ')
                setMessage({ type: 'error', text: errorText })
              } else {
                setMessage({ type: 'success', text: result.success || 'Created' })
                setIsModalOpen(false)
              }
            }} className="space-y-4">
              <input type="hidden" name="zone_id" value={userProfile.zone_id} />
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-black tracking-widest text-slate-500 ml-1">Full Name</label>
                <input name="fullName" required placeholder="Arjun Sharma" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-black tracking-widest text-slate-500 ml-1">Sentinel Email</label>
                <input name="email" type="email" required placeholder="ranger@vanrakshak.ai" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-black tracking-widest text-slate-500 ml-1">Initial Passkey</label>
                <input name="password" type="password" required placeholder="••••••••" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-black tracking-widest text-slate-500 ml-1">Telegram Chat ID (Required)</label>
                <input name="chatId" required placeholder="12345678" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-black tracking-widest text-slate-500 ml-1">Command Authorization</label>
                <select name="role" required className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none cursor-pointer">
                  <option value="field_ranger">Field Ranger (Standard)</option>
                  <option value="super_admin">Super Admin (Full Control)</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-3 bg-slate-100 dark:bg-slate-800 rounded-2xl font-bold text-sm hover:bg-slate-200 transition-all">Abort</button>
                <button 
                  disabled={formLoading}
                  type="submit" 
                  className="flex-[2] px-4 py-3 bg-primary text-white rounded-2xl font-black text-sm shadow-xl shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {formLoading ? 'RECRUITING...' : 'FINALIZE ENLISTMENT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

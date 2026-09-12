"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        setUser(session.user);
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        
        if (profileData) setProfile(profileData);
      }
      setLoading(false);
    };

    fetchUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user?.id) {
        setProfile(null);
      } else {
        // Fetch profile if session exists but profile doesn't
        supabase.from('profiles').select('*').eq('id', session.user.id).single()
          .then(({ data }) => setProfile(data));
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  // Close menu when route changes
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  // Lock body scroll when menu is open
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isMenuOpen]);

  const isHome = pathname === '/';

  if (isHome) {
    return (
      <header className="sticky top-0 z-50 w-full border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-background-dark/80 backdrop-blur-md px-6 md:px-20 py-4">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-8">
          <div className="flex items-center gap-10">
            <Link href="/" className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary text-3xl">shield_with_heart</span>
              <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white uppercase">VanRakshak AI</h2>
            </Link>
            <nav className="hidden lg:flex items-center gap-8">
              <Link className="text-sm font-semibold hover:text-primary transition-colors" href="/dashboard">Dashboard</Link>
              <Link className="text-sm font-semibold hover:text-primary transition-colors" href="#mission">Mission</Link>
              <Link className="text-sm font-semibold hover:text-primary transition-colors" href="#tech-stack">Tech Stack</Link>
            </nav>
          </div>
          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2 w-64">
              <span className="material-symbols-outlined text-slate-500 text-xl">search</span>
              <input className="bg-transparent border-none focus:ring-0 text-sm w-full placeholder:text-slate-500 outline-none" placeholder="Search ecosystems..." type="text" />
            </div>
            {user ? (
              <Link href="/dashboard" className="bg-primary text-white px-6 py-2.5 rounded-lg text-sm font-bold hover:brightness-110 transition-all shadow-lg shadow-primary/20">
                Go to Dashboard
              </Link>
            ) : (
              <Link href="/login" className="bg-primary text-white px-6 py-2.5 rounded-lg text-sm font-bold hover:brightness-110 transition-all shadow-lg shadow-primary/20">
                Personnel Login
              </Link>
            )}
            {user && (
              <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden border-2 border-primary" aria-label="User profile">
                <img alt="Profile" className="w-full h-full object-cover" src={profile?.avatar_url || "https://lh3.googleusercontent.com/aida-public/AB6AXuBdgIvuP7nkbnUx2wzWzfD2bIuNZgrKONVbDkNR4QdClV9rrM7SAqXSeqOTh_3xzdNeXE1dfyUy-l3x_5fkOrggGQt734SC9_zm8Dcb09CRiIGio5a2pFG6qtzACyVBnCobbuov59RF6yJhoO8hp_wpe3lXCuZj3RCnWKSiOLyTtbrFHuq1HY1s-VcV6NYSCOnoFB8HrJEHqssaP1usM_NFwqmzey_Tb3Ut9saqKGgFSjHIOo0ErH7O_5HhROwlW-tcAJ5n-1_PRaY"} />
              </div>
            )}
            <button 
              onClick={() => setIsMenuOpen(true)}
              className="lg:hidden size-10 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
          </div>
        </div>
      </header>
    );
  }

  const navLinks = [
    { name: 'Dashboard', path: '/dashboard', icon: 'dashboard' },
    { name: 'Analytics', path: '/analytics', icon: 'bar_chart' },
    { name: 'Reports', path: '/reports', icon: 'list_alt' },
    { name: 'Cameras', path: '/cameras', icon: 'videocam' },
    { name: 'Alerts', path: '/live-alerts', icon: 'notifications' },
    { name: 'Team', path: '/team', icon: 'group' },
    { name: 'Settings', path: '/settings', icon: 'settings' },
  ];

  const mobileNavLinks = [
    { name: 'Home', path: '/dashboard', icon: 'home' },
    { name: 'Alerts', path: '/live-alerts', icon: 'notifications' },
    { name: 'Analytics', path: '/analytics', icon: 'bar_chart' },
    { name: 'Cameras', path: '/cameras', icon: 'videocam' },
    { name: 'Team', path: '/team', icon: 'group' },
  ];

  return (
    <>
      <header className="glass-nav">
        <div className="w-full px-4 md:px-10 h-16 flex items-center justify-between gap-4 max-w-[1550px] mx-auto">
          {/* Logo and Desktop Menu */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-3 shrink-0">
              <div className="bg-primary p-1.5 rounded-lg text-white flex items-center justify-center">
                <span className="material-symbols-outlined !text-xl">forest</span>
              </div>
              <h2 className="text-slate-900 dark:text-white text-xl font-bold tracking-tight shrink-0">VanRakshak AI</h2>
            </Link>
            
            <nav className="hidden lg:flex items-center gap-6">
              {navLinks.map((link) => {
                const isActive = pathname === link.path;
                return (
                  <Link 
                    key={link.path}
                    href={link.path}
                    className={isActive 
                      ? "text-primary text-[10px] font-black uppercase tracking-widest border-b-2 border-primary h-16 flex items-center whitespace-nowrap" 
                      : "text-slate-600 dark:text-slate-400 hover:text-primary dark:hover:text-primary text-[10px] font-black uppercase tracking-widest transition-all h-16 flex items-center whitespace-nowrap border-b-2 border-transparent"
                    }
                  >
                    {link.name}
                  </Link>
                );
              })}
            </nav>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden xl:flex items-center gap-2 px-3 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-tighter">Mission Uplink: Stable</span>
            </div>
            <button 
              onClick={() => setIsMenuOpen(true)}
              className="lg:hidden size-10 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            <div className="relative hidden md:block">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">search</span>
              <input className="bg-slate-100 dark:bg-slate-800 border-none rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary w-48 xl:w-64" placeholder="Search..." type="text"/>
            </div>
            <button 
              onClick={handleLogout}
              className="hidden sm:flex relative p-2 text-slate-500 hover:bg-red-50 dark:hover:bg-red-900/10 hover:text-red-500 rounded-lg transition-colors group"
              title="Logout"
            >
              <span className="material-symbols-outlined">logout</span>
            </button>
            <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 mx-1 hidden sm:block"></div>
            <Link href="/settings" className="flex items-center gap-3 pl-2 cursor-pointer group lowercase">
              <div className="text-right hidden sm:block">
                <p className="text-[11px] font-black text-slate-900 dark:text-white leading-none group-hover:text-primary transition-colors uppercase tracking-tight">
                  {profile?.full_name || user?.email?.split('@')[0] || "Personnel User"}
                </p>
                <p className="text-[9px] text-slate-500 uppercase font-mono mt-1 font-bold">
                  {loading ? 'LOADING...' : (profile?.role?.toLowerCase() === 'super_admin' || profile?.role?.toLowerCase() === 'superadmin' ? 'S.ADMIN' : 'F.RANGER')} // {profile?.zone_id || 'Z-01'}
                </p>
              </div>
              <img className="w-10 h-10 rounded-full object-cover border-2 border-primary/20 group-hover:border-primary shadow-lg shadow-primary/5 transition-all" alt="Admin" src={profile?.avatar_url || "https://lh3.googleusercontent.com/aida-public/AB6AXuBdgIvuP7nkbnUx2wzWzfD2bIuNZgrKONVbDkNR4QdClV9rrM7SAqXSeqOTh_3xzdNeXE1dfyUy-l3x_5fkOrggGQt734SC9_zm8Dcb09CRiIGio5a2pFG6qtzACyVBnCobbuov59RF6yJhoO8hp_wpe3lXCuZj3RCnWKSiOLyTtbrFHuq1HY1s-VcV6NYSCOnoFB8HrJEHqssaP1usM_NFwqmzey_Tb3Ut9saqKGgFSjHIOo0ErH7O_5HhROwlW-tcAJ5n-1_PRaY"}/>
            </Link>
          </div>
        </div>
      </header>

      {/* Fixed Bottom Navigation for Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-primary/10 px-4 py-2 flex items-center justify-around lg:hidden h-[72px] pb-[env(safe-area-inset-bottom)]">
        {mobileNavLinks.map((link) => {
          const isActive = pathname === link.path;
          return (
            <Link 
              key={link.path}
              href={link.path}
              className={`flex flex-col items-center gap-1 transition-all ${
                isActive ? 'text-primary' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <div className={`p-1.5 rounded-xl transition-all ${isActive ? 'bg-primary/10' : ''}`}>
                <span className={`material-symbols-outlined !text-2xl ${isActive ? 'fill-1' : ''}`}>
                  {link.icon}
                </span>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-tight">
                {link.name}
              </span>
            </Link>
          );
        })}
      </nav>
      {/* Mobile Side Drawer (Hamburger Menu) */}
      <div className={`fixed inset-0 z-[60] lg:hidden transition-all duration-300 ${isMenuOpen ? 'visible opacity-100' : 'invisible opacity-0'}`}>
        {/* Backdrop */}
        <div 
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={() => setIsMenuOpen(false)}
        ></div>
        
        {/* Drawer Content */}
        <div className={`absolute top-0 right-0 w-[280px] h-full bg-white dark:bg-[#0a141c] shadow-2xl transition-transform duration-300 ease-out transform ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="p-6 flex flex-col h-full">
            <div className="flex items-center justify-between mb-8">
              <span className="text-sm font-bold uppercase tracking-widest text-slate-500">Menu</span>
              <button 
                onClick={() => setIsMenuOpen(false)}
                className="size-10 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <nav className="flex flex-col gap-2">
              {navLinks.map((link) => {
                const isActive = pathname === link.path;
                return (
                  <Link 
                    key={link.path}
                    href={link.path}
                    className={`flex items-center gap-4 px-4 py-3 rounded-xl font-bold transition-all ${
                      isActive 
                        ? 'bg-primary/10 text-primary shadow-sm shadow-primary/5 border border-primary/20' 
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <span className={`material-symbols-outlined !text-2xl ${isActive ? 'fill-1' : ''}`}>
                      {link.icon}
                    </span>
                    <span className="text-base">{link.name}</span>
                  </Link>
                );
              })}
            </nav>
            
            <div className="mt-auto pt-6 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
                <img className="size-10 rounded-full border border-primary/20" alt="Admin" src={profile?.avatar_url || "https://lh3.googleusercontent.com/aida-public/AB6AXuBdgIvuP7nkbnUx2wzWzfD2bIuNZgrKONVbDkNR4QdClV9rrM7SAqXSeqOTh_3xzdNeXE1dfyUy-l3x_5fkOrggGQt734SC9_zm8Dcb09CRiIGio5a2pFG6qtzACyVBnCobbuov59RF6yJhoO8hp_wpe3lXCuZj3RCnWKSiOLyTtbrFHuq1HY1s-VcV6NYSCOnoFB8HrJEHqssaP1usM_NFwqmzey_Tb3Ut9saqKGgFSjHIOo0ErH7O_5HhROwlW-tcAJ5n-1_PRaY"}/>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white capitalize">{profile?.full_name || user?.email?.split('@')[0] || "Personnel User"}</p>
                  <p className="text-[10px] text-slate-500 uppercase">
                    {profile?.role?.toLowerCase() === 'super_admin' ? 'Super Admin' : 'Field Ranger'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Spacer for bottom nav */}
      <div className="h-[72px] lg:hidden"></div>
    </>
  );
}

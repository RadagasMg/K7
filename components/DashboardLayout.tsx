'use client';

import { useAuth } from '@/contexts/AuthContext';
import { usePathname, useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { LayoutDashboard, LogOut, Package } from 'lucide-react';
import Link from 'next/link';

import { ThemeToggle } from '@/components/ThemeToggle';

export interface TabItem {
  id: string;
  label: string;
  icon: React.ElementType;
}

export function DashboardLayout({ 
  children, 
  title,
  tabs,
  activeTab,
  onTabChange
}: { 
  children: React.ReactNode, 
  title?: string,
  tabs?: TabItem[],
  activeTab?: string,
  onTabChange?: (tab: string) => void
}) {
  const { profile, loading } = useAuth();
  const pathname = usePathname();

  if (loading) return <div className="p-8 text-gray-900 dark:text-gray-100">Chargement...</div>;
  if (!profile) return <>{children}</>;

  const getDashboardLink = () => {
    if (profile.role === 'admin') return '/admin';
    if (profile.role === 'agent') return '/agent';
    return '/client';
  };

  const navItems = tabs && tabs.length > 0 
    ? tabs.map(tab => ({ ...tab, isTab: true }))
    : [{ id: 'dashboard', href: getDashboardLink(), label: 'Tableau de bord', icon: LayoutDashboard }];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 md:flex">
        <div className="flex h-16 items-center justify-between border-b border-gray-200 dark:border-gray-800 px-4">
          <div className="flex items-center">
            <Package className="mr-2 h-6 w-6 text-blue-600 dark:text-blue-500" />
            <span className="text-lg font-bold text-gray-900 dark:text-white">K7</span>
          </div>
          <ThemeToggle />
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item: any) => {
            const isActive = item.isTab ? activeTab === item.id : pathname === item.href;
            
            if (item.isTab) {
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange && onTabChange(item.id)}
                  className={`flex w-full items-center rounded-lg px-4 py-3 text-sm font-medium ${
                    isActive ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                >
                  <item.icon className={`mr-3 h-5 w-5 ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />
                  {item.label}
                </button>
              );
            }
            
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center rounded-lg px-4 py-3 text-sm font-medium ${
                  isActive ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                }`}
              >
                <item.icon className={`mr-3 h-5 w-5 ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-gray-200 dark:border-gray-800 p-4">
          <div className="mb-4 px-4 text-sm text-gray-500 dark:text-gray-400">
            Connecté en tant que <br/>
            <span className="font-semibold text-gray-900 dark:text-white">{profile.name}</span>
          </div>
          <button
            onClick={() => auth.signOut()}
            className="flex w-full items-center rounded-lg px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <LogOut className="mr-3 h-5 w-5 text-red-500 dark:text-red-400" />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 z-50 flex w-full border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 pb-2 pt-2 md:hidden overflow-x-auto whitespace-nowrap scrollbar-hide">
        <div className="flex min-w-full px-2">
        {navItems.map((item: any) => {
          const isActive = item.isTab ? activeTab === item.id : pathname === item.href;
          
          if (item.isTab) {
            return (
              <button
                key={item.id}
                onClick={() => onTabChange && onTabChange(item.id)}
                className={`flex w-20 flex-col items-center justify-center py-2 text-xs font-medium flex-shrink-0 ${
                  isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                <item.icon className={`mb-1 h-6 w-6 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />
                <span className="truncate w-full text-center px-1">{item.label}</span>
              </button>
            );
          }
          
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex w-20 flex-col items-center justify-center py-2 text-xs font-medium flex-shrink-0 ${
                isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              <item.icon className={`mb-1 h-6 w-6 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />
              <span className="truncate w-full text-center px-1">{item.label}</span>
            </Link>
          );
        })}
        <div className="flex w-20 flex-col items-center justify-center py-2 flex-shrink-0">
          <ThemeToggle />
        </div>
        <button
          onClick={() => auth.signOut()}
          className="flex w-20 flex-col items-center justify-center py-2 text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 flex-shrink-0"
        >
          <LogOut className="mb-1 h-6 w-6 text-red-500 dark:text-red-400" />
          <span className="truncate w-full text-center px-1">Quitter</span>
        </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="mb-20 md:mb-0 md:ml-64">
        <div className="p-4 md:p-8">
          {title && (
            <div className="mb-6 flex items-center justify-between md:block">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white md:text-3xl">{title}</h1>
              <div className="md:hidden">
                {/* Theme toggle is in bottom nav on mobile, but we could put it here too if preferred. Bottom nav is fine. */}
              </div>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}

'use client';

import { useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { useAuthStore } from '@/store/useAuthStore';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import ScheduleView from '@/components/ScheduleView';
import WorkersView from '@/components/WorkersView';
import FinanceView from '@/components/FinanceView';
import Login from '@/components/Login';

export default function Home() {
  const activeTab = useStore((state) => state.activeTab);
  const isLoading = useStore((state) => state.isLoading);
  const loadData = useStore((state) => state.loadData);
  
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin';

  // Load data when user logs in
  useEffect(() => {
    if (user) {
      loadData(user.workerId, user.role === 'admin');
    }
  }, [user, loadData]);

  // Show login if not authenticated
  if (!user) {
    return <Login />;
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Laster data...</p>
        </div>
      </div>
    );
  }

  // Determine which tabs to show based on user role
  // Admin sees all tabs, project leaders only see Kalender and Økonomi
  const visibleTabs: ('schedule' | 'workers' | 'finance')[] = isAdmin 
    ? ['schedule', 'workers', 'finance']
    : ['schedule', 'finance'];

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar visibleTabs={visibleTabs} />
      <div className="flex-1 flex flex-col overflow-hidden md:ml-0">
        {/* Desktop: Fixed header */}
        <div className="hidden md:block">
          <Header />
        </div>
        
        {/* Main content area */}
        <main className="flex-1 overflow-auto">
          {/* Mobile: Scrollable header */}
          <div className="md:hidden">
            <Header />
          </div>
          
          {/* Content views - make them fill the space properly */}
          <div className="h-full md:h-auto">
            {activeTab === 'schedule' && <ScheduleView />}
            {activeTab === 'workers' && isAdmin && <WorkersView />}
            {activeTab === 'finance' && <FinanceView />}
          </div>
        </main>
      </div>
    </div>
  );
}

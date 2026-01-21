'use client';

import { useEffect } from 'react';
import { useStore } from '@/store/useStore';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import ScheduleView from '@/components/ScheduleView';
import WorkersView from '@/components/WorkersView';
import FinanceView from '@/components/FinanceView';

export default function Home() {
  const activeTab = useStore((state) => state.activeTab);
  const isLoading = useStore((state) => state.isLoading);
  const loadData = useStore((state) => state.loadData);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden md:ml-0">
        <Header />
        <main className="flex-1 overflow-hidden">
          {activeTab === 'schedule' && <ScheduleView />}
          {activeTab === 'workers' && <WorkersView />}
          {activeTab === 'finance' && <FinanceView />}
        </main>
      </div>
    </div>
  );
}

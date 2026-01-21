'use client';

import { useStore } from '@/store/useStore';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import ScheduleView from '@/components/ScheduleView';
import WorkersView from '@/components/WorkersView';
import FinanceView from '@/components/FinanceView';

export default function Home() {
  const activeTab = useStore((state) => state.activeTab);

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

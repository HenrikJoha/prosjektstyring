'use client';

import { useStore } from '@/store/useStore';
import { Calendar, Users, PieChart } from 'lucide-react';
import clsx from 'clsx';

const tabs = [
  { id: 'schedule' as const, label: 'Kalender', icon: Calendar },
  { id: 'workers' as const, label: 'Ansatte', icon: Users },
  { id: 'finance' as const, label: 'Økonomi', icon: PieChart },
];

export default function Sidebar() {
  const { activeTab, setActiveTab } = useStore();

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-20 bg-white border-r border-gray-200">
        <div className="p-4">
          <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xl">PS</span>
          </div>
        </div>
        <nav className="flex-1 flex flex-col gap-2 p-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'flex flex-col items-center gap-1 p-3 rounded-lg transition-colors',
                  activeTab === tab.id
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                )}
              >
                <Icon size={24} />
                <span className="text-xs font-medium">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        <div className="flex justify-around py-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'flex flex-col items-center gap-1 p-2 rounded-lg transition-colors min-w-[70px]',
                  activeTab === tab.id
                    ? 'text-blue-600'
                    : 'text-gray-500'
                )}
              >
                <Icon size={24} />
                <span className="text-xs font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}

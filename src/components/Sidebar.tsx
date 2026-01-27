'use client';

import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Calendar, Users, PieChart, Menu, X } from 'lucide-react';
import clsx from 'clsx';

const tabs = [
  { id: 'schedule' as const, label: 'Kalender', icon: Calendar },
  { id: 'workers' as const, label: 'Ansatte', icon: Users },
  { id: 'finance' as const, label: 'Økonomi', icon: PieChart },
];

interface SidebarProps {
  visibleTabs?: ('schedule' | 'workers' | 'finance')[];
}

export default function Sidebar({ visibleTabs }: SidebarProps) {
  const { activeTab, setActiveTab } = useStore();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Filter tabs if visibleTabs is provided
  const displayTabs = visibleTabs 
    ? tabs.filter(tab => visibleTabs.includes(tab.id))
    : tabs;

  const handleTabClick = (tabId: 'schedule' | 'workers' | 'finance') => {
    setActiveTab(tabId);
    setMobileNavOpen(false); // Close nav after selection on mobile
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-20 bg-gray-200 border-r border-gray-200">
        <div className="p-4">
          <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xl">PS</span>
          </div>
        </div>
        <nav className="flex-1 flex flex-col gap-2 p-2">
          {displayTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
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

      {/* Mobile Hamburger Button - Fixed at bottom left */}
      <button
        onClick={() => setMobileNavOpen(!mobileNavOpen)}
        className="md:hidden fixed bottom-4 left-4 z-50 w-12 h-12 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-blue-700 transition-colors"
        aria-label={mobileNavOpen ? 'Lukk meny' : 'Åpne meny'}
      >
        {mobileNavOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Mobile Bottom Navigation - Collapsible */}
      {mobileNavOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="md:hidden fixed inset-0 bg-black/30 z-40"
            onClick={() => setMobileNavOpen(false)}
          />
          
          {/* Navigation Panel */}
          <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-200 border-t border-gray-200 z-50 rounded-t-2xl shadow-2xl animate-slide-up">
            <div className="flex justify-around py-4 pb-6">
              {displayTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabClick(tab.id)}
                    className={clsx(
                      'flex flex-col items-center gap-1 p-3 rounded-lg transition-colors min-w-[80px]',
                      activeTab === tab.id
                        ? 'text-blue-600 bg-blue-50'
                        : 'text-gray-500'
                    )}
                  >
                    <Icon size={28} />
                    <span className="text-sm font-medium">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        </>
      )}
    </>
  );
}

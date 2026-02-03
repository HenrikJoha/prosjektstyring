'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { useAuthStore } from '@/store/useAuthStore';
import { formatCurrency } from '@/utils/dates';
import { LogOut, Settings, ChevronDown } from 'lucide-react';
import ProfileSettings from './ProfileSettings';

export default function Header() {
  const { activeTab, getTotalOrdrereserve } = useStore();
  const { user, logout } = useAuthStore();
  const totalOrdrereserve = getTotalOrdrereserve();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);

  // Close user menu when switching tabs so it never gets stuck open
  useEffect(() => {
    setShowUserMenu(false);
  }, [activeTab]);

  const getTitle = () => {
    switch (activeTab) {
      case 'schedule':
        return 'Prosjektkalender';
      case 'workers':
        return 'Ansatte';
      case 'finance':
        return 'Økonomi';
    }
  };

  return (
    <>
      <header className="bg-gray-200 border-b border-gray-200 px-4 md:px-6 py-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h1 className="text-xl md:text-2xl font-semibold text-gray-900">
            {getTitle()}
          </h1>
          
          <div className="flex items-center gap-4">
            {/* Ordrereserve - Hidden in Finance tab */}
            {activeTab !== 'finance' && (
              <div className="bg-blue-50 px-4 py-2 rounded-lg">
                <div className="text-xs text-blue-600 font-medium uppercase tracking-wide">
                  Ordrereserve
                </div>
                <div className="text-lg md:text-xl font-bold text-blue-700">
                  {formatCurrency(totalOrdrereserve)}
                </div>
              </div>
            )}

            {/* User Menu */}
            {user && (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                    style={{ backgroundColor: user.profileColor }}
                  >
                    {user.username.substring(0, 2).toUpperCase()}
                  </div>
                  <ChevronDown size={16} className="text-gray-500 hidden md:block" />
                </button>

                {showUserMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowUserMenu(false)}
                      aria-hidden
                    />
                    <div className="absolute left-0 md:left-auto md:right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-50 py-1">
                      <div className="px-4 py-3 border-b border-gray-100">
                        <div className="font-medium text-gray-900">{user.username}</div>
                        <div className="text-sm text-gray-500 capitalize">
                          {user.role === 'admin' ? 'Administrator' : 'Prosjektleder'}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          setShowProfileSettings(true);
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                      >
                        <Settings size={16} />
                        Kontoinnstillinger
                      </button>
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          logout();
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-red-600"
                      >
                        <LogOut size={16} />
                        Logg ut
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Profile Settings Modal */}
      {showProfileSettings && (
        <ProfileSettings onClose={() => setShowProfileSettings(false)} />
      )}
    </>
  );
}

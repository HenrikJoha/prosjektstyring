'use client';

import { useStore } from '@/store/useStore';
import { formatCurrency } from '@/utils/dates';

export default function Header() {
  const { activeTab, getTotalOrdrereserve } = useStore();
  const totalOrdrereserve = getTotalOrdrereserve();

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
    <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h1 className="text-xl md:text-2xl font-semibold text-gray-900">
          {getTitle()}
        </h1>
        
        <div className="flex items-center gap-4">
          <div className="bg-blue-50 px-4 py-2 rounded-lg">
            <div className="text-xs text-blue-600 font-medium uppercase tracking-wide">
              Ordrereserve
            </div>
            <div className="text-lg md:text-xl font-bold text-blue-700">
              {formatCurrency(totalOrdrereserve)}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

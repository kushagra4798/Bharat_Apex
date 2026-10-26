import React from 'react';
import { NAV_ITEMS, ViewPath } from './Sidebar';

export interface MobileNavProps {
  activeView: ViewPath;
  onSelectView: (view: ViewPath) => void;
}

const MOBILE_LABELS: Record<ViewPath, string> = {
  overview: 'Overview',
  'aps-scheduler': 'APS',
  'bom-inventory': 'BOM',
  'supplier-edi-hub': 'EDI',
  'fx-risk-hub': 'FX',
  'fleet-map': 'Fleet',
};

export const MobileNav: React.FC<MobileNavProps> = ({ activeView, onSelectView }) => {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-14 bg-surface-container-lowest dark:bg-[#0e1526] border-t border-outline-variant/30 dark:border-[#222e4a] z-50 flex items-center justify-around shadow-[0_-1px_8px_rgba(0,0,0,0.06)] px-1 select-none">
      {NAV_ITEMS.map((item) => {
        const isActive = activeView === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectView(item.id)}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
              isActive
                ? 'text-primary dark:text-indigo-400 font-bold'
                : 'text-secondary dark:text-[#94a3b8] hover:text-on-surface dark:hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[19px]">{item.icon}</span>
            <span className="text-[10px] font-medium leading-none mt-1">
              {MOBILE_LABELS[item.id]}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

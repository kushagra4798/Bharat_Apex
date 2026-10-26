import React, { useState, useEffect, useRef } from 'react';
import { BharatApexProvider, useBharatApex } from './context';
import { AppLayout } from './components/layout/AppLayout';
import { ViewPath } from './components/layout/Sidebar';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import {
  OverviewView,
  ApsSchedulerView,
  BomInventoryView,
  SupplierEdiHubView,
  FxRiskHubView,
  FleetMapView,
} from './views';
import {
  ExpediteModal,
  FxSimulatorModal,
  NewWorkOrderModal,
  WorkOrderModal,
  EmergencyPoModal,
  EdiAsnModal,
} from './components/Modals';
import { useToast } from './hooks';
import { WorkOrder, BomItem, EWayBillRecord } from './types';

function AppContent() {
  const [activeView, setActiveView] = useState<ViewPath>('overview');
  const [isDark, setIsDark] = useState<boolean>(() => {
    return localStorage.getItem('theme') !== 'light'; // Default dark mode as per Stitch SCADA cockpit design
  });

  const toastControls = useToast();
  const { state } = useBharatApex();
  const prevPendingToastId = useRef<string | null>(null);

  // Trigger toasts on state.pendingToast updates
  useEffect(() => {
    if (state.pendingToast && state.pendingToast.id !== prevPendingToastId.current) {
      prevPendingToastId.current = state.pendingToast.id;
      toastControls.addToast(state.pendingToast.message, state.pendingToast.type || 'info');
    }
  }, [state.pendingToast, toastControls]);

  // Modals state
  const [isFxModalOpen, setIsFxModalOpen] = useState(false);
  const [isNewWoModalOpen, setIsNewWoModalOpen] = useState(false);
  const [isEdiAsnModalOpen, setIsEdiAsnModalOpen] = useState(false);
  const [selectedEdiRecord, setSelectedEdiRecord] = useState<EWayBillRecord | null>(null);
  const [selectedEmergencyPoItem, setSelectedEmergencyPoItem] = useState<BomItem | null>(null);
  const [selectedWo, setSelectedWo] = useState<WorkOrder | null>(null);
  const [expediteTarget, setExpediteTarget] = useState<{
    truckId: string;
    oemName: string;
    partDesc: string;
  } | null>(null);

  // Sync dark mode class on document.documentElement
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  const handleSelectView = (view: ViewPath) => {
    setActiveView(view);
  };

  const handleToggleDarkMode = () => {
    setIsDark((prev) => !prev);
  };

  return (
    <AppLayout
      activeView={activeView}
      onSelectView={handleSelectView}
      isDark={isDark}
      onToggleDarkMode={handleToggleDarkMode}
      onOpenFxSimulator={() => setIsFxModalOpen(true)}
      toastControls={toastControls}
    >
      {/* 6 Views, each wrapped in an ErrorBoundary as required */}
      {activeView === 'overview' && (
        <ErrorBoundary fallbackTitle="Overview Cockpit Error">
          <OverviewView
            onOpenExpediteModal={(truckId, oemName, partDesc) =>
              setExpediteTarget({ truckId, oemName, partDesc })
            }
            onOpenRoute={() => setActiveView('fleet-map')}
            onToast={toastControls.addToast}
          />
        </ErrorBoundary>
      )}

      {activeView === 'aps-scheduler' && (
        <ErrorBoundary fallbackTitle="APS Scheduler View Error">
          <ApsSchedulerView
            onOpenNewWoModal={() => setIsNewWoModalOpen(true)}
            onOpenWoDetails={(wo) => setSelectedWo(wo)}
            onToast={toastControls.addToast}
          />
        </ErrorBoundary>
      )}

      {activeView === 'bom-inventory' && (
        <ErrorBoundary fallbackTitle="BOM & Inventory View Error">
          <BomInventoryView
            onOpenEmergencyPoModal={(item) => setSelectedEmergencyPoItem(item)}
            onToast={toastControls.addToast}
          />
        </ErrorBoundary>
      )}

      {activeView === 'supplier-edi-hub' && (
        <ErrorBoundary fallbackTitle="Supplier & EDI Hub Error">
          <SupplierEdiHubView
            onOpenEdiAsnModal={(record) => {
              setSelectedEdiRecord(record || null);
              setIsEdiAsnModalOpen(true);
            }}
          />
        </ErrorBoundary>
      )}

      {activeView === 'fx-risk-hub' && (
        <ErrorBoundary fallbackTitle="FX Risk Hub Error">
          <FxRiskHubView />
        </ErrorBoundary>
      )}

      {activeView === 'fleet-map' && (
        <ErrorBoundary fallbackTitle="Fleet Logistics Map Error">
          <FleetMapView
            onExpediteTruck={(truckId, oemName, partDesc) =>
              setExpediteTarget({ truckId, oemName, partDesc })
            }
          />
        </ErrorBoundary>
      )}

      {/* Global Action Modals */}
      <FxSimulatorModal
        isOpen={isFxModalOpen}
        onClose={() => setIsFxModalOpen(false)}
        onToast={toastControls.addToast}
      />

      <NewWorkOrderModal
        isOpen={isNewWoModalOpen}
        onClose={() => setIsNewWoModalOpen(false)}
        onToast={toastControls.addToast}
      />

      <WorkOrderModal
        isOpen={!!selectedWo}
        onClose={() => setSelectedWo(null)}
        workOrder={selectedWo}
        onToast={toastControls.addToast}
      />

      <EmergencyPoModal
        isOpen={!!selectedEmergencyPoItem}
        onClose={() => setSelectedEmergencyPoItem(null)}
        item={selectedEmergencyPoItem}
        onToast={toastControls.addToast}
      />

      <EdiAsnModal
        isOpen={isEdiAsnModalOpen}
        onClose={() => {
          setIsEdiAsnModalOpen(false);
          setSelectedEdiRecord(null);
        }}
        selectedRecord={selectedEdiRecord}
        onToast={toastControls.addToast}
      />

      {expediteTarget && (
        <ExpediteModal
          isOpen={true}
          onClose={() => setExpediteTarget(null)}
          truckId={expediteTarget.truckId}
          oemName={expediteTarget.oemName}
          partDescription={expediteTarget.partDesc}
          onToast={toastControls.addToast}
        />
      )}
    </AppLayout>
  );
}

export default function App() {
  return (
    <BharatApexProvider>
      <AppContent />
    </BharatApexProvider>
  );
}

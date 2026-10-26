import React, { useState, useMemo } from 'react';
import { Card, StatusBadge, DataTable } from '../components/ui';
import { useBharatApex } from '../context';
import { Machine, WorkOrder, WorkOrderStage } from '../types';

export interface ApsSchedulerViewProps {
  onOpenNewWoModal?: () => void;
  onOpenWoDetails?: (wo: WorkOrder) => void;
  onToast: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const ApsSchedulerView: React.FC<ApsSchedulerViewProps> = ({
  onOpenNewWoModal,
  onOpenWoDetails,
  onToast,
}) => {
  const { state, toggleMachineStatus, advanceWorkOrder, addFeedEntry } = useBharatApex();
  const { machines, workOrders } = state;

  const [shiftCadence, setShiftCadence] = useState<'day' | 'week' | 'month'>('day');
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('ALL');
  const [isRerouteDismissed, setIsRerouteDismissed] = useState(false);
  const [isRerouteApproved, setIsRerouteApproved] = useState(false);

  // Compute live stage load percentage dynamically from machines status, OEE, and active work orders
  const stageLoads: Record<WorkOrderStage, number> = useMemo(() => {
    const getMachineFactor = (id: string) => {
      const m = machines.find((mach) => mach.id === id);
      if (!m) return 0.85;
      if (m.status === 'MAINTENANCE') return 0.05;
      if (m.status === 'IDLE') return 0.2;
      if (m.status === 'SETUP') return 0.6;
      return m.oee / 100;
    };

    const machiningCapacity =
      ['CNC-01', 'CNC-02', 'CNC-03', 'CNC-04', 'VMC-01'].reduce(
        (sum, id) => sum + 750 * getMachineFactor(id),
        0
      );

    const rawPrepCapacity = 2400 * getMachineFactor('VMC-02');
    const fabCapacity = 1400 * getMachineFactor('ROBOTIC-WELD-01');
    const assemblyCapacity = 2600;
    const dispatchCapacity = 1200 * getMachineFactor('CMM-01');

    const capacities: Record<WorkOrderStage, number> = {
      RAW_PREP: Math.max(500, rawPrepCapacity),
      MACHINING: Math.max(500, machiningCapacity),
      FABRICATION: Math.max(500, fabCapacity),
      ASSEMBLY: Math.max(500, assemblyCapacity),
      FINAL_DISPATCH: Math.max(500, dispatchCapacity),
    };

    const loads = {} as Record<WorkOrderStage, number>;
    (Object.keys(capacities) as WorkOrderStage[]).forEach((stage) => {
      const demand = workOrders
        .filter((w) => w.stage === stage && w.status !== 'COMPLETED')
        .reduce((sum, w) => sum + w.quantity, 0);
      loads[stage] = Math.min(100, Math.round((demand / capacities[stage]) * 100));
    });

    return loads;
  }, [machines, workOrders]);

  // Real busiest stage and bottleneck load %
  const allStages: WorkOrderStage[] = ['RAW_PREP', 'MACHINING', 'FABRICATION', 'ASSEMBLY', 'FINAL_DISPATCH'];
  const busiestStage = allStages.reduce((max, s) => (stageLoads[s] > stageLoads[max] ? s : max), allStages[0]);
  const bottleneckLoad = stageLoads[busiestStage];
  const busiestStageName = {
    RAW_PREP: 'Raw Prep',
    MACHINING: 'Machining',
    FABRICATION: 'Fabrication',
    ASSEMBLY: 'Assembly',
    FINAL_DISPATCH: 'Final Dispatch',
  }[busiestStage];

  // 5-Stage Pipeline count per stage
  const pipelineCounts: Record<WorkOrderStage, number> = {
    RAW_PREP: workOrders.filter((w) => w.stage === 'RAW_PREP').length,
    MACHINING: workOrders.filter((w) => w.stage === 'MACHINING').length,
    FABRICATION: workOrders.filter((w) => w.stage === 'FABRICATION').length,
    ASSEMBLY: workOrders.filter((w) => w.stage === 'ASSEMBLY').length,
    FINAL_DISPATCH: workOrders.filter((w) => w.stage === 'FINAL_DISPATCH').length,
  };

  // Filtered work orders by query, stage, and due time cadence
  const filteredWorkOrders = workOrders.filter((wo) => {
    const matchQuery =
      wo.oemName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      wo.partDescription.toLowerCase().includes(searchQuery.toLowerCase()) ||
      wo.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStage = stageFilter === 'ALL' || wo.stage === stageFilter;

    let matchCadence = true;
    const due = (wo.dueShift || '').toLowerCase();
    if (shiftCadence === 'day') {
      matchCadence = due.includes('today') || due.includes('dock') || due.includes('route') || due.includes('immediate');
    } else if (shiftCadence === 'week') {
      matchCadence = due.includes('today') || due.includes('tomorrow') || due.includes('dock') || due.includes('route') || due.includes('immediate');
    } // 'month' shows all

    return matchQuery && matchStage && matchCadence;
  });

  // Action: Auto-Balance Schedule
  const handleAutoBalance = () => {
    addFeedEntry(
      'APS Algorithm Executed: Heuristic Line Balancing',
      'Machining load leveling re-sequenced. Bottleneck in Cell 2 mitigated (-14% queue delay).',
      'SCHEDULE',
      'NORMAL'
    );
    onToast('APS Algorithm running: Heuristic line balance re-sequenced across 8 cells.', 'success');
  };

  // Action: Approve AI JIT Reroute
  const handleApproveReroute = () => {
    setIsRerouteApproved(true);
    addFeedEntry(
      'JIT Heuristic Adjustment Approved (#TK-402)',
      '250 pcs from WO-9821 successfully rerouted to auxiliary CNC-04 (Makino A51).',
      'SCHEDULE',
      'NORMAL'
    );
    onToast('250 pcs from WO-9821 successfully rerouted to CNC-04.', 'success');
  };

  const woColumns = [
    {
      key: 'id',
      header: 'Order ID',
      render: (wo: WorkOrder) => (
        <span className="font-mono font-bold text-primary dark:text-indigo-400">{wo.id}</span>
      ),
    },
    {
      key: 'oemName',
      header: 'Customer',
      render: (wo: WorkOrder) => (
        <span className="font-semibold text-on-surface dark:text-white">{wo.oemName}</span>
      ),
    },
    {
      key: 'partDescription',
      header: 'Part Description',
      render: (wo: WorkOrder) => (
        <div>
          <span className="text-xs font-medium text-on-surface dark:text-[#f8fafc] block">
            {wo.partDescription}
          </span>
          <span className="font-mono text-[11px] text-secondary dark:text-[#94a3b8]">
            #{wo.partNumber}
          </span>
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'Quantity',
      align: 'right' as const,
      render: (wo: WorkOrder) => <span className="font-mono text-xs">{wo.quantity} pcs</span>,
    },
    {
      key: 'stage',
      header: 'Stage',
      render: (wo: WorkOrder) => (
        <span className="px-2 py-0.5 rounded bg-surface-container dark:bg-[#162035] text-xs font-semibold text-on-surface dark:text-white">
          {wo.stage}
        </span>
      ),
    },
    {
      key: 'progress',
      header: 'Progress',
      render: (wo: WorkOrder) => (
        <div className="flex items-center gap-2 min-w-[110px]">
          <div className="flex-1 bg-surface-container-highest dark:bg-[#1f2c47] h-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                wo.progress === 100 ? 'bg-emerald-500' : 'bg-primary'
              }`}
              style={{ width: `${wo.progress}%` }}
            />
          </div>
          <span className="font-mono text-xs font-semibold text-secondary dark:text-[#94a3b8]">
            {wo.progress}%
          </span>
        </div>
      ),
    },
    {
      key: 'machineId',
      header: 'Assigned Cell',
      render: (wo: WorkOrder) => (
        <span className="font-mono text-xs text-secondary dark:text-[#94a3b8]">
          {wo.machineId}
        </span>
      ),
    },
    {
      key: 'dueShift',
      header: 'Due Shift',
      render: (wo: WorkOrder) => (
        <span className="text-xs text-secondary dark:text-[#94a3b8]">{wo.dueShift}</span>
      ),
    },
    {
      key: 'scrapRate',
      header: 'Scrap Rate',
      align: 'right' as const,
      render: (wo: WorkOrder) => (
        <span className="font-mono text-xs text-secondary dark:text-[#94a3b8]">
          {wo.scrapRate}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center' as const,
      render: (wo: WorkOrder) => <StatusBadge status={wo.status} />,
    },
    {
      key: 'action',
      header: 'Action',
      align: 'center' as const,
      render: (wo: WorkOrder) => (
        <div className="flex items-center gap-1.5 justify-center">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              advanceWorkOrder(wo.id);
              onToast(`WO #${wo.id} stage advanced successfully.`, 'success');
            }}
            title="Advance Work Order to Next Stage"
            className="px-2.5 py-1 rounded bg-primary text-white text-[11px] font-semibold hover:bg-primary-container transition-colors shadow-xs"
          >
            Advance
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onOpenWoDetails) onOpenWoDetails(wo);
            }}
            title="Manage Details"
            className="p-1 rounded text-secondary hover:text-on-surface hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">tune</span>
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in duration-200">
      {/* Top Command & Action Bar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-surface-container-lowest dark:bg-[#0B0F19] border border-outline-variant/30 dark:border-[#243352] p-5 rounded-xl shadow-sm">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary dark:bg-indigo-500/20 dark:text-indigo-400 border border-primary/20 dark:border-indigo-500/30 text-[11px] font-mono uppercase tracking-wider font-semibold">
              Unit-4 Chakan MIDC
            </span>
            <span className="text-secondary text-xs">·</span>
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              Live Telemetry Synced
            </span>
          </div>
          <h1 className="text-lg md:text-xl font-bold text-on-surface dark:text-white tracking-tight">
            APS Scheduler & Line Balancing
          </h1>
          <p className="text-xs text-secondary dark:text-[#94a3b8]">
            Real-time scheduling for 8 CNC & fabrication cells · Shift A & B optimization
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Shift Switcher */}
          <div className="flex items-center bg-surface-container dark:bg-[#141E34] border border-outline-variant/30 dark:border-[#243352] p-1 rounded-lg">
            <button
              onClick={() => {
                setShiftCadence('day');
                onToast('Shift cadence set to Day (Shift A/B)', 'info');
              }}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                shiftCadence === 'day'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-secondary dark:text-[#94a3b8] hover:text-on-surface'
              }`}
            >
              Day (A/B)
            </button>
            <button
              onClick={() => {
                setShiftCadence('week');
                onToast('Shift cadence set to Weekly Leveling Window', 'info');
              }}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                shiftCadence === 'week'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-secondary dark:text-[#94a3b8] hover:text-on-surface'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => {
                setShiftCadence('month');
                onToast('Shift cadence set to Monthly Master Schedule', 'info');
              }}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                shiftCadence === 'month'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-secondary dark:text-[#94a3b8] hover:text-on-surface'
              }`}
            >
              Month
            </button>
          </div>

          {/* Auto-Balance Action */}
          <button
            type="button"
            onClick={handleAutoBalance}
            className="flex items-center gap-1.5 px-3.5 h-9 rounded-lg bg-surface-container dark:bg-[#141E34] border border-outline-variant/30 dark:border-[#243352] text-xs font-semibold text-on-surface dark:text-white hover:bg-surface-container-high transition-colors shadow-xs"
          >
            <span className="material-symbols-outlined text-[17px] text-primary dark:text-indigo-400">
              dynamic_feed
            </span>
            <span>Auto-Balance Schedule</span>
          </button>

          {/* New Work Order Action */}
          <button
            type="button"
            onClick={onOpenNewWoModal}
            className="flex items-center gap-1.5 px-3.5 h-9 rounded-lg bg-primary hover:bg-primary-container text-white transition-colors text-xs font-semibold shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>New Work Order</span>
          </button>
        </div>
      </div>

      {/* AI Smart Optimization Advisor Callout matching Stitch */}
      {!isRerouteDismissed && (
        <div className="bg-surface-container-lowest dark:bg-[#161F38] border border-primary/30 dark:border-indigo-500/40 p-4 rounded-xl shadow-sm dark:shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-l-4 border-l-primary dark:border-l-indigo-500">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 dark:bg-indigo-950/80 border border-primary/20 dark:border-indigo-500/30 flex items-center justify-center shrink-0 text-primary dark:text-indigo-400">
              <span className="material-symbols-outlined text-[22px]">psychology</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-primary dark:text-indigo-300 uppercase tracking-wide">
                  JIT Heuristic Engine
                </span>
                <span className="text-[10px] text-secondary dark:text-[#94a3b8] bg-surface-container dark:bg-[#0E1526] px-2 py-0.5 rounded border border-outline-variant/20 dark:border-[#243352]">
                  Takt Time Alert #TK-402
                </span>
              </div>
              <p className="text-xs text-on-surface dark:text-[#e2e8f0] mt-0.5">
                {busiestStageName} stage currently operating at <strong className="text-error dark:text-rose-400 font-semibold">{bottleneckLoad}% bottleneck load</strong>. Reroute WO-9821 batch segment (250 pcs) to auxiliary CNC-04 to mitigate 38-min line starvation in Cell 3.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
            <button
              type="button"
              onClick={() => setIsRerouteDismissed(true)}
              className="px-3 py-1.5 text-secondary hover:text-on-surface dark:text-[#94a3b8] dark:hover:text-white text-xs font-semibold"
            >
              Dismiss
            </button>
            <button
              type="button"
              disabled={isRerouteApproved}
              onClick={handleApproveReroute}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                isRerouteApproved
                  ? 'bg-emerald-600 text-white cursor-default'
                  : 'bg-primary text-white hover:bg-primary-container shadow-xs'
              }`}
            >
              {isRerouteApproved ? '✓ Adjustment Approved' : 'Approve Adjustment'}
            </button>
          </div>
        </div>
      )}

      {/* 5-Stage Production Flow Pipeline Card */}
      <div className="bg-surface-container-lowest dark:bg-[#0B0F19] border border-outline-variant/30 dark:border-[#243352] p-5 rounded-xl shadow-sm flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary dark:text-indigo-400 text-[20px]">
              alt_route
            </span>
            <h2 className="text-sm font-bold text-on-surface dark:text-white">
              5-Stage Flow Balance Pipeline
            </h2>
          </div>
          <span className="text-xs text-secondary dark:text-[#94a3b8] font-mono">
            {workOrders.length} Total Active Orders
          </span>
        </div>

        {/* 5 Stages Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {(
            [
              { stage: 'RAW_PREP', label: '01. Raw Prep', icon: 'content_cut' },
              { stage: 'MACHINING', label: '02. Machining', icon: 'precision_manufacturing' },
              { stage: 'FABRICATION', label: '03. Fabrication', icon: 'handyman' },
              { stage: 'ASSEMBLY', label: '04. Assembly', icon: 'build_circle' },
              { stage: 'FINAL_DISPATCH', label: '05. Dispatch', icon: 'local_shipping' },
            ] as const
          ).map((item) => (
            <div
              key={item.stage}
              className="bg-surface-container-low dark:bg-[#10192b] border border-outline-variant/20 dark:border-[#1f2c47] p-3 rounded-xl flex flex-col justify-between gap-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold text-secondary dark:text-[#94a3b8] uppercase">
                  {item.label}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-surface-container dark:bg-[#172238] font-mono text-xs font-bold text-primary dark:text-indigo-400">
                  {pipelineCounts[item.stage]} WOs
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-secondary dark:text-[#94a3b8]">Live Load</span>
                <span className="font-mono text-sm font-bold text-on-surface dark:text-white">
                  {stageLoads[item.stage]}% Cap
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 8 Machine OEE Cockpit Cards (4x2 Grid) */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm md:text-base font-bold text-on-surface dark:text-white">
              Machining Cells & OEE Monitoring (8 Workstations)
            </h2>
          </div>
          <span className="text-xs text-secondary dark:text-[#94a3b8] font-mono hidden sm:inline">
            Click "Toggle State" to cycle status
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {machines.map((machine: Machine) => (
            <Card
              key={machine.id}
              variant="default"
              padding="md"
              className="flex flex-col justify-between hover:border-primary/40 transition-all"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <span className="font-mono font-bold text-sm text-on-surface dark:text-white block">
                      {machine.name}
                    </span>
                    <span className="text-xs text-secondary dark:text-[#94a3b8]">{machine.model}</span>
                  </div>
                  <StatusBadge status={machine.status} />
                </div>
                <span className="text-[11px] text-on-surface-variant dark:text-[#94a3b8] block mt-1 truncate">
                  {machine.operation}
                </span>
              </div>

              {/* OEE readout */}
              <div className="my-3 p-2.5 rounded-lg bg-surface-container-low dark:bg-[#0d1726] border border-outline-variant/20 dark:border-[#1f2c47] flex items-end justify-between">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-secondary dark:text-[#94a3b8] block">
                    Overall OEE
                  </span>
                  <span
                    className={`font-mono text-xl font-bold ${
                      machine.oee >= 85
                        ? 'text-tertiary dark:text-emerald-400'
                        : machine.oee > 0
                        ? 'text-amber-500'
                        : 'text-error dark:text-red-400'
                    }`}
                  >
                    {machine.oee.toFixed(1)}%
                  </span>
                </div>
                <div className="text-right text-[11px] text-secondary dark:text-[#94a3b8] font-mono">
                  <div>Avail: {machine.availability}%</div>
                  <div>Perf: {machine.performance}% · Q: {machine.quality}%</div>
                </div>
              </div>

              {/* Operator & Toggle button */}
              <div className="flex items-center justify-between text-xs pt-1 border-t border-outline-variant/20 dark:border-[#1f2c47]">
                <span className="text-secondary dark:text-[#94a3b8] truncate max-w-[120px]">
                  {machine.operator}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    toggleMachineStatus(machine.id);
                    onToast(`${machine.name} status cycle updated.`, 'info');
                  }}
                  className="px-2.5 py-1 rounded bg-surface-container dark:bg-[#162035] border border-outline-variant/30 dark:border-[#243352] text-[11px] font-semibold text-on-surface dark:text-white hover:bg-surface-container-high transition-colors"
                >
                  Toggle State
                </button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Live Work Order Scheduling Table */}
      <Card
        variant="default"
        padding="none"
        header={
          <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full gap-3">
            <div>
              <h3 className="text-sm font-bold text-on-surface dark:text-white">
                Live Scheduled Work Orders
              </h3>
              <p className="text-[11px] text-secondary dark:text-[#94a3b8]">
                Sequenced queue for JIT Line Feed #4
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search OEM, Part, or WO..."
                className="h-8 px-3 rounded-lg bg-surface-container dark:bg-[#131c31] border border-outline-variant/30 dark:border-[#222e4a] text-xs text-on-surface dark:text-white focus:outline-none focus:ring-1 focus:ring-primary w-48"
              />
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className="h-8 px-2.5 rounded-lg bg-surface-container dark:bg-[#131c31] border border-outline-variant/30 dark:border-[#222e4a] text-xs text-on-surface dark:text-white focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                <option value="ALL">All Stages</option>
                <option value="RAW_PREP">Raw Prep</option>
                <option value="MACHINING">Machining</option>
                <option value="FABRICATION">Fabrication</option>
                <option value="ASSEMBLY">Assembly</option>
                <option value="FINAL_DISPATCH">Final Dispatch</option>
              </select>
            </div>
          </div>
        }
      >
        <DataTable
          columns={woColumns}
          data={filteredWorkOrders}
          keyExtractor={(wo) => wo.id}
          onRowClick={(wo) => onOpenWoDetails && onOpenWoDetails(wo)}
        />
      </Card>
    </div>
  );
};

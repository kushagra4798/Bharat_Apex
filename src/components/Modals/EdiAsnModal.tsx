import React, { useState, useMemo, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { useBharatApex } from '../../context';
import { calculateGst, calculateEwayBillValidity, EWB_KM_PER_DAY } from '../../services/calculations';
import { EWayBillRecord } from '../../types';

export interface EdiAsnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  selectedRecord?: EWayBillRecord | null;
}

interface OemGstinProfile {
  name: string;
  plant: string;
  gstin: string;
  city: string;
  pincode: number;
  partDescription: string;
  partNumber: string;
  defaultQty: number;
  unitPrice: number;
}

const OEM_PROFILES: OemGstinProfile[] = [
  {
    name: 'Tata Motors',
    plant: 'Sanand EV Line 2, Gujarat',
    gstin: '24AABCT2004L1Z2',
    city: 'Sanand',
    pincode: 382170,
    partDescription: 'Front Axle Sub-assembly',
    partNumber: 'BA-ASM-400',
    defaultQty: 150,
    unitPrice: 14250,
  },
  {
    name: 'Mahindra & Mahindra',
    plant: 'Chakan Line 1, Pune, MH',
    gstin: '27AAACM1201K1Z3',
    city: 'Pune',
    pincode: 410501,
    partDescription: 'Scorpio-N Steering Knuckle Castings',
    partNumber: 'BA-MM-880',
    defaultQty: 200,
    unitPrice: 3850,
  },
  {
    name: 'Maruti Suzuki',
    plant: 'Manesar Line B, Haryana',
    gstin: '06AAACM3302L1Z9',
    city: 'Manesar',
    pincode: 122051,
    partDescription: 'Swift K-Series Transmission Gear Blanks',
    partNumber: 'BA-MSIL-305',
    defaultQty: 350,
    unitPrice: 1950,
  },
  {
    name: 'Hyundai Motor India',
    plant: 'Sriperumbudur Hub, Tamil Nadu',
    gstin: '33AAACH5504K1Z1',
    city: 'Sriperumbudur',
    pincode: 602105,
    partDescription: 'Creta Platform Ventilated Brake Disc Rotors',
    partNumber: 'BA-HYUN-612',
    defaultQty: 240,
    unitPrice: 4200,
  },
  {
    name: 'Bajaj Auto',
    plant: 'Waluj Complex, Chhatrapati Sambhajinagar, MH',
    gstin: '27AAACB1108P1Z5',
    city: 'Sambhajinagar',
    pincode: 431136,
    partDescription: '3-Wheeler RE Crankcase Primary Covers',
    partNumber: 'BA-BAJAJ-118',
    defaultQty: 400,
    unitPrice: 2850,
  },
];

export const EdiAsnModal: React.FC<EdiAsnModalProps> = ({
  isOpen,
  onClose,
  onToast,
  selectedRecord,
}) => {
  const { transmitAsn } = useBharatApex();

  const [fromGstin, setFromGstin] = useState('27AAACB2201R1Z8'); // Chakan Unit-4, MH
  const [selectedOemIndex, setSelectedOemIndex] = useState(0);
  const selectedProfile = OEM_PROFILES[selectedOemIndex];

  const [toGstin, setToGstin] = useState(selectedProfile.gstin);
  const [vehicleNo, setVehicleNo] = useState('MH-14-GH-4091');
  const [quantity, setQuantity] = useState(selectedProfile.defaultQty);
  const [unitPrice, setUnitPrice] = useState(selectedProfile.unitPrice);
  const [transporterId] = useState('27AAACV7710K1Z4');
  const [activeTab, setActiveTab] = useState<'form' | 'json'>('form');
  const [copied, setCopied] = useState(false);

  // Sync state if an existing bill record is passed in
  useEffect(() => {
    if (selectedRecord) {
      const matchedOemIdx = OEM_PROFILES.findIndex((p) =>
        selectedRecord.oemCustomer.toLowerCase().includes(p.name.toLowerCase()) ||
        p.name.toLowerCase().includes(selectedRecord.oemCustomer.toLowerCase())
      );
      if (matchedOemIdx !== -1) {
        setSelectedOemIndex(matchedOemIdx);
      }
      if (selectedRecord.supplierGstin) setFromGstin(selectedRecord.supplierGstin);
      if (selectedRecord.recipientGstin) setToGstin(selectedRecord.recipientGstin);
      if (selectedRecord.vehicleNo) setVehicleNo(selectedRecord.vehicleNo);
      if (selectedRecord.quantity) setQuantity(selectedRecord.quantity);
      if (selectedRecord.unitValue) setUnitPrice(selectedRecord.unitValue);
    }
  }, [selectedRecord]);

  // Handle OEM Profile switch
  const handleOemChange = (index: number) => {
    setSelectedOemIndex(index);
    const p = OEM_PROFILES[index];
    setToGstin(p.gstin);
    setQuantity(p.defaultQty);
    setUnitPrice(p.unitPrice);
  };

  // Determine Inter-State vs Intra-State by GSTIN state code prefix (first 2 digits)
  const fromStateCode = fromGstin.trim().slice(0, 2) || '27';
  const toStateCode = toGstin.trim().slice(0, 2) || '24';
  const isInterState = fromStateCode !== toStateCode;

  // Transit distance: use selectedRecord distance or corridor standard (660 km inter-state, 45 km intra-state)
  const transDistance = selectedRecord?.distanceKm ?? (isInterState ? 660 : 45);
  const genTime = selectedRecord?.generatedAt ?? new Date();

  // Pure function validity calculation (EWB_KM_PER_DAY = 200, labelled illustrative)
  const validity = useMemo(
    () => calculateEwayBillValidity(transDistance, genTime),
    [transDistance, genTime]
  );

  // Compute GST breakdown
  const taxableAmount = quantity * unitPrice;
  const gstResult = useMemo(
    () => calculateGst(taxableAmount, isInterState, 18),
    [taxableAmount, isInterState]
  );

  // NIC-style E-Way Bill JSON schema payload
  const nicJsonPayload = useMemo(() => {
    return {
      version: '1.0.0421',
      billLists: [
        {
          userGstin: fromGstin,
          supplyType: 'O',
          subSupplyType: '1',
          docType: 'INV',
          docNo: `BA-INV-2026-${Math.floor(1000 + Math.random() * 9000)}`,
          docDate: new Date().toLocaleDateString('en-GB'),
          fromGstin: fromGstin,
          fromTrdName: 'BHARAT APEX AUTOMOTIVE LTD',
          fromAddr1: 'Plot B-14, Phase 2, Chakan MIDC',
          fromPlace: 'Pune',
          fromPincode: 410501,
          fromStateCode: Number(fromStateCode) || 27,
          toGstin: toGstin,
          toTrdName: selectedProfile.name.toUpperCase(),
          toAddr1: selectedProfile.plant,
          toPlace: selectedProfile.city,
          toPincode: selectedProfile.pincode,
          toStateCode: Number(toStateCode) || 24,
          totalValue: gstResult.taxableAmount,
          cgstValue: gstResult.cgstAmount,
          sgstValue: gstResult.sgstAmount,
          igstValue: gstResult.igstAmount,
          totInvValue: gstResult.totalInvoiceAmount,
          transMode: '1',
          transDistance: isInterState ? 660 : 45,
          transporterName: 'VRL Logistics Ltd',
          transporterId: transporterId,
          transDocNo: `LR-${Math.floor(10000 + Math.random() * 90000)}`,
          transDocDate: new Date().toLocaleDateString('en-GB'),
          vehicleNo: vehicleNo,
          vehicleType: 'R',
          itemList: [
            {
              itemNo: 1,
              productName: selectedProfile.partDescription,
              productDesc: selectedProfile.partNumber,
              hsnCode: 87085000,
              quantity: quantity,
              qtyUnit: 'NOS',
              cgstRate: isInterState ? 0 : 9,
              sgstRate: isInterState ? 0 : 9,
              igstRate: isInterState ? 18 : 0,
              taxableAmount: gstResult.taxableAmount,
            },
          ],
        },
      ],
    };
  }, [
    fromGstin,
    toGstin,
    fromStateCode,
    toStateCode,
    selectedProfile,
    gstResult,
    isInterState,
    transporterId,
    vehicleNo,
    quantity,
  ]);

  const handleCopyJson = () => {
    const str = JSON.stringify(nicJsonPayload, null, 2);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(str);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      if (onToast) onToast('NIC E-Way Bill JSON payload copied to clipboard', 'info');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (quantity <= 0) return;

    // Generate standard 12-digit E-Way Bill Number
    const ewayBillNo = selectedRecord?.ewayBillNo || Math.floor(100000000000 + Math.random() * 900000000000).toString();

    transmitAsn(
      selectedProfile.name,
      selectedProfile.partNumber,
      quantity,
      ewayBillNo,
      {
        distanceKm: transDistance,
        recipientGstin: toGstin,
        destinationAddress: selectedProfile.plant,
        partDescription: selectedProfile.partDescription,
        unitValue: unitPrice,
        isInterState,
        vehicleNo,
        transporterId,
      }
    );

    if (onToast) {
      onToast(
        `EWB #${ewayBillNo} transmitted for ${selectedProfile.name} (${quantity} units · ${validity.validDays}d validity)`,
        'success'
      );
    }

    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Transmit GST E-Way Bill & ASN"
      subtitle="Issue EWB-01 dispatch payload validated against NIC tax schema"
      icon={
        <span className="material-symbols-outlined text-[20px] text-primary dark:text-indigo-400">
          local_shipping
        </span>
      }
      maxWidth="2xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-left font-mono">
            <span className="text-[10px] text-secondary dark:text-[#94a3b8] uppercase block">
              Total Invoice Amount (with GST)
            </span>
            <span className="text-sm md:text-base font-bold text-on-surface dark:text-white">
              ₹ {gstResult.totalInvoiceAmount.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-outline-variant/30 dark:border-[#243352] text-xs font-semibold hover:bg-surface-container transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-container text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">send</span>
              <span>Transmit ASN & Issue EWB</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4 text-xs">
        {/* Tab Switcher: Form vs NIC JSON Preview */}
        <div className="flex items-center justify-between border-b border-outline-variant/20 dark:border-[#1f2c47] pb-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('form')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'form'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-secondary dark:text-[#94a3b8] hover:text-on-surface dark:hover:text-white'
              }`}
            >
              Dispatch Form
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('json')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'json'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-secondary dark:text-[#94a3b8] hover:text-on-surface dark:hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">code</span>
              <span>NIC JSON Preview</span>
            </button>
          </div>

          {activeTab === 'json' && (
            <button
              type="button"
              onClick={handleCopyJson}
              className="px-2.5 py-1 rounded bg-surface-container dark:bg-[#162035] border border-outline-variant/30 dark:border-[#243352] text-[11px] font-semibold text-primary dark:text-indigo-400 hover:bg-surface-container-high transition-colors cursor-pointer flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[14px]">
                {copied ? 'check' : 'content_copy'}
              </span>
              <span>{copied ? 'Copied' : 'Copy JSON'}</span>
            </button>
          )}
        </div>

        {/* E-Way Bill Validity & Live Countdown Card */}
        <div className="p-3.5 rounded-xl bg-surface-container-low dark:bg-[#0d1726] border border-outline-variant/30 dark:border-[#222e4a] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                validity.badgeColor === 'green'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                  : validity.badgeColor === 'amber'
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                  : 'bg-error/10 text-error dark:text-red-400 border-error/30'
              }`}
            >
              <span className="material-symbols-outlined text-[19px]">
                {validity.badgeColor === 'green' ? 'timer' : validity.badgeColor === 'amber' ? 'hourglass_top' : 'error'}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-on-surface dark:text-white">
                  E-Way Bill Validity Window
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-container dark:bg-[#162035] text-secondary border border-outline-variant/30 font-semibold whitespace-nowrap shrink-0">
                  {validity.validDays} Day{validity.validDays > 1 ? 's' : ''} ({validity.validHours}h)
                </span>
              </div>
              <p className="text-[11px] text-secondary dark:text-[#94a3b8] mt-0.5 font-mono">
                Transit: {transDistance} km · Constant EWB_KM_PER_DAY = {EWB_KM_PER_DAY} (1 day per 200 km, labelled illustrative)
              </p>
            </div>
          </div>

          {/* Live Countdown Badge */}
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold border whitespace-nowrap shrink-0 ${
                validity.badgeColor === 'green'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                  : validity.badgeColor === 'amber'
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 animate-pulse'
                  : 'bg-error/10 text-error dark:text-red-400 border-error/30'
              }`}
            >
              <span className="material-symbols-outlined text-[14px] shrink-0">
                {validity.badgeColor === 'green' ? 'schedule' : validity.badgeColor === 'amber' ? 'warning' : 'cancel'}
              </span>
              <span className="whitespace-nowrap">{validity.formattedCountdown}</span>
            </div>
          </div>
        </div>

        {activeTab === 'form' ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Customer Profile Selection */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-secondary dark:text-[#94a3b8]">
                Destination OEM Customer
              </label>
              <select
                value={selectedOemIndex}
                onChange={(e) => handleOemChange(parseInt(e.target.value, 10))}
                className="h-9 px-3 rounded-lg bg-surface-container dark:bg-[#131c31] border border-outline-variant/40 dark:border-[#222e4a] text-xs font-medium text-on-surface dark:text-white focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                {OEM_PROFILES.map((p, idx) => (
                  <option key={p.name} value={idx}>
                    {p.name} · {p.plant} (GSTIN: {p.gstin})
                  </option>
                ))}
              </select>
            </div>

            {/* GSTIN Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-secondary dark:text-[#94a3b8]">
                  From GSTIN (Supplier / Chakan)
                </label>
                <input
                  type="text"
                  value={fromGstin}
                  onChange={(e) => setFromGstin(e.target.value.toUpperCase())}
                  required
                  className="h-9 px-3 rounded-lg bg-surface-container dark:bg-[#131c31] border border-outline-variant/40 dark:border-[#222e4a] text-xs font-mono font-bold text-on-surface dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-secondary dark:text-[#94a3b8]">
                  To GSTIN (Recipient OEM)
                </label>
                <input
                  type="text"
                  value={toGstin}
                  onChange={(e) => setToGstin(e.target.value.toUpperCase())}
                  required
                  className="h-9 px-3 rounded-lg bg-surface-container dark:bg-[#131c31] border border-outline-variant/40 dark:border-[#222e4a] text-xs font-mono font-bold text-on-surface dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Vehicle & Item Details */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-secondary dark:text-[#94a3b8]">
                  Assigned Vehicle No
                </label>
                <input
                  type="text"
                  value={vehicleNo}
                  onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
                  required
                  className="h-9 px-3 rounded-lg bg-surface-container dark:bg-[#131c31] border border-outline-variant/40 dark:border-[#222e4a] text-xs font-mono font-bold text-primary dark:text-indigo-400 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-secondary dark:text-[#94a3b8]">
                  Dispatch Quantity (Units)
                </label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 0))}
                  required
                  className="h-9 px-3 rounded-lg bg-surface-container dark:bg-[#131c31] border border-outline-variant/40 dark:border-[#222e4a] text-xs font-mono font-bold text-on-surface dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-secondary dark:text-[#94a3b8]">
                  Unit Price (₹ INR)
                </label>
                <input
                  type="number"
                  min="1"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(Math.max(1, parseFloat(e.target.value) || 0))}
                  required
                  className="h-9 px-3 rounded-lg bg-surface-container dark:bg-[#131c31] border border-outline-variant/40 dark:border-[#222e4a] text-xs font-mono font-bold text-on-surface dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* GST Tax Classification & Calculation Card */}
            <div className="p-3.5 rounded-xl bg-surface-container-low dark:bg-[#0d1726] border border-outline-variant/30 dark:border-[#222e4a] flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-on-surface dark:text-white">
                    GST Regime:
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                      isInterState
                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                    }`}
                  >
                    {isInterState
                      ? `Inter-State (State ${fromStateCode} → ${toStateCode}) · IGST 18%`
                      : `Intra-State (State ${fromStateCode} → ${toStateCode}) · CGST 9% + SGST 9%`}
                  </span>
                </div>
                <span className="text-secondary dark:text-[#94a3b8] font-mono">
                  HSN #87085000
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-outline-variant/20 dark:border-[#1a253d] font-mono text-[11px]">
                <div>
                  <span className="text-secondary dark:text-[#94a3b8] block">Taxable Value</span>
                  <span className="font-bold text-on-surface dark:text-white">
                    ₹ {gstResult.taxableAmount.toLocaleString('en-IN')}
                  </span>
                </div>

                {isInterState ? (
                  <div>
                    <span className="text-secondary dark:text-[#94a3b8] block">IGST (18%)</span>
                    <span className="font-bold text-primary dark:text-indigo-400">
                      ₹ {gstResult.igstAmount.toLocaleString('en-IN')}
                    </span>
                  </div>
                ) : (
                  <>
                    <div>
                      <span className="text-secondary dark:text-[#94a3b8] block">CGST (9%)</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        ₹ {gstResult.cgstAmount.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div>
                      <span className="text-secondary dark:text-[#94a3b8] block">SGST (9%)</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        ₹ {gstResult.sgstAmount.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </>
                )}

                <div>
                  <span className="text-secondary dark:text-[#94a3b8] block">Total Tax</span>
                  <span className="font-bold text-on-surface dark:text-white">
                    ₹ {gstResult.totalTax.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>
          </form>
        ) : (
          /* NIC JSON Preview Code View */
          <div className="relative">
            <pre className="p-4 rounded-xl bg-[#070b14] border border-[#222e4a] text-cyan-300 font-mono text-[11px] overflow-x-auto max-h-[380px] leading-relaxed">
              {JSON.stringify(nicJsonPayload, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </Modal>
  );
};

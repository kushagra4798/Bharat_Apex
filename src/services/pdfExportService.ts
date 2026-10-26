import {
  BomItem,
  CurrencyCode,
  CurrencyRates,
  CustomerBuffer,
  FxShocks,
  Machine,
  PlantFeedEntry,
  Truck,
  WorkOrder,
} from '../types';
import { convertCurrency, formatCurrencyValue } from './currencyService';
import { rollUpBomLandedCost } from './calculations';
import { HandoverResult } from './advisorService';

/**
 * Lazy loads jsPDF and jspdf-autotable dynamically on demand
 * so the main bundle size is not impacted.
 */
export async function getPdfLibraries() {
  const [jspdfModule, autotableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const jsPDF = jspdfModule.default || jspdfModule.jsPDF;
  const autoTable = autotableModule.default;

  return { jsPDF, autoTable };
}

/**
 * Replaces Rupee symbol '₹' with 'Rs. ' because default standard PDF fonts (Helvetica)
 * do not support the Unicode rupee glyph and will render corrupt characters.
 */
export function sanitizePdfText(str: string): string {
  if (!str) return '';
  return str.replace(/₹\s?/g, 'Rs. ');
}

/**
 * Formats a currency value for PDF display with 'Rs.' instead of '₹'.
 */
export function formatPdfCurrency(
  amount: number,
  currency: CurrencyCode,
  options?: {
    useIndianSystem?: boolean;
    decimals?: number;
  }
): string {
  const formatted = formatCurrencyValue(amount, currency, options);
  return sanitizePdfText(formatted);
}

/**
 * Attaches the required 'Demo data' footer and page numbers to all pages of the document.
 */
export function addPdfPageFooters(doc: any) {
  const totalPages = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139); // slate-500

    // Footer horizontal divider rule
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.3);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

    // Left-aligned footer: Demo data
    doc.text('Demo data', 14, pageHeight - 6);

    // Right-aligned footer: Page X of Y
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - 14, pageHeight - 6, {
      align: 'right',
    });
  }
}

export interface ShiftReportPdfOptions {
  plantName?: string;
  shiftName?: string;
  leadInCharge?: string;
  date?: string;
  customerBuffers: CustomerBuffer[];
  workOrders: WorkOrder[];
  machines: Machine[];
  plantFeed: PlantFeedEntry[];
  trucks: Truck[];
  baseCurrency: CurrencyCode;
  currencyRates: CurrencyRates;
  fxShocks: FxShocks;
  latestHandover?: HandoverResult | string | null;
  saveToFile?: boolean;
}

/**
 * Exports the comprehensive Daily Shift Operations & Telematics Audit Report as a PDF.
 * Includes:
 * - Header (plant, shift, date)
 * - SCADA KPI Summary
 * - Customer Buffer Table with Status
 * - Open Work Orders by Stage
 * - Last 20 Plant Feed Entries
 * - Latest AI Handover text (if one exists)
 * - 'Demo data' footer and page numbering on every page
 */
export async function exportDailyShiftReportPdf(
  options: ShiftReportPdfOptions
): Promise<any> {
  const { jsPDF, autoTable } = await getPdfLibraries();

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const {
    plantName = 'Bharat Apex Chakan Hub - Unit 4',
    shiftName = 'Morning Shift (06:00 - 14:00 IST)',
    leadInCharge = 'R. Deshmukh (Lead Controller) · Line 4',
    date = new Date().toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }),
    customerBuffers,
    workOrders,
    machines,
    plantFeed,
    trucks,
    baseCurrency,
    currencyRates,
    fxShocks,
    latestHandover,
    saveToFile = true,
  } = options;

  let currentY = 14;

  // 1. Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(14, currentY, 182, 22, 'F');

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('BHARAT APEX AUTOMOTIVE', 18, currentY + 8);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text('DAILY SHIFT OPERATIONS & TELEMATICS AUDIT REPORT', 18, currentY + 14);
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 190, currentY + 14, {
    align: 'right',
  });

  currentY += 26;

  // Shift & Facility Metadata Box
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, currentY, 182, 18, 1.5, 1.5, 'FD');

  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);

  doc.setFont('helvetica', 'bold');
  doc.text('Plant Facility:', 18, currentY + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(plantName, 42, currentY + 6);

  doc.setFont('helvetica', 'bold');
  doc.text('Shift Cadence:', 110, currentY + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(shiftName, 134, currentY + 6);

  doc.setFont('helvetica', 'bold');
  doc.text('Lead Controller:', 18, currentY + 13);
  doc.setFont('helvetica', 'normal');
  doc.text(leadInCharge, 42, currentY + 13);

  doc.setFont('helvetica', 'bold');
  doc.text('Report Date:', 110, currentY + 13);
  doc.setFont('helvetica', 'normal');
  doc.text(`${date} (Base Currency: ${baseCurrency})`, 134, currentY + 13);

  currentY += 22;

  // 2. SCADA KPI Summary
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('1. Operational KPI Summary', 14, currentY);
  currentY += 3;

  const totalExposureINR = customerBuffers.reduce((sum, b) => {
    return sum + (b.runOutHours < 3.0 ? (3.0 - b.runOutHours) * b.penaltyPerHourINR : 0);
  }, 0);
  const convExposure = convertCurrency(totalExposureINR, 'INR', baseCurrency, currencyRates, fxShocks);
  const criticalCount = customerBuffers.filter((b) => b.runOutHours < 3.0).length;
  const warningCount = customerBuffers.filter((b) => b.runOutHours >= 3.0 && b.runOutHours < 6.0).length;
  const runningMachines = machines.filter((m) => m.status === 'RUNNING').length;
  const openWos = workOrders.filter((w) => w.status !== 'COMPLETED').length;
  const avgOee = (machines.reduce((acc, m) => acc + m.oee, 0) / (machines.length || 1)).toFixed(1);

  const kpiData = [
    [
      { content: 'Line-Stop Penalty at Risk:', styles: { fontStyle: 'bold' as const } },
      formatPdfCurrency(convExposure, baseCurrency),
      { content: 'Critical Buffers (<3h):', styles: { fontStyle: 'bold' as const } },
      `${criticalCount} buffer${criticalCount === 1 ? '' : 's'}`,
    ],
    [
      { content: 'Warning Buffers (3-6h):', styles: { fontStyle: 'bold' as const } },
      `${warningCount} buffer${warningCount === 1 ? '' : 's'}`,
      { content: 'Plant Overall OEE:', styles: { fontStyle: 'bold' as const } },
      `${avgOee}% (Target: 85.0%)`,
    ],
    [
      { content: 'Active Workstations:', styles: { fontStyle: 'bold' as const } },
      `${runningMachines} of ${machines.length} RUNNING`,
      { content: 'Open Work Orders:', styles: { fontStyle: 'bold' as const } },
      `${openWos} active batch${openWos === 1 ? '' : 'es'}`,
    ],
    [
      { content: 'Active FASTag Convoys:', styles: { fontStyle: 'bold' as const } },
      `${trucks.length} en route`,
      { content: 'Audit Status:', styles: { fontStyle: 'bold' as const } },
      'ISO/TS 16949 SCADA Verified',
    ],
  ];

  autoTable(doc, {
    startY: currentY,
    body: kpiData,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, textColor: [30, 41, 59] },
    columnStyles: {
      0: { cellWidth: 46, fillColor: [241, 245, 249] },
      1: { cellWidth: 45 },
      2: { cellWidth: 46, fillColor: [241, 245, 249] },
      3: { cellWidth: 45 },
    },
    margin: { left: 14, right: 14 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 7;

  // 3. Customer Buffers Table with Status
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('2. Customer Line Buffers & Burn-Down Hours', 14, currentY);
  currentY += 3;

  const sortedBuffers = [...customerBuffers].sort((a, b) => a.runOutHours - b.runOutHours);
  const bufferHeaders = [
    ['OEM Customer', 'Plant Location', 'Assembly Part', 'Stock', 'Burn/hr', 'Run-Out', 'Status', 'Penalty Rate/hr'],
  ];
  const bufferRows = sortedBuffers.map((b) => {
    const penaltyConv = convertCurrency(b.penaltyPerHourINR, 'INR', baseCurrency, currencyRates, fxShocks);
    return [
      b.oemName,
      b.plantLocation,
      b.partDescription,
      `${b.currentStockUnits.toLocaleString()} pcs`,
      `${b.consumptionPerHour}/h`,
      `${b.runOutHours.toFixed(1)} hrs`,
      b.status,
      formatPdfCurrency(penaltyConv, baseCurrency),
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: bufferHeaders,
    body: bufferRows,
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], fontSize: 8, fontStyle: 'bold', halign: 'left' },
    styles: { fontSize: 7.5, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 26 },
      1: { cellWidth: 28 },
      2: { cellWidth: 34 },
      3: { halign: 'right', cellWidth: 20 },
      4: { halign: 'right', cellWidth: 16 },
      5: { halign: 'center', fontStyle: 'bold', cellWidth: 18 },
      6: { halign: 'center', fontStyle: 'bold', cellWidth: 18 },
      7: { halign: 'right', cellWidth: 22 },
    },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 6) {
        const val = data.cell.raw;
        if (val === 'CRITICAL') {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fillColor = [254, 226, 226];
        } else if (val === 'WARNING') {
          data.cell.styles.textColor = [217, 119, 6];
          data.cell.styles.fillColor = [254, 243, 199];
        } else {
          data.cell.styles.textColor = [16, 185, 129];
        }
      }
    },
    margin: { left: 14, right: 14 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 7;

  // 4. Open Work Orders by Stage
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('3. Active Production Work Orders by Stage', 14, currentY);
  currentY += 3;

  const stageOrder: Record<string, number> = {
    RAW_PREP: 1,
    MACHINING: 2,
    FABRICATION: 3,
    ASSEMBLY: 4,
    FINAL_DISPATCH: 5,
  };

  const openWorkOrdersList = workOrders
    .filter((w) => w.status !== 'COMPLETED')
    .sort((a, b) => (stageOrder[a.stage] || 9) - (stageOrder[b.stage] || 9));

  const woHeaders = [['Stage', 'WO Number', 'Part Description', 'OEM Client', 'Qty', 'Cell', 'Due Time', 'Status']];
  const woRows = openWorkOrdersList.map((w) => [
    w.stage.replace('_', ' '),
    w.id,
    w.partDescription,
    w.oemName,
    `${w.quantity} pcs`,
    w.machineId,
    w.dueTime,
    w.status,
  ]);

  autoTable(doc, {
    startY: currentY,
    head: woHeaders,
    body: woRows,
    theme: 'striped',
    headStyles: { fillColor: [51, 65, 85], fontSize: 8, fontStyle: 'bold' },
    styles: { fontSize: 7.5, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 26 },
      1: { cellWidth: 20 },
      2: { cellWidth: 38 },
      3: { cellWidth: 26 },
      4: { halign: 'right', cellWidth: 18 },
      5: { halign: 'center', cellWidth: 18 },
      6: { halign: 'center', cellWidth: 18 },
      7: { halign: 'center', fontStyle: 'bold', cellWidth: 18 },
    },
    margin: { left: 14, right: 14 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 7;

  // 5. Last 20 Plant Feed Entries
  // Check if we need a page break before the feed section
  if (currentY > 220) {
    doc.addPage();
    currentY = 16;
  }

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('4. Recent SCADA Live Feed Events (Last 20 Logged)', 14, currentY);
  currentY += 3;

  const recentFeed = (plantFeed || []).slice(0, 20);
  const feedHeaders = [['Time', 'Category', 'Severity', 'Event Title & Telemetry Detail']];
  const feedRows = recentFeed.map((entry) => [
    entry.timestamp,
    entry.category,
    entry.severity,
    `${sanitizePdfText(entry.title)} - ${sanitizePdfText(entry.description)}`,
  ]);

  autoTable(doc, {
    startY: currentY,
    head: feedHeaders,
    body: feedRows,
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], fontSize: 8, fontStyle: 'bold' },
    styles: { fontSize: 7, cellPadding: 1.8 },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 22 },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 122 },
    },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 2) {
        const sev = data.cell.raw;
        if (sev === 'CRITICAL') {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        } else if (sev === 'WARN') {
          data.cell.styles.textColor = [217, 119, 6];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    margin: { left: 14, right: 14 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 7;

  // 6. Latest AI Shift Handover Text (if one exists)
  // Retrieve saved handover from parameter, or attempt reading localStorage
  let handoverObj: HandoverResult | null = null;
  if (latestHandover) {
    if (typeof latestHandover === 'string') {
      try {
        handoverObj = JSON.parse(latestHandover);
      } catch {
        handoverObj = {
          isConfigured: true,
          shiftName,
          outgoingLead: leadInCharge,
          summary: latestHandover,
          keyIncidents: [],
          pendingActions: [],
        };
      }
    } else {
      handoverObj = latestHandover;
    }
  } else if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = window.localStorage.getItem('bharat_apex_latest_handover');
      if (stored) {
        handoverObj = JSON.parse(stored);
      }
    } catch {
      // Ignored
    }
  }

  if (handoverObj && handoverObj.summary) {
    // If not enough room on page, start new page
    if (currentY > 210) {
      doc.addPage();
      currentY = 16;
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('5. Latest AI Shift Handover Briefing', 14, currentY);
    currentY += 4;

    const handoverBoxY = currentY;
    const cleanSummary = sanitizePdfText(handoverObj.summary);
    const incidentLines = (handoverObj.keyIncidents || [])
      .map((inc) => `* [${inc.timestamp || 'Alert'}] ${inc.type || ''}: ${inc.description}`)
      .join('\n');
    const actionLines = (handoverObj.pendingActions || [])
      .map((act) => `* [ACTION PENDING]: ${act}`)
      .join('\n');

    let fullText = `Shift: ${handoverObj.shiftName || shiftName} | Outgoing Lead: ${
      handoverObj.outgoingLead || leadInCharge
    }\n\n${cleanSummary}`;

    if (incidentLines) {
      fullText += `\n\nKey Incidents:\n${incidentLines}`;
    }
    if (actionLines) {
      fullText += `\n\nPrioritized Action Items for Incoming Crew:\n${actionLines}`;
    }

    const splitText = doc.splitTextToSize(sanitizePdfText(fullText), 174);
    const boxHeight = Math.max(22, splitText.length * 4 + 8);

    doc.setDrawColor(199, 210, 254); // indigo-200
    doc.setFillColor(245, 247, 255); // indigo-50
    doc.roundedRect(14, handoverBoxY, 182, boxHeight, 1.5, 1.5, 'FD');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);
    doc.text(splitText, 18, handoverBoxY + 6);

    currentY += boxHeight + 6;
  }

  // 7. Add Footers with 'Demo data' and Page Numbers across all pages
  addPdfPageFooters(doc);

  // Save to file or return doc
  if (saveToFile) {
    const filename = `BharatApex_DailyShiftReport_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
  }

  return doc;
}

export interface BomPdfOptions {
  plantName?: string;
  date?: string;
  bomItems: BomItem[];
  baseCurrency: CurrencyCode;
  currencyRates: CurrencyRates;
  fxShocks: FxShocks;
  saveToFile?: boolean;
}

/**
 * Exports the BOM & Inventory Valuation Table as a PDF.
 * Includes:
 * - Header (plant, date, base currency)
 * - Flattened 3-level BOM table with quantities and landed cost in selected base currency
 * - 'Rs.' instead of Rupee symbol
 * - 'Demo data' footer and page numbering on every page
 */
export async function exportBomPdf(options: BomPdfOptions): Promise<any> {
  const { jsPDF, autoTable } = await getPdfLibraries();

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const {
    plantName = 'Bharat Apex Automotive - Chakan Manufacturing Hub',
    date = new Date().toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }),
    bomItems,
    baseCurrency,
    currencyRates,
    fxShocks,
    saveToFile = true,
  } = options;

  let currentY = 14;

  // 1. Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(14, currentY, 269, 20, 'F');

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('BHARAT APEX AUTOMOTIVE', 18, currentY + 8);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text('BILL OF MATERIALS (BOM) & INVENTORY VALUATION REPORT', 18, currentY + 14);
  doc.text(`Valuation Base Currency: ${baseCurrency}`, 275, currentY + 8, {
    align: 'right',
  });
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 275, currentY + 14, {
    align: 'right',
  });

  currentY += 24;

  // Metadata Sub-bar
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.text(`Facility: ${plantName}  |  Report Date: ${date}  |  All landed costs rolled up into ${baseCurrency} with tariffs & FX shocks`, 14, currentY);

  currentY += 4;

  // 2. Flatten BOM hierarchy
  const flattenBom = (items: BomItem[], depth = 1): (BomItem & { depth: number })[] => {
    let result: (BomItem & { depth: number })[] = [];
    items.forEach((item) => {
      result.push({ ...item, depth });
      if (item.children && item.children.length > 0) {
        result = result.concat(flattenBom(item.children, depth + 1));
      }
    });
    return result;
  };

  const flattened = flattenBom(bomItems);

  // 3. Table Rows
  const headers = [
    [
      'Level',
      'Part Number',
      'Part Description',
      'Category',
      'Qty / Assy',
      'Current Stock',
      'Safety Stock',
      'Stock Status',
      'Quoted Cost',
      `Landed Cost (${baseCurrency})`,
    ],
  ];

  const rows = flattened.map((item) => {
    const isLow = item.currentStock < item.safetyStock;
    const landedCost = rollUpBomLandedCost(item, currencyRates, fxShocks, baseCurrency);

    return [
      `L${item.level}`,
      item.partNumber,
      item.description,
      item.category,
      `${item.qtyPerAssembly}`,
      `${item.currentStock.toLocaleString('en-IN')} pcs`,
      `${item.safetyStock.toLocaleString('en-IN')} pcs`,
      isLow ? 'BELOW SAFETY' : 'NOMINAL',
      formatPdfCurrency(item.unitCost, item.currency, {
        useIndianSystem: false,
        decimals: item.currency === 'JPY' ? 0 : 2,
      }),
      formatPdfCurrency(landedCost, baseCurrency),
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: headers,
    body: rows,
    theme: 'striped',
    headStyles: {
      fillColor: [30, 41, 59],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'left',
    },
    styles: { fontSize: 7.5, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: 'bold', halign: 'center', cellWidth: 14 },
      1: { fontStyle: 'bold', cellWidth: 32 },
      2: { cellWidth: 55 },
      3: { cellWidth: 30 },
      4: { halign: 'right', cellWidth: 20 },
      5: { halign: 'right', cellWidth: 25 },
      6: { halign: 'right', cellWidth: 25 },
      7: { halign: 'center', fontStyle: 'bold', cellWidth: 24 },
      8: { halign: 'right', cellWidth: 22 },
      9: { halign: 'right', fontStyle: 'bold', cellWidth: 22 },
    },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 7) {
        if (data.cell.raw === 'BELOW SAFETY') {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fillColor = [254, 226, 226];
        } else {
          data.cell.styles.textColor = [16, 185, 129];
        }
      }
    },
    margin: { left: 14, right: 14 },
  });

  // 4. Add Footers with 'Demo data' and Page Numbers across all pages
  addPdfPageFooters(doc);

  if (saveToFile) {
    const filename = `BharatApex_BOM_Inventory_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
  }

  return doc;
}

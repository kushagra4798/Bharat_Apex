import { describe, it, expect } from 'vitest';
import {
  sanitizePdfText,
  formatPdfCurrency,
  getPdfLibraries,
  exportDailyShiftReportPdf,
  exportBomPdf,
} from './pdfExportService';
import {
  INITIAL_CUSTOMER_BUFFERS,
  INITIAL_WORK_ORDERS,
  MACHINES,
  INITIAL_BOM,
  INITIAL_TRUCKS,
  INITIAL_PLANT_FEED,
  DEFAULT_CURRENCY_RATES,
  DEFAULT_FX_SHOCKS,
} from '../data/mockData';

describe('PDF Export Service (Lazy-loaded jsPDF & jspdf-autotable)', () => {
  describe('Sanitization & Currency Formatting (Rs. Replacement)', () => {
    it('replaces Unicode Rupee symbol with "Rs. "', () => {
      expect(sanitizePdfText('₹25,00,000')).toBe('Rs. 25,00,000');
      expect(sanitizePdfText('Penalty: ₹1.5 L/hr')).toBe('Penalty: Rs. 1.5 L/hr');
      expect(sanitizePdfText('Total: ₹ 500')).toBe('Total: Rs. 500');
    });

    it('leaves standard currency symbols untouched', () => {
      expect(sanitizePdfText('$100.50')).toBe('$100.50');
      expect(sanitizePdfText('€85.00')).toBe('€85.00');
      expect(sanitizePdfText('No currency here')).toBe('No currency here');
      expect(sanitizePdfText('')).toBe('');
    });

    it('formatPdfCurrency uses Rs. instead of ₹ for INR amounts', () => {
      const inrFormatted = formatPdfCurrency(2500000, 'INR');
      expect(inrFormatted).not.toContain('₹');
      expect(inrFormatted).toContain('Rs.');
      expect(inrFormatted).toContain('25.00 L');
    });

    it('formatPdfCurrency formats USD and EUR without ₹ symbol', () => {
      const usdFormatted = formatPdfCurrency(1250.5, 'USD');
      expect(usdFormatted).not.toContain('₹');
      expect(usdFormatted).toContain('$');

      const eurFormatted = formatPdfCurrency(950, 'EUR');
      expect(eurFormatted).not.toContain('₹');
      expect(eurFormatted).toContain('€');
    });
  });

  describe('Dynamic Import / Lazy-Loading of jsPDF & autotable', () => {
    it('dynamically loads jsPDF and autoTable without static bundle pollution', async () => {
      const { jsPDF, autoTable } = await getPdfLibraries();
      expect(jsPDF).toBeDefined();
      expect(typeof jsPDF).toBe('function');
      expect(autoTable).toBeDefined();
      expect(typeof autoTable).toBe('function');

      const doc = new jsPDF();
      expect(doc.internal.pageSize.getWidth()).toBeGreaterThan(0);
    });
  });

  describe('exportDailyShiftReportPdf', () => {
    it('generates shift report PDF with header, KPIs, buffer table, open work orders, feed, and AI handover', async () => {
      const doc = await exportDailyShiftReportPdf({
        plantName: 'Bharat Apex Chakan Hub - Unit 4',
        shiftName: 'Morning Shift (06:00 - 14:00 IST)',
        leadInCharge: 'R. Deshmukh',
        date: '2026-10-26',
        customerBuffers: INITIAL_CUSTOMER_BUFFERS,
        workOrders: INITIAL_WORK_ORDERS,
        machines: MACHINES,
        plantFeed: INITIAL_PLANT_FEED,
        trucks: INITIAL_TRUCKS,
        baseCurrency: 'INR',
        currencyRates: DEFAULT_CURRENCY_RATES,
        fxShocks: DEFAULT_FX_SHOCKS,
        latestHandover: {
          isConfigured: true,
          shiftName: 'Morning Shift',
          outgoingLead: 'R. Deshmukh',
          summary: 'Nominal operational status. All cell cycle times within target tolerances.',
          keyIncidents: [
            { timestamp: '08:15', type: 'MAINTENANCE', description: 'CNC-01 routine filter wash' },
          ],
          pendingActions: ['Monitor Tiago axle buffer levels before 13:00 IST'],
        },
        saveToFile: false,
      });

      expect(doc).toBeDefined();
      const pageCount = doc.getNumberOfPages();
      expect(pageCount).toBeGreaterThanOrEqual(1);

      // Verify page properties
      const page1Width = doc.internal.pageSize.getWidth();
      const page1Height = doc.internal.pageSize.getHeight();
      expect(page1Width).toBeCloseTo(210, 0); // A4 portrait: 210mm
      expect(page1Height).toBeCloseTo(297, 0); // A4 portrait: 297mm
    });

    it('generates report cleanly when latest AI handover does not exist', async () => {
      const doc = await exportDailyShiftReportPdf({
        customerBuffers: INITIAL_CUSTOMER_BUFFERS,
        workOrders: INITIAL_WORK_ORDERS,
        machines: MACHINES,
        plantFeed: INITIAL_PLANT_FEED.slice(0, 5),
        trucks: INITIAL_TRUCKS,
        baseCurrency: 'INR',
        currencyRates: DEFAULT_CURRENCY_RATES,
        fxShocks: DEFAULT_FX_SHOCKS,
        latestHandover: null,
        saveToFile: false,
      });

      expect(doc).toBeDefined();
      expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    });
  });

  describe('exportBomPdf', () => {
    it('generates landscape BOM PDF table with quantities and landed cost in base currency', async () => {
      const doc = await exportBomPdf({
        plantName: 'Bharat Apex Automotive - Chakan Hub',
        date: '2026-10-26',
        bomItems: INITIAL_BOM,
        baseCurrency: 'INR',
        currencyRates: DEFAULT_CURRENCY_RATES,
        fxShocks: DEFAULT_FX_SHOCKS,
        saveToFile: false,
      });

      expect(doc).toBeDefined();
      const pageCount = doc.getNumberOfPages();
      expect(pageCount).toBeGreaterThanOrEqual(1);

      // Landscape A4 check: 297mm width, 210mm height
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      expect(pageWidth).toBeCloseTo(297, 0);
      expect(pageHeight).toBeCloseTo(210, 0);
    });

    it('generates BOM PDF in foreign base currency (USD)', async () => {
      const doc = await exportBomPdf({
        bomItems: INITIAL_BOM,
        baseCurrency: 'USD',
        currencyRates: DEFAULT_CURRENCY_RATES,
        fxShocks: DEFAULT_FX_SHOCKS,
        saveToFile: false,
      });

      expect(doc).toBeDefined();
      expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    });
  });
});

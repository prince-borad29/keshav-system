// ============================================================
// reportExportEngine.js — Export to CSV, Excel (.xlsx), PDF
// NaN-safe formatting for all export types
// ============================================================
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Format cell for export (NaN-safe) ────────────────────────
function formatExportCell(val, format) {
  if (val === null || val === undefined || val === '') return '-';

  switch (format) {
    case 'number': {
      const n = Number(val);
      return isNaN(n) ? String(val) : n.toLocaleString('en-IN');
    }
    case 'currency': {
      const n = Number(val);
      return isNaN(n) ? String(val) : `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    }
    case 'percentage': {
      const n = Number(val);
      return isNaN(n) ? String(val) : `${n.toFixed(1)}%`;
    }
    case 'date': {
      const d = new Date(val);
      return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString('en-IN');
    }
    case 'datetime': {
      const d = new Date(val);
      return isNaN(d.getTime()) ? String(val) : d.toLocaleString('en-IN');
    }
    case 'boolean':
      return val === true || val === 'true' ? 'Yes'
        : val === false || val === 'false' ? 'No'
        : String(val);
    default:
      return String(val);
  }
}

// ── Get raw value for Excel (typed correctly) ────────────────
function getExcelValue(val, format) {
  if (val === null || val === undefined || val === '') return '';

  if (format === 'number' || format === 'currency' || format === 'percentage') {
    const n = Number(val);
    // Only return as number if it's actually numeric
    return isNaN(n) ? String(val) : n;
  }

  if (format === 'boolean') {
    return val === true || val === 'true' ? 'Yes'
      : val === false || val === 'false' ? 'No'
      : String(val);
  }

  return String(val);
}

// Resolve export columns using columnConfigs
export function resolveExportColumns(columns, columnConfigs) {
  return columns
    .filter(c => !columnConfigs?.[c.key]?.hidden)
    .map(c => ({
      ...c,
      label: columnConfigs?.[c.key]?.label || c.label || c.key,
      format: columnConfigs?.[c.key]?.format || 'text',
    }));
}

// ════════════════════════════════════════════════════════════
// CSV Export
// ════════════════════════════════════════════════════════════
export function exportCSV(data, columns, reportTitle) {
  const headers = columns.map(c => c.label);
  const rows = data.map(row =>
    columns.map(c => formatExportCell(row[c.key], c.format))
  );
  const csvLines = [
    headers.map(h => `"${h}"`).join(','),
    ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
  ];
  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${sanitizeFilename(reportTitle)}.csv`);
}

// ════════════════════════════════════════════════════════════
// Excel Export
// ════════════════════════════════════════════════════════════
export async function exportExcel(data, columns, reportTitle) {
  const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs');

  const wsData = [
    columns.map(c => c.label),
    ...data.map(row =>
      columns.map(c => getExcelValue(row[c.key], c.format))
    ),
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws['!cols'] = columns.map(c => ({
    wch: Math.max(c.label.length, 14),
  }));

  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${sanitizeFilename(reportTitle)}.xlsx`);
}

// ════════════════════════════════════════════════════════════
// PDF Export
// ════════════════════════════════════════════════════════════
export function exportPDF(data, columns, reportTitle, options = {}) {
  const {
    orientation = 'landscape',
    primaryColor = [92, 48, 48],
    fontSize = 8,
    includeTimestamp = true,
  } = options;

  const doc = new jsPDF({ orientation, unit: 'mm' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const headers = columns.map(c => c.label);
  const rows = data.map(row =>
    columns.map(c => formatExportCell(row[c.key], c.format))
  );
  const timestamp = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  // Header banner
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(reportTitle, 14, 12);

  if (includeTimestamp) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${timestamp}`, pageWidth - 14, 12, { align: 'right' });
  }

  // Table
  autoTable(doc, {
    startY: 22,
    head: [headers],
    body: rows,
    theme: 'grid',
    headStyles: {
      fillColor: primaryColor,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: fontSize + 1,
    },
    bodyStyles: {
      fontSize,
      textColor: [30, 30, 30],
    },
    alternateRowStyles: {
      fillColor: [248, 246, 246],
    },
    styles: {
      cellPadding: 2.5,
      overflow: 'linebreak',
    },
    margin: { left: 14, right: 14 },
    didDrawPage: (hookData) => {
      const pageNum = hookData.pageNumber;
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(
        `Page ${pageNum} · ${reportTitle}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 6,
        { align: 'center' }
      );
    },
  });

  doc.save(`${sanitizeFilename(reportTitle)}.pdf`);
}

// ── Helpers ───────────────────────────────────────────────────
function sanitizeFilename(name) {
  return (name || 'Report').replace(/[^a-z0-9_\-\s]/gi, '').replace(/\s+/g, '_');
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ── Dispatch ──────────────────────────────────────────────────
export async function handleExport(format, data, columns, reportTitle) {
  if (!data || data.length === 0) throw new Error('No data to export');
  switch (format) {
    case 'csv':   exportCSV(data, columns, reportTitle);         break;
    case 'excel': await exportExcel(data, columns, reportTitle); break;
    case 'pdf':   exportPDF(data, columns, reportTitle);         break;
    default:      throw new Error(`Unknown format: ${format}`);
  }
}
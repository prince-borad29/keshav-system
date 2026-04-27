// reportExportEngine.js
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function sanitize(name) {
  return (name || 'Report').replace(/[^a-z0-9_\-\s]/gi, '').replace(/\s+/g, '_');
}

function trigger(blob, filename) {
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getExportRows(data) {
  return (data || []).filter(r => !r._type || r._type === 'data');
}

export function exportCSV(data, columns, title) {
  const rows   = getExportRows(data);
  const header = columns.map(c => `"${c.label}"`).join(',');
  const body   = rows.map(r => columns.map(c => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`).join(','));
  trigger(new Blob([[header, ...body].join('\n')], { type: 'text/csv;charset=utf-8;' }), `${sanitize(title)}.csv`);
}

export async function exportExcel(data, columns, title) {
  const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs');
  const rows  = getExportRows(data);
  const wsData = [
    columns.map(c => c.label),
    ...rows.map(row => columns.map(c => {
      const v = row[c.key];
      return c.type === 'number' ? (parseFloat(v) || 0) : String(v ?? '');
    })),
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = columns.map(c => ({ wch: Math.max(c.label.length + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${sanitize(title)}.xlsx`);
}

export function exportPDF(data, columns, title) {
  const rows  = getExportRows(data);
  const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm' });
  const pageW = doc.internal.pageSize.getWidth();
  const P     = [92, 48, 48];
  const ts    = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  doc.setFillColor(...P);
  doc.rect(0, 0, pageW, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 12);
  doc.setFontSize(7); doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${ts}  ·  ${rows.length} rows`, pageW - 14, 12, { align: 'right' });

  autoTable(doc, {
    startY: 22,
    head: [columns.map(c => c.label)],
    body: rows.map(row => columns.map(c => String(row[c.key] ?? ''))),
    theme: 'grid',
    headStyles: { fillColor: P, textColor: 255, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 7, textColor: [30, 30, 30] },
    alternateRowStyles: { fillColor: [249, 247, 247] },
    styles: { cellPadding: 2.5, overflow: 'linebreak' },
    margin: { left: 10, right: 10 },
    didDrawPage: ({ pageNumber }) => {
      doc.setFontSize(6); doc.setTextColor(150);
      doc.text(`Page ${pageNumber}  ·  ${title}`, pageW / 2, doc.internal.pageSize.getHeight() - 5, { align: 'center' });
    },
  });
  doc.save(`${sanitize(title)}.pdf`);
}

export async function handleExport(format, data, columns, title) {
  if (!data?.length) throw new Error('No data to export');
  if (format === 'csv')         exportCSV(data, columns, title);
  else if (format === 'excel') await exportExcel(data, columns, title);
  else if (format === 'pdf')    exportPDF(data, columns, title);
}
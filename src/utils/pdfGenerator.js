const PdfPrinter = require('pdfmake/src/printer');
const vfs = require('pdfmake/build/vfs_fonts');

const fonts = {
  Roboto: {
    normal:      Buffer.from(vfs['Roboto-Regular.ttf'], 'base64'),
    bold:        Buffer.from(vfs['Roboto-Medium.ttf'], 'base64'),
    italics:     Buffer.from(vfs['Roboto-Italic.ttf'], 'base64'),
    bolditalics: Buffer.from(vfs['Roboto-MediumItalic.ttf'], 'base64'),
  },
};

const printer = new PdfPrinter(fonts);

const fmt = (d) => d ? new Date(d).toLocaleDateString('sw-TZ') : '—';

const TYPE_LABEL = { image: 'Picha', video: 'Video', document: 'Hati', audio: 'Sauti' };

const evidenceBox = (files, note) => {
  const rows = [];
  if (note) {
    rows.push({ text: note, italics: true, fontSize: 8, color: '#444444', margin: [6, 4, 6, 3] });
  }
  for (const file of files) {
    const typeLabel = TYPE_LABEL[file.file_type] || 'Faili';
    const desc = file.description ? ` — ${file.description}` : '';
    rows.push({ text: `• [${typeLabel}]  ${file.file_name}${desc}`, fontSize: 8.5, color: '#333333', margin: [10, 1, 6, 1] });
  }
  return {
    table: { widths: ['*'], body: [[{ stack: rows }]] },
    layout: { hLineColor: () => '#cccccc', vLineColor: () => '#cccccc', fillColor: () => '#f8f9fa' },
    margin: [0, 4, 0, 6],
  };
};

const buildContent = (caseData) => {
  const content = [];

  // ── Header ──────────────────────────────────────────────────────────────
  content.push({ text: 'OLAM TECHNOLOGIES — HELION TRACKING', style: 'company', alignment: 'center', margin: [0, 0, 0, 3] });
  content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: '#1a1a2e' }] });
  content.push({ text: 'TAARIFA RASMI YA TUKIO  /  INCIDENT REPORT', style: 'title', alignment: 'center', margin: [0, 6, 0, 2] });
  content.push({ text: caseData.title, style: 'caseTitle', alignment: 'center', margin: [0, 0, 0, 8] });

  // ── Metadata table ───────────────────────────────────────────────────────
  content.push({
    table: {
      widths: [110, '*', 100, '*'],
      body: [
        [
          { text: 'Case ID:', bold: true, fontSize: 9 }, { text: caseData.id, fontSize: 9 },
          { text: 'Tarehe / Date:', bold: true, fontSize: 9 }, { text: fmt(caseData.incident_date), fontSize: 9 },
        ],
        [
          { text: 'Gari / Vehicle:', bold: true, fontSize: 9 }, { text: caseData.vehicle_plate || '—', fontSize: 9 },
          { text: 'Hali / Status:', bold: true, fontSize: 9 }, { text: (caseData.status || '').toUpperCase(), fontSize: 9 },
        ],
        [
          { text: 'Dereva / Driver:', bold: true, fontSize: 9 },
          { text: (caseData.drivers || []).map(d => d.name).join(', ') || caseData.driver_name || '—', fontSize: 9 },
          { text: 'Ukali / Severity:', bold: true, fontSize: 9 },
          { text: (caseData.severity || '').toUpperCase(), fontSize: 9 },
        ],
      ],
    },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 10],
  });

  content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#cccccc' }] });
  content.push({ text: ' ', margin: [0, 2] });

  // ── Steps (text only; evidence shown as a sub-block under each step) ─────
  for (const step of caseData.steps || []) {
    content.push({ text: step.label || 'Step', style: 'stepHeading', margin: [0, 6, 0, 2] });
    if (step.content) {
      content.push({ text: step.content, style: 'body', margin: [0, 0, 0, 4] });
    }
    // Evidence attached to this step
    if ((step.files && step.files.length > 0) || step.note) {
      content.push({
        text: [{ text: 'Ushahidi / Evidence', bold: true, fontSize: 8.5, color: '#1a1a2e' }],
        margin: [0, 2, 0, 1],
      });
      content.push(evidenceBox(step.files || [], step.note));
    }
  }

  // ── General Evidence section ──────────────────────────────────────────────
  const ge = caseData.generalEvidence || [];
  if (ge.length > 0) {
    content.push({ text: ' ', margin: [0, 6] });
    content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#cccccc' }] });
    content.push({ text: 'USHAHIDI WA JUMLA / GENERAL EVIDENCE', style: 'stepHeading', margin: [0, 6, 0, 4] });
    content.push(evidenceBox(ge, null));
  }

  // ── Signature block ───────────────────────────────────────────────────────
  content.push({ text: ' ', margin: [0, 8] });
  content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.5, lineColor: '#1a1a2e' }] });
  content.push({ text: ' ', margin: [0, 6] });
  content.push({
    columns: [
      {
        stack: [
          { text: 'Imeandaliwa na:', bold: true, fontSize: 8 },
          { text: '\n\n_____________________', fontSize: 8 },
          { text: 'Jina / Cheo / Sahihi', fontSize: 7, color: '#777' },
          { text: 'Tarehe: ___/___/______', fontSize: 7, margin: [0, 3] },
        ],
      },
      {
        stack: [
          { text: 'Imepitiwa na (Meneja):', bold: true, fontSize: 8 },
          { text: '\n\n_____________________', fontSize: 8 },
          { text: 'Jina / Cheo / Sahihi', fontSize: 7, color: '#777' },
          { text: 'Tarehe: ___/___/______', fontSize: 7, margin: [0, 3] },
        ],
      },
      {
        stack: [
          { text: 'Imeidhinishwa na (HR):', bold: true, fontSize: 8 },
          { text: '\n\n_____________________', fontSize: 8 },
          { text: 'Jina / Cheo / Sahihi', fontSize: 7, color: '#777' },
          { text: 'Tarehe: ___/___/______', fontSize: 7, margin: [0, 3] },
        ],
      },
    ],
    columnGap: 16,
  });

  return content;
};

exports.generate = (caseData) => {
  const docDefinition = {
    content: buildContent(caseData),
    defaultStyle: { font: 'Roboto', fontSize: 9.5 },
    styles: {
      company:     { fontSize: 10, bold: true, color: '#1a1a2e' },
      title:       { fontSize: 13, bold: true, color: '#1a1a2e' },
      caseTitle:   { fontSize: 10, bold: true, color: '#333333', italics: true },
      stepHeading: { fontSize: 10, bold: true, color: '#1a1a2e' },
      body:        { fontSize: 9.5, lineHeight: 1.4, color: '#333333' },
    },
    pageMargins: [36, 36, 36, 48],
    footer: (currentPage, pageCount) => ({
      text: `Helion Tracking — Olam Technologies  |  Ukurasa ${currentPage} / ${pageCount}  |  Siri / Confidential`,
      alignment: 'center', fontSize: 7, color: '#999999', margin: [36, 8],
    }),
  };

  return printer.createPdfKitDocument(docDefinition);
};

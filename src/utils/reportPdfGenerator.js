const { JSDOM } = require('jsdom');
const htmlToPdfMake = require('html-to-pdfmake');
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

function stripFontFamily(obj) {
  if (Array.isArray(obj)) return obj.map(stripFontFamily);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'font') continue;
      out[k] = stripFontFamily(v);
    }
    return out;
  }
  return obj;
}

function fixWidths(obj) {
  if (Array.isArray(obj)) return obj.map(fixWidths);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'font') continue;
      if ((k === 'width' || k === 'widths') && typeof v === 'string' && /[^\d.]/.test(v)) continue;
      out[k] = fixWidths(v);
    }
    if (out.table && !out.table.widths) {
      const cols = out.table.body?.[0]?.length || 2;
      out.table.widths = Array(cols).fill('*');
    }
    if (out.table?.body) {
      const noBorder = out.table.layout === 'noBorders'
        || out._signatureTable
        || out.table.dontBreakRows;
      if (noBorder && !out.layout) out.layout = 'noBorders';
    }
    return out;
  }
  return obj;
}

function preprocessHtml(htmlContent) {
  let h = String(htmlContent || '');

  // Signature tables — strip cell borders for PDF
  h = h.replace(
    /<table([^>]*class="[^"]*helion-signature-table[^"]*"[^>]*)>/gi,
    '<table$1 border="0" style="border:none;border-collapse:collapse;width:100%">',
  );
  h = h.replace(
    /(<table[^>]*helion-signature-table[^>]*>)([\s\S]*?)(<\/table>)/gi,
    (_, open, body, close) => {
      const inner = body
        .replace(/<td([^>]*)>/gi, '<td$1 style="border:none;padding:8px 10px;">')
        .replace(/<th([^>]*)>/gi, '<th$1 style="border:none;padding:8px 10px;background:transparent;">');
      return `${open}${inner}${close}`;
    },
  );

  // Explicit page breaks handled by splitting HTML before conversion
  return h
    .replace(/<colgroup[^>]*>[\s\S]*?<\/colgroup>/gi, '')
    .replace(/font-family\s*:[^;"}]+;?/gi, '')
    .replace(/width\s*:\s*\d+%[^;"}]*;?/gi, '')
    .replace(/max-width\s*:[^;"}]+;?/gi, '')
    .replace(/margin\s*:\s*0\s+auto[^;"}]*;?/gi, '');
}

function injectPdfPageBreaks(content) {
  return content;
}

function markSignatureTablesInHtml(html) {
  return html;
}

module.exports = async function generateReportPdf(htmlContent, { title = 'Official Report', caseId = '' } = {}) {
  const { window } = new JSDOM('');

  const parts = String(htmlContent || '').split(/<div[^>]*data-page-break[^>]*>\s*<\/div>/gi);
  const pdfContent = [];

  parts.forEach((part, idx) => {
    const prepped = preprocessHtml(part);
    const chunk = String(prepped || '').trim();
    if (!chunk) return;
    if (idx > 0) pdfContent.push({ text: '', pageBreak: 'before' });
    const raw = htmlToPdfMake(chunk, { window, defaultStyles: { p: { margin: [0, 0, 0, 8] } } });
    const fixed = fixWidths(stripFontFamily(raw));
    if (Array.isArray(fixed)) pdfContent.push(...fixed);
    else if (fixed) pdfContent.push(fixed);
  });

  if (!pdfContent.length) {
    const prepped = preprocessHtml(htmlContent);
    const raw = htmlToPdfMake(prepped, { window });
    const fixed = fixWidths(stripFontFamily(raw));
    if (Array.isArray(fixed)) pdfContent.push(...fixed);
    else pdfContent.push(fixed);
  }

  const docDefinition = {
    content: pdfContent,
    defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.4 },
    styles: {
      'html-h1': { fontSize: 16, bold: true, marginBottom: 6 },
      'html-h2': { fontSize: 14, bold: true, marginBottom: 5 },
      'html-h3': { fontSize: 12, bold: true, marginBottom: 4 },
      'html-p':  { marginBottom: 8 },
    },
    pageMargins: [50, 50, 50, 60],
    footer: (currentPage, pageCount) => ({
      text: `Helion Tracking — ${title}  ·  ${caseId}  |  Page ${currentPage} of ${pageCount}  |  CONFIDENTIAL`,
      alignment: 'center',
      fontSize: 7,
      color: '#999999',
      margin: [40, 12],
    }),
  };

  const printer = new PdfPrinter(fonts);
  return printer.createPdfKitDocument(docDefinition);
};

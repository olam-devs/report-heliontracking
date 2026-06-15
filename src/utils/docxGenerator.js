const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, Table, TableRow, TableCell,
  WidthType, ShadingType,
} = require('docx');

const fmt = (d) => d ? new Date(d).toLocaleDateString('sw-TZ') : '—';

const noBorders = {
  top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
  left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
};

const TYPE_LABEL = { image: 'Picha', video: 'Video', document: 'Hati', audio: 'Sauti' };

const evidenceParagraphs = (files, note) => {
  const paras = [];
  if (note) {
    paras.push(new Paragraph({
      children: [new TextRun({ text: note, italics: true, color: '444444', size: 16 })],
      spacing: { after: 40 },
    }));
  }
  for (const file of files) {
    const typeLabel = TYPE_LABEL[file.file_type] || 'Faili';
    const desc = file.description ? ` — ${file.description}` : '';
    paras.push(new Paragraph({
      children: [new TextRun({ text: `• [${typeLabel}]  ${file.file_name}${desc}`, size: 18 })],
      indent: { left: 360 },
      spacing: { after: 40 },
    }));
  }
  return paras;
};

const buildDoc = async (caseData) => {
  const children = [];

  // ── Header ───────────────────────────────────────────────────────────────
  children.push(new Paragraph({
    children: [new TextRun({ text: 'OLAM TECHNOLOGIES — HELION TRACKING', bold: true, size: 22 })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: 'TAARIFA RASMI YA TUKIO  /  INCIDENT REPORT', bold: true, size: 26 })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: caseData.title, bold: true, size: 22, italics: true })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 160 },
  }));

  // ── Metadata table ────────────────────────────────────────────────────────
  const metaRows = [
    ['Case ID', caseData.id, 'Tarehe / Date', fmt(caseData.incident_date)],
    ['Gari / Vehicle', caseData.vehicle_plate || '—', 'Hali / Status', (caseData.status || '').toUpperCase()],
    ['Dereva / Driver', (caseData.drivers || []).map(d => d.name).join(', ') || caseData.driver_name || '—', 'Ukali / Severity', (caseData.severity || '').toUpperCase()],
  ];

  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: metaRows.map(row =>
      new TableRow({
        children: row.map((cell, i) =>
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: cell, bold: i % 2 === 0, size: 18 })],
            })],
            shading: i % 2 === 0 ? { type: ShadingType.SOLID, color: 'e8eaf6', fill: 'e8eaf6' } : {},
          })
        ),
      })
    ),
  }));
  children.push(new Paragraph({ text: '', spacing: { after: 120 } }));

  // ── Steps ─────────────────────────────────────────────────────────────────
  for (const step of caseData.steps || []) {
    // Heading
    children.push(new Paragraph({
      children: [new TextRun({ text: step.label || 'Step', bold: true, size: 20 })],
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 160, after: 80 },
    }));

    // Narrative text
    if (step.content) {
      for (const line of step.content.split('\n')) {
        children.push(new Paragraph({
          children: [new TextRun({ text: line, size: 19 })],
          spacing: { after: 60 },
        }));
      }
    }

    // Evidence attached to this step
    const hasEvidence = (step.files && step.files.length > 0) || step.note;
    if (hasEvidence) {
      children.push(new Paragraph({
        children: [new TextRun({ text: 'Ushahidi / Evidence', bold: true, size: 18, color: '1a1a2e' })],
        spacing: { before: 80, after: 40 },
      }));
      children.push(...evidenceParagraphs(step.files || [], step.note));
    }
  }

  // ── General Evidence ──────────────────────────────────────────────────────
  const ge = caseData.generalEvidence || [];
  if (ge.length > 0) {
    children.push(new Paragraph({ text: '', spacing: { before: 160 } }));
    children.push(new Paragraph({
      children: [new TextRun({ text: 'USHAHIDI WA JUMLA / GENERAL EVIDENCE', bold: true, size: 20 })],
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 120, after: 80 },
    }));
    children.push(...evidenceParagraphs(ge, null));
  }

  // ── Signature block ───────────────────────────────────────────────────────
  children.push(new Paragraph({ text: '', spacing: { before: 320 } }));
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({ children: [new TextRun({ text: 'Imeandaliwa na:', bold: true, size: 18 })] }),
              new Paragraph({ text: '' }),
              new Paragraph({ children: [new TextRun({ text: '________________________', size: 18 })] }),
              new Paragraph({ children: [new TextRun({ text: 'Jina / Cheo / Sahihi', color: '777777', size: 16 })] }),
              new Paragraph({ children: [new TextRun({ text: 'Tarehe: ___/___/______', size: 16 })] }),
            ],
            borders: noBorders,
          }),
          new TableCell({
            children: [
              new Paragraph({ children: [new TextRun({ text: 'Imepitiwa na (Meneja):', bold: true, size: 18 })] }),
              new Paragraph({ text: '' }),
              new Paragraph({ children: [new TextRun({ text: '________________________', size: 18 })] }),
              new Paragraph({ children: [new TextRun({ text: 'Jina / Cheo / Sahihi', color: '777777', size: 16 })] }),
              new Paragraph({ children: [new TextRun({ text: 'Tarehe: ___/___/______', size: 16 })] }),
            ],
            borders: noBorders,
          }),
          new TableCell({
            children: [
              new Paragraph({ children: [new TextRun({ text: 'Imeidhinishwa na (HR):', bold: true, size: 18 })] }),
              new Paragraph({ text: '' }),
              new Paragraph({ children: [new TextRun({ text: '________________________', size: 18 })] }),
              new Paragraph({ children: [new TextRun({ text: 'Jina / Cheo / Sahihi', color: '777777', size: 16 })] }),
              new Paragraph({ children: [new TextRun({ text: 'Tarehe: ___/___/______', size: 16 })] }),
            ],
            borders: noBorders,
          }),
        ],
      }),
    ],
  }));

  return new Document({ sections: [{ children }] });
};

exports.generate = async (caseData) => {
  const doc = await buildDoc(caseData);
  return Packer.toBuffer(doc);
};

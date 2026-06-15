import { useEditor, EditorContent } from '@tiptap/react';
import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { TextAlign } from '@tiptap/extension-text-align';
import { Highlight } from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { useEffect, useRef, useState, useCallback } from 'react';

// ── Custom FontSize extension ─────────────────────────────────────────────────
const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: el => el.style.fontSize || null,
          renderHTML: attrs => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: (size) => ({ chain }) => chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

// ── Custom FontFamily extension ───────────────────────────────────────────────
const FontFamily = Extension.create({
  name: 'fontFamily',
  addOptions() { return { types: ['textStyle'] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontFamily: {
          default: null,
          parseHTML: el => el.style.fontFamily?.replace(/['"]/g, '') || null,
          renderHTML: attrs => attrs.fontFamily ? { style: `font-family: ${attrs.fontFamily}` } : {},
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontFamily: (family) => ({ chain }) => chain().setMark('textStyle', { fontFamily: family }).run(),
      unsetFontFamily: () => ({ chain }) => chain().setMark('textStyle', { fontFamily: null }).removeEmptyTextStyle().run(),
    };
  },
});

const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: 'div[data-page-break]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-page-break': 'true',
      class: 'helion-page-break',
      style: 'page-break-before: always; break-before: page;',
    })];
  },
  addCommands() {
    return {
      setPageBreak: () => ({ commands }) => commands.insertContent({ type: this.name }),
    };
  },
});

// ── Toolbar components ────────────────────────────────────────────────────────
const Btn = ({ active, onClick, title, children, className = '' }) => (
  <button
    type="button"
    onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    title={title}
    className={`px-2 py-1 rounded text-sm leading-none transition-colors ${
      active ? 'bg-brand-600 text-white' : 'text-gray-700 hover:bg-gray-100'
    } ${className}`}
  >
    {children}
  </button>
);

const Sep = () => <span className="w-px h-5 bg-gray-300 mx-1 self-center shrink-0" />;

const COLORS = ['#000000','#1e293b','#dc2626','#2563eb','#16a34a','#d97706','#7c3aed','#db2777','#475569'];

const FONT_SIZES = ['10px','11px','12px','14px','16px','18px','20px','24px','28px','32px','36px','48px'];

const FONT_FAMILIES = [
  { label: 'Default',    value: '' },
  { label: 'Sans-serif', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Serif',      value: 'Georgia, "Times New Roman", serif' },
  { label: 'Monospace',  value: '"Courier New", Courier, monospace' },
];

// A4 at 96dpi: 794px × 1123px; with 72px margins → content 650px × 979px
const A4_CONTENT_HEIGHT = 979;

export default function TipTapEditor({ content, onChange, editable = true, paginated = false }) {
  const lastEmitted = useRef(content);
  const editorDomRef = useRef(null);
  const [pageCount, setPageCount] = useState(1);
  const [currentFontSize, setCurrentFontSize] = useState('');

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      FontSize,
      FontFamily,
      PageBreak,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      lastEmitted.current = html;
      onChange?.(html);
    },
    onSelectionUpdate: ({ editor }) => {
      const attrs = editor.getAttributes('textStyle');
      setCurrentFontSize(attrs.fontSize || '');
    },
  });

  useEffect(() => {
    if (editor && content !== lastEmitted.current) {
      lastEmitted.current = content;
      editor.commands.setContent(content, false);
    }
  }, [content]);

  useEffect(() => {
    if (editor) editor.setEditable(editable);
  }, [editable]);

  // Measure content height for page count
  const measurePages = useCallback(() => {
    if (!editorDomRef.current) return;
    const proseMirror = editorDomRef.current.querySelector('.ProseMirror');
    if (!proseMirror) return;
    const h = proseMirror.scrollHeight;
    setPageCount(Math.max(1, Math.ceil(h / A4_CONTENT_HEIGHT)));
  }, []);

  useEffect(() => {
    if (!paginated || !editor) return;
    const dom = editor.view?.dom;
    if (!dom) return;
    editorDomRef.current = dom.parentElement;
    const ro = new ResizeObserver(measurePages);
    ro.observe(dom);
    measurePages();
    return () => ro.disconnect();
  }, [editor, paginated, measurePages]);

  // Compute page-break divider positions
  const pageBreakLines = paginated
    ? Array.from({ length: pageCount - 1 }, (_, i) => (i + 1) * A4_CONTENT_HEIGHT)
    : [];

  if (!editor) return null;

  const e = editor;

  // ── Font size helpers ──────────────────────────────────────────────────────
  const getSizeNum = () => parseInt(currentFontSize) || 16;
  const increaseFontSize = () => {
    const cur = getSizeNum();
    const next = FONT_SIZES.find(s => parseInt(s) > cur) || '48px';
    e.chain().focus().setFontSize(next).run();
    setCurrentFontSize(next);
  };
  const decreaseFontSize = () => {
    const cur = getSizeNum();
    const prev = [...FONT_SIZES].reverse().find(s => parseInt(s) < cur) || '10px';
    e.chain().focus().setFontSize(prev).run();
    setCurrentFontSize(prev);
  };

  // ── Current font family ────────────────────────────────────────────────────
  const currentFamily = e.getAttributes('textStyle').fontFamily || '';
  const currentFamilyLabel = FONT_FAMILIES.find(f => f.value === currentFamily)?.label || 'Default';

  return (
    <div className={`flex flex-col border border-gray-300 rounded-lg overflow-hidden bg-white ${paginated ? 'shadow-xl' : ''}`}>
      {editable && (
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
          {/* History */}
          <Btn onClick={() => e.chain().focus().undo().run()} title="Undo">↩</Btn>
          <Btn onClick={() => e.chain().focus().redo().run()} title="Redo">↪</Btn>
          <Sep />

          {/* Font family */}
          <select
            className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-500 h-7"
            value={currentFamily}
            title="Font family"
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(ev) => {
              const val = ev.target.value;
              if (val) {
                e.chain().focus().setFontFamily(val).run();
              } else {
                e.chain().focus().unsetFontFamily().run();
              }
            }}
          >
            {FONT_FAMILIES.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>

          {/* Font size */}
          <div className="flex items-center gap-0.5 border border-gray-200 rounded bg-white h-7">
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); decreaseFontSize(); }}
              className="px-1.5 text-sm text-gray-600 hover:bg-gray-100 h-full rounded-l"
              title="Decrease font size"
            >A−</button>
            <select
              className="text-xs text-gray-700 border-0 focus:outline-none bg-transparent text-center w-14"
              value={currentFontSize}
              title="Font size"
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(ev) => {
                const val = ev.target.value;
                if (val) {
                  e.chain().focus().setFontSize(val).run();
                  setCurrentFontSize(val);
                } else {
                  e.chain().focus().unsetFontSize().run();
                  setCurrentFontSize('');
                }
              }}
            >
              <option value="">Default</option>
              {FONT_SIZES.map(s => <option key={s} value={s}>{s.replace('px','')}</option>)}
            </select>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); increaseFontSize(); }}
              className="px-1.5 text-sm text-gray-600 hover:bg-gray-100 h-full rounded-r"
              title="Increase font size"
            >A+</button>
          </div>
          <Sep />

          {/* Headings */}
          <Btn active={e.isActive('heading', { level: 1 })} onClick={() => e.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1">H1</Btn>
          <Btn active={e.isActive('heading', { level: 2 })} onClick={() => e.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">H2</Btn>
          <Btn active={e.isActive('heading', { level: 3 })} onClick={() => e.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3">H3</Btn>
          <Btn active={e.isActive('paragraph')} onClick={() => e.chain().focus().setParagraph().run()} title="Paragraph">¶</Btn>
          <Sep />

          {/* Inline formatting */}
          <Btn active={e.isActive('bold')}      onClick={() => e.chain().focus().toggleBold().run()}      title="Bold"><strong>B</strong></Btn>
          <Btn active={e.isActive('italic')}    onClick={() => e.chain().focus().toggleItalic().run()}    title="Italic"><em>I</em></Btn>
          <Btn active={e.isActive('underline')} onClick={() => e.chain().focus().toggleUnderline().run()} title="Underline"><u>U</u></Btn>
          <Btn active={e.isActive('strike')}    onClick={() => e.chain().focus().toggleStrike().run()}    title="Strikethrough"><s>S</s></Btn>
          <Sep />

          {/* Alignment */}
          <Btn active={e.isActive({ textAlign: 'left' })}    onClick={() => e.chain().focus().setTextAlign('left').run()}    title="Align left">⇐</Btn>
          <Btn active={e.isActive({ textAlign: 'center' })}  onClick={() => e.chain().focus().setTextAlign('center').run()}  title="Align center">⇔</Btn>
          <Btn active={e.isActive({ textAlign: 'right' })}   onClick={() => e.chain().focus().setTextAlign('right').run()}   title="Align right">⇒</Btn>
          <Btn active={e.isActive({ textAlign: 'justify' })} onClick={() => e.chain().focus().setTextAlign('justify').run()} title="Justify">≡</Btn>
          <Sep />

          {/* Lists */}
          <Btn active={e.isActive('bulletList')}  onClick={() => e.chain().focus().toggleBulletList().run()}  title="Bullet list">• List</Btn>
          <Btn active={e.isActive('orderedList')} onClick={() => e.chain().focus().toggleOrderedList().run()} title="Ordered list">1. List</Btn>
          <Sep />

          {/* Table */}
          <Btn onClick={() => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Insert table">⊞ Table</Btn>
          <Btn
            onClick={() => e.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: false }).updateAttributes('table', { class: 'helion-signature-table' }).run()}
            title="Signature block (no grid lines)"
          >
            ✍ Sig
          </Btn>
          {e.isActive('table') && (
            <>
              <Btn onClick={() => e.chain().focus().addColumnAfter().run()} title="Add column">+Col</Btn>
              <Btn onClick={() => e.chain().focus().addRowAfter().run()} title="Add row">+Row</Btn>
              <Btn onClick={() => e.chain().focus().deleteColumn().run()} title="Delete column">−Col</Btn>
              <Btn onClick={() => e.chain().focus().deleteRow().run()} title="Delete row">−Row</Btn>
              <Btn onClick={() => e.chain().focus().deleteTable().run()} title="Delete table">✕ Table</Btn>
            </>
          )}
          <Sep />

          {/* Text colors */}
          <span className="flex items-center gap-0.5 ml-0.5" title="Text color">
            {COLORS.map(c => (
              <button
                key={c}
                type="button"
                onMouseDown={(ev) => { ev.preventDefault(); e.chain().focus().setColor(c).run(); }}
                style={{ background: c, width: 14, height: 14, borderRadius: 2, border: '1px solid #0002', flexShrink: 0 }}
                title={c}
              />
            ))}
          </span>
          <Sep />

          {/* Highlight */}
          <Btn active={e.isActive('highlight', { color: '#fde047' })} onClick={() => e.chain().focus().toggleHighlight({ color: '#fde047' }).run()} title="Highlight yellow">🖍</Btn>
          <Btn active={e.isActive('highlight', { color: '#86efac' })} onClick={() => e.chain().focus().toggleHighlight({ color: '#86efac' }).run()} title="Highlight green" className="text-xs">🟢</Btn>
          <Btn active={e.isActive('highlight', { color: '#fca5a5' })} onClick={() => e.chain().focus().toggleHighlight({ color: '#fca5a5' }).run()} title="Highlight red" className="text-xs">🔴</Btn>

          {/* Clear formatting */}
          <Btn onClick={() => e.chain().focus().clearNodes().unsetAllMarks().run()} title="Clear formatting">✕</Btn>

          {/* Horizontal rule / page break */}
          <Btn onClick={() => e.chain().focus().setHorizontalRule().run()} title="Horizontal rule">—</Btn>
          <Btn onClick={() => e.chain().focus().setPageBreak().run()} title="Page break (new PDF page)">⏎ Page</Btn>

          {/* Page count indicator (paginated mode only) */}
          {paginated && (
            <>
              <Sep />
              <span className="text-xs text-gray-400 whitespace-nowrap px-1">
                ~{pageCount} page{pageCount !== 1 ? 's' : ''}
              </span>
            </>
          )}
        </div>
      )}

      {/* Editor content area */}
      {paginated ? (
        <div className="bg-gray-200 overflow-auto" style={{ minHeight: '500px' }}>
          {/* A4 page simulation */}
          <div
            className="mx-auto my-6 bg-white shadow-2xl relative"
            style={{ width: '794px', minHeight: `${A4_CONTENT_HEIGHT + 2 * 72}px` }}
          >
            {/* Page break lines */}
            {pageBreakLines.map((y) => (
              <div
                key={y}
                className="absolute left-0 right-0 pointer-events-none z-10"
                style={{ top: y + 72 }}
              >
                <div className="border-t-2 border-dashed border-blue-300 relative">
                  <span className="absolute right-2 -top-3 text-[10px] text-blue-400 bg-white px-1 font-medium">
                    page break
                  </span>
                </div>
              </div>
            ))}

            {/* Page number labels on the right */}
            {Array.from({ length: pageCount }, (_, i) => (
              <div
                key={i}
                className="absolute pointer-events-none z-10"
                style={{
                  top: i * A4_CONTENT_HEIGHT + 72 + 8,
                  right: -48,
                  width: 40,
                }}
              >
                <div className="bg-blue-100 text-blue-600 text-[10px] font-bold text-center rounded px-1 py-0.5">
                  {i + 1}
                </div>
              </div>
            ))}

            <EditorContent
              editor={editor}
              className="prose prose-sm max-w-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[979px] [&_.ProseMirror]:p-[72px] [&_.ProseMirror_table]:border-collapse [&_.ProseMirror_table]:w-full [&_.ProseMirror_td]:border [&_.ProseMirror_td]:border-gray-300 [&_.ProseMirror_td]:p-2 [&_.ProseMirror_th]:border [&_.ProseMirror_th]:border-gray-400 [&_.ProseMirror_th]:p-2 [&_.ProseMirror_th]:bg-gray-100 [&_.ProseMirror_th]:font-bold [&_.helion-signature-table]:border-0 [&_.helion-signature-table_td]:border-0 [&_.helion-signature-table_th]:border-0 [&_.helion-signature-table_th]:bg-transparent [&_.helion-page-break]:my-3 [&_.helion-page-break]:border-t-2 [&_.helion-page-break]:border-dashed [&_.helion-page-break]:border-blue-300 [&_.helion-page-break]:relative [&_.helion-page-break]:h-0"
            />
          </div>

          {/* Page count footer */}
          <div className="text-center pb-6 text-xs text-gray-400">
            Estimated {pageCount} A4 page{pageCount !== 1 ? 's' : ''} when printed
          </div>
        </div>
      ) : (
        <EditorContent
          editor={editor}
          className="flex-1 min-h-[400px] prose prose-sm max-w-none p-6 focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[400px] [&_.ProseMirror_table]:border-collapse [&_.ProseMirror_table]:w-full [&_.ProseMirror_td]:border [&_.ProseMirror_td]:border-gray-300 [&_.ProseMirror_td]:p-2 [&_.ProseMirror_th]:border [&_.ProseMirror_th]:border-gray-400 [&_.ProseMirror_th]:p-2 [&_.ProseMirror_th]:bg-gray-100 [&_.ProseMirror_th]:font-bold [&_.helion-signature-table]:border-0 [&_.helion-signature-table_td]:border-0 [&_.helion-signature-table_th]:border-0 [&_.helion-signature-table_th]:bg-transparent [&_.helion-page-break]:my-3 [&_.helion-page-break]:border-t-2 [&_.helion-page-break]:border-dashed [&_.helion-page-break]:border-blue-300"
        />
      )}
    </div>
  );
}

import { useState, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import EvidenceBlock from './EvidenceBlock';
import MiniEditor from './MiniEditor';

export default function StepBlock({ step, onUpdate, onDelete, onInsertAfter }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(step.label || '');
  const [content, setContent] = useState(step.content || '');
  const [note, setNote] = useState(step.note || '');
  const [saving, setSaving] = useState(false);
  const [showEvidence, setShowEvidence] = useState(
    !!(step.files?.length > 0 || step.note)
  );

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const save = async () => {
    setSaving(true);
    await onUpdate(step.id, { label, content, note });
    setSaving(false);
    setEditing(false);
  };

  const cancel = () => {
    setEditing(false);
    setLabel(step.label || '');
    setContent(step.content || '');
    setNote(step.note || '');
  };

  const handleEvidenceChange = useCallback((updated) => {
    onUpdate(step.id, updated, true);
  }, [step.id, onUpdate]);

  const filesCount = step.files?.length || 0;

  // Detect if content is HTML
  const isHtml = content && /<[a-z][\s\S]*>/i.test(content);

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <div className={`card transition-shadow ${isDragging ? 'shadow-xl ring-2 ring-brand-600' : ''}`}>
        {/* Step header */}
        <div className="flex items-start gap-3 p-4 border-b border-gray-100">
          <button {...attributes} {...listeners}
            className="drag-handle mt-0.5 p-1 text-gray-300 hover:text-gray-500 rounded shrink-0"
            title="Drag to reorder">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 6a2 2 0 100-4 2 2 0 000 4zM8 14a2 2 0 100-4 2 2 0 000 4zM8 22a2 2 0 100-4 2 2 0 000 4zM16 6a2 2 0 100-4 2 2 0 000 4zM16 14a2 2 0 100-4 2 2 0 000 4zM16 22a2 2 0 100-4 2 2 0 000 4z" />
            </svg>
          </button>

          {/* Label */}
          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                className="input text-base font-semibold"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Step title / label…"
                autoFocus
              />
            ) : (
              <h3 className="text-base font-semibold text-gray-900 truncate">
                {label || <span className="text-gray-400 italic">Untitled step</span>}
              </h3>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-1 shrink-0">
            {editing ? (
              <>
                <button onClick={save} disabled={saving} className="btn-primary text-xs py-1 px-2">
                  {saving ? '…' : 'Save'}
                </button>
                <button onClick={cancel} className="btn-secondary text-xs py-1 px-2">Cancel</button>
              </>
            ) : (
              <>
                <button onClick={() => setEditing(true)} className="btn-ghost text-xs py-1 px-2" title="Edit">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button onClick={() => onDelete(step.id)} className="btn-ghost text-xs py-1 px-2 text-red-400 hover:text-red-600 hover:bg-red-50" title="Delete">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Step body */}
        <div className="p-4 space-y-3">
          {/* Narrative content */}
          {editing ? (
            <MiniEditor
              content={content}
              onChange={setContent}
            />
          ) : (
            content
              ? isHtml
                ? <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed [&_mark]:bg-yellow-200 [&_mark]:px-0.5 [&_mark[style*='fca5a5']]:bg-red-200" dangerouslySetInnerHTML={{ __html: content }} />
                : <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{content}</p>
              : <span className="text-sm text-gray-400 italic">No content yet. Click edit to add narrative.</span>
          )}

          {/* Evidence panel (collapsible) */}
          {showEvidence && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Attached Evidence</p>
              <EvidenceBlock step={step} onChange={handleEvidenceChange} readOnly={false} canDownload={true} />
              {editing ? (
                <div className="mt-2">
                  <label className="label text-xs">Evidence Caption / Note</label>
                  <textarea
                    className="input resize-none min-h-[56px] text-sm"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Caption or note for this evidence (appears in exported report)…"
                  />
                </div>
              ) : (
                note && <p className="text-xs text-gray-500 italic mt-1">{note}</p>
              )}
            </div>
          )}

          {/* Evidence toggle */}
          <button
            onClick={() => setShowEvidence(v => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            {showEvidence
              ? 'Hide evidence'
              : filesCount > 0
                ? `Show evidence (${filesCount} file${filesCount !== 1 ? 's' : ''})`
                : 'Attach evidence'}
          </button>
        </div>
      </div>

      {/* Insert-after — compact */}
      <div className="flex justify-center h-4 relative group">
        <button
          type="button"
          onClick={() => onInsertAfter(step.id, 'text')}
          className="absolute top-1/2 -translate-y-1/2 text-[10px] leading-none px-1.5 py-0.5 rounded border border-gray-200 text-gray-400 bg-white opacity-0 group-hover:opacity-100 hover:border-brand-400 hover:text-brand-600 transition-opacity z-10"
        >
          + step
        </button>
      </div>
    </div>
  );
}

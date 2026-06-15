import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Highlight } from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Underline } from '@tiptap/extension-underline';
import { useEffect, useRef } from 'react';

const Btn = ({ active, onClick, title, children }) => (
  <button
    type="button"
    onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    title={title}
    className={`px-2 py-0.5 rounded text-xs font-medium transition-colors border ${
      active
        ? 'bg-brand-600 text-white border-brand-600'
        : 'text-gray-600 hover:bg-gray-100 border-transparent'
    }`}
  >
    {children}
  </button>
);

export default function MiniEditor({ content, onChange }) {
  const lastEmitted = useRef(content);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, blockquote: false, code: false,
        codeBlock: false, horizontalRule: false,
      }),
      Underline,
      TextStyle,
      Highlight.configure({ multicolor: true }),
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      lastEmitted.current = html;
      onChange?.(html);
    },
  });

  useEffect(() => {
    if (editor && content !== lastEmitted.current) {
      lastEmitted.current = content;
      editor.commands.setContent(content || '', false);
    }
  }, [content, editor]);

  if (!editor) return null;

  const e = editor;
  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden bg-white focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-transparent transition">
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-gray-100 bg-gray-50">
        <Btn active={e.isActive('bold')}      onClick={() => e.chain().focus().toggleBold().run()}                               title="Bold"><strong>B</strong></Btn>
        <Btn active={e.isActive('italic')}    onClick={() => e.chain().focus().toggleItalic().run()}                             title="Italic"><em>I</em></Btn>
        <Btn active={e.isActive('underline')} onClick={() => e.chain().focus().toggleUnderline().run()}                         title="Underline"><u>U</u></Btn>
        <Btn active={e.isActive('highlight')} onClick={() => e.chain().focus().toggleHighlight({ color: '#fde047' }).run()}     title="Highlight yellow">🖍</Btn>
        <Btn active={e.isActive('highlight', { color: '#fca5a5' })} onClick={() => e.chain().focus().toggleHighlight({ color: '#fca5a5' }).run()} title="Highlight red">🔴</Btn>
        <Btn active={e.isActive('bulletList')}  onClick={() => e.chain().focus().toggleBulletList().run()}  title="Bullet list">• List</Btn>
        <Btn active={e.isActive('orderedList')} onClick={() => e.chain().focus().toggleOrderedList().run()} title="Numbered list">1. List</Btn>
      </div>
      <EditorContent
        editor={editor}
        className="[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[100px] [&_.ProseMirror]:p-3 [&_.ProseMirror]:text-sm [&_.ProseMirror]:text-gray-700 [&_.ProseMirror_mark]:bg-yellow-200 [&_.ProseMirror_p]:mb-1"
      />
    </div>
  );
}

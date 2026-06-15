import { useState, useCallback } from 'react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import StepBlock from './StepBlock';
import api from '../api/client';
import toast from 'react-hot-toast';

export default function TimelineBuilder({ caseId, steps, setSteps }) {
  const [activeId, setActiveId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = async ({ active, over }) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const oldIndex = steps.findIndex(s => s.id === active.id);
    const newIndex = steps.findIndex(s => s.id === over.id);
    const reordered = arrayMove(steps, oldIndex, newIndex);
    setSteps(reordered);

    try {
      await api.patch(`/cases/${caseId}/steps/reorder`, { orderedIds: reordered.map(s => s.id) });
    } catch {
      toast.error('Failed to save order');
      setSteps(steps);
    }
  };

  const handleUpdate = useCallback(async (stepId, data, isEvidenceChange = false) => {
    if (isEvidenceChange) {
      setSteps(prev => prev.map(s => s.id === stepId ? { ...s, ...data } : s));
      return;
    }
    try {
      const { data: updated } = await api.put(`/cases/${caseId}/steps/${stepId}`, data);
      setSteps(prev => prev.map(s => s.id === stepId ? { ...s, ...updated } : s));
    } catch {
      toast.error('Failed to save step');
    }
  }, [caseId, setSteps]);

  const handleDelete = useCallback(async (stepId) => {
    if (!confirm('Delete this step?')) return;
    try {
      await api.delete(`/cases/${caseId}/steps/${stepId}`);
      setSteps(prev => prev.filter(s => s.id !== stepId));
      toast.success('Step deleted');
    } catch {
      toast.error('Failed to delete step');
    }
  }, [caseId, setSteps]);

  const handleInsertAfter = useCallback(async (afterStepId) => {
    try {
      const { data: newStep } = await api.post(`/cases/${caseId}/steps`, {
        type: 'text', label: '', content: null, note: null, insert_after: afterStepId,
      });
      setSteps(prev => {
        const idx = prev.findIndex(s => s.id === afterStepId);
        const next = [...prev];
        next.splice(idx + 1, 0, { ...newStep, files: [] });
        return next;
      });
    } catch {
      toast.error('Failed to add step');
    }
  }, [caseId, setSteps]);

  const handleAddStep = async () => {
    try {
      const { data: newStep } = await api.post(`/cases/${caseId}/steps`, {
        type: 'text', label: '', content: null, note: null,
      });
      setSteps(prev => [...prev, { ...newStep, files: [] }]);
    } catch {
      toast.error('Failed to add step');
    }
  };

  const activeStep = steps.find(s => s.id === activeId);

  if (steps.length === 0) {
    return (
      <div className="text-center py-10">
        <div className="text-5xl mb-3">📝</div>
        <p className="text-gray-500 mb-5">No steps yet. Start building the incident timeline.</p>
        <button onClick={handleAddStep} className="btn-primary">+ Add Text Step</button>
      </div>
    );
  }

  return (
    <div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setActiveId(active.id)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext items={steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-0">
            {steps.map((step) => (
              <StepBlock
                key={step.id}
                step={step}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                onInsertAfter={handleInsertAfter}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeStep && (
            <div className="card p-4 shadow-2xl opacity-95 ring-2 ring-brand-600">
              <p className="font-semibold">{activeStep.label || 'Untitled step'}</p>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Add at end */}
      <div className="flex justify-center pt-4 border-t border-gray-200 mt-4">
        <button onClick={handleAddStep} className="btn-secondary text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Text Step
        </button>
      </div>
    </div>
  );
}

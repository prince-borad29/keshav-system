import React from 'react';
import { Trash2 } from 'lucide-react';

export default function ConfirmModal({ isOpen, onClose, onConfirm }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      ></div>
      
      {/* Modal Box */}
      {/* Modal Box */}
<div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-[320px] sm:max-w-md p-6 text-center animate-in zoom-in-95 duration-200">
        
        {/* Icon */}
        <div className="mx-auto mb-4 w-16 h-16 flex items-center justify-center">
          <Trash2 size={48} className="text-red-700 stroke-[1.5]" />
        </div>
        
        {/* Title */}
        <h3 className="text-xl font-bold text-[#002B3D] mb-2">
          Confirm Deletion
        </h3>
        
        {/* Message */}
        <p className="text-sm text-slate-500 leading-relaxed mb-6 px-2">
          Are you sure you want to delete this? You can’t undo this action.
        </p>

        {/* Buttons */}
        <div className="flex gap-3">
          <button 
            onClick={onClose} 
            className="flex-1 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-bold text-sm hover:bg-slate-100 transition-colors"
          >
            No, Cancel
          </button>
          
          <button 
            onClick={() => { onConfirm(); onClose(); }} 
            className="flex-1 py-3 rounded-xl bg-[#002B3D] text-white font-bold text-sm hover:bg-[#155e7a] transition-colors shadow-lg shadow-sky-900/20"
          >
            Yes, Process
          </button>
        </div>

      </div>
    </div>
  );
}
import React from 'react';
import { X } from 'lucide-react';

export default function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;

  return (
    // 1. BACKDROP: Fixed, Full Screen, High Z-Index, Dark Background
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose} // Click outside to close
    >
      {/* 2. CONTENT: White Box, Stops Click Propagation */}
      <div 
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in scale-100"
        onClick={(e) => e.stopPropagation()} 
      >
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h3 className="font-bold text-lg text-slate-800">{title}</h3>
          <button 
            onClick={onClose} 
            className="p-2 rounded-full hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 max-h-[80vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
import React from 'react';
import { X } from 'lucide-react';

export default function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-md shadow-[0_4px_20px_rgba(0,0,0,0.08)] w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-200"
        onClick={(e) => e.stopPropagation()} 
      >
        <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100 bg-gray-50/50">
          <h3 className="font-semibold text-base text-gray-900">{title}</h3>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-md hover:bg-gray-200 text-gray-500 hover:text-gray-900 transition-colors"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
        <div className="p-5 max-h-[80vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
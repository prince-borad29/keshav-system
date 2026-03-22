import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export default function Select({ 
  options, 
  value, // string or array (if multiple is true)
  onChange, 
  placeholder = "Select...", 
  className = "", 
  disabled = false,
  multiple = false 
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Determine display text
  let displayText = placeholder;
  if (multiple) {
    const selectedCount = Array.isArray(value) ? value.length : 0;
    if (selectedCount === 1) {
      displayText = options.find(o => o.value === value[0])?.label || placeholder;
    } else if (selectedCount > 1) {
      displayText = `${selectedCount} selected`;
    }
  } else {
    const selectedOption = options.find(opt => opt.value === value);
    if (selectedOption) displayText = selectedOption.label;
  }

  const handleSelect = (optValue) => {
    if (multiple) {
      const currentValues = Array.isArray(value) ? value : [];
      if (currentValues.includes(optValue)) {
        onChange(currentValues.filter(v => v !== optValue));
      } else {
        onChange([...currentValues, optValue]);
      }
      // Note: We deliberately do NOT call setIsOpen(false) here so they can select multiple
    } else {
      onChange(optValue);
      setIsOpen(false);
    }
  };

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-3 py-2 bg-white border transition-all duration-200 outline-none text-sm rounded-md
          ${disabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed border-gray-200' : 'cursor-pointer hover:border-gray-300 text-gray-900'}
          ${isOpen ? 'border-[#5C3030] ring-1 ring-[#5C3030]/20 shadow-sm' : 'border-gray-200'}
        `}
      >
        <span className={`truncate pr-2 ${displayText === placeholder ? 'text-gray-400' : 'text-gray-900'}`}>
          {displayText}
        </span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !disabled && (
        <div className="absolute z-[999] w-full mt-1 bg-white border border-gray-200 rounded-md shadow-xl max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-1 custom-scrollbar">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500 text-center">No options</div>
          ) : (
            <div className="p-1 space-y-0.5">
              {options.map((option) => {
                const isSelected = multiple 
                  ? (Array.isArray(value) && value.includes(option.value))
                  : (value === option.value);
                  
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelect(option.value)}
                    className={`w-full text-left px-2.5 py-2 text-sm flex items-center justify-between rounded-md transition-colors
                      ${isSelected ? 'bg-[#5C3030]/10 text-[#5C3030] font-semibold' : 'text-gray-700 hover:bg-gray-100'}
                    `}
                  >
                    <span className="truncate">{option.label}</span>
                    {isSelected && <Check size={14} className="text-[#5C3030] shrink-0 ml-2" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
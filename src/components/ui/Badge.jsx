import React from 'react';

export default function Badge({ children, variant = 'default', className = '' }) {
  const variants = {
    default: "bg-gray-100 text-gray-700 border-gray-200",
    primary: "bg-[#5C3030]/10 text-[#5C3030] border-[#5C3030]/20",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    danger: "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-widest border ${variants[variant] || variants.default} ${className}`}>
      {children}
    </span>
  );
}
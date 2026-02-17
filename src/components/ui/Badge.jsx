import React from 'react';

export default function Badge({ children, variant = 'default' }) {
  const variants = {
    default: "bg-slate-100 text-slate-600 border-slate-200",
    primary: "bg-teal-50 text-teal-700 border-teal-100", // Admin
    warning: "bg-orange-50 text-orange-700 border-orange-100", // Nirikshak
    purple: "bg-purple-50 text-purple-700 border-purple-100", // Sanchalak
    danger: "bg-red-50 text-red-700 border-red-100",
  };

  return (
    <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border ${variants[variant] || variants.default}`}>
      {children}
    </span>
  );
}
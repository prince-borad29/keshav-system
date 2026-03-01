import React from 'react';
import { Loader2 } from 'lucide-react';

export default function Button({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  isLoading = false, 
  icon: Icon,
  className = '',
  ...props 
}) {
  const baseStyle = "inline-flex items-center justify-center font-semibold transition-colors duration-150 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5C3030]/40 disabled:opacity-50 disabled:pointer-events-none text-sm";
  
  const variants = {
    primary: "bg-[#5C3030] text-white hover:bg-[#4a2626] active:bg-[#3d1f1f]",
    secondary: "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 active:bg-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.02)]",
    danger: "bg-red-50 text-red-700 hover:bg-red-100 active:bg-red-200 border border-red-100",
    ghost: "bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200"
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2",
    lg: "px-5 py-2.5 text-base"
  };

  return (
    <button 
      className={`${baseStyle} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? <Loader2 className="animate-spin mr-2" size={16} strokeWidth={1.5} /> : Icon && <Icon size={16} strokeWidth={1.5} className="mr-2" />}
      {children}
    </button>
  );
}
import React from 'react';
import { Loader2 } from 'lucide-react';

export default function Button({ 
  children, 
  variant = 'primary', // primary, secondary, danger, ghost
  size = 'md', // sm, md, lg
  isLoading = false, 
  icon: Icon,
  className = '',
  ...props 
}) {
  const baseStyle = "inline-flex items-center justify-center font-bold transition-all duration-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-70 disabled:cursor-not-allowed active:scale-[0.98]";
  
  const variants = {
    primary: "bg-primary hover:bg-primary-dark text-white shadow-lg shadow-primary/20 focus:ring-primary/50",
    secondary: "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 focus:ring-slate-200",
    danger: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 focus:ring-red-200",
    ghost: "bg-transparent text-slate-500 hover:text-primary hover:bg-primary/5"
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-5 py-2.5 text-sm",
    lg: "px-6 py-3.5 text-base"
  };

  return (
    <button 
      className={`${baseStyle} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? <Loader2 className="animate-spin mr-2" size={18} /> : Icon && <Icon size={18} className="mr-2" />}
      {children}
    </button>
  );
}
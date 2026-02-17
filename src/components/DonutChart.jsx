import React from 'react';

export default function DonutChart({ value, total, size = 100, strokeWidth = 8, color = "#0F766E", label }) {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        {/* Background Ring */}
        <svg className="transform -rotate-90 w-full h-full">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#E2E8F0"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Progress Ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        {/* Center Text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-700">
           <span className="text-xl font-bold">{percentage}%</span>
        </div>
      </div>
      {label && <div className="mt-2 text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</div>}
    </div>
  );
}
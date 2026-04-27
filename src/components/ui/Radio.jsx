import React from 'react';

export default function Radio({
  options = [],
  value,
  onChange,
  name = 'radio',
  className = '',
  direction = 'horizontal', // 'horizontal' or 'vertical'
  required = false,
  disabled = false
}) {
  const containerClass = direction === 'vertical' ? 'flex flex-col gap-3' : 'flex gap-3 flex-wrap';

  return (
    <div className={`${containerClass} ${className}`}>
      {options.map((option) => (
        <label
          key={option.value}
          className="flex items-center gap-2.5 cursor-pointer group"
        >
          <div className="relative flex items-center justify-center">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              required={required}
              className="w-4 h-4 cursor-pointer accent-[#5C3030]"
            />
          </div>
          <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}

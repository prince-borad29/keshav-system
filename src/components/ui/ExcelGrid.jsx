import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';

export default function ExcelGrid({ columns, initialData, onDataChange }) {
  const [data, setData] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Initialize data when props change
  useEffect(() => {
    setData(JSON.parse(JSON.stringify(initialData || [])));
  }, [initialData]);

  // Handle cell edit
  const handleCellEdit = (rowIndex, columnKey, newValue) => {
    const updatedData = [...data];
    updatedData[rowIndex][columnKey] = newValue;
    setData(updatedData);
    if (onDataChange) onDataChange(updatedData);
  };

  const filteredData = data.filter(row => 
    Object.values(row).some(val => 
      String(val).toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  return (
    <div className="flex flex-col h-full bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      {/* Grid Toolbar */}
      <div className="p-2 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
          <input 
            type="text"
            placeholder="Search within report..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded outline-none focus:border-[#5C3030] focus:ring-1 focus:ring-[#5C3030]/20"
          />
        </div>
        <div className="text-xs text-gray-500 font-medium">
          {filteredData.length} records shown
          <span className="ml-2 text-[#5C3030] font-bold px-2 py-0.5 bg-[#5C3030]/10 rounded">EDITABLE</span>
        </div>
      </div>

      {/* Spreadsheet Area */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-left text-sm border-collapse whitespace-nowrap">
          <thead className="bg-gray-100 sticky top-0 z-10 shadow-[0_1px_0_rgba(229,231,235,1)]">
            <tr>
              <th className="w-10 px-2 py-2 border-r border-gray-200 text-center text-gray-400 font-semibold text-xs bg-gray-100">#</th>
              {columns.map((col) => (
                <th key={col.key} className="px-3 py-2 border-r border-gray-200 text-gray-700 font-semibold text-xs tracking-wider uppercase bg-gray-100">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredData.length === 0 ? (
              <tr><td colSpan={columns.length + 1} className="p-8 text-center text-gray-400">No data found</td></tr>
            ) : (
              filteredData.map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-blue-50/30 group">
                  <td className="px-2 py-1.5 border-b border-r border-gray-200 text-center text-xs text-gray-400 bg-gray-50 select-none">
                    {rowIndex + 1}
                  </td>
                  {columns.map((col) => (
                    <td 
                      key={col.key} 
                      className="border-b border-r border-gray-200 bg-white p-0 relative transition-colors focus-within:bg-blue-50 focus-within:ring-2 focus-within:ring-[#5C3030] focus-within:z-10"
                    >
                      <input
                        type="text"
                        value={row[col.key] || ''}
                        onChange={(e) => handleCellEdit(rowIndex, col.key, e.target.value)}
                        className="w-full h-full px-3 py-2 text-sm text-gray-800 bg-transparent outline-none focus:text-[#5C3030] focus:font-medium"
                      />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
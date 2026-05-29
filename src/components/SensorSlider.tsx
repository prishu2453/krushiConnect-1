import React from 'react';

interface SensorSliderProps {
  label: string;
  value: number;
  unit: string;
  min?: number;
  max?: number;
  onChange: (val: number) => void;
}

export const SensorSlider = ({ label, value, unit, min = 0, max = 100, onChange }: SensorSliderProps) => {
  return (
    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
      <div className="flex justify-between items-center mb-2">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
        <span className="text-xs font-bold text-slate-900">{Math.round(value)}{unit}</span>
      </div>
      <input 
        type="range" 
        min={min} 
        max={max} 
        value={value} 
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
      />
    </div>
  );
};

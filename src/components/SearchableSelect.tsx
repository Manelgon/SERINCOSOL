"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, Check, Search, X } from "lucide-react";

interface Option {
    value: string | number;
    label: string;
}

interface SearchableSelectProps {
    options: Option[];
    value: string | number;
    onChange: (value: string | number) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}

export default function SearchableSelect({
    options,
    value,
    onChange,
    placeholder = "Seleccionar...",
    className = "",
    disabled = false,
}: SearchableSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Filter options
    const filteredOptions = options.filter((opt) =>
        opt.label.toLowerCase().includes(search.toLowerCase())
    );

    // Find selected label
    const selectedOption = options.find((opt) => opt.value === value);

    return (
        <div className={`relative ${className} ${disabled ? "opacity-60" : ""}`} ref={wrapperRef}>
            <div
                className={`w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 ${disabled ? "bg-slate-50 cursor-not-allowed pointer-events-none" : "cursor-pointer"}`}
                onClick={() => {
                    if (disabled) return;
                    setIsOpen(!isOpen);
                    // Reset search when opening to show all options, 
                    // or keep it? Let's reset to allow fresh search.
                    if (!isOpen) setSearch("");
                }}
            >
                <span className={`block truncate ${!selectedOption ? "text-gray-500" : "text-gray-900"}`}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <div className="flex items-center gap-1">
                    {selectedOption && (
                        <div
                            className="p-1 hover:bg-gray-100 rounded-full"
                            onClick={(e) => {
                                e.stopPropagation();
                                onChange("");
                            }}
                        >
                            <X className="w-3 h-3 text-gray-400" />
                        </div>
                    )}
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                </div>
            </div>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-hidden flex flex-col">
                    <div className="p-2 border-b border-gray-100">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                autoFocus
                                type="text"
                                className="w-full pl-9 pr-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-yellow-400"
                                placeholder="Buscar..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    </div>

                    <div className="overflow-y-auto flex-1">
                        {filteredOptions.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-gray-500 text-center">
                                No se encontraron resultados
                            </div>
                        ) : (
                            filteredOptions.map((opt) => (
                                <div
                                    key={opt.value}
                                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-yellow-50 flex items-center justify-between ${opt.value === value ? "bg-yellow-50 text-yellow-900 font-medium" : "text-gray-700"
                                        }`}
                                    onClick={() => {
                                        onChange(opt.value);
                                        setIsOpen(false);
                                    }}
                                >
                                    <span>{opt.label}</span>
                                    {opt.value === value && <Check className="w-4 h-4 text-yellow-600" />}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

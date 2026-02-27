import React, { useState, useRef, useEffect } from 'react';
import Fuse from 'fuse.js';
import { standardCatalog } from '../data/standardCatalog';

const fuse = new Fuse(standardCatalog, { keys: ['name'], threshold: 0.3 });

export const AutocompleteItemInput = ({ value, onChange, onSelect, placeholder, autoFocus, className }) => {
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const wrapperRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleChange = (e) => {
        const val = e.target.value;
        onChange(val);
        if (val.length > 1) {
            const results = fuse.search(val).slice(0, 5);
            setSuggestions(results.map(r => r.item));
            setShowSuggestions(true);
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
        }
    };

    return (
        <div ref={wrapperRef} className="relative w-full">
            <input
                value={value}
                onChange={handleChange}
                onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                placeholder={placeholder}
                className={className || "w-full border rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none"}
                autoFocus={autoFocus}
            />
            {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute z-50 left-0 w-64 bg-white border border-gray-200 rounded-lg shadow-xl mt-1 max-h-60 overflow-y-auto">
                    {suggestions.map((item, i) => (
                        <li
                            key={i}
                            onClick={() => {
                                onSelect(item);
                                setShowSuggestions(false);
                            }}
                            className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b last:border-b-0 text-sm"
                        >
                            <div className="font-medium text-gray-800 truncate">{item.name}</div>
                            <div className="text-xs text-gray-500 flex justify-between mt-1">
                                <span className="uppercase">{item.category}</span>
                                <span className="text-blue-600 font-medium">RM{item.price.toFixed(2)}</span>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

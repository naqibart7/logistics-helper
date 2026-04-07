import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import Fuse from 'fuse.js';
import { Search, MapPin, Phone, Check, ChevronDown } from 'lucide-react';

/**
 * AutocompleteSupplierInput
 * A rich, fuzzy-search supplier selector with keyboard navigation,
 * category-boost, and inline suggestion cards.
 *
 * Props:
 *   suppliers      - Array of supplier objects
 *   value          - Currently selected supplier object (or null)
 *   onSelect       - (supplier) => void — called when a supplier is picked
 *   onClear        - () => void — called when selection is cleared
 *   materialCategory - Optional string; if provided, matching suppliers are boosted to top
 *   placeholder    - Input placeholder text
 *   className      - Optional wrapper className override
 *   compact        - If true, renders a smaller inline version
 *   inputMode      - 'select' (default) shows selected state, 'text' always shows text input (for Monday tab)
 *   textValue      - Controlled text value (for inputMode='text')
 *   onTextChange   - Called with text string on every keystroke (for inputMode='text')
 */
const AutocompleteSupplierInput = ({
    suppliers = [],
    value = null,
    onSelect,
    onClear,
    materialCategory = '',
    placeholder = 'Search supplier...',
    className = '',
    compact = false,
    inputMode = 'select',
    textValue = '',
    onTextChange,
}) => {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const wrapperRef = useRef(null);
    const inputRef = useRef(null);
    const listRef = useRef(null);

    // Build Fuse index for fuzzy search across name, location, categories
    const fuse = useMemo(() => {
        return new Fuse(suppliers, {
            keys: [
                { name: 'name', weight: 0.5 },
                { name: 'location', weight: 0.2 },
                { name: 'categories', weight: 0.3 },
            ],
            threshold: 0.35,
            includeScore: true,
        });
    }, [suppliers]);

    // Compute filtered + sorted results
    const results = useMemo(() => {
        const searchTerm = inputMode === 'text' ? textValue : query;
        let items;
        if (!searchTerm || searchTerm.length < 1) {
            items = suppliers.map(s => ({ item: s, score: 1 }));
        } else {
            items = fuse.search(searchTerm);
        }

        // Category boost: if we know the material category, push matching suppliers up
        if (materialCategory) {
            const catLower = materialCategory.toLowerCase();
            items.sort((a, b) => {
                const aMatch = (a.item.categories || []).some(c => c.toLowerCase().includes(catLower) || catLower.includes(c.toLowerCase()));
                const bMatch = (b.item.categories || []).some(c => c.toLowerCase().includes(catLower) || catLower.includes(c.toLowerCase()));
                if (aMatch && !bMatch) return -1;
                if (!aMatch && bMatch) return 1;
                return (a.score || 0) - (b.score || 0);
            });
        }

        return items.slice(0, 8).map(r => r.item);
    }, [query, textValue, inputMode, suppliers, fuse, materialCategory]);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
                setActiveIndex(-1);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Scroll active item into view
    useEffect(() => {
        if (activeIndex >= 0 && listRef.current) {
            const items = listRef.current.querySelectorAll('[data-supplier-item]');
            if (items[activeIndex]) {
                items[activeIndex].scrollIntoView({ block: 'nearest' });
            }
        }
    }, [activeIndex]);

    const handleKeyDown = useCallback((e) => {
        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'Enter') {
                setIsOpen(true);
                setActiveIndex(0);
                e.preventDefault();
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setActiveIndex(prev => Math.min(prev + 1, results.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setActiveIndex(prev => Math.max(prev - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (activeIndex >= 0 && results[activeIndex]) {
                    handleSelect(results[activeIndex]);
                }
                break;
            case 'Escape':
                e.preventDefault();
                setIsOpen(false);
                setActiveIndex(-1);
                break;
        }
    }, [isOpen, activeIndex, results]);

    const handleSelect = (supplier) => {
        onSelect(supplier);
        setQuery('');
        setIsOpen(false);
        setActiveIndex(-1);
    };

    const handleInputChange = (e) => {
        const val = e.target.value;
        if (inputMode === 'text') {
            onTextChange?.(val);
        } else {
            setQuery(val);
        }
        setIsOpen(true);
        setActiveIndex(-1);
    };

    const handleFocus = () => {
        setIsOpen(true);
    };

    const handleClear = (e) => {
        e.stopPropagation();
        onClear?.();
        setQuery('');
        setIsOpen(false);
    };

    const catMatchesTarget = (cats) => {
        if (!materialCategory) return false;
        const catLower = materialCategory.toLowerCase();
        return (cats || []).some(c => c.toLowerCase().includes(catLower) || catLower.includes(c.toLowerCase()));
    };

    // TEXT MODE: for MondayEntryGenerator (always show input, no "selected" state)
    if (inputMode === 'text') {
        return (
            <div ref={wrapperRef} className={`relative ${className}`}>
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={textValue}
                        onChange={handleInputChange}
                        onFocus={handleFocus}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        className="w-full bg-gray-50 border-0 focus:ring-2 focus:ring-blue-500 rounded-lg pl-9 pr-3 py-2.5 text-sm font-medium"
                    />
                </div>

                {isOpen && results.length > 0 && (
                    <ul ref={listRef}
                        className="absolute z-50 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-2xl mt-1 max-h-72 overflow-y-auto py-1"
                    >
                        {results.map((supplier, idx) => (
                            <li
                                key={supplier.id}
                                data-supplier-item
                                onClick={() => handleSelect(supplier)}
                                className={`px-3.5 py-2.5 cursor-pointer border-b last:border-b-0 border-gray-50 transition-colors ${
                                    idx === activeIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-sm text-gray-900">{supplier.name}</span>
                                    {supplier.bankName && (
                                        <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">
                                            Bank ✓
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                    {supplier.location && (
                                        <span className="flex items-center gap-1">
                                            <MapPin size={10} /> {supplier.location}
                                        </span>
                                    )}
                                    {supplier.contact && (
                                        <span className="flex items-center gap-1">
                                            <Phone size={10} /> {supplier.contact}
                                        </span>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        );
    }

    // SELECT MODE: for SupplierTrackedBOM (shows selected state or search input)
    if (value) {
        return (
            <div className={`flex items-center gap-2 ${className}`}>
                <div className={`flex-1 bg-white border rounded-lg ${compact ? 'px-2 py-1.5' : 'px-3 py-2'} flex items-center gap-2`}>
                    <div className="flex-1 min-w-0">
                        <div className={`font-semibold text-blue-700 truncate ${compact ? 'text-xs' : 'text-sm'}`}>
                            {value.name}
                        </div>
                        {!compact && value.location && (
                            <div className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5">
                                <MapPin size={8} /> {value.location}
                            </div>
                        )}
                    </div>
                    <button
                        onClick={handleClear}
                        className="text-gray-400 hover:text-red-500 p-0.5 rounded transition-colors flex-shrink-0"
                        title="Change supplier"
                    >
                        ×
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div ref={wrapperRef} className={`relative ${className}`}>
            <div className="relative">
                <Search size={compact ? 12 : 14} className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={handleInputChange}
                    onFocus={handleFocus}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className={`w-full border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${
                        compact ? 'pl-7 pr-2 py-1.5 text-xs' : 'pl-8 pr-3 py-2 text-sm'
                    }`}
                />
                {!query && (
                    <ChevronDown size={compact ? 12 : 14} className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
                )}
            </div>

            {isOpen && results.length > 0 && (
                <ul ref={listRef}
                    className="absolute z-50 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-2xl mt-1 max-h-64 overflow-y-auto py-1"
                    style={{ minWidth: '260px' }}
                >
                    {results.map((supplier, idx) => {
                        const isCatMatch = catMatchesTarget(supplier.categories);
                        return (
                            <li
                                key={supplier.id}
                                data-supplier-item
                                onClick={() => handleSelect(supplier)}
                                className={`px-3 py-2.5 cursor-pointer border-b last:border-b-0 border-gray-50 transition-colors ${
                                    idx === activeIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-sm text-gray-900 truncate">{supplier.name}</span>
                                    {isCatMatch && (
                                        <span className="flex-shrink-0 flex items-center gap-0.5 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">
                                            <Check size={8} /> Match
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                    {supplier.location && (
                                        <span className="flex items-center gap-1">
                                            <MapPin size={10} /> {supplier.location}
                                        </span>
                                    )}
                                    {supplier.contact && (
                                        <span className="flex items-center gap-1">
                                            <Phone size={10} /> {supplier.contact}
                                        </span>
                                    )}
                                </div>
                                {supplier.categories && supplier.categories.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                        {supplier.categories.slice(0, 4).map((cat, ci) => (
                                            <span key={ci} className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                                                materialCategory && cat.toLowerCase().includes(materialCategory.toLowerCase())
                                                    ? 'bg-blue-100 text-blue-700'
                                                    : 'bg-gray-100 text-gray-600'
                                            }`}>
                                                {cat}
                                            </span>
                                        ))}
                                        {supplier.categories.length > 4 && (
                                            <span className="text-[9px] text-gray-400">+{supplier.categories.length - 4}</span>
                                        )}
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

export default AutocompleteSupplierInput;

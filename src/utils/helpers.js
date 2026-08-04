// Helper utilities
export const generateId = () => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const sanitizeInput = (str) => {
    if (typeof str !== 'string') return str;
    return str.trim();
};

export const validatePhone = (phone) => {
    return /^[\d\s\-+()]+$/.test(phone);
};

export const validateQuantity = (qty) => {
    const num = parseFloat(qty);
    return !isNaN(num) && num > 0;
};

export const formatDate = (dateString) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-MY', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
};

export const searchFilter = (items, searchTerm, searchFields) => {
    if (!searchTerm) return items;

    const term = searchTerm.toLowerCase();
    return items.filter(item =>
        searchFields.some(field => {
            const value = field.split('.').reduce((obj, key) => obj?.[key], item);
            return String(value || '').toLowerCase().includes(term);
        })
    );
};

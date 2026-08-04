import { generateId } from './helpers';

/**
 * Export suppliers to CSV format
 */
export const exportSuppliersToCSV = (suppliers) => {
    const headers = ['Name', 'Categories', 'Location', 'Contact', 'WhatsApp', 'AccountNumber', 'BankName'];

    const csvRows = [
        headers.join(','),
        ...suppliers.map(supplier => {
            const categories = supplier.categories.join(';'); // Use semicolon for multiple categories
            return [
                `"${supplier.name}"`,
                `"${categories}"`,
                `"${supplier.location || ''}"`,
                `"${supplier.contact || ''}"`,
                `"${supplier.whatsapp || ''}"`,
                `"${supplier.accountNumber || ''}"`,
                `"${supplier.bankName || ''}"`
            ].join(',');
        })
    ];

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `suppliers_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

/**
 * Parse CSV content to supplier array
 */
export const parseSupplierCSV = (csvText) => {
    const lines = csvText.trim().split('\n');

    if (lines.length < 2) {
        throw new Error('CSV file is empty or invalid');
    }

    // Skip header row
    const dataLines = lines.slice(1);

    const suppliersMap = new Map();
    const errors = [];

    dataLines.forEach((line, index) => {
        const lineNum = index + 2;

        if (!line.trim()) return;

        try {
            const fields = parseCSVLine(line);

            if (fields.length < 2) {
                errors.push(`Line ${lineNum}: Missing required fields (Name and Categories)`);
                return;
            }

            const [name, categories, location = '', contact = '', whatsapp = '', accountNumber = '', bankName = ''] = fields;
            const trimmedName = name.trim();
            const normalizedName = trimmedName.toLowerCase();

            if (!trimmedName) {
                errors.push(`Line ${lineNum}: Supplier name is required`);
                return;
            }

            if (!categories.trim()) {
                errors.push(`Line ${lineNum}: At least one category is required`);
                return;
            }

            const newCategories = categories.split(';').map(c => c.trim()).filter(Boolean);

            if (suppliersMap.has(normalizedName)) {
                // Merge with existing entry in this batch
                const existing = suppliersMap.get(normalizedName);

                // Merge unique categories
                const categorySet = new Set([...existing.categories, ...newCategories]);
                existing.categories = Array.from(categorySet);

                // Update other fields if they were empty in existing but present in new
                if (!existing.location && location.trim()) existing.location = location.trim();
                if (!existing.contact && contact.trim()) existing.contact = contact.trim();
                if (!existing.whatsapp && whatsapp.trim()) existing.whatsapp = whatsapp.trim();
                if (!existing.accountNumber && accountNumber.trim()) existing.accountNumber = accountNumber.trim();
                if (!existing.bankName && bankName.trim()) existing.bankName = bankName.trim();
            } else {
                // Add new entry
                suppliersMap.set(normalizedName, {
                    id: generateId(),
                    name: trimmedName,
                    categories: newCategories,
                    location: location.trim(),
                    contact: contact.trim(),
                    whatsapp: whatsapp.trim(),
                    accountNumber: accountNumber.trim(),
                    bankName: bankName.trim()
                });
            }
        } catch (error) {
            errors.push(`Line ${lineNum}: ${error.message}`);
        }
    });

    const suppliers = Array.from(suppliersMap.values());
    return { suppliers, errors };
};

/**
 * Parse a single CSV line handling quoted fields
 */
const parseCSVLine = (line) => {
    const fields = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                // Escaped quote
                currentField += '"';
                i++; // Skip next quote
            } else {
                // Toggle quote state
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            // Field separator
            fields.push(currentField);
            currentField = '';
        } else {
            currentField += char;
        }
    }

    // Add last field
    fields.push(currentField);

    return fields;
};

/**
 * Generate CSV template for suppliers
 */
export const downloadSupplierTemplate = () => {
    const template = `Name,Categories,Location,Contact,WhatsApp,AccountNumber,BankName
ABC Hardware,"Gypsum;Metal Stud;Paint",Selangor,012-3456789,60123456789,123456789,Maybank
XYZ Supplies,"Electrical;Lighting",Kuala Lumpur,013-9876543,60139876543,987654321,CIMB`;

    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', 'supplier_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

/**
 * Import suppliers from file
 */
export const importSuppliersFromFile = (file) => {
    return new Promise((resolve, reject) => {
        if (!file) {
            reject(new Error('No file provided'));
            return;
        }

        if (!file.name.endsWith('.csv')) {
            reject(new Error('File must be a CSV file'));
            return;
        }

        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const csvText = e.target.result;
                const result = parseSupplierCSV(csvText);
                resolve(result);
            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = () => {
            reject(new Error('Failed to read file'));
        };

        reader.readAsText(file);
    });
};

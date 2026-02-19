import { generateId } from './helpers';

/**
 * Export suppliers to CSV format
 */
export const exportSuppliersToCSV = (suppliers) => {
    const headers = ['Name', 'Categories', 'Location', 'Contact', 'WhatsApp'];

    const csvRows = [
        headers.join(','),
        ...suppliers.map(supplier => {
            const categories = supplier.categories.join(';'); // Use semicolon for multiple categories
            return [
                `"${supplier.name}"`,
                `"${categories}"`,
                `"${supplier.location}"`,
                `"${supplier.contact}"`,
                `"${supplier.whatsapp || ''}"`
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

    const suppliers = [];
    const errors = [];

    dataLines.forEach((line, index) => {
        const lineNum = index + 2; // +2 because we skipped header and arrays are 0-indexed

        if (!line.trim()) return; // Skip empty lines

        try {
            // Parse CSV line (handle quoted fields)
            const fields = parseCSVLine(line);

            if (fields.length < 3) {
                errors.push(`Line ${lineNum}: Not enough fields (minimum: Name, Categories, Location)`);
                return;
            }

            const [name, categories, location, contact = '', whatsapp = ''] = fields;

            if (!name.trim()) {
                errors.push(`Line ${lineNum}: Supplier name is required`);
                return;
            }

            if (!categories.trim()) {
                errors.push(`Line ${lineNum}: At least one category is required`);
                return;
            }

            const supplier = {
                id: generateId(),
                name: name.trim(),
                categories: categories.split(';').map(c => c.trim()).filter(Boolean),
                location: location.trim(),
                contact: contact.trim(),
                whatsapp: whatsapp.trim()
            };

            suppliers.push(supplier);
        } catch (error) {
            errors.push(`Line ${lineNum}: ${error.message}`);
        }
    });

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
    const template = `Name,Categories,Location,Contact,WhatsApp
ABC Hardware,"Gypsum;Metal Stud;Paint",Selangor,012-3456789,012-3456789
XYZ Supplies,"Electrical;Lighting",Kuala Lumpur,013-9876543,013-9876543
BuildMart,"Tiles;Flooring;Cement",Johor,014-5551234,014-5551234`;

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

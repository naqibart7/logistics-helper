// Local storage utilities with error handling
export const storage = {
    save: (key, data) => {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return { success: true };
        } catch (error) {
            console.error(`Failed to save ${key}:`, error);
            return { success: false, error: error.message };
        }
    },

    load: (key, defaultValue = null) => {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error(`Failed to load ${key}:`, error);
            return defaultValue;
        }
    },

    remove: (key) => {
        try {
            localStorage.removeItem(key);
            return { success: true };
        } catch (error) {
            console.error(`Failed to remove ${key}:`, error);
            return { success: false, error: error.message };
        }
    }
};

export const STORAGE_KEYS = {
    PROJECTS: 'logisticsProjects',
    SUPPLIERS: 'logisticsSuppliers',
    ITEM_CATALOG: 'logisticsItemCatalog'
};

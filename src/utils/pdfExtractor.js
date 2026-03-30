
import * as pdfjsLib from 'pdfjs-dist';

// Check for installed version or fallback
const v = pdfjsLib.version || '5.4.624';
// Use unpkg to fetch the worker matching the detected/specified version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${v}/build/pdf.worker.min.mjs`;

/**
 * Extracts text items with position (x, y) from a PDF file.
 * Preserves visual layout structure.
 */
export const extractTextWithLayout = async (file) => {
    const arrayBuffer = await file.arrayBuffer();

    // Load the document using PDF.js
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    const pages = [];

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();

        // Map items to simplified structure
        const items = content.items.map(item => {
            const x = item.transform ? item.transform[4] : 0;
            const y = item.transform ? item.transform[5] : 0;

            return {
                str: item.str,
                x: x,
                y: y,
                width: item.width || 0,
                height: item.height || 0,
                hasEOL: item.hasEOL
            };
        });

        // Sort items: Top-down (Y desc), Left-to-right (X asc)
        // Note: PDF coordinates origin is bottom-left, so Higher Y is "Top".
        items.sort((a, b) => {
            const yDiff = Math.abs(a.y - b.y);
            if (yDiff < 5) { // Same line threshold
                return a.x - b.x;
            }
            return b.y - a.y;
        });

        pages.push({ pageNumber: i, items });
    }

    return pages;
};

/**
 * Groups sorted items into rows based on Y-coordinate.
 */
export const groupItemsByLine = (items) => {
    const lines = [];
    let currentLine = [];
    let currentY = -1;

    items.forEach(item => {
        if (currentY === -1 || Math.abs(item.y - currentY) < 5) {
            currentLine.push(item);
            currentY = item.y;
        } else {
            // New line detected
            // Sort previous line strictly by X before pushing
            currentLine.sort((a, b) => a.x - b.x);
            lines.push([...currentLine]);

            // Start new line
            currentLine = [item];
            currentY = item.y;
        }
    });

    if (currentLine.length > 0) {
        currentLine.sort((a, b) => a.x - b.x);
        lines.push(currentLine);
    }

    return lines;
};

/**
 * Converts PDF to text, preserving table column gaps via spaces.
 * CRITICAL: Uses wide spacing (4 spaces) for column gaps > 10px,
 * which allows downstream parsers to split columns using /\s{2,}/.
 */
export const convertPDFToText = async (file) => {
    try {
        const pages = await extractTextWithLayout(file);
        let fullText = '';

        for (const page of pages) {
            const lines = groupItemsByLine(page.items);

            for (const line of lines) {
                let lineStr = '';
                let lastX = 0;

                line.forEach(item => {
                    // Calculate visual gap
                    // item.x is absolute. 
                    const gap = item.x - lastX;

                    if (lastX > 0) {
                        // Insert separators based on gap size
                        if (gap > 40) {
                            lineStr += '          '; // Very wide gap -> 10 spaces
                        } else if (gap > 10) {
                            lineStr += '    ';       // Column gap -> 4 spaces (Trigger split)
                        } else if (gap > 2) {
                            lineStr += ' ';          // Word break -> 1 space (No split)
                        }
                    }

                    lineStr += item.str;

                    // Update cursor to end of this item
                    lastX = item.x + (item.width || 0);
                });

                fullText += lineStr + '\n';
            }
            fullText += '\n--- PAGE BREAK ---\n';
        }

        return fullText;
    } catch (error) {
        console.error("PDF Layout Extraction Error:", error);
        throw error;
    }
};

/**
 * Advanced Tabular Parser: The "Invisible Spreadsheet"
 * Scans absolute X/Y coordinates to group words into a rigid 2D grid structure.
 * This prevents empty columns (like missing QTY) from shifting data into the wrong index.
 */
export const extractTabularData = async (file) => {
    try {
        const pages = await extractTextWithLayout(file);
        const tabularData = [];

        for (const page of pages) {
            const lines = groupItemsByLine(page.items);
            let columnStarts = [];

            // 1. Identify distinct vertical columns based on X-coordinates
            page.items.forEach(item => {
                // Find if there is a known column within 25px tolerance
                const matchedCol = columnStarts.find(c => Math.abs(c.x - item.x) < 25);
                if (matchedCol) {
                    matchedCol.count++;
                } else {
                    columnStarts.push({ x: item.x, count: 1 });
                }
            });

            // 2. Sort columns left-to-right and merge ones that are too close
            columnStarts.sort((a, b) => a.x - b.x);

            const mergedCols = [];
            for (const col of columnStarts) {
                if (mergedCols.length === 0) {
                    mergedCols.push(col);
                } else {
                    const lastCol = mergedCols[mergedCols.length - 1];
                    // If columns are closer than 30px, they are likely the same logical column slightly misaligned
                    if (col.x - lastCol.x < 30) {
                        lastCol.x = (lastCol.x * lastCol.count + col.x * col.count) / (lastCol.count + col.count); // weighted average
                        lastCol.count += col.count;
                    } else {
                        mergedCols.push(col);
                    }
                }
            }

            // 3. Grid Zoning: Group columns into independent 2D tables if separated by >100px gap
            const zones = [];
            let currentZone = [];

            for (let i = 0; i < mergedCols.length; i++) {
                if (currentZone.length === 0) {
                    currentZone.push(mergedCols[i]);
                } else {
                    const lastCol = currentZone[currentZone.length - 1];
                    // If massive > 100px gap, it's a new table block (e.g. side-by-side tables)
                    if (mergedCols[i].x - lastCol.x > 100) {
                        zones.push([...currentZone]);
                        currentZone = [mergedCols[i]];
                    } else {
                        currentZone.push(mergedCols[i]);
                    }
                }
            }
            if (currentZone.length > 0) zones.push(currentZone);

            const pageTables = [];

            // 4. Snap text items into their respective isolated 2D grids
            zones.forEach(zoneCols => {
                const zoneTable = [];

                for (const line of lines) {
                    // Initialize empty row matching the detected columns for this zone
                    const rowArray = new Array(zoneCols.length).fill('');
                    let placedAny = false;

                    line.forEach(item => {
                        let bestColIdx = -1;
                        let minDiff = 60; // Max snap tolerance across column center

                        // Assign item to the closest column INSIDE THIS ZONE
                        zoneCols.forEach((col, idx) => {
                            const diff = Math.abs(col.x - item.x);
                            if (diff < minDiff) {
                                minDiff = diff;
                                bestColIdx = idx;
                            }
                        });

                        if (bestColIdx !== -1) {
                            // If multiple items fall into the same column slot, join them
                            if (rowArray[bestColIdx] === '') {
                                rowArray[bestColIdx] = item.str.trim();
                            } else {
                                rowArray[bestColIdx] += ' ' + item.str.trim();
                            }
                            placedAny = true;
                        }
                    });

                    // Only add the row if any data landed in this specific table zone
                    if (placedAny) {
                        zoneTable.push(rowArray);
                    }
                }

                if (zoneTable.length > 0) pageTables.push(zoneTable);
            });

            tabularData.push({ pageNumber: page.pageNumber, tables: pageTables });
        }

        return tabularData;
    } catch (error) {
        console.error("Tabular Extraction Error:", error);
        throw error;
    }
};

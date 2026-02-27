const fs = require('fs');
const html = fs.readFileSync('temp_orderform.html', 'utf8');

const items = [];
// <div class="product-card" data-price="20.00" data-category="electrical">
// ...
// <h3 class="...">3/4" Flexible Hose Loose (meter)</h3>

let pos = 0;

while (true) {
  const cardStart = html.indexOf('product-card', pos);
  if (cardStart === -1) break;
  
  const priceStart = html.indexOf('data-price="', cardStart) + 12;
  const priceEnd = html.indexOf('"', priceStart);
  const price = parseFloat(html.substring(priceStart, priceEnd));
  
  const catStart = html.indexOf('data-category="', cardStart) + 15;
  const catEnd = html.indexOf('"', catStart);
  const category = html.substring(catStart, catEnd).trim();
  
  const h3Start = html.indexOf('<h3', cardStart);
  const h3ContentStart = html.indexOf('>', h3Start) + 1;
  const h3ContentEnd = html.indexOf('</h3>', h3ContentStart);
  const name = html.substring(h3ContentStart, h3ContentEnd).replace(/&quot;/g, '"').trim();
  
  items.push({ price, category, name });
  pos = h3ContentEnd;
}

console.log('Found', items.length, 'items');
console.log(items.slice(0, 3));

fs.writeFileSync('src/data/standardCatalog.js', 'export const standardCatalog = ' + JSON.stringify(items, null, 2) + ';\n');

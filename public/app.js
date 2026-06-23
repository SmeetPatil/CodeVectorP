const tableBody = document.getElementById('tableBody');
const categoryFilter = document.getElementById('categoryFilter');
const loadBtn = document.getElementById('loadBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageInfo = document.getElementById('pageInfo');
const limitFilter = document.getElementById('limitFilter');

let historyStack = [];
let nextCursor = null;

async function fetchProducts(cursor = null) {
  const category = categoryFilter.value;
  let url = '/products?limit' + `=${encodeURIComponent(limitFilter.value)}`;
  if (category) url += `&category=${encodeURIComponent(category)}`;
  if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    
    renderTable(data.items);
    
    nextCursor = data.next_cursor;
    
    prevBtn.disabled = historyStack.length <= 1;
    nextBtn.disabled = !data.has_more;
    
    pageInfo.textContent = `Page ${historyStack.length} (showing ${data.items.length} items)`;
    
  } catch (err) {
    console.error('Fetch error:', err);
    tableBody.innerHTML = `<tr><td colspan="6" style="color:red">Failed to fetch products: ${err.message}</td></tr>`;
  }
}

function renderTable(items) {
  tableBody.innerHTML = '';
  if (items.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="6">No products found.</td></tr>';
    return;
  }
  
  items.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.id}</td>
      <td>${escapeHTML(item.name)}</td>
      <td>${escapeHTML(item.category)}</td>
      <td>$${parseFloat(item.price).toFixed(2)}</td>
      <td>${new Date(item.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
      <td>${new Date(item.updated_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
    `;
    tableBody.appendChild(tr);
  });
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

loadBtn.addEventListener('click', () => {
  historyStack = [null];
  fetchProducts(null);
});

nextBtn.addEventListener('click', () => {
  if (nextCursor) {
    historyStack.push(nextCursor);
    fetchProducts(nextCursor);
  }
});

prevBtn.addEventListener('click', () => {
  if (historyStack.length > 1) {
    historyStack.pop(); // remove current page cursor
    const previousCursor = historyStack[historyStack.length - 1];
    fetchProducts(previousCursor);
  }
});

// Initial load
historyStack = [null];
fetchProducts(null);

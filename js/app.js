// Only handle the in-page tabs (Power, Mining, Economy, Politics)
document.querySelectorAll('#tabs a[data-section]').forEach(tab => {
  tab.addEventListener('click', function(e) {
    e.preventDefault();
    
    document.querySelectorAll('.list-group-item').forEach(t => t.classList.remove('active'));
    this.classList.add('active');
    
    const section = this.getAttribute('data-section');
    loadSection(section);
  });
});

function loadSection(section) {
  const content = document.getElementById('content-area');
  content.innerHTML = `<h2 class="text-sa-green">Section: ${section.charAt(0).toUpperCase() + section.slice(1)}</h2><p>Content coming soon...</p>`;
  
  if (section === 'mining') {
    content.innerHTML = `
      <h2 class="text-sa-green">⛏️ Mining Dashboard</h2>
      <canvas id="miningChart" height="120"></canvas>
    `;
    renderSampleMiningChart();
  }
}

function renderSampleMiningChart() {
  const ctx = document.getElementById('miningChart');
  if (!ctx) return;
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['PGMs', 'Gold', 'Coal', 'Manganese', 'Iron Ore'],
      datasets: [{
        label: '2024 Value (R billion)',
        data: [180, 95, 140, 65, 85],
        backgroundColor: ['#007A4D', '#FFCD00', '#002395', '#000000', '#E03C31']
      }]
    },
    options: { responsive: true }
  });
}
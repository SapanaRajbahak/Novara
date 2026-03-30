// Simple mock chart rendering (bar chart)
document.addEventListener('DOMContentLoaded', function() {
  const ctx = document.getElementById('revenueChart').getContext('2d');
  // Mock data: monthly revenue
  const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
  const data = [5200, 6100, 7000, 8000, 9000, 3200];
  const max = Math.max(...data) * 1.1;
  const w = 400, h = 180, barW = 40, gap = 26;
  ctx.clearRect(0,0,w,h);
  ctx.font = 'bold 13px Manrope, sans-serif';
  ctx.fillStyle = '#e3dac9';
  ctx.fillRect(0,0,w,h);
  // Y axis
  ctx.strokeStyle = '#b7ac9f';
  ctx.beginPath();
  ctx.moveTo(40, 20); ctx.lineTo(40, h-30); ctx.lineTo(w-10, h-30);
  ctx.stroke();
  // Bars
  for(let i=0;i<data.length;i++) {
    const x = 40 + i*(barW+gap);
    const y = h-30 - (data[i]/max)*(h-60);
    ctx.fillStyle = '#bf9b5a';
    ctx.fillRect(x, y, barW, h-30-y);
    ctx.fillStyle = '#2f5145';
    ctx.fillText(months[i], x+barW/2-12, h-10);
    ctx.fillText('$'+data[i], x+barW/2-18, y-8);
  }
});

// Approve/Reject payout actions (mock)
document.querySelectorAll('.btn-approve').forEach(btn => {
  btn.onclick = function() {
    if (btn.disabled) return;
    btn.closest('tr').querySelector('.badge').textContent = 'Approved';
    btn.closest('tr').querySelector('.badge').className = 'badge badge-approved';
    btn.disabled = true;
    btn.nextElementSibling.disabled = true;
  };
});
document.querySelectorAll('.btn-reject').forEach(btn => {
  btn.onclick = function() {
    if (btn.disabled) return;
    btn.closest('tr').querySelector('.badge').textContent = 'Rejected';
    btn.closest('tr').querySelector('.badge').className = 'badge badge-rejected';
    btn.disabled = true;
    btn.previousElementSibling.disabled = true;
  };
});

// Settings form (mock save)
document.getElementById('settingsForm').onsubmit = function(e) {
  e.preventDefault();
  alert('Settings saved (mock)');
};

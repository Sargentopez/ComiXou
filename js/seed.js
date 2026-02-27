/* ============================================================
   seed.js — Datos de prueba + usuario admin
   Ejecutar UNA VEZ desde la consola del navegador:
   > loadScript('js/seed.js')
   O incluirlo temporalmente en index.html y quitarlo después.
   ============================================================ */

(function seedData() {

  // ── USUARIOS FIJOS ──
  // Admin y Macario son hardcoded en auth.js — no necesitan localStorage.
  // Solo aseguramos que seed de cómics usa los IDs correctos.
  console.log('ℹ️  Usuarios fijos gestionados por auth.js:');
  console.log('   admin@comixow.com / 123456  (rol: admin)');
  console.log('   macario@yo.com   / 123456  (rol: author)');

  // ── PORTADA DEFAULT (canvas gris con número) ──
  function makeThumb(n) {
    const canvas = document.createElement('canvas');
    canvas.width  = 300;
    canvas.height = 420; // proporción 9:20 aprox
    const ctx = canvas.getContext('2d');

    // Fondo con color suave variable
    const colors = ['#e8d5f5','#d5e8f5','#f5e8d5','#d5f5e8','#f5d5e8',
                    '#e8f5d5','#f5f5d5','#d5d5f5','#f5d5d5','#d5f5f5'];
    ctx.fillStyle = colors[n % colors.length];
    ctx.fillRect(0, 0, 300, 420);

    // Borde
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 292, 412);

    // Título
    ctx.fillStyle = '#222';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Título ${n}`, 150, 200);

    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#555';
    ctx.fillText(`Autor ${Math.ceil(n/2)}`, 150, 240);

    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#888';
    ctx.fillText('ComiXow', 150, 380);

    return canvas.toDataURL('image/jpeg', 0.7);
  }

  // ── PÁGINA DEFAULT ──
  function makePage(comicN, pageN) {
    const canvas = document.createElement('canvas');
    canvas.width  = 300;
    canvas.height = 420;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 300, 420);
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 296, 416);
    ctx.fillStyle = '#bbb';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Título ${comicN}`, 150, 180);
    ctx.font = '16px sans-serif';
    ctx.fillText(`Página ${pageN}`, 150, 220);
    return canvas.toDataURL('image/jpeg', 0.6);
  }

  // ── 20 CÓMICS ──
  const KEY_COMICS = 'cs_comics';
  const comics = JSON.parse(localStorage.getItem(KEY_COMICS) || '[]');

  // Limpiar cómics de seed anteriores
  const cleaned = comics.filter(c => !c._seed);

  const seedGenres = ['comic', 'fotografia', 'underground'];

  for (let i = 1; i <= 20; i++) {
    const autorNum = Math.ceil(i / 2);
    const userId   = autorNum <= 5 ? 'u_autor1' : 'u_admin';
    const genre    = seedGenres[(i - 1) % 3]; // reparte: comic, fotografia, underground, comic...
    const thumbUrl = makeThumb(i);

    const panels = [1, 2, 3].map((p, idx) => ({
      id:          `panel_seed_${i}_${p}`,
      dataUrl:     idx === 0 ? thumbUrl : makePage(i, p),
      orientation: 'v',
      texts:       []
    }));

    cleaned.push({
      id:        `comic_seed_${i}`,
      userId,
      username:  `Autor ${autorNum}`,
      title:     `Título ${i}`,
      desc:      `Descripción del cómic número ${i}.`,
      genre,
      panels,
      published:  true,
      approved:   true,
      _seed:      true,
      createdAt:  new Date(Date.now() - (20 - i) * 86400000).toISOString(),
      updatedAt:  new Date(Date.now() - (20 - i) * 3600000).toISOString()
    });
  }

  localStorage.setItem(KEY_COMICS, JSON.stringify(cleaned));
  console.log('✅ 20 cómics de prueba creados');
  console.log('🔄 Recarga la página para verlos');

})();

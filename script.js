/* ============================================================
   "Campo de girasoles al atardecer" — pintura interactiva
   ------------------------------------------------------------
   Organización del archivo:
     1. Utilidades y detección de rendimiento del dispositivo
     2. Generación de girasoles (SVG) por capas de profundidad
     3. Generación de nubes
     4. Sistema de partículas (canvas)
     5. Sistema de colibríes (rAF + curvas de Bézier)
     6. Mensaje romántico y revelado progresivo
     7. Música (YouTube IFrame API + fallback de audio propio)
     8. Interacción principal (botón "sorpresa")
   ============================================================ */

(function () {
  'use strict';

  /* ----------------------------------------------------------
     1. UTILIDADES
     ---------------------------------------------------------- */
  const rand = (min, max) => Math.random() * (max - min) + min;
  const randInt = (min, max) => Math.floor(rand(min, max + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  const isLowPower =
    (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
    (navigator.deviceMemory && navigator.deviceMemory <= 4);
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs) => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const key in attrs) el.setAttribute(key, attrs[key]);
    return el;
  };

  /* ----------------------------------------------------------
     2. GIRASOLES
     Cada girasol es un grupo SVG (tallo + centro + pétalos
     dispuestos radialmente). El balanceo del viento se resuelve
     con animaciones CSS (ver style.css) controladas por
     variables --sway-* que aquí asignamos de forma aleatoria
     para que ningún girasol se mueva exactamente igual.
     ---------------------------------------------------------- */

  function buildPetalGradientDefs(svg, idPrefix) {
    const defs = svgEl('defs', {});

    const petalGrad = svgEl('linearGradient', {
      id: `${idPrefix}-petal`,
      x1: '0%', y1: '100%', x2: '0%', y2: '0%'
    });
    petalGrad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': '#b5540f' }));
    petalGrad.appendChild(svgEl('stop', { offset: '45%', 'stop-color': '#f2a927' }));
    petalGrad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#fff0ac' }));
    defs.appendChild(petalGrad);

    const centerGrad = svgEl('radialGradient', {
      id: `${idPrefix}-center`,
      cx: '38%', cy: '35%', r: '65%'
    });
    centerGrad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': '#5a4321' }));
    centerGrad.appendChild(svgEl('stop', { offset: '55%', 'stop-color': '#3c2b16' }));
    centerGrad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#241809' }));
    defs.appendChild(centerGrad);

    svg.appendChild(defs);
  }

  /**
   * Dibuja un girasol dentro de un <svg> ya existente.
   * @param {SVGElement} svg      contenedor donde se añade el girasol
   * @param {string} idPrefix     prefijo de los gradientes de esta capa
   * @param {object} opts         parámetros de tamaño/posición/estilo
   */
  function drawSunflower(svg, idPrefix, opts) {
    const {
      x, baseY, stemHeight, petalCount, petalLen, petalWidth,
      centerRadius, swayAmt, swayDuration, swayDelay,
      flutterDuration, flutterDelay, stemWidth, flat
    } = opts;

    const group = svgEl('g', { class: 'sunflower' });
    group.style.setProperty('--sway-amt', `${swayAmt}deg`);
    group.style.setProperty('--sway-duration', `${swayDuration}s`);
    group.style.setProperty('--sway-delay', `${swayDelay}s`);
    group.style.setProperty('--flutter-duration', `${flutterDuration}s`);
    group.style.setProperty('--flutter-delay', `${flutterDelay}s`);
    group.setAttribute('transform', `translate(${x}, ${baseY})`);

    const plant = svgEl('g', { class: 'plant' });

    // Tallo: curva suave, ligeramente irregular para verse orgánico
    const bend = rand(-6, 6);
    const stem = svgEl('path', {
      class: 'stem',
      d: `M0,0 C ${bend},${-stemHeight * 0.45} ${-bend},${-stemHeight * 0.75} 0,${-stemHeight}`,
      stroke: flat ? '#7a6a2e' : '#5f5322',
      'stroke-width': stemWidth
    });
    plant.appendChild(stem);

    // Grupo de pétalos + centro, posicionado en la punta del tallo
    const petals = svgEl('g', { class: 'petals', transform: `translate(0, ${-stemHeight})` });

    const petalRing = svgEl('g', { class: 'petal-ring' });
    const angleStep = 360 / petalCount;
    for (let i = 0; i < petalCount; i++) {
      const angle = i * angleStep + rand(-3, 3);
      const petal = svgEl('ellipse', {
        class: 'petal',
        cx: 0,
        cy: -petalLen / 2,
        rx: petalWidth / 2,
        ry: petalLen / 2,
        fill: `url(#${idPrefix}-petal)`,
        transform: `rotate(${angle})`
      });
      petalRing.appendChild(petal);
    }
    petals.appendChild(petalRing);

    const center = svgEl('circle', {
      class: 'center',
      r: centerRadius,
      fill: `url(#${idPrefix}-center)`
    });
    petals.appendChild(center);

    plant.appendChild(petals);
    group.appendChild(plant);
    svg.appendChild(group);
  }

  /**
   * Puebla una capa completa del campo con N girasoles distribuidos
   * a lo largo del ancho del viewBox, variando tamaño/velocidad de
   * balanceo según la profundidad (capas más lejanas = más quietas).
   */
  function generateField(svgId, idPrefix, count, sizeRange, depthFactor) {
    const svg = document.getElementById(svgId);
    if (!svg) return;
    buildPetalGradientDefs(svg, idPrefix);

    const viewBox = svg.viewBox.baseVal;
    const width = viewBox.width || 1000;
    const baseY = viewBox.height || 300;

    // Distribución con jitter para evitar look de "rejilla"
    const slotWidth = width / count;
    for (let i = 0; i < count; i++) {
      const x = slotWidth * i + rand(slotWidth * 0.15, slotWidth * 0.85);
      const size = rand(sizeRange[0], sizeRange[1]);
      const stemHeight = size * rand(0.85, 1.25);

      drawSunflower(svg, idPrefix, {
        x,
        baseY: baseY + rand(-baseY * 0.03, baseY * 0.03),
        stemHeight,
        petalCount: randInt(8, 13),
        petalLen: size * 0.62,
        petalWidth: size * 0.24,
        centerRadius: size * 0.24,
        stemWidth: Math.max(1.2, size * 0.045),
        flat: depthFactor < 0.5,
        // Capas lejanas se balancean más lento y con menor amplitud
        swayAmt: rand(0.6, 2.2) * depthFactor + 0.4,
        swayDuration: rand(4.5, 8) / depthFactor,
        swayDelay: rand(-8, 0),
        flutterDuration: rand(2.4, 4) / Math.max(depthFactor, 0.6),
        flutterDelay: rand(-4, 0)
      });
    }
  }

  function initSunflowerField() {
    // Horizonte: muchos girasoles pequeños, movimiento casi imperceptible
    generateField('fieldHorizon', 'sf-h', isMobile ? 16 : 22, [14, 22], 0.35);
    // Plano medio: tamaño y movimiento intermedios
    generateField('fieldMid', 'sf-m', isMobile ? 9 : 13, [30, 46], 0.7);
    // Primer plano: pocos girasoles, grandes, más perceptibles al viento
    generateField('fieldFront', 'sf-f', isMobile ? 4 : 6, [70, 120], 1.15);
  }

  /* ----------------------------------------------------------
     3. NUBES
     Formas suaves (radial-gradient + blur) que derivan muy
     lentamente de un lado a otro del cielo.
     ---------------------------------------------------------- */
  function initClouds() {
    const layer = document.getElementById('cloudsLayer');
    if (!layer) return;
    const count = isMobile ? 4 : 6;

    for (let i = 0; i < count; i++) {
      const cloud = document.createElement('div');
      cloud.className = 'cloud';
      const w = rand(18, 40);
      const h = w * rand(0.28, 0.4);
      cloud.style.width = `${w}vw`;
      cloud.style.height = `${h}vw`;
      cloud.style.left = `${rand(-10, 90)}vw`;
      cloud.style.top = `${rand(4, 46)}vh`;
      cloud.style.opacity = rand(0.3, 0.6).toFixed(2);
      const duration = rand(140, 260);
      cloud.style.animationDuration = `${duration}s`;
      cloud.style.animationDelay = `-${rand(0, duration)}s`;
      layer.appendChild(cloud);
    }
  }

  /* ----------------------------------------------------------
     4. PARTÍCULAS (polen / motas de luz)
     Canvas ligero, pocas partículas, redibujado con rAF.
     ---------------------------------------------------------- */
  function initParticles() {
    const canvas = document.getElementById('particlesCanvas');
    if (!canvas || prefersReducedMotion) return;
    const ctx = canvas.getContext('2d');

    let width, height;
    function resize() {
      width = canvas.width = canvas.offsetWidth * devicePixelRatio;
      height = canvas.height = canvas.offsetHeight * devicePixelRatio;
    }
    resize();
    window.addEventListener('resize', resize);

    const count = isMobile ? 7 : (isLowPower ? 10 : 16);
    const particles = [];

    function spawn(p) {
      // Aparecen sobre todo cerca del campo de girasoles y del área del sol
      const nearSun = Math.random() < 0.4;
      p.x = nearSun ? rand(0.35, 0.65) * width : rand(0, 1) * width;
      p.y = nearSun ? rand(0.45, 0.65) * height : rand(0.55, 0.95) * height;
      p.r = rand(0.8, 2.2) * devicePixelRatio;
      p.driftX = rand(-0.06, 0.12) * devicePixelRatio;
      p.driftY = rand(-0.18, -0.04) * devicePixelRatio;
      p.alpha = 0;
      p.alphaTarget = rand(0.25, 0.6);
      p.life = 0;
      p.maxLife = rand(9000, 18000);
      p.fadeSpeed = rand(0.006, 0.014);
    }

    for (let i = 0; i < count; i++) {
      const p = {};
      spawn(p);
      p.life = rand(0, p.maxLife); // desfasar el inicio
      particles.push(p);
    }

    let lastTime = performance.now();
    function tick(now) {
      const dt = Math.min(now - lastTime, 50);
      lastTime = now;
      ctx.clearRect(0, 0, width, height);

      particles.forEach((p) => {
        p.life += dt;
        p.x += p.driftX;
        p.y += p.driftY;

        const lifeRatio = p.life / p.maxLife;
        if (lifeRatio < 0.15) {
          p.alpha = Math.min(p.alphaTarget, p.alpha + p.fadeSpeed);
        } else if (lifeRatio > 0.75) {
          p.alpha = Math.max(0, p.alpha - p.fadeSpeed);
        }

        if (p.life >= p.maxLife) spawn(p);

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 224, 160, ${p.alpha})`;
        ctx.shadowColor = 'rgba(255, 210, 140, 0.8)';
        ctx.shadowBlur = 4 * devicePixelRatio;
        ctx.fill();
      });

      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ----------------------------------------------------------
     5. COLIBRÍES
     Cada colibrí recorre una trayectoria curva (Bézier cúbica)
     generada aleatoriamente, se detiene brevemente ("hover")
     cerca del campo y luego sale de escena. Al terminar un
     ciclo espera un tiempo aleatorio antes de volver a aparecer,
     de modo que nunca están todos en pantalla a la vez.
     ---------------------------------------------------------- */
  function cubicBezier(p0, p1, p2, p3, t) {
    const u = 1 - t;
    const x = u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x;
    const y = u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y;
    return { x, y };
  }

  function makeHummingbird(container, index) {
    const el = document.createElement('div');
    el.className = 'hummingbird';
    el.innerHTML = `
      <svg viewBox="0 0 34 22">
        <g class="wing" style="transform-origin: 14px 8px;">
          <ellipse cx="12" cy="6" rx="9" ry="4" fill="rgba(60,90,70,0.55)"/>
        </g>
        <ellipse cx="20" cy="12" rx="12" ry="5" fill="#2f5d4f"/>
        <ellipse cx="30" cy="11" rx="4" ry="2.2" fill="#e0536b"/>
        <path d="M30,11 L34,10.5" stroke="#1a1a1a" stroke-width="1" stroke-linecap="round"/>
        <ellipse cx="9" cy="13" rx="4" ry="6" fill="#245a44"/>
      </svg>
    `;
    container.appendChild(el);

    return {
      el,
      wing: el.querySelector('.wing'),
      speedFactor: rand(0.7, 1.4), // cada colibrí vuela a un ritmo distinto
      phase: 'idle',
      phaseStart: 0,
      phaseDuration: 0,
      from: null,
      to: null,
      hoverPoint: null,
      nextCycleAt: performance.now() + rand(300, 4000) * (index + 1) / 2
    };
  }

  function randomEdgePoint() {
    // Punto fuera o en el borde de la escena, para entradas/salidas naturales
    const side = pick(['left', 'right', 'top']);
    if (side === 'left') return { x: rand(-8, -2), y: rand(35, 85) };
    if (side === 'right') return { x: rand(102, 110), y: rand(35, 85) };
    return { x: rand(10, 90), y: rand(-5, 5) };
  }

  function randomFieldPoint() {
    // Punto cercano al campo de girasoles (zona inferior de la escena)
    return { x: rand(15, 85), y: rand(48, 78) };
  }

  function startHummingbirdCycle(bird, now) {
    const from = randomEdgePoint();
    const to = randomFieldPoint();
    bird.from = from;
    bird.to = to;
    bird.control1 = { x: rand(from.x, to.x), y: rand(Math.min(from.y, to.y) - 15, Math.max(from.y, to.y)) };
    bird.control2 = { x: rand(from.x, to.x), y: rand(Math.min(from.y, to.y) - 10, Math.max(from.y, to.y) + 10) };
    bird.phase = 'flyIn';
    bird.phaseStart = now;
    bird.phaseDuration = rand(4500, 8500) * bird.speedFactor;
    bird.el.classList.add('is-visible');
  }

  function updateHummingbird(bird, now, sceneRect) {
    if (bird.phase === 'idle') {
      if (now >= bird.nextCycleAt) startHummingbirdCycle(bird, now);
      return;
    }

    const elapsed = now - bird.phaseStart;
    const t = clamp(elapsed / bird.phaseDuration, 0, 1);
    const eased = easeInOutQuad(t);

    if (bird.phase === 'flyIn') {
      const pos = cubicBezier(bird.from, bird.control1, bird.control2, bird.to, eased);
      placeBird(bird, pos, sceneRect, bird.to.x - bird.from.x);

      if (t >= 1) {
        bird.phase = 'hover';
        bird.phaseStart = now;
        bird.phaseDuration = rand(900, 2200);
        bird.hoverPoint = pos;
      }
    } else if (bird.phase === 'hover') {
      // Pequeño temblor orgánico mientras "liba" la flor
      const jitterX = Math.sin(now / 90) * 0.6;
      const jitterY = Math.cos(now / 130) * 0.4;
      placeBird(bird, { x: bird.hoverPoint.x + jitterX, y: bird.hoverPoint.y + jitterY }, sceneRect, 0);

      if (t >= 1) {
        const exit = randomEdgePoint();
        bird.from = bird.hoverPoint;
        bird.to = exit;
        bird.control1 = { x: rand(bird.from.x, exit.x), y: rand(bird.from.y - 10, bird.from.y + 10) };
        bird.control2 = { x: rand(bird.from.x, exit.x), y: rand(exit.y - 10, exit.y + 10) };
        bird.phase = 'flyOut';
        bird.phaseStart = now;
        bird.phaseDuration = rand(3500, 7000) * bird.speedFactor;
      }
    } else if (bird.phase === 'flyOut') {
      const pos = cubicBezier(bird.from, bird.control1, bird.control2, bird.to, eased);
      placeBird(bird, pos, sceneRect, bird.to.x - bird.from.x);

      if (t >= 1) {
        bird.el.classList.remove('is-visible');
        bird.phase = 'idle';
        bird.nextCycleAt = now + rand(2500, 9000);
      }
    }
  }

  function placeBird(bird, posPercent, sceneRect, dx) {
    const x = (posPercent.x / 100) * sceneRect.width;
    const y = (posPercent.y / 100) * sceneRect.height;
    const facingLeft = dx < 0;
    bird.el.style.transform =
      `translate(${x}px, ${y}px) scaleX(${facingLeft ? -1 : 1})`;
  }

  function initHummingbirds() {
    const container = document.getElementById('hummingbirdsLayer');
    if (!container) return { start() {} };

    const count = isMobile ? 3 : 5;
    const birds = [];
    for (let i = 0; i < count; i++) birds.push(makeHummingbird(container, i));

    let started = false;
    let rafId = null;

    function loop(now) {
      const sceneRect = document.getElementById('scene').getBoundingClientRect();
      birds.forEach((b) => updateHummingbird(b, now, sceneRect));
      rafId = requestAnimationFrame(loop);
    }

    return {
      start() {
        if (started || prefersReducedMotion) return;
        started = true;
        const now = performance.now();
        birds.forEach((b, i) => {
          b.nextCycleAt = now + rand(200, 2500) + i * rand(400, 900);
        });
        rafId = requestAnimationFrame(loop);
      }
    };
  }

  /* ----------------------------------------------------------
     6. MENSAJE ROMÁNTICO
     Se revela solo, unos segundos después de entrar, para que
     primero se aprecie el paisaje en calma.
     ---------------------------------------------------------- */
  function initMessageReveal() {
    const message = document.getElementById('messageOverlay');
    const button = document.getElementById('surpriseBtn');

    setTimeout(() => {
      message.classList.add('is-visible');
      button.classList.add('is-visible');
    }, 3400);
  }

  /* ----------------------------------------------------------
     0-BIS. PANTALLA DE ACCESO
     Un filtro simple con clave para que el enlace, aunque quede
     "no listado" en internet, no se abra con solo tenerlo a la
     vista de cualquiera. OJO: esto es una barrera del lado del
     cliente (JavaScript visible), no seguridad real — cualquiera
     con conocimientos técnicos podría saltarla leyendo el código.
     Sirve como filtro casual para un enlace personal, no como
     protección de datos sensibles.

     Cambia ACCESS_PASSWORD por la clave que quieras usar.
     ---------------------------------------------------------- */
  const ACCESS_PASSWORD = 'girasoles';

  function initAccessGate(onUnlock) {
    const gate = document.getElementById('accessGate');
    const form = document.getElementById('accessGateForm');
    const input = document.getElementById('accessGateInput');
    const error = document.getElementById('accessGateError');
    if (!gate || !form || !input) {
      onUnlock();
      return;
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = input.value.trim().toLowerCase();

      if (value === ACCESS_PASSWORD.toLowerCase()) {
        gate.classList.add('is-unlocked');
        setTimeout(() => { gate.hidden = true; }, 900);
        onUnlock();
      } else {
        error.hidden = false;
        gate.classList.add('shake');
        input.select();
        setTimeout(() => gate.classList.remove('shake'), 400);
      }
    });

    input.addEventListener('input', () => {
      error.hidden = true;
    });

    // Enfoca el campo automáticamente para que se pueda escribir de inmediato
    setTimeout(() => input.focus(), 300);
  }

  /* ----------------------------------------------------------
     7. MÚSICA
     Se integra el embed oficial de YouTube dentro de un iframe
     oculto. El iframe se deja SIN src al cargar la página, y
     solo se le asigna la URL del embed (con autoplay=1) dentro
     del propio manejador de clic del botón: así el video se
     solicita como consecuencia directa de un gesto del usuario,
     que es lo que los navegadores exigen para permitir audio
     con sonido de forma automática.

     Si en el futuro se dispone de un archivo de audio propio y
     autorizado, basta con asignar su ruta a #bgAudioFallback
     (por ejemplo: audio.src = "assets/mi-cancion-autorizada.mp3")
     y este módulo lo usará automáticamente como respaldo si el
     embed de YouTube no llega a cargar.
     ---------------------------------------------------------- */
  const YT_VIDEO_ID = '0KStf4ya3DM'; // Calibre 50 - "Mi Sorpresa Fuiste Tú" (video oficial)

  function playMusic() {
    const iframe = document.getElementById('youtubePlayer');
    if (iframe) {
      iframe.src =
        `https://www.youtube-nocookie.com/embed/${YT_VIDEO_ID}` +
        `?autoplay=1&controls=0&modestbranding=1&rel=0&playsinline=1`;
      return;
    }
    // Respaldo: solo suena si en el futuro se define una fuente propia autorizada
    const fallback = document.getElementById('bgAudioFallback');
    if (fallback && fallback.getAttribute('src')) {
      fallback.play().catch(() => {});
    }
  }

  /* ----------------------------------------------------------
     8. PINTURA DE REFERENCIA CON ZOOM
     Al activarse la sorpresa, esta pintura entra en pantalla
     completa con un zoom lento (ver transición en CSS), se
     mantiene un momento y se desvanece para volver a revelar
     la escena interactiva de fondo.
     ---------------------------------------------------------- */
  function showRevealImage() {
    const overlay = document.getElementById('revealImageOverlay');
    if (!overlay) return;

    // Forzamos reflow antes de añadir la clase para asegurar que
    // la transición de zoom se dispare desde su estado inicial.
    overlay.classList.add('is-active');

    setTimeout(() => {
      overlay.classList.add('is-fading');
    }, 5200);

    setTimeout(() => {
      overlay.classList.remove('is-active');
      overlay.classList.remove('is-fading');
    }, 7000);
  }

  /* ----------------------------------------------------------
     9. INTERACCIÓN PRINCIPAL
     ---------------------------------------------------------- */
  function initSurpriseButton(hummingbirds) {
    const button = document.getElementById('surpriseBtn');
    const scene = document.getElementById('scene');
    if (!button) return;

    let activated = false;
    button.addEventListener('click', () => {
      if (activated) return;
      activated = true;

      scene.classList.add('is-revealed');   // intensifica el resplandor del atardecer
      hummingbirds.start();                  // los colibríes comienzan a aparecer
      playMusic();                           // inicia la música (gesto del usuario)
      showRevealImage();                     // pintura de referencia con efecto de zoom

      button.textContent = '♪ Para ti';
      button.classList.add('is-hidden');
    });
  }

  /* ----------------------------------------------------------
     INICIALIZACIÓN
     ---------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', () => {
    initSunflowerField();
    initClouds();
    initParticles();
    const hummingbirds = initHummingbirds();
    initSurpriseButton(hummingbirds);
    // El paisaje ya está vivo detrás de la pantalla de acceso; el mensaje
    // solo empieza su cuenta regresiva una vez que la persona entra.
    initAccessGate(() => initMessageReveal());
  });
})();

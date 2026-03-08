/**
 * ComiXow - Módulo de Soporte para Tabletas Gráficas
 * Integración con editor.js para sensibilidad de presión, inclinación y velocidad
 */

class TabletSupport {
  constructor() {
    this.isTabletConnected = false;
    this.currentPressure = 0;
    this.currentTiltX = 0;
    this.currentTiltY = 0;
    this.currentTwist = 0;
    this.pointerType = 'mouse';
    this.lastX = 0;
    this.lastY = 0;
    this.lastTime = 0;
    this.velocity = 0;
    
    this.init();
  }

  init() {
    // Detectar soporte de Pointer Events
    if (window.PointerEvent) {
      this.setupPointerEvents();
      console.log('✓ Pointer Events API disponible');
    } else {
      console.warn('⚠ Pointer Events no soportado, usando Mouse Events');
      this.setupMouseEvents();
    }

    // Detectar cambios en dispositivos
    this.detectTabletConnection();
  }

  setupPointerEvents() {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    canvas.addEventListener('pointerleave', (e) => this.onPointerLeave(e));
  }

  setupMouseEvents() {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
  }

  onPointerDown(e) {
    this.updatePointerData(e);
    this.lastTime = Date.now();
    
    if (e.pointerType === 'pen') {
      this.isTabletConnected = true;
      this.pointerType = 'pen';
      this.updateTabletUI();
    }
  }

  onPointerMove(e) {
    if (e.buttons === 0) return; // No está presionado

    this.updatePointerData(e);
    this.calculateVelocity(e);
    this.applyTabletPressure();
  }

  onPointerUp(e) {
    this.currentPressure = 0;
    this.velocity = 0;
  }

  onPointerLeave(e) {
    this.currentPressure = 0;
  }

  onMouseDown(e) {
    this.pointerType = 'mouse';
    this.lastTime = Date.now();
  }

  onMouseMove(e) {
    if (e.buttons === 0) return;
    this.calculateVelocity(e);
    // Simular presión con velocidad
    this.currentPressure = Math.min(this.velocity / 10, 1);
  }

  onMouseUp(e) {
    this.currentPressure = 0;
  }

  updatePointerData(e) {
    this.currentPressure = e.pressure || 0;
    this.currentTiltX = e.tiltX || 0;
    this.currentTiltY = e.tiltY || 0;
    this.currentTwist = e.twist || 0;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  }

  calculateVelocity(e) {
    const now = Date.now();
    const dt = now - this.lastTime;
    
    if (dt > 0) {
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      this.velocity = distance / dt;
    }
    
    this.lastTime = now;
  }

  applyTabletPressure() {
    // Modificar el tamaño del pincel según presión
    if (window.currentBrushSize !== undefined) {
      const baseBrushSize = window.baseBrushSize || window.currentBrushSize;
      const pressureMultiplier = 0.5 + (this.currentPressure * 1.5); // 0.5x a 2x
      window.currentBrushSize = baseBrushSize * pressureMultiplier;
    }

    // Modificar opacidad según inclinación
    if (window.currentOpacity !== undefined && this.currentTiltX !== 0) {
      const tiltInfluence = Math.abs(this.currentTiltX) / 90;
      window.currentOpacity = Math.max(0.3, 1 - tiltInfluence * 0.5);
    }
  }

  detectTabletConnection() {
    document.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'pen' && !this.isTabletConnected) {
        this.isTabletConnected = true;
        this.updateTabletUI();
        this.showNotification('✓ Tableta gráfica detectada');
      }
    });
  }

  updateTabletUI() {
    const statusEl = document.getElementById('tabletStatus');
    if (statusEl) {
      statusEl.innerHTML = `
        <div class="tablet-status-connected">
          <span class="status-dot"></span>
          Tableta Conectada
        </div>
      `;
    }
  }

  showNotification(message) {
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }
  }

  // Obtener datos actuales para usar en el editor
  getPressureData() {
    return {
      pressure: this.currentPressure,
      tiltX: this.currentTiltX,
      tiltY: this.currentTiltY,
      twist: this.currentTwist,
      velocity: this.velocity,
      isTablet: this.isTabletConnected,
      pointerType: this.pointerType
    };
  }

  // Aplicar suavizado de línea (anti-aliasing)
  getSmoothBrushSize(baseSize) {
    const pressure = this.currentPressure || 1;
    return baseSize * (0.5 + pressure * 1.5);
  }

  // Calcular ángulo del pincel según inclinación
  getBrushAngle() {
    return Math.atan2(this.currentTiltY, this.currentTiltX);
  }

  // Obtener opacidad ajustada por presión
  getAdjustedOpacity(baseOpacity) {
    return baseOpacity * (0.5 + this.currentPressure);
  }
}

// Instanciar globalmente
window.tabletSupport = new TabletSupport();

// Exportar para uso en módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TabletSupport;
}
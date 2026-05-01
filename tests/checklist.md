# ComiXow — Checklist de Regresión
> Ejecutar antes de aprobar cualquier versión. Marcar ✓/✗ en PC y Android.

## Ejecutar tests unitarios primero
```bash
node tests/unit.test.js   # debe terminar con 0 fallos
```

---

## 1. EDITOR — Navegación y cámara
| # | Prueba | PC | Android |
|---|--------|----|---------|
| 1.1 | Zoom con rueda/pinch — se mantiene al soltar | | |
| 1.2 | Zoom con botón 🔍 centra el lienzo | | |
| 1.3 | Tocar canvas sin herramienta NO resetea zoom | | |
| 1.4 | Cambio de orientación del dispositivo resetea cámara | | |
| 1.5 | Cambiar de hoja resetea cámara | | |

## 2. EDITOR — Selección de capas
| # | Prueba | PC | Android |
|---|--------|----|---------|
| 2.1 | Click en texto abre panel de propiedades | | |
| 2.2 | Doble click en texto abre panel de propiedades | | |
| 2.3 | Click en dibujo a mano selecciona capa | | |
| 2.4 | Click en borde de objeto sin relleno selecciona | | |
| 2.5 | Click en zona transparente NO selecciona | | |
| 2.6 | Objetos superpuestos: selecciona el de mayor índice | | |

## 3. EDITOR — Panel de texto/bocadillo
| # | Prueba | PC | Android |
|---|--------|----|---------|
| 3.1 | Panel NO se cierra al tocar canvas | | |
| 3.2 | Panel NO se cierra al tocar barra de menús bloqueada | | |
| 3.3 | Panel se cierra con botón ✓ | | |
| 3.4 | Tocar otro texto cierra el actual y abre el nuevo | | |
| 3.5 | ESC cierra el panel | | |

## 4. EDITOR — Menús
| # | Prueba | PC | Android |
|---|--------|----|---------|
| 4.1 | Menú Insertar → Imagen → Galería funciona | | |
| 4.2 | Menú Insertar → Texto → Bocadillo añade bocadillo | | |
| 4.3 | Menú Dibujar → Dibujo a mano abre submenú | | |
| 4.4 | Menú Dibujar → Vectorial → Rectángulo funciona | | |
| 4.5 | Menú Proyecto se alinea a la derecha | | |
| 4.6 | Click fuera del menú lo cierra | | |
| 4.7 | Menús bloqueados NO responden al tocarlos | | |

## 5. EDITOR — Objetos vectoriales
| # | Prueba | PC | Android |
|---|--------|----|---------|
| 5.1 | Resize proporcional mantiene radios de curva | | |
| 5.2 | Resize asimétrico ajusta radios al eje más corto | | |
| 5.3 | V⟺C: tocar vértice lo hace invisible | | |
| 5.4 | V⟺C: slider actualiza curva en tiempo real | | |
| 5.5 | V⟺C: último vértice editado tiene prioridad en conflictos | | |
| 5.6 | Barra flotante y slider tienen misma orientación | | |
| 5.7 | Slider se mueve junto con la barra al arrastrarla | | |

## 6. EDITOR — Dibujo a mano
| # | Prueba | PC | Android |
|---|--------|----|---------|
| 6.1 | Pinch con 2 dedos hace zoom de cámara (no pinta) | | |
| 6.2 | Deshacer/rehacer trazos funciona | | |
| 6.3 | Borrador borra sin afectar otras capas | | |

## 7. EDITOR — Bocadillos
| # | Prueba | PC | Android |
|---|--------|----|---------|
| 7.1 | Cola de bocadillo se puede arrastrar | | |
| 7.2 | Bocadillo pensamiento: puntos azul/rojo ajustan cola | | |
| 7.3 | Bocadillo explosión: vértices arrastrables | | |
| 7.4 | Texto no sobresale del bocadillo (T5) | | |

## 8. HOME / INDEX
| # | Prueba | PC | Android |
|---|--------|----|---------|
| 8.1 | Obras publicadas aparecen en el índice | | |
| 8.2 | Buscador filtra por autor/género | | |
| 8.3 | Botón Leer abre el reproductor | | |

## 9. REPRODUCTOR EXTERNO
| # | Prueba | PC | Android |
|---|--------|----|---------|
| 9.1 | Primer texto visible al cargar hoja | | |
| 9.2 | Navegación avanza/retrocede hojas | | |
| 9.3 | Botón cerrar vuelve a la app | | |
| 9.4 | Pantalla de créditos aparece al final | | |

---
*Actualizar este archivo cuando se añadan funcionalidades nuevas.*

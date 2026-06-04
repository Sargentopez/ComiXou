/* Comxow/COMXOW, creada por A. Gavina Costero  2026, albertobicho@gmail.com */
/*
 * Librerías y código de terceros utilizados en este proyecto:
 *
 * - omggif (GIF encoder/decoder)
 *     Autor: Dean McNamee <dean@gmail.com>
 *     Licencia: MIT
 *     https://github.com/deanm/omggif
 *
 * - pako (compresión zlib/gzip)
 *     Autores: Andrei Tuputcyn, Vitaly Puzrin y colaboradores (Nodeca project)
 *     Licencia: MIT
 *     https://github.com/nodeca/pako
 *
 * - UPNG.js (codificador/decodificador PNG)
 *     Autor: Ivan Kutskir
 *     Licencia: MIT
 *     https://github.com/photopea/UPNG.js
 *
 * - LZW decompression (puerto JavaScript de implementación Java)
 *     Referencia original: https://gist.github.com/devunwired/4479231
 *     Licencia: dominio público / uso libre
 */
/* ============================================================
   genres.js — Lista de géneros del catálogo
   Ampliar añadiendo entradas al array GENRES.
   ============================================================ */

const GENRES = [
  { id: 'comic',       label: 'Ilustración' },
  { id: 'fotografia',  label: 'Fotografía' },
  { id: 'underground', label: 'Underground' },
  { id: 'aventura',    label: 'Aventura' },
  { id: 'drama',       label: 'Drama' },
  { id: 'comedia',     label: 'Comedia' },
  { id: 'scifi',       label: 'Sci-Fi' },
  { id: 'terror',      label: 'Terror' },
  { id: 'romance',     label: 'Romance' },
  { id: 'accion',      label: 'Acción' },
  { id: 'fantasia',    label: 'Fantasía' },
  { id: 'historico',   label: 'Histórico' },
  { id: 'thriller',    label: 'Thriller' },
  { id: 'infantil',    label: 'Infantil' },
  { id: 'documental',  label: 'Documental' },
];

// Devuelve el label a partir del id
function genreLabel(id) {
  const g = GENRES.find(g => g.id === id);
  return g ? g.label : id;
}

/* ============================================================
   genres.js — Lista de géneros del catálogo
   Ampliar añadiendo entradas al array GENRES.
   ============================================================ */

const GENRES = [
  { id: 'comic',       label: 'Cómic' },
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

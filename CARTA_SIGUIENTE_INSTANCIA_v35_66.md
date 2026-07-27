# Carta para la siguiente instancia — de v35.29 a v35.66 (reader v30.82)

Hola. Continuación directa de la carta anterior (`CARTA_SIGUIENTE_INSTANCIA_v35_29.md` — léela si necesitas el contexto de la migración de dominio, Brevo/SMTP, el cambio de contraseña, etc., aquí no lo repito). Esta ha sido una sesión larga y variada: retoques de interfaz, un sistema nuevo de nombrado de textos/animaciones, una investigación a fondo de las trayectorias en grupos, dos bugs de fondo en el flujo de texto, la confirmación de email de Supabase activada, y — lo más importante para quien continúe desde aquí — **la auditoría de políticas RLS completada, con tres vulnerabilidades reales corregidas.**

---

## 0. Confirmación de email: ACTIVADA

Durante meses (desde la v7.x) todas las cartas han dicho "DESACTIVADA (desarrollo/pruebas), reactivar antes de producción". **Eso ya no es así.** Alberto la activó él mismo en el panel de Supabase durante esta sesión, tras un intercambio en el que primero le dije (mal, fiándome de la documentación acumulada sin comprobarlo con él) que seguía desactivada. Alberto corrigió: ya la había cambiado. **No vuelvas a dar por sentado el estado de esta opción leyendo cartas antiguas — pregúntale a Alberto directamente si hay alguna duda, es un ajuste que vive solo en el panel de Supabase, no en el código, así que ninguna carta ni ningún grep del repositorio lo puede confirmar por sí solo.**

---

## 1. Auditoría RLS completada — tres vulnerabilidades reales corregidas

Era el bloqueante señalado en todas las cartas desde hace sesiones. Se auditó con esta consulta (útil si hace falta repetirla más adelante, p.ej. al añadir una tabla nueva):

```sql
select
  t.tablename, t.rowsecurity as rls_enabled,
  p.policyname, p.cmd as command, p.roles, p.qual as using_expression, p.with_check
from pg_tables t
left join pg_policies p
  on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public'
  and t.tablename in ('works','panels','panel_layers','panel_texts','authors','biblioteca')
order by t.tablename, p.policyname;
```

**Contexto importante para explicar por qué esto era tan urgente, por si hace falta repetir la explicación:** la clave `anon` (`sb_publishable_...`) que está en `js/auth.js`/`js/supabase-client.js` **no es secreta** — viaja en texto plano en cualquier fichero JS servido a cualquier visitante, se puede leer con `curl` sin ni siquiera abrir un navegador. Las políticas RLS son la única barrera real frente a alguien que hable directamente con la API de Supabase sin pasar por la interfaz de la app — los `isAdmin()`/comprobaciones del propio JavaScript son solo comodidad de interfaz, no protección.

### 1.1 — Crítico: cualquier usuario podía autoasignarse el rol de admin

`authors_update_own` tenía `using (auth.uid() = id)` pero **sin `with_check`** — en Postgres, sin `with_check` explícito se reutiliza el mismo `using`, que solo impedía cambiar el `id`, no el `role`. Cualquier usuario autenticado (con solo registrarse, algo público) podía hacer un `PATCH` directo a su propia fila poniendo `role: 'admin'`.

**Arreglado con un trigger** (`with_check` por sí solo no puede comparar el valor antes/después):

```sql
create or replace function public.prevent_role_self_change()
returns trigger language plpgsql security definer as $$
begin
  if NEW.role is distinct from OLD.role then
    if not exists (select 1 from public.authors where id = auth.uid() and role = 'admin') then
      NEW.role := OLD.role;
    end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_prevent_role_self_change
before update on public.authors
for each row execute function public.prevent_role_self_change();
```

### 1.2 — `deleteAuthorData()` (borrar usuario desde admin) estaba parcialmente roto

Comprobado en el código (`supabase-client.js`): usa la misma clave `anon` de siempre, sin ninguna vía privilegiada — así que está sujeto a las mismas políticas RLS que cualquiera. `biblioteca` y `authors` no tenían política de `DELETE` para admin (solo para el propio dueño de la fila), así que cuando un admin "eliminaba" a otro usuario, sus obras sí se borraban (`works`/`panels`/etc. ya tenían `_delete_admin`) pero su fila de `biblioteca` y su perfil en `authors` se quedaban huérfanos sin ningún error visible.

```sql
create policy "biblioteca_delete_admin" on public.biblioteca for delete
using (exists (select 1 from public.authors a2 where a2.id = auth.uid() and a2.role = 'admin'));

create policy "authors_delete_admin" on public.authors for delete
using (exists (select 1 from public.authors a2 where a2.id = auth.uid() and a2.role = 'admin'));
```

### 1.3 — Un autor podía autopublicarse saltándose la revisión de admin

Confirmado con Alberto: un autor puede enviar su obra a quien quiera desde Mis Creaciones, pero publicarla en el índice **debe** pasar por un admin. `works_update` tenía `with_check (auth.uid() = author_id)` — protegía la autoría, pero no el campo `published`, así que un autor podía saltarse la revisión con un `PATCH` directo poniendo `published: true`.

```sql
create or replace function public.prevent_self_publish()
returns trigger language plpgsql security definer as $$
begin
  if NEW.published = true and OLD.published = false then
    if not exists (select 1 from public.authors where id = auth.uid() and role = 'admin') then
      NEW.published := false;
    end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_prevent_self_publish
before update on public.works
for each row execute function public.prevent_self_publish();
```

**Ojo con el matiz, por si hace falta tocar esto:** el trigger solo bloquea el sentido `false → true` para quien no sea admin. `true → false` (el botón "Retirar" que el propio autor ya tenía en Mis Creaciones) sigue funcionando sin pasar por admin — decisión deliberada, confirmada con Alberto, ya que despublicar tu propia obra es mucho menos delicado que ganar visibilidad indebidamente.

### 1.4 — El email de todos los usuarios era legible por cualquiera, sin sesión

`authors_select_public` tenía `using (true)` — cualquiera, sin cuenta, podía pedir `authors?select=email` y sacar el correo de todo el mundo. Arreglarlo de golpe habría roto dos cosas legítimas que sí necesitan acceso público a esa tabla: el panel de admin (ver todos los emails, correcto para un admin) y, sobre todo, **la comprobación de nombre de usuario único al registrarse** (necesita funcionar sin cuenta todavía). Como RLS no distingue columnas dentro de una misma fila, dejar esa fila visible para comprobar el nombre habría dejado el email visible por la misma vía. Se hizo en **tres pasos, en este orden exacto** (importante si algo similar hay que repetir: invertir el orden habría roto el registro de usuarios a mitad de camino):

1. Función RPC dedicada que solo devuelve `true`/`false`, sin exponer la fila:
   ```sql
   create or replace function public.username_exists(uname text)
   returns boolean language sql security definer stable as $$
     select exists (select 1 from public.authors where username = uname);
   $$;
   grant execute on function public.username_exists(text) to anon, authenticated;
   ```
2. `auth.js` (`register()`) actualizado para llamar a `POST /rest/v1/rpc/username_exists` en vez de consultar la tabla directamente (v35.66). Confirmado que la otra consulta a `authors` en `auth.js` (`_fetchProfile`, al iniciar sesión) ya filtraba por el propio `id` con el propio token — no le afectaba el paso siguiente.
3. Una vez confirmado que el registro seguía funcionando con la v35.66, se sustituyó la política:
   ```sql
   drop policy if exists "authors_select_public" on public.authors;
   create policy "authors_select_own_or_admin" on public.authors for select
   using (
     auth.uid() = id
     or exists (select 1 from public.authors a2 where a2.id = auth.uid() and a2.role = 'admin')
   );
   ```

### 1.5 — Dejado tal cual, a propósito (no es un descuido)

`works`, `panels`, `panel_layers`, `panel_texts` siguen con `SELECT` totalmente público (`using (true)`, sin filtrar por `published`). Se planteó restringirlo a "publicada, o eres el autor, o eres admin", pero Alberto preguntó explícitamente si eso rompería la función de "compartir un borrador por enlace desde Mis Creaciones, y que quien lo reciba pueda reenviarlo a su vez" — y sí la habría roto. **Limitación de fondo de RLS, no un problema de redactar mejor la política:** RLS evalúa fila por fila, sin ninguna noción de "cómo" se ha llegado a pedir esa fila — no puede distinguir "pido esta obra en concreto porque tengo el enlace" de "estoy listando todo lo que existe", son la misma comprobación. Permitir lo primero implica permitir lo segundo. Con el UUID no adivinable como única barrera de facto (mismo principio que un enlace "cualquiera con el enlace" de Google Docs) — **decisión de diseño consciente, confirmada con Alberto, no se toca.**

**Funciones/triggers nuevos en la base de datos, para tenerlos en cuenta en el futuro:** `prevent_role_self_change` (trigger en `authors`), `prevent_self_publish` (trigger en `works`), `username_exists` (función RPC). Si algo raro pasa con cambios de `role` que no cuajan, o con `published` que se revierte solo, o si aparece un motivo legítimo para tocar el uno o el otro (p.ej. un futuro flujo donde SÍ convenga que el propio autor cambie su rol u autopublicarse en un caso concreto), la causa está en estos tres sitios.

---

## 2. Miniaturas con texto horneado (v35.51–v35.54)

Petición: que el texto (y no solo el dibujo) aparezca en la miniatura de la obra en Mis Creaciones/home, ya que hasta ahora esas miniaturas venían de `panels[0].dataUrl` — **sin texto a propósito**, porque el reader superpone el texto por separado encima de esa misma imagen.

- **`edRenderPage(page, withText)`** (nuevo parámetro en `editor.js`): con `true` hornea el texto/bocadillos en la imagen, reutilizando el mismo `draw()` de TextLayer/BubbleLayer que ya usaba `_edRenderPageThumb` para el panel de páginas del editor — no se inventó nada nuevo.
- Se genera una portada (`coverDataUrl`, solo la hoja 1, y solo si tiene texto de verdad) al guardar, tanto local como en la nube.
- **Se reutilizó infraestructura que ya existía pero estaba casi sin usar:** el campo `works.cover_url` y la función `_thumbUpload` llevaban tiempo en el código, pero las miniaturas de listados leían directamente `panels[0].data_url` (sin texto), no `cover_url`. Ahora `cover_url` se genera con texto y las lecturas (home, Mis Creaciones local y nube, admin) lo prefieren, con `panels[0].data_url` de respaldo para obras guardadas antes de este cambio.
- **Bug real encontrado en el camino:** `coverDataUrl` (una imagen JPEG pesada) no se excluía del índice de `localStorage` (a diferencia de `panels[0].dataUrl`, que sí) — riesgo de superar la cuota — y **tampoco se escribía en OPFS**, así que se perdía por completo al recargar. Corregido: se recorta del índice de `localStorage` y se escribe en OPFS y en el backup de carpeta de PC.
- **Segundo bug, de caché:** `_mcThumbCache` (Mis Creaciones) nunca se invalidaba al guardar — y el listener que se añadió para arreglarlo se registró primero *dentro* de `MyComicsView_init()`, por lo que solo estaba activo mientras se veía Mis Creaciones, no mientras el editor guarda (que es cuando ocurre el guardado real). Corregido registrándolo una sola vez, de forma global, al cargar el script.
- **`object-fit: cover` → `contain`** en las miniaturas de home/Mis Creaciones/admin: las páginas son altas y estrechas (360×780), y un recorte cuadrado a `cover` descartaba buena parte de arriba/abajo — daba la impresión de que texto y dibujo se superponían cuando en realidad la imagen generada ya tenía las posiciones correctas (verificado con una simulación en Node/canvas replicando las fórmulas exactas). No se tocó la cámara del editor (`#edCameraVideo`), que sí necesita `cover`.

---

## 3. Estilo de botones e interfaz (v35.55–v35.56)

- Extendido el estilo "icono sin fondo, con borde" (ya aplicado al editor general) a `#gcpPreviewBtn` (editor de animaciones) y `#tdApplyBtn`/`#tdDiagBtn` (editor de textos) — comprobado que ninguna otra cabecera tiene más botones con la clase `.ed-top-action` que pudieran verse afectados de rebote.
- **Franja blanca en pantalla completa móvil, editor de textos:** `#tdShell` tenía `padding-top: env(safe-area-inset-top)` igual que `#gcpShell`, pero mientras que la cabecera del editor de animaciones es `position:absolute` (ignora ese padding), la del editor de textos es un elemento flex normal (`position:relative`) que sí lo respetaba, dejando el hueco. Como el editor general no tiene ese padding y funciona bien, se quitó de `#tdShell` en vez de reestructurar cómo se posiciona su cabecera.

---

## 4. Nombrado de textos y animaciones (v35.57–v35.59)

Petición: que el título del Editor de textos muestre "Editor de textos" al crear, y el nombre asignado a ese texto al reeditar; lo mismo para el editor de animaciones con "Animación N".

**Corrección de rumbo importante en esta sección:** en un primer momento le dije a Alberto que el menú "Capas" del editor general era un placeholder sin desarrollar, basándome en un comentario obsoleto en `views.js` (`<!-- CAPAS (placeholder — se desarrollará) -->`). Alberto me corrigió — la ventana de capas existe y funciona perfectamente. El comentario estaba simplemente desactualizado; la implementación real vive en un fichero aparte, **`editor-layers.js`**, que se me había pasado por completo en la primera búsqueda. **Si algo similar vuelve a pasar (una búsqueda no encuentra una función que claramente existe), sospecha de un fichero separado antes de concluir que la función no existe.**

- **`_tdComputeFlowName(blocks)`** (`editor-textdoc.js`): usa el bloque marcado como título (encabezado H1 de Trix) si hay alguno con texto real; si no, la primera línea con contenido.
- Se asigna a `la.name` — la misma propiedad que la ventana de capas (`editor-layers.js`) ya usaba para el renombrado manual (doble toque, `_lyStartNameEdit`) — **tanto al insertar por primera vez como en cada reedición posterior** (petición explícita: si se añade un título o cambia el inicio al reeditar, el nombre debe reflejarlo, aunque eso sobrescriba un renombrado manual hecho antes desde la ventana de capas).
- **`edOpenTextDoc(editLayer)`**: título = `editLayer.name || 'Editor de textos'` al reeditar, "Editor de textos" en creación nueva.
- **Editor de animaciones**: mismo patrón pero más simple — la animación se inserta como capa tipo "Imagen" (`_isGcpImage`/`_gcpLayersData`), la misma para la que se arregló la persistencia de `.name` (ver abajo). Al reeditar, si `gifLayer.name` existe se usa; si no, el texto genérico "Editar animación" de siempre. Creación nueva sin cambios ("Animación N").
- **Hallazgo más amplio, aparte de lo pedido:** al implementar esto se descubrió que **ningún tipo de capa serializaba `.name`** — el renombrado manual de la ventana de capas (imágenes, dibujos, formas, líneas, GIFs, bocadillos, no solo texto) se perdía silenciosamente al guardar y recargar, tanto local como en la nube. No era un fallo introducido en esta sesión, pero al ser exactamente el mismo patrón que se acababa de tocar, se arregló para los ocho tipos de capa a la vez (`edSerLayer`/`edDeserLayer` en `editor.js`) en vez de dejarlo a medias.

---

## 5. Trayectorias con grupos (v35.60–v35.62)

Petición: que un grupo con "girar según trayectoria" se mueva y gire como un solo objeto rígido, no cada miembro por separado — incluyendo animaciones dentro del grupo, que además deben seguir reproduciendo sus propios fotogramas con normalidad.

- **Causa raíz:** cada miembro del grupo rotaba alrededor de **su propio centro** en vez de que todo el grupo orbitara alrededor de un **centro común**. Se reutilizó el mismo criterio de pivote (centroide de los miembros, excluyendo DrawLayer porque siempre está en x=0.5/y=0.5) que ya usa la rotación manual de grupos por pinch (`_msRecalcBbox`).
- Aplicado en **tres funciones distintas** que resultaron ser implementaciones paralelas del mismo cálculo, cada una con su propio bug independiente:
  1. `_edViewerMpTick()` (`editor.js`) — el visor interno/reproductor real. Arreglado primero, confirmado funcionando por Alberto.
  2. `_edMpPreviewTick()` (`editor.js`) — la Vista previa de recorrido (▶ al **editar** un recorrido). Función completamente aparte, solo procesa el objeto sobre el que se entró a editar. Tuvo **dos rondas de arreglo**: la primera solo cubrió el caso "con orientación automática activa"; Alberto detectó que sin esa opción marcada seguía sin mover al resto del grupo (la pista fue: "si activo 'girar según trayectoria' funciona bien, si no, no" — eso señaló que el bug vivía específicamente en la rama sin orientación, que yo no había tocado la primera vez).
  3. `reader/reader.js` — el reader externo, con el mismo código duplicado. No tenía siquiera el concepto de "grupo" (`groupId`) implementado; se le añadió una función equivalente a `_edGroupMemberIdxs`.
- **Segundo hallazgo, relacionado:** al propagar la trayectoria a un grupo, se copiaba la velocidad pero no `_motionCycles`/`_motionCyclesDur`. Si el objeto cuya trayectoria se edita es una animación sincronizada por ciclos, el resto del grupo calculaba su progreso con velocidad en px/s en vez de la misma duración — con el tiempo se habría desincronizado. Ya se propaga también.
- Confirmado que el sistema de reproducción de fotogramas (`_applyFrame`, temporizadores propios) es independiente de la posición/rotación y no depende de si el objeto está en un grupo — no hacía falta ningún cambio ahí.

---

## 6. Invisibilidad "Gradual" en animaciones (v35.63)

Petición: en el submenú Comportamiento del editor de animaciones, sección Invisibilidad, añadir una casilla "Gradual" bajo "Al final", marcada por defecto; si se desmarca, la aparición/desaparición debe ser inmediata en vez de con fundido.

- El fundido gradual existe en **tres mecanismos distintos** (misma idea, implementaciones separadas, cada una gateada con la nueva opción):
  - Capa ya insertada en el lienzo: `_animFadeOpacity` + `requestAnimationFrame`, tres puntos (fade-in inicial, fade-in al reiniciar ciclo, fade-out al final) en `editor.js`.
  - Vista previa en vivo del editor GCP (▶ dentro del propio editor): transición CSS sobre el canvas, no `_animFadeOpacity`.
  - Reader externo: su propio sistema por ticks (`_animFadeStart`/`_animFadeDir`/`_animFadeDur`), no la recursión de `requestAnimationFrame`.
- Propiedad nueva `_gcpInvisGradual`, con una particularidad: su valor por defecto es `true` (al revés que `_gcpInvisBeforeStart`/`_gcpInvisAtEnd`, que son `false` por defecto), así que se serializa "al revés" — solo se guarda cuando es `false`, se trata "ausente" como "activada" en todos los sitios. Replicado el mismo patrón de guardado que las otras dos casillas (serialización ×2, biblioteca, sincronización de interfaz, listener) en cada uno de sus puntos.

---

## 7. Flujo de texto — dos bugs de fondo (v35.64–v35.65)

**7.1 — Reeditar creaba hojas intermedias en vez de fluir en hojas existentes (v35.64).** Al añadir texto a un texto ya existente, si desbordaba más allá del tramo actual del flujo, `_tdReflowFlowInPlace` **siempre** creaba una hoja nueva — nunca comprobaba si ya había una hoja existente justo después (con cualquier orientación, contenido, etc.) donde encajar el desbordamiento. Se comprobó que la rama de "creación nueva" (aplicar un texto por primera vez) **ya hacía esto bien** desde antes — reutilizaba hojas existentes con su propia orientación antes de crear ninguna — así que el fallo era específicamente que reeditar no seguía ese mismo criterio ya establecido en el propio código. Ahora ambas rutas se comportan igual. También se corrigió `_tdEditingFlowFrames` (la vista previa en vivo mientras se edita, antes de guardar) con el mismo criterio — el propio comentario del código ya advertía que debía coincidir exactamente con el cálculo del guardado real.

**7.2 — Primera línea de una hoja vertical se salía tras fluir desde una horizontal (v35.65).** El ajuste de línea (cuántas palabras caben) se decidía con el ancho de la hoja ACTUAL, pero el salto de página (por falta de espacio vertical) solo se detectaba DESPUÉS, dentro de `pushLine()`, con la línea ya completamente decidida. Si esa línea resultaba que tenía que pasar a una hoja con otra orientación (más estrecha), su contenido ya se había ajustado con el ancho de la hoja vieja. Se añadió una comprobación **anticipada**: antes de decidir las palabras de una línea nueva, si por el tamaño de letra del bloque (una estimación razonable — el alto real de la línea aún no se conoce) no va a caber verticalmente en lo que queda de la hoja actual, se cambia de marco **antes** de ajustar esa línea. El salto reactivo de siempre se queda como red de seguridad para el caso raro de una línea con un tamaño de letra mucho mayor que el resto del párrafo.

**No se tocó** el sistema de saltos manuales (arrastre) ni "Exceptuar en esta hoja" en ninguno de los dos arreglos.

---

## 8. Patrones a recordar de esta sesión

- **Nunca dar por sentado el estado de un ajuste externo (panel de Supabase, etc.) solo por lo que digan las cartas** — pregunta directamente si hay alguna duda. Ya ha pasado una vez esta sesión (confirmación de email) que la documentación acumulada estaba desactualizada frente a un cambio hecho directamente en el panel, sin pasar por una conversación conmigo.
- **Si una búsqueda no encuentra una función que el usuario asegura que existe y funciona, sospecha de un fichero separado** antes de concluir que no existe — pasó con `editor-layers.js`.
- **Cuando se añade una propiedad nueva a una capa (`.name`, `coverDataUrl`, `_gcpInvisGradual`...), comprobar SIEMPRE los tres puntos de persistencia:** `edSerLayer`/`edDeserLayer` (si el tipo usa lista explícita, no `Object.assign`, hay que tocar los dos lados), el índice de `localStorage` (`_stripHeavy`, si el dato es pesado hay que excluirlo ahí), y OPFS (`_opfsWrite`, si no está en su payload explícito se pierde aunque esté bien serializada en memoria). Se ha encontrado el mismo patrón de bug (falta uno de estos tres) más de una vez esta sesión.
- **Cuando el mismo cálculo de recorrido/orientación/paginación aparece en más de un sitio** (editor interno vs. reader externo; guardado real vs. vista previa en vivo), comprobar los dos/tres antes de dar el arreglo por completo — en esta sesión ha habido casos de hasta tres implementaciones paralelas del mismo concepto, cada una con margen para un bug independiente.
- **Un detalle aparentemente pequeño en la descripción de Alberto (p.ej. "si activo X funciona, si no, no funciona") suele señalar EXACTAMENTE la rama de código donde está el bug** — no una casualidad a ignorar.
- **Antes de proponer una restricción de RLS, comprobar en el código quién más depende del acceso actual** (pasó con `authors_select_public`: admin.js y la comprobación de username también la necesitaban, no solo el "problema" a resolver) — y, si la restricción afecta a una función usada en registro/login, aplicarla en el orden correcto (función/código primero, política restrictiva al final) para no romper el flujo a mitad de camino.
- **RLS no distingue "cómo" se llegó a pedir una fila** (por id conocido vs. listado sin filtro) — si hace falta que un enlace compartido funcione para cualquiera, esa misma condición permite también el listado masivo. No hay forma de tener ambas cosas (compartible + no listable) solo con RLS; hay que decidir conscientemente cuál se prioriza.

---

## SUPABASE

- **Proyecto:** `qqgsbyylaugsagbxsetc.supabase.co`
- **Confirmación email: ACTIVADA** (cambiado por Alberto durante esta sesión — ver sección 0).
- **Auditoría RLS: completada** (ver sección 1) — tres vulnerabilidades reales corregidas (escalada de rol, borrado incompleto de usuario, autopublicación) y el email ya no es público. Queda, a propósito y confirmado con Alberto, que `works`/`panels`/`panel_layers`/`panel_texts` sigan con lectura pública sin filtrar por `published` — necesario para que compartir un borrador por enlace siga funcionando igual que hasta ahora.
- **Funciones/triggers nuevos:** `prevent_role_self_change` (trigger, `authors`), `prevent_self_publish` (trigger, `works`), `username_exists` (función RPC, usada por `auth.js`).
- Resto de infraestructura (Brevo/SMTP, Site URL, plantillas de email, Migadu en trial) sin cambios desde la v35.29 — ver esa carta si hace falta el detalle.

---

*Generada al final de la sesión. Versión activa de código: v35.66 (reader v30.82).*

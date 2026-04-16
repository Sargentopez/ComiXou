/* ============================================================
   gif-decoder.js  — Parser/decoder GIF89a para ComiXou
   Basado en el estándar GIF89a (https://www.w3.org/Graphics/GIF/spec-gif89a.txt)
   Implementación propia, sin dependencias externas.
   Licencia: MIT
   ============================================================

   Uso:
     GifDecoder.decode(dataUrl)  → Promise<{ frames, width, height }>
     frames[i] = { imageData: ImageData, delay: ms }

   Cada frame es un ImageData completo (ancho × alto del GIF),
   listo para ctx.putImageData(frame.imageData, 0, 0).
   ============================================================ */

const GifDecoder = (() => {

  // ── LZW Decompress ──────────────────────────────────────────
  function lzwDecode(minCodeSize, data) {
    const clearCode  = 1 << minCodeSize;
    const eoiCode    = clearCode + 1;
    let codeSize     = minCodeSize + 1;
    let codeMask     = (1 << codeSize) - 1;
    let table        = [];
    let out          = [];
    let pos          = 0;
    let buf          = 0;
    let bufBits      = 0;

    function initTable() {
      table = [];
      for (let i = 0; i < clearCode; i++) table[i] = [i];
      table[clearCode] = [];
      table[eoiCode]   = null;
      codeSize = minCodeSize + 1;
      codeMask = (1 << codeSize) - 1;
    }

    function readCode() {
      while (bufBits < codeSize) {
        if (pos >= data.length) return -1;
        buf |= data[pos++] << bufBits;
        bufBits += 8;
      }
      const code = buf & codeMask;
      buf >>= codeSize;
      bufBits -= codeSize;
      return code;
    }

    initTable();
    let code = readCode();
    if (code === clearCode) code = readCode();
    if (code < 0 || !table[code]) return out;
    out = table[code].slice();
    let prev = code;

    while (true) {
      code = readCode();
      if (code < 0 || code === eoiCode) break;
      if (code === clearCode) { initTable(); code = readCode(); if (code < 0) break; out = out.concat(table[code]); prev = code; continue; }
      let entry;
      if (code < table.length && table[code]) {
        entry = table[code].slice();
      } else if (code === table.length) {
        entry = table[prev].slice(); entry.push(entry[0]);
      } else break;
      out = out.concat(entry);
      const newEntry = table[prev].slice(); newEntry.push(entry[0]);
      table.push(newEntry);
      if (table.length === (1 << codeSize) && codeSize < 12) { codeSize++; codeMask = (1 << codeSize) - 1; }
      prev = code;
    }
    return out;
  }

  // ── Parser principal ─────────────────────────────────────────
  function parse(bytes) {
    let p = 0;
    const read  = (n) => { const s = bytes.slice(p, p+n); p += n; return s; };
    const byte  = ()  => bytes[p++];
    const word  = ()  => { const v = bytes[p] | bytes[p+1]<<8; p+=2; return v; };

    // Header
    const sig = String.fromCharCode(bytes[0],bytes[1],bytes[2],bytes[3],bytes[4],bytes[5]);
    if (!sig.startsWith('GIF')) throw new Error('Not a GIF');
    p = 6;
    const width  = word();
    const height = word();
    const packed = byte();
    byte(); // bg color index
    byte(); // pixel aspect ratio

    const hasGlobalCT  = !!(packed >> 7);
    const globalCTSize = hasGlobalCT ? 3 * (1 << ((packed & 7) + 1)) : 0;
    let globalCT = hasGlobalCT ? read(globalCTSize) : null;

    const frames = [];
    let gce = null; // graphic control extension

    // Canvas acumulado para disposalType correcto
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const canvasCtx = canvas.getContext('2d');

    while (p < bytes.length) {
      const sentinel = byte();

      if (sentinel === 0x3B) break; // trailer

      if (sentinel === 0x21) { // extension
        const label = byte();
        if (label === 0xF9) { // graphic control extension
          byte(); // block size (4)
          const gcePacked = byte();
          const delay     = word() * 10; // centiseconds → ms
          const transIdx  = byte();
          byte(); // block terminator
          gce = {
            disposalMethod: (gcePacked >> 2) & 7,
            hasTransparency: !!(gcePacked & 1),
            transparentIndex: transIdx,
            delay: delay || 100,
          };
        } else {
          // skip other extensions
          let blockSize;
          while ((blockSize = byte()) > 0) p += blockSize;
        }
        continue;
      }

      if (sentinel === 0x2C) { // image descriptor
        const imgLeft   = word();
        const imgTop    = word();
        const imgWidth  = word();
        const imgHeight = word();
        const imgPacked = byte();
        const hasLocalCT  = !!(imgPacked >> 7);
        const interlaced  = !!(imgPacked & 0x40);
        const localCTSize = hasLocalCT ? 3 * (1 << ((imgPacked & 7) + 1)) : 0;
        const localCT  = hasLocalCT ? read(localCTSize) : null;
        const colorTable = localCT || globalCT;

        const minCodeSize = byte();
        // Leer sub-bloques
        const lzwData = [];
        let blockSize;
        while ((blockSize = byte()) > 0) {
          for (let i = 0; i < blockSize; i++) lzwData.push(bytes[p++]);
        }

        const indices = lzwDecode(minCodeSize, lzwData);

        // Aplicar disposalMethod al canvas acumulado
        const disposal = gce ? gce.disposalMethod : 0;
        const hasAlpha  = gce ? gce.hasTransparency : false;
        const transIdx  = gce ? gce.transparentIndex : -1;

        if (disposal === 2) {
          canvasCtx.clearRect(imgLeft, imgTop, imgWidth, imgHeight);
        } else if (disposal === 3) {
          // restore to previous — para simplificar, igual que disposal 2
          canvasCtx.clearRect(imgLeft, imgTop, imgWidth, imgHeight);
        }

        // Construir patch de este frame
        const patch = canvasCtx.createImageData(imgWidth, imgHeight);
        const px = patch.data;

        // Deinterlace si necesario
        let rowOrder;
        if (interlaced) {
          rowOrder = [];
          [0,4,2,1].forEach((start, pass) => {
            const step = [8,8,4,2][pass];
            for (let r = start; r < imgHeight; r += step) rowOrder.push(r);
          });
        }

        for (let i = 0; i < indices.length; i++) {
          const row = interlaced ? rowOrder[Math.floor(i / imgWidth)] : Math.floor(i / imgWidth);
          const col = i % imgWidth;
          const idx = indices[i];
          const pi  = (row * imgWidth + col) * 4;
          if (hasAlpha && idx === transIdx) {
            px[pi+3] = 0; // transparente
          } else {
            const ci = idx * 3;
            px[pi]   = colorTable[ci];
            px[pi+1] = colorTable[ci+1];
            px[pi+2] = colorTable[ci+2];
            px[pi+3] = 255;
          }
        }

        // Pintar patch en canvas acumulado
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = imgWidth; tmpCanvas.height = imgHeight;
        tmpCanvas.getContext('2d').putImageData(patch, 0, 0);
        canvasCtx.drawImage(tmpCanvas, imgLeft, imgTop);

        // Capturar estado actual del canvas como frame completo
        const fullFrame = canvasCtx.getImageData(0, 0, width, height);
        frames.push({
          imageData: fullFrame,
          delay: gce ? gce.delay : 100,
        });

        gce = null;
        continue;
      }

      // Byte desconocido — saltar
      break;
    }

    return { frames, width, height };
  }

  // ── API pública ───────────────────────────────────────────────
  function decode(dataUrl) {
    return new Promise((resolve, reject) => {
      try {
        // dataUrl → base64 → Uint8Array
        const b64  = dataUrl.split(',')[1];
        const bin  = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const result = parse(bytes);
        if (!result.frames.length) reject(new Error('GIF sin frames'));
        else resolve(result);
      } catch(e) { reject(e); }
    });
  }

  return { decode };
})();

/* ============================================================
   gif-decoder.js — Decodificador GIF para ComiXou
   Usa gifuct.js (parseGIF + decompressFrames) con el patrón
   exacto del demo oficial: patch canvas → gif canvas acumulado.
   Produce frames completos { imageData, delay } para GifLayer.
   ============================================================ */

var GifDecoder = (function() {

  function decode(dataUrl) {
    return new Promise(function(resolve, reject) {
      try {
        // dataUrl → ArrayBuffer
        var b64   = dataUrl.split(',')[1];
        var bin   = atob(b64);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        var ab = bytes.buffer;

        // Parsear con gifuct
        var gif    = parseGIF(ab);
        var frames = decompressFrames(gif, true); // buildPatch=true

        if (!frames || !frames.length) { reject(new Error('GIF sin frames')); return; }

        var width  = gif.lsd.width;
        var height = gif.lsd.height;

        // Canvas acumulado (gifCanvas del demo)
        var gifCanvas     = document.createElement('canvas');
        gifCanvas.width   = width;
        gifCanvas.height  = height;
        var gifCtx        = gifCanvas.getContext('2d');

        // Canvas temporal para el patch de cada frame (tempCanvas del demo)
        var tempCanvas    = document.createElement('canvas');
        var tempCtx       = tempCanvas.getContext('2d');
        var frameImageData = null;

        var result = [];
        var needsDisposal = false;

        for (var fi = 0; fi < frames.length; fi++) {
          var frame = frames[fi];
          var dims  = frame.dims;

          // disposal del frame anterior
          if (needsDisposal) {
            gifCtx.clearRect(0, 0, width, height);
            needsDisposal = false;
          }

          // Crear/reusar ImageData para el patch
          if (!frameImageData || dims.width !== frameImageData.width || dims.height !== frameImageData.height) {
            tempCanvas.width  = dims.width;
            tempCanvas.height = dims.height;
            frameImageData    = tempCtx.createImageData(dims.width, dims.height);
          }

          // Aplicar patch
          frameImageData.data.set(frame.patch);
          tempCtx.putImageData(frameImageData, 0, 0);
          gifCtx.drawImage(tempCanvas, dims.left, dims.top);

          // Capturar frame completo
          var full = gifCtx.getImageData(0, 0, width, height);
          result.push({
            imageData: full,
            delay: frame.delay || 100
          });

          if (frame.disposalType === 2) needsDisposal = true;
        }

        resolve({ frames: result, width: width, height: height });

      } catch(e) { reject(e); }
    });
  }

  return { decode: decode };
})();

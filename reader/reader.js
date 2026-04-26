/* ============================================================
   ComiXow Reader — Reproductor externo standalone
   Canvas idéntico al visor interno del editor.
   ============================================================ */

/* ── gifuct-js embebido (MIT, Matt Way github.com/matt-way/gifuct-js) ── */
var _gm = {};
function _gr(id) { return _gm[id]; }
function _gl(id, fn) {
  try { var e={}; fn(e,_gr); _gm[id]=e; }
  catch(err) { console.error('[gifuct] mod '+id+' err:',err); _gm[id]={}; }
}
_gl(4,function(exports,_gr){
"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.readBits = exports.readArray = exports.readUnsigned = exports.readString = exports.peekBytes = exports.readBytes = exports.peekByte = exports.readByte = exports.buildStream = void 0;

// Default stream and parsers for Uint8TypedArray data type
var buildStream = function buildStream(uint8Data) {
  return {
    data: uint8Data,
    pos: 0
  };
};

exports.buildStream = buildStream;

var readByte = function readByte() {
  return function (stream) {
    return stream.data[stream.pos++];
  };
};

exports.readByte = readByte;

var peekByte = function peekByte() {
  var offset = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
  return function (stream) {
    return stream.data[stream.pos + offset];
  };
};

exports.peekByte = peekByte;

var readBytes = function readBytes(length) {
  return function (stream) {
    return stream.data.subarray(stream.pos, stream.pos += length);
  };
};

exports.readBytes = readBytes;

var peekBytes = function peekBytes(length) {
  return function (stream) {
    return stream.data.subarray(stream.pos, stream.pos + length);
  };
};

exports.peekBytes = peekBytes;

var readString = function readString(length) {
  return function (stream) {
    return Array.from(readBytes(length)(stream)).map(function (value) {
      return String.fromCharCode(value);
    }).join('');
  };
};

exports.readString = readString;

var readUnsigned = function readUnsigned(littleEndian) {
  return function (stream) {
    var bytes = readBytes(2)(stream);
    return littleEndian ? (bytes[1] << 8) + bytes[0] : (bytes[0] << 8) + bytes[1];
  };
};

exports.readUnsigned = readUnsigned;

var readArray = function readArray(byteSize, totalOrFunc) {
  return function (stream, result, parent) {
    var total = typeof totalOrFunc === 'function' ? totalOrFunc(stream, result, parent) : totalOrFunc;
    var parser = readBytes(byteSize);
    var arr = new Array(total);

    for (var i = 0; i < total; i++) {
      arr[i] = parser(stream);
    }

    return arr;
  };
};

exports.readArray = readArray;

var subBitsTotal = function subBitsTotal(bits, startIndex, length) {
  var result = 0;

  for (var i = 0; i < length; i++) {
    result += bits[startIndex + i] && Math.pow(2, length - i - 1);
  }

  return result;
};

var readBits = function readBits(schema) {
  return function (stream) {
    var _byte = readByte()(stream); // convert the byte to bit array


    var bits = new Array(8);

    for (var i = 0; i < 8; i++) {
      bits[7 - i] = !!(_byte & 1 << i);
    } // convert the bit array to values based on the schema


    return Object.keys(schema).reduce(function (res, key) {
      var def = schema[key];

      if (def.length) {
        res[key] = subBitsTotal(bits, def.index, def.length);
      } else {
        res[key] = bits[def.index];
      }

      return res;
    }, {});
  };
};

exports.readBits = readBits;
});
_gl(3,function(exports,_gr){
"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.loop = exports.conditional = exports.parse = void 0;

var parse = function parse(stream, schema) {
  var result = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  var parent = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : result;

  if (Array.isArray(schema)) {
    schema.forEach(function (partSchema) {
      return parse(stream, partSchema, result, parent);
    });
  } else if (typeof schema === 'function') {
    schema(stream, result, parent, parse);
  } else {
    var key = Object.keys(schema)[0];

    if (Array.isArray(schema[key])) {
      parent[key] = {};
      parse(stream, schema[key], result, parent[key]);
    } else {
      parent[key] = schema[key](stream, result, parent, parse);
    }
  }

  return result;
};

exports.parse = parse;

var conditional = function conditional(schema, conditionFunc) {
  return function (stream, result, parent, parse) {
    if (conditionFunc(stream, result, parent)) {
      parse(stream, schema, result, parent);
    }
  };
};

exports.conditional = conditional;

var loop = function loop(schema, continueFunc) {
  return function (stream, result, parent, parse) {
    var arr = [];

    while (continueFunc(stream, result, parent)) {
      var newParent = {};
      parse(stream, schema, result, newParent);
      arr.push(newParent);
    }

    return arr;
  };
};

exports.loop = loop;
});
_gl(6,function(exports,_gr){
"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.lzw = void 0;

/**
 * javascript port of java LZW decompression
 * Original java author url: https://gist.github.com/devunwired/4479231
 */
var lzw = function lzw(minCodeSize, data, pixelCount) {
  var MAX_STACK_SIZE = 4096;
  var nullCode = -1;
  var npix = pixelCount;
  var available, clear, code_mask, code_size, end_of_information, in_code, old_code, bits, code, i, datum, data_size, first, top, bi, pi;
  var dstPixels = new Array(pixelCount);
  var prefix = new Array(MAX_STACK_SIZE);
  var suffix = new Array(MAX_STACK_SIZE);
  var pixelStack = new Array(MAX_STACK_SIZE + 1); // Initialize GIF data stream decoder.

  data_size = minCodeSize;
  clear = 1 << data_size;
  end_of_information = clear + 1;
  available = clear + 2;
  old_code = nullCode;
  code_size = data_size + 1;
  code_mask = (1 << code_size) - 1;

  for (code = 0; code < clear; code++) {
    prefix[code] = 0;
    suffix[code] = code;
  } // Decode GIF pixel stream.


  var datum, bits, count, first, top, pi, bi;
  datum = bits = count = first = top = pi = bi = 0;

  for (i = 0; i < npix;) {
    if (top === 0) {
      if (bits < code_size) {
        // get the next byte
        datum += data[bi] << bits;
        bits += 8;
        bi++;
        continue;
      } // Get the next code.


      code = datum & code_mask;
      datum >>= code_size;
      bits -= code_size; // Interpret the code

      if (code > available || code == end_of_information) {
        break;
      }

      if (code == clear) {
        // Reset decoder.
        code_size = data_size + 1;
        code_mask = (1 << code_size) - 1;
        available = clear + 2;
        old_code = nullCode;
        continue;
      }

      if (old_code == nullCode) {
        pixelStack[top++] = suffix[code];
        old_code = code;
        first = code;
        continue;
      }

      in_code = code;

      if (code == available) {
        pixelStack[top++] = first;
        code = old_code;
      }

      while (code > clear) {
        pixelStack[top++] = suffix[code];
        code = prefix[code];
      }

      first = suffix[code] & 0xff;
      pixelStack[top++] = first; // add a new string to the table, but only if space is available
      // if not, just continue with current table until a clear code is found
      // (deferred clear code implementation as per GIF spec)

      if (available < MAX_STACK_SIZE) {
        prefix[available] = old_code;
        suffix[available] = first;
        available++;

        if ((available & code_mask) === 0 && available < MAX_STACK_SIZE) {
          code_size++;
          code_mask += available;
        }
      }

      old_code = in_code;
    } // Pop a pixel off the pixel stack.


    top--;
    dstPixels[pi++] = pixelStack[top];
    i++;
  }

  for (i = pi; i < npix; i++) {
    dstPixels[i] = 0; // clear missing pixels
  }

  return dstPixels;
};

exports.lzw = lzw;
});
_gl(5,function(exports,_gr){
"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.deinterlace = void 0;

/**
 * Deinterlace function from https://github.com/shachaf/jsgif
 */
var deinterlace = function deinterlace(pixels, width) {
  var newPixels = new Array(pixels.length);
  var rows = pixels.length / width;

  var cpRow = function cpRow(toRow, fromRow) {
    var fromPixels = pixels.slice(fromRow * width, (fromRow + 1) * width);
    newPixels.splice.apply(newPixels, [toRow * width, width].concat(fromPixels));
  }; // See appendix E.


  var offsets = [0, 4, 2, 1];
  var steps = [8, 8, 4, 2];
  var fromRow = 0;

  for (var pass = 0; pass < 4; pass++) {
    for (var toRow = offsets[pass]; toRow < rows; toRow += steps[pass]) {
      cpRow(toRow, fromRow);
      fromRow++;
    }
  }

  return newPixels;
};

exports.deinterlace = deinterlace;
});
_gl(2,function(exports,_gr){
"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;

var _ = _gr(3);

var _uint = _gr(4);

// a set of 0x00 terminated subblocks
var subBlocksSchema = {
  blocks: function blocks(stream) {
    var terminator = 0x00;
    var chunks = [];
    var streamSize = stream.data.length;
    var total = 0;

    for (var size = (0, _uint.readByte)()(stream); size !== terminator; size = (0, _uint.readByte)()(stream)) {
      // catch corrupted files with no terminator
      if (stream.pos + size >= streamSize) {
        var availableSize = streamSize - stream.pos;
        chunks.push((0, _uint.readBytes)(availableSize)(stream));
        total += availableSize;
        break;
      }

      chunks.push((0, _uint.readBytes)(size)(stream));
      total += size;
    }

    var result = new Uint8Array(total);
    var offset = 0;

    for (var i = 0; i < chunks.length; i++) {
      result.set(chunks[i], offset);
      offset += chunks[i].length;
    }

    return result;
  }
}; // global control extension

var gceSchema = (0, _.conditional)({
  gce: [{
    codes: (0, _uint.readBytes)(2)
  }, {
    byteSize: (0, _uint.readByte)()
  }, {
    extras: (0, _uint.readBits)({
      future: {
        index: 0,
        length: 3
      },
      disposal: {
        index: 3,
        length: 3
      },
      userInput: {
        index: 6
      },
      transparentColorGiven: {
        index: 7
      }
    })
  }, {
    delay: (0, _uint.readUnsigned)(true)
  }, {
    transparentColorIndex: (0, _uint.readByte)()
  }, {
    terminator: (0, _uint.readByte)()
  }]
}, function (stream) {
  var codes = (0, _uint.peekBytes)(2)(stream);
  return codes[0] === 0x21 && codes[1] === 0xf9;
}); // image pipeline block

var imageSchema = (0, _.conditional)({
  image: [{
    code: (0, _uint.readByte)()
  }, {
    descriptor: [{
      left: (0, _uint.readUnsigned)(true)
    }, {
      top: (0, _uint.readUnsigned)(true)
    }, {
      width: (0, _uint.readUnsigned)(true)
    }, {
      height: (0, _uint.readUnsigned)(true)
    }, {
      lct: (0, _uint.readBits)({
        exists: {
          index: 0
        },
        interlaced: {
          index: 1
        },
        sort: {
          index: 2
        },
        future: {
          index: 3,
          length: 2
        },
        size: {
          index: 5,
          length: 3
        }
      })
    }]
  }, (0, _.conditional)({
    lct: (0, _uint.readArray)(3, function (stream, result, parent) {
      return Math.pow(2, parent.descriptor.lct.size + 1);
    })
  }, function (stream, result, parent) {
    return parent.descriptor.lct.exists;
  }), {
    data: [{
      minCodeSize: (0, _uint.readByte)()
    }, subBlocksSchema]
  }]
}, function (stream) {
  return (0, _uint.peekByte)()(stream) === 0x2c;
}); // plain text block

var textSchema = (0, _.conditional)({
  text: [{
    codes: (0, _uint.readBytes)(2)
  }, {
    blockSize: (0, _uint.readByte)()
  }, {
    preData: function preData(stream, result, parent) {
      return (0, _uint.readBytes)(parent.text.blockSize)(stream);
    }
  }, subBlocksSchema]
}, function (stream) {
  var codes = (0, _uint.peekBytes)(2)(stream);
  return codes[0] === 0x21 && codes[1] === 0x01;
}); // application block

var applicationSchema = (0, _.conditional)({
  application: [{
    codes: (0, _uint.readBytes)(2)
  }, {
    blockSize: (0, _uint.readByte)()
  }, {
    id: function id(stream, result, parent) {
      return (0, _uint.readString)(parent.blockSize)(stream);
    }
  }, subBlocksSchema]
}, function (stream) {
  var codes = (0, _uint.peekBytes)(2)(stream);
  return codes[0] === 0x21 && codes[1] === 0xff;
}); // comment block

var commentSchema = (0, _.conditional)({
  comment: [{
    codes: (0, _uint.readBytes)(2)
  }, subBlocksSchema]
}, function (stream) {
  var codes = (0, _uint.peekBytes)(2)(stream);
  return codes[0] === 0x21 && codes[1] === 0xfe;
});
var schema = [{
  header: [{
    signature: (0, _uint.readString)(3)
  }, {
    version: (0, _uint.readString)(3)
  }]
}, {
  lsd: [{
    width: (0, _uint.readUnsigned)(true)
  }, {
    height: (0, _uint.readUnsigned)(true)
  }, {
    gct: (0, _uint.readBits)({
      exists: {
        index: 0
      },
      resolution: {
        index: 1,
        length: 3
      },
      sort: {
        index: 4
      },
      size: {
        index: 5,
        length: 3
      }
    })
  }, {
    backgroundColorIndex: (0, _uint.readByte)()
  }, {
    pixelAspectRatio: (0, _uint.readByte)()
  }]
}, (0, _.conditional)({
  gct: (0, _uint.readArray)(3, function (stream, result) {
    return Math.pow(2, result.lsd.gct.size + 1);
  })
}, function (stream, result) {
  return result.lsd.gct.exists;
}), // content frames
{
  frames: (0, _.loop)([gceSchema, applicationSchema, commentSchema, imageSchema, textSchema], function (stream) {
    var nextCode = (0, _uint.peekByte)()(stream); // rather than check for a terminator, we should check for the existence
    // of an ext or image block to avoid infinite loops
    //var terminator = 0x3B;
    //return nextCode !== terminator;

    return nextCode === 0x21 || nextCode === 0x2c;
  })
}];
var _default = schema;
exports["default"] = _default;
});
_gl(1,function(exports,_gr){
"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.decompressFrames = exports.decompressFrame = exports.parseGIF = void 0;

var _gif = _interopRequireDefault(_gr(2));

var _jsBinarySchemaParser = _gr(3);

var _uint = _gr(4);

var _deinterlace = _gr(5);

var _lzw = _gr(6);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

var parseGIF = function parseGIF(arrayBuffer) {
  var byteData = new Uint8Array(arrayBuffer);
  return (0, _jsBinarySchemaParser.parse)((0, _uint.buildStream)(byteData), _gif["default"]);
};

exports.parseGIF = parseGIF;

var generatePatch = function generatePatch(image) {
  var totalPixels = image.pixels.length;
  var patchData = new Uint8ClampedArray(totalPixels * 4);

  for (var i = 0; i < totalPixels; i++) {
    var pos = i * 4;
    var colorIndex = image.pixels[i];
    var color = image.colorTable[colorIndex] || [0, 0, 0];
    patchData[pos] = color[0];
    patchData[pos + 1] = color[1];
    patchData[pos + 2] = color[2];
    patchData[pos + 3] = colorIndex !== image.transparentIndex ? 255 : 0;
  }

  return patchData;
};

var decompressFrame = function decompressFrame(frame, gct, buildImagePatch) {
  if (!frame.image) {
    console.warn('gif frame does not have associated image.');
    return;
  }

  var image = frame.image; // get the number of pixels

  var totalPixels = image.descriptor.width * image.descriptor.height; // do lzw decompression

  var pixels = (0, _lzw.lzw)(image.data.minCodeSize, image.data.blocks, totalPixels); // deal with interlacing if necessary

  if (image.descriptor.lct.interlaced) {
    pixels = (0, _deinterlace.deinterlace)(pixels, image.descriptor.width);
  }

  var resultImage = {
    pixels: pixels,
    dims: {
      top: frame.image.descriptor.top,
      left: frame.image.descriptor.left,
      width: frame.image.descriptor.width,
      height: frame.image.descriptor.height
    }
  }; // color table

  if (image.descriptor.lct && image.descriptor.lct.exists) {
    resultImage.colorTable = image.lct;
  } else {
    resultImage.colorTable = gct;
  } // add per frame relevant gce information


  if (frame.gce) {
    resultImage.delay = (frame.gce.delay || 10) * 10; // convert to ms

    resultImage.disposalType = frame.gce.extras.disposal; // transparency

    if (frame.gce.extras.transparentColorGiven) {
      resultImage.transparentIndex = frame.gce.transparentColorIndex;
    }
  } // create canvas usable imagedata if desired


  if (buildImagePatch) {
    resultImage.patch = generatePatch(resultImage);
  }

  return resultImage;
};

exports.decompressFrame = decompressFrame;

var decompressFrames = function decompressFrames(parsedGif, buildImagePatches) {
  return parsedGif.frames.filter(function (f) {
    return f.image;
  }).map(function (f) {
    return decompressFrame(f, parsedGif.gct, buildImagePatches);
  });
};

exports.decompressFrames = decompressFrames;
});

window.parseGIF         = _gm[1].parseGIF;
window.decompressFrames = _gm[1].decompressFrames;
window.GifDecoder = (function(){
  function decode(dataUrl){
    return new Promise(function(res,rej){
      try{
        var b64=dataUrl.split(',')[1],bin=atob(b64),u8=new Uint8Array(bin.length);
        for(var i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
        var gif=window.parseGIF(u8.buffer);
        var frames=window.decompressFrames(gif,true);
        if(!frames||!frames.length){rej(new Error('sin frames'));return;}
        var w=gif.lsd.width,h=gif.lsd.height;
        var gc=document.createElement('canvas');gc.width=w;gc.height=h;
        var gx=gc.getContext('2d');
        var tc=document.createElement('canvas'),tx=tc.getContext('2d');
        var fid=null,result=[],clr=false;
        for(var fi=0;fi<frames.length;fi++){
          var f=frames[fi],d=f.dims;
          if(clr){gx.clearRect(0,0,w,h);clr=false;}
          if(!fid||d.width!==fid.width||d.height!==fid.height){
            tc.width=d.width;tc.height=d.height;
            fid=tx.createImageData(d.width,d.height);
          }
          fid.data.set(f.patch);
          tx.putImageData(fid,0,0);
          gx.drawImage(tc,d.left,d.top);
          result.push({imageData:gx.getImageData(0,0,w,h),delay:f.delay||100});
          if(f.disposalType===2) clr=true;
        }
        res({frames:result,width:w,height:h});
      }catch(e){rej(e);}
    });
  }
  return {decode:decode};
})();
/* ── fin gifuct-js ── */

const SUPABASE_URL = 'https://qqgsbyylaugsagbxsetc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_1bB9Y8TtvFjhP49kwLpZmA_nTVsE2Hd';

// Dimensiones del canvas — IDÉNTICAS al editor para render 1:1
// El escalado para ocupar la pantalla lo hace CSS (canvas.style.width/height)
const ED_PAGE_W = 360;
const ED_PAGE_H = 780;
// El workspace del editor es 5×ancho × 3×alto del panel vertical
// Necesario para reproducir el tamaño de las burbujas de cola "thought"
const ED_CANVAS_MIN = Math.min(ED_PAGE_W * 5, ED_PAGE_H * 3); // 1800

// ── ESTADO ──────────────────────────────────────────────────
const RS = {
  panels:       [],   // [{id, orientation, text_mode, data_url, texts:[]}]
  images:       [],   // Image objects precargados
  idx:          0,    // panel actual
  textStep:     0,    // bocadillo visible (sequential)
  fadeAlpha:    0,    // alpha bocadillo anterior
  fadeRaf:      null,
  canvas:       null,
  ctx:          null,
  ctrlTimer:    null,
  ac:           null,
  keyHandler:   null,
  resizeFn:     null,
  creditsShown: false, // true tras mostrarse la primera vez — no vuelve a aparecer
  navMode:      'fixed', // 'fixed' | 'horizontal' | 'vertical'
};

// ── ARRANQUE ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const id     = params.get('id');
  const draft  = params.get('draft');   // token de borrador (obra no publicada)
  const wantsFs = params.get('fs') === '1'; // heredar fullscreen de la app

  // Modo embed: incrustado en iframe desde admin/expositor
  RS.isEmbed = params.get('embed') === '1' || window.self !== window.top;

  const fromApp = params.get('from') === 'app';

  const _doClose = () => {
    if (history.length > 1) { history.back(); return; }
    // Sin historial previo: volver al index solo si se abrió desde dentro de ComiXow
    if (fromApp) {
      const base = window.location.href.replace(/\/reader\/.*$/, '/');
      if (base) { window.location.href = base; return; }
    }
    // Acceso externo: intentar cerrar la pestaña
    window.close();
    setTimeout(() => {
      _readerToast('Cierra esta pestaña con el botón ✕ del navegador', 4000);
    }, 300);
  };

  const _closeAction = RS.isEmbed
    ? _embedClose
    : () => {
        // Salir de fullscreen primero si está activo, luego cerrar
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          const exit = document.exitFullscreen || document.webkitExitFullscreen;
          if (exit) { exit.call(document).then(_doClose).catch(_doClose); return; }
        }
        _doClose();
      };
  if (RS.isEmbed) document.body.classList.add('embed-mode');

  // Si la app estaba en fullscreen, entrar en fullscreen.
  // Intentamos inmediatamente (el tap en "Leer" puede servir como gesto activador
  // en navegadores modernos). Si el navegador lo rechaza, esperamos al primer gesto.
  if (wantsFs && !RS.isEmbed) {
    const _enterFsOnce = () => {
      const req = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
      if (req) req.call(document.documentElement).catch(() => {});
      document.removeEventListener('click',      _enterFsOnce);
      document.removeEventListener('touchstart', _enterFsOnce);
      document.removeEventListener('keydown',    _enterFsOnce);
    };
    // Intento inmediato (herencia del gesto de navegación)
    const _reqFs = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
    if (_reqFs) {
      _reqFs.call(document.documentElement).catch(() => {
        // Si falla, esperar al primer gesto explícito
        document.addEventListener('click',      _enterFsOnce, { once: true });
        document.addEventListener('touchstart', _enterFsOnce, { once: true });
        document.addEventListener('keydown',    _enterFsOnce, { once: true });
      });
    }
  }

  // Botón cerrar: siempre visible, pegado a la hoja por _positionBtns()
  const closeBtnEl = document.getElementById('closeBtn');
  if (closeBtnEl) {
    closeBtnEl.addEventListener('click', _closeAction);
    closeBtnEl.addEventListener('touchend', e => { e.stopPropagation(); _closeAction(); }, { passive: false });
  }

  // Botón fullscreen: listener directo en gesto de usuario (igual que header.js)
  const fsBtn = document.getElementById('fullscreenToggle');
  if (fsBtn) {
    fsBtn.addEventListener('touchend', e => { e.stopPropagation(); }, { passive: false });
    fsBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (RS.isEmbed) {
        // En iframe: pedir al padre que ponga el iframe en fullscreen
        try { window.parent.postMessage({ type: 'reader:fullscreen' }, '*'); } catch(_) {}
        return;
      }
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
      } else {
        if (typeof Fullscreen !== 'undefined') {
          Fullscreen.enter().catch(() => {});
        } else {
          const el = document.documentElement;
          const req = el.requestFullscreen || el.webkitRequestFullscreen;
          if (req) req.call(el, { navigationUI: 'hide' }).catch(() => {});
        }
      }
    });
    document.addEventListener('fullscreenchange',       _onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', _onFullscreenChange);
  }

  if (draft) { loadDraft(draft); return; }
  if (id)    { loadWork(id);     return; }
  showError('No se indicó ninguna obra. Comprueba el enlace.');
});

function _toggleFullscreen() {
  if (RS.isEmbed) return;
  // Usar el mismo módulo Fullscreen que el editor de ComiXow
  if (typeof Fullscreen !== 'undefined') {
    Fullscreen.request();
  } else {
    // Fallback si el script no cargó
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (isFs) {
      (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
    } else {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) req.call(el, { navigationUI: 'hide' }).catch(() => {});
    }
  }
}

function _onFullscreenChange() {
  const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  const btn  = document.getElementById('fullscreenToggle');
  if (btn) btn.textContent = isFs ? '[ ✕ ]' : '[ ]';
}

function _embedClose() {
  history.back();
}

// ── CARGA DESDE SUPABASE ─────────────────────────────────────
async function loadWork(workId) {
  setLoadingMsg('Cargando obra...');
  try {
    const work = await sbGet('works?id=eq.' + workId + '&published=eq.true');
    if (!work || !work.length) { showError('Esta obra no existe o no está publicada.'); return; }

    setLoadingMsg('Cargando páginas...');
    await _loadPanels(workId);
    document.title = (work[0].title || 'Obra') + ' — ComiXow';
    RS._workAuthor = work[0].author_name || "";
    RS._workSocial = work[0].social      || "";
    RS._workTitle  = work[0].title       || '';
    RS.navMode     = work[0].nav_mode    || 'fixed';
    // Actualizar meta OG con datos reales de la obra
    _updateOGMeta(work[0].title, work[0].author_name);
    // Añadir hoja de créditos como último panel — se trata como hoja normal
    const _lastPanel = RS.panels[RS.panels.length - 1];
    RS.panels.push({ id: 'credits', isCredits: true, orientation: _lastPanel?.orientation || 'v', layers: [], texts: [] });
    setLoadingMsg('Preparando imágenes...');
    await preloadImages();
    startReader();

  } catch(err) {
    console.error('Error:', err);
    showError('Error de conexión. Comprueba tu internet e inténtalo de nuevo.');
  }
}

// ── CARGA BORRADOR (obra no publicada, acceso por token) ─────
async function loadDraft(token) {
  setLoadingMsg('Cargando borrador...');
  try {
    const work = await sbGetAuth('works?id=eq.' + token);
    if (!work || !work.length) { showError('Borrador no encontrado o enlace caducado.'); return; }

    setLoadingMsg('Cargando páginas...');
    await _loadPanels(token, true);  // true = usar JWT para leer capas del borrador
    document.title = (work[0].title || 'Borrador') + ' — ComiXow';
    RS._workAuthor = work[0].author_name || "";
    RS._workSocial = work[0].social      || "";
    RS._workTitle  = work[0].title       || '';
    RS.navMode     = work[0].nav_mode    || 'fixed';
    _updateOGMeta(work[0].title, work[0].author_name);
    const _lastPanel = RS.panels[RS.panels.length - 1];
    RS.panels.push({ id: 'credits', isCredits: true, orientation: _lastPanel?.orientation || 'v', layers: [], texts: [] });
    setLoadingMsg('Preparando imágenes...');
    await preloadImages();
    startReader();
  } catch(err) {
    console.error('Error loadDraft:', err);
    showError('Error al cargar el borrador. Comprueba tu conexión.');
  }
}

// ── CARGA PANELES + CAPAS + TEXTOS ────────────────────────────
// Rellena RS.panels con capas del editor (panel_layers) y textos (panel_texts).
// panel_layers → render fiel por capas (imagen, draw, stroke, bubble, text)
// panel_texts  → lógica sequential (text_order, text_mode, contador)

// ── Descompresión gzip de layer_data (CompressionStream W3C nativo) ──
const _CZ_PFX = 'gz:';


async function _czDecompress(str) {
  if (!str || !str.startsWith(_CZ_PFX)) return str;
  if (typeof DecompressionStream === 'undefined') return str;
  try {
    const b64 = str.slice(_CZ_PFX.length);
    // atob por chunks de 8192 chars — evita fallo en Android con b64 muy largo
    const CHUNK = 8192;
    let byteLen = 0;
    const parts = [];
    for (let i = 0; i < b64.length; i += CHUNK) {
      const bin = atob(b64.slice(i, i + CHUNK));
      const part = new Uint8Array(bin.length);
      for (let j = 0; j < bin.length; j++) part[j] = bin.charCodeAt(j);
      parts.push(part);
      byteLen += part.length;
    }
    const bytes = new Uint8Array(byteLen);
    let off2 = 0;
    for (const p of parts) { bytes.set(p, off2); off2 += p.length; }
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const chunks = [];
    const reader2 = ds.readable.getReader();
    let done, value;
    while (!({ done, value } = await reader2.read(), done)) chunks.push(value);
    const total = chunks.reduce((a,c)=>a+c.length,0);
    const merged = new Uint8Array(total);
    let off=0; for(const c of chunks){merged.set(c,off);off+=c.length;}
    return new TextDecoder().decode(merged);
  } catch(e) { return str; }
}

// Descarga APNG del bucket 'anims' y devuelve dataUrl PNG
async function _animDownload(animUrl) {
  if (!animUrl) return null;
  const r = await fetch(animUrl);
  if (!r.ok) return null;
  const blob = await r.blob();
  return new Promise(res => {
    const fr = new FileReader();
    fr.onload  = e => res(e.target.result);
    fr.onerror = () => res(null);
    fr.readAsDataURL(blob);
  });
}

async function _loadPanels(workId, useAuth) {
  const _sbFetch = useAuth ? sbGetAuth : sbGet;
  const panels = await _sbFetch('panels?work_id=eq.' + workId + '&order=panel_order.asc');
  if (!panels || !panels.length) { showError('Esta obra no tiene páginas guardadas.'); return; }

  const panelIds = panels.map(p => p.id).join(',');

  // Descargar capas del editor y textos del reader en paralelo
  const [layerRows, texts] = await Promise.all([
    _sbFetch('panel_layers?panel_id=in.(' + panelIds + ')&order=layer_order.asc&select=*'),
    _sbFetch('panel_texts?panel_id=in.('  + panelIds + ')&order=text_order.asc'),
  ]);

  RS.panels = await Promise.all(panels.map(async panel => {
    // Capas del editor: parsear layer_data JSON
    const layers = (await Promise.all((layerRows || [])
      .filter(r => r.panel_id === panel.id)
      .sort((a, b) => a.layer_order - b.layer_order)
      .map(async r => {
        try {
          const _raw = await _czDecompress(r.layer_data);
          const l = JSON.parse(_raw);
          if (!l) return null;
          if (l.type === 'gif' && r.gif_url) l._gifUrl = r.gif_url;
          // APNG: descargar del bucket por animKey — igual que GIF usa _gifUrl
          // Descargar APNG si hay anim_url, con o sin animKey en layer_data
          if (l.type === 'image' && r.anim_url) {
            try {
              const _apngDataUrl = await _animDownload(r.anim_url);
              if (_apngDataUrl) l._apngSrc = _apngDataUrl;
            } catch(e) { console.warn('APNG reader dl:', e); }
          }
          return l;
        } catch(e) { return null; }
      })
    )).filter(Boolean);

    // Textos para lógica sequential
    const panelTexts = (texts || [])
      .filter(t => t.panel_id === panel.id)
      .sort((a, b) => (a.text_order||0) - (b.text_order||0));

    // Asociar panel_texts con sus panel_layers correspondientes.
    // panel_layers incluye bubbles sin texto; panel_texts solo incluye los que tienen texto.
    // Usar _hasText para sincronizar correctamente.
    const bubbleLayers = layers.filter(l => l.type==='bubble' || l.type==='text');
    const bubbleLayersWithText = bubbleLayers.filter(l => l._hasText !== false);
    panelTexts.forEach((t, i) => {
      const bl = bubbleLayersWithText[i];
      if (bl && bl.renderDataUrl) t._hasRenderLayer = true;
    });

    return {
      ...panel,
      layers,
      texts: panelTexts,
    };
  }));
}

async function preloadImages() {
  // Precargar todos los data base64 de capas image/draw/stroke de todos los paneles.
  // RS.panels[i].layerImgs[j] = Image | null para cada capa del panel i.
  RS.images = []; // legacy, ya no se usa para render pero se mantiene para no romper nada

  // Contar hojas con contenido real (excluir créditos y hojas sin capas)
  const totalPanels = RS.panels.filter(p => !p.isCredits && (p.layers||[]).length > 0).length;
  let loadedPanels = 0;
  setLoadingProgress(0, '');

  // Cargar todos los paneles en paralelo (máximo rendimiento)
  // El progreso se actualiza con un contador atómico conforme cada panel termina.
  // Esto evita el problema de cargar secuencialmente (N veces más lento).
  setLoadingMsg('Cargando imágenes...');
  await Promise.all(RS.panels.map(async (panel, pi) => {
    panel.layerImgs = await Promise.all((panel.layers || []).map(layer => {
      // GIF: descargar de Storage y decodificar frames (antes de comprobar src)
      if (layer.type === 'gif') {
        if (!layer._gifUrl) return Promise.resolve(null);
        return fetch(layer._gifUrl)
          .then(r => r.blob())
          .then(blob => new Promise(res => {
            const fr = new FileReader();
            fr.onload = e => res(e.target.result);
            fr.readAsDataURL(blob);
          }))
          .then(dataUrl => window.GifDecoder ? window.GifDecoder.decode(dataUrl) : null)
          .then(decoded => {
            if (!decoded || !decoded.frames.length) return null;
            // Crear canvas offscreen con el primer frame
            const oc = document.createElement('canvas');
            oc.width = decoded.width; oc.height = decoded.height;
            oc.getContext('2d').putImageData(decoded.frames[0].imageData, 0, 0);
            // Guardar todos los frames para animación
            layer._gifFrames = decoded.frames;
            layer._gifIdx    = 0;
            layer._gifOc     = oc;
            layer._gifReady  = true;
            return oc; // devolver el canvas como 'img' para layerImgs[j]
          })
          .catch(() => null);
      }
      // Animación APNG: decodificar con ApngDecoder (UPNG) → _animFrames + _animOc
      if (layer._apngSrc && window.ApngDecoder) {
        return window.ApngDecoder.decode(layer._apngSrc, layer._gcpFrameDelay || 100)
          .then(function(result) {
            layer._animFrames  = result.frames;
            layer._animIdx     = 0;
            layer._animLastTick = 0;
            layer._animPlayCount = 0;
            layer._animOc      = document.createElement('canvas');
            layer._animOc.width  = result.width;
            layer._animOc.height = result.height;
            layer._animOc.getContext('2d').putImageData(result.frames[0].imageData, 0, 0);
            layer._animReady   = true;
            return layer._animOc;
          }).catch(function(e) { console.warn('APNG reader load:', e); return null; });
      }


      // Si tiene renderDataUrl (bitmap prerenderizado), cargarlo
      const src = layer.renderDataUrl || layer.src || layer.dataUrl;
      if (!src) return Promise.resolve(null);
      const needsImg = layer.renderDataUrl ||
        layer.type === 'image' || layer.type === 'draw' || layer.type === 'stroke' ||
        layer.type === 'line' || layer.type === 'shape';
      if (!needsImg) return Promise.resolve(null);
      return new Promise(resolve => {
        const img = new Image();
        img.onload  = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });
    }));
    // (renderDataUrl de bubbles se carga via panel.layers en el paso anterior)

    // Actualizar progreso conforme cada panel termina (paralelo — orden no garantizado)
    if (!panel.isCredits && (panel.layers||[]).length > 0) {
      loadedPanels++;
      const pct = totalPanels > 0 ? (loadedPanels / totalPanels) * 95 : 0;
      setLoadingMsg('Cargando hoja ' + loadedPanels + ' de ' + totalPanels + '...');
      setLoadingProgress(pct, '');
    }
  }));

  setLoadingProgress(100, '');

  // Fallback: si algún panel no tiene capas, precargar data_url como antes
  RS.panels.forEach((panel, i) => {
    if (!panel.layers || !panel.layers.length) {
      if (panel.data_url) {
        const img = new Image();
        img.src = panel.data_url;
        panel.layerImgs = [img];
        panel.layers    = [{ type: 'image', src: panel.data_url, x:0.5, y:0.5, width:1, height:1 }];
      } else {
        panel.layerImgs = [];
      }
    }
  });
}

async function sbGet(path) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  if (!res.ok) throw new Error('Supabase ' + res.status);
  return res.json();
}

// sbGetAuth: usa el JWT del usuario autenticado si está disponible (necesario para leer borradores propios)
function _sbAuthHeaders() {
  try {
    const s = JSON.parse(localStorage.getItem('cs_session') || 'null');
    if (s && s.token) return { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + s.token };
  } catch(e) {}
  return { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY };
}
async function sbGetAuth(path) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: _sbAuthHeaders() });
  if (!res.ok) throw new Error('Supabase ' + res.status);
  return res.json();
}

// ── INICIAR ───────────────────────────────────────────────────
// ── Animación GIF en el reproductor ─────────────────────────────────────────
function _readerGifTick() {
  const now = Date.now();
  RS.panels.forEach((panel, pi) => {
    let panelChanged = false;
    (panel.layers || []).forEach(layer => {
      // GIF importado
      if (layer._gifReady && layer._gifFrames && layer._gifOc) {
        if (!layer._gifLastTick) layer._gifLastTick = now;
        const frame = layer._gifFrames[layer._gifIdx];
        if (now - layer._gifLastTick >= (frame.delay || 100)) {
          layer._gifIdx = (layer._gifIdx + 1) % layer._gifFrames.length;
          layer._gifOc.getContext('2d').putImageData(layer._gifFrames[layer._gifIdx].imageData, 0, 0);
          layer._gifLastTick = now;
          panelChanged = true;
        }
      }
      // Animación APNG (nuevo sistema)
      if (layer._animReady && layer._animFrames && layer._animFrames.length > 1) {
        if (!layer._animLastTick) layer._animLastTick = now;
        const _animFrame = layer._animFrames[layer._animIdx];
        const _animDelay = (_animFrame && _animFrame.delay) || layer._gcpFrameDelay || 100;
        if (now - layer._animLastTick >= _animDelay) {
          const _stopAtEnd   = layer._gcpStopAtEnd   || false;
          const _repeatCount = layer._gcpRepeatCount || 0;
          let _nextIdx = layer._animIdx + 1;
          if (_nextIdx >= layer._animFrames.length) {
            layer._animPlayCount = (layer._animPlayCount || 0) + 1;
            if (_stopAtEnd || (_repeatCount > 0 && layer._animPlayCount >= _repeatCount)) {
              _nextIdx = layer._animFrames.length - 1;
            } else { _nextIdx = 0; }
          }
          layer._animIdx = _nextIdx;
          layer._animOc.getContext('2d').putImageData(layer._animFrames[_nextIdx].imageData, 0, 0);
          layer._animLastTick = now;
          panelChanged = true;
        }
      }

    });
    if (panelChanged) {
      // Modo fixed: redibujar si es el panel activo
      if (pi === RS.idx && RS.ctx) { _render(); }
      // Modo scroll: redibujar en el canvas del slide
      else if (panel._scrollCtx) {
        const _sc = RS.idx; RS.idx = pi;
        const _sctx = RS.ctx; RS.ctx = panel._scrollCtx;
        _render();
        RS.idx = _sc; RS.ctx = _sctx;
      }
    }
  });
  requestAnimationFrame(_readerGifTick);
}

function startReader() {
  document.getElementById('loadingScreen').classList.add('hidden');
  document.getElementById('readerApp').classList.remove('hidden');

  // Arrancar loop de animación GIF si hay alguno en la obra
  const _hasGifs = RS.panels.some(p => (p.layers||[]).some(l => l._gifReady || l._animReady));
  if (_hasGifs) requestAnimationFrame(_readerGifTick);

  if (RS.navMode === 'horizontal' || RS.navMode === 'vertical') {
    _startScrollReader();
    return;
  }

  // ── Modo fixed (original) ──
  RS.canvas = document.getElementById('readerCanvas');
  RS.ctx    = RS.canvas.getContext('2d');
  RS.idx    = 0;
  RS.textStep = _initTextStep(0);

  _resizeCanvas();
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    _render();
    _showControls();
  });
  _setupControls();
  requestAnimationFrame(_positionBtns);

  RS.resizeFn = () => { _resizeCanvas(); _render(); };
  setTimeout(() => window.addEventListener('resize', RS.resizeFn), 300);

  const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const msg = isTouch
    ? 'Toca izquierda/derecha para pasar página  👆'
    : 'Desplázate con las flechas del teclado  ◀ ▶';
  _readerToast(msg, 4000);
}

// ── MODO SCROLL (horizontal / vertical) ──────────────────────
//
// Igual que el HTML de referencia:
//   - Un canvas por ESTADO (panel×textStep) dentro de su slide
//   - flex: 0 0 100% + scroll-snap → el navegador anima el deslizamiento
//   - Al llegar a un estado nuevo se detecta por evento scroll
//   - Teclado PC: scrollIntoView al estado siguiente/anterior
//
// RS.scrollMap[i] = { panelIdx, textStep }
// ─────────────────────────────────────────────────────────────

function _startScrollReader() {
  const isH = RS.navMode === 'horizontal';
  const vw = window.innerWidth, vh = window.innerHeight;

  // Ocultar canvas del modo fixed
  const fixedCanvas = document.getElementById('readerCanvas');
  if (fixedCanvas) fixedCanvas.style.display = 'none';

  // Configurar contenedor — overflow NUNCA se toca después de aquí
  const container = document.getElementById('scrollReader');
  container.style.display = 'flex'; // necesario: #scrollReader{display:none} supera la clase
  container.className = isH ? 'scroll-reader scroll-h' : 'scroll-reader scroll-v';
  container.innerHTML = '';

  // ── Construir slides: uno por panel ──
  const _canvases = [];

  RS.panels.forEach((panel, pi) => {
    const { pw, ph } = _panelDims(pi);
    const scale = Math.min(vw / pw, vh / ph);

    const slide = document.createElement('div');
    slide.className = 'rs-slide';
    slide.style.width  = vw + 'px';
    slide.style.height = vh + 'px';

    const canvas = document.createElement('canvas');
    canvas.width  = pw;
    canvas.height = ph;
    canvas.style.width  = Math.round(pw * scale) + 'px';
    canvas.style.height = Math.round(ph * scale) + 'px';
    canvas.style.pointerEvents = 'none';

    slide.appendChild(canvas);
    container.appendChild(slide);
    _canvases.push(canvas);
    // Guardar ctx para que _readerGifTick pueda redibujar en modo scroll
    RS.panels[pi]._scrollCtx = canvas.getContext('2d');
  });

  // ── Overlay: intercepta toques cuando hay textos pendientes ──
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10;touch-action:none;';
  overlay.style.pointerEvents = 'none';
  document.getElementById('readerApp').appendChild(overlay);
  RS.scrollOverlay = overlay;

  // ── Estado ──
  RS.idx      = 0;
  RS.textStep = 0;

  function _activateCanvas(pi) {
    RS.canvas = _canvases[pi];
    RS.ctx    = _canvases[pi]?.getContext('2d');
  }

  function _hasPendingTexts() {
    const panel = RS.panels[RS.idx];
    const texts = panel?.texts || [];
    return (panel?.text_mode || 'sequential') === 'sequential' && RS.textStep < texts.length;
  }

  function _updateOverlay() {
    const panel = RS.panels[RS.idx];
    const texts = panel?.texts || [];
    const isSeq = (panel?.text_mode || 'sequential') === 'sequential';
    const active = isSeq && texts.length > 0 && (RS.textStep < texts.length || RS.textStep > 1);
    overlay.style.pointerEvents = active ? 'all' : 'none';
  }

  // ── Render inicial de todos los slides ──
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    // Paso 1: renderizar todos los panels sin textos secuenciales
    RS.panels.forEach((panel, pi) => {
      _activateCanvas(pi);
      RS.idx      = pi;
      RS.textStep = 0;
      _render();
    });
    // Paso 2: panel 0 con el primer texto visible (igual que el visor del editor)
    RS.idx      = 0;
    RS.textStep = _initTextStep(0);
    _activateCanvas(0);
    _render();
    _updateOverlay();
    // Forzar posición inicial al panel 0
    container.scrollLeft = 0;
    container.scrollTop  = 0;
    _positionBtns();
  });

  // ── Swipe en el overlay ──
  let _osx = null, _osy = null;
  overlay.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { _osx = null; return; }
    _osx = e.touches[0].clientX;
    _osy = e.touches[0].clientY;
  }, { passive: true });

  overlay.addEventListener('touchend', e => {
    if (_osx === null) return;
    const ex = e.changedTouches[0].clientX;
    const ey = e.changedTouches[0].clientY;
    const dx = ex - _osx, dy = ey - _osy;
    _osx = null;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (isH && adx < 20) return;
    if (!isH && ady < 20) return;
    if (isH && ady > adx * 1.5) return;
    if (!isH && adx > ady * 1.5) return;

    const goFwd = isH ? dx < 0 : dy < 0;
    const goBwd = isH ? dx > 0 : dy > 0;

    if (goFwd && _hasPendingTexts()) {
      _startFade();
      RS.textStep++;
      _activateCanvas(RS.idx);
      _render();
      _updateOverlay();
    } else if (goFwd) {
      if (RS.idx < RS.panels.length - 1) _snapTo(RS.idx + 1);
    } else if (goBwd) {
      _vsBack();
    }
  }, { passive: true });

  // ── Retroceder ──
  function _vsBack() {
    if (RS.fadeRaf) { cancelAnimationFrame(RS.fadeRaf); RS.fadeRaf = null; RS.fadeAlpha = 0; }
    const panel = RS.panels[RS.idx];
    const isSeq = (panel?.text_mode || 'sequential') === 'sequential';
    const texts = panel?.texts || [];
    if (isSeq && RS.textStep > 1) {
      RS.textStep--;
      _activateCanvas(RS.idx);
      _render();
      _updateOverlay();
    } else {
      if (RS.idx > 0) _snapTo(RS.idx - 1);
    }
  }

  // ── Scroll nativo: detectar llegada a nuevo panel ──
  let _prevSI = 0, _scrollRaf = null;
  container.addEventListener('scroll', () => {
    if (_scrollRaf) cancelAnimationFrame(_scrollRaf);
    _scrollRaf = requestAnimationFrame(() => {
      const pos  = isH ? container.scrollLeft : container.scrollTop;
      const size = isH ? container.clientWidth : container.clientHeight;
      if (!size) return;
      const si = Math.max(0, Math.min(RS.panels.length - 1, Math.round(pos / size)));
      if (si === _prevSI) return;
      const goingBack = si < _prevSI;
      _prevSI = si;
      RS.idx  = si;
      _activateCanvas(si);
      const np    = RS.panels[si];
      const ntxts = np?.texts || [];
      const isSeq = (np?.text_mode || 'sequential') === 'sequential';
      if (!isSeq || ntxts.length === 0) {
        RS.textStep = 0;
      } else if (goingBack) {
        RS.textStep = ntxts.length;
      } else {
        RS.textStep = 1;
      }
      _render();
      _updateOverlay();
    });
  }, { passive: true });

  // ── Teclado PC ──
  RS.keyHandler = e => {
    const fwd = ['ArrowRight','ArrowDown','Space','Enter'].includes(e.code);
    const bwd = ['ArrowLeft','ArrowUp'].includes(e.code);
    if (fwd) {
      e.preventDefault();
      if (_hasPendingTexts()) {
        _startFade(); RS.textStep++; _activateCanvas(RS.idx); _render(); _updateOverlay();
      } else if (RS.idx < RS.panels.length - 1) {
        _snapTo(RS.idx + 1);
      }
    }
    if (bwd) { e.preventDefault(); _vsBack(); }
    if (e.key === 'Escape') {
      if (RS.isEmbed) { try { window.parent.postMessage({ type: 'reader:close' }, '*'); } catch(_) {} }
    }
  };
  document.addEventListener('keydown', RS.keyHandler);

  // ── Resize / giro de dispositivo ──
  RS.resizeFn = () => {
    const _vw = window.innerWidth, _vh = window.innerHeight;
    // Reajustar dimensiones de cada slide y canvas
    Array.from(container.children).forEach((slide, pi) => {
      const panel = RS.panels[pi]; if (!panel) return;
      const { pw, ph } = _panelDims(pi);
      const scale = Math.min(_vw / pw, _vh / ph);
      slide.style.width  = _vw + 'px';
      slide.style.height = _vh + 'px';
      const cv = slide.querySelector('canvas');
      if (cv) {
        cv.style.width  = Math.round(pw * scale) + 'px';
        cv.style.height = Math.round(ph * scale) + 'px';
      }
    });
    // Reposicionar al panel activo
    const _sz = isH ? container.clientWidth : container.clientHeight;
    if (_sz) container.scrollTo({ left: isH ? RS.idx*_sz : 0, top: isH ? 0 : RS.idx*_sz, behavior:'instant' });
    // Redibujar panel activo
    _activateCanvas(RS.idx);
    _render();
    // Reposicionar botones
    _positionBtns();
  };
  setTimeout(() => {
    window.addEventListener('resize', RS.resizeFn);
    window.addEventListener('orientationchange', () => {
      setTimeout(RS.resizeFn, 100);
      setTimeout(RS.resizeFn, 400);
    });
    const _onFsChange = () => setTimeout(RS.resizeFn, 50);
    document.addEventListener('fullscreenchange',       _onFsChange);
    document.addEventListener('webkitfullscreenchange', _onFsChange);
  }, 300);

  // ── scrollTo programático ──
  function _snapTo(idx) {
    const size = isH ? container.clientWidth : container.clientHeight;
    container.scrollTo({
      left:     isH ? idx * size : 0,
      top:      isH ? 0 : idx * size,
      behavior: 'smooth',
    });
  }

  const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  _readerToast(
    isH ? (isTouch ? 'Desliza ◀ ▶ para cambiar de hoja' : 'Flechas ◀ ▶ para navegar')
        : (isTouch ? 'Desliza ▲ ▼ para cambiar de hoja' : 'Flechas ▲ ▼ para navegar'),
    4000
  );
}

function _renderVectorLayer(ctx, layer, pw, ph, img) {
  if (img) {
    ctx.save();
    ctx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1;
    ctx.drawImage(img, 0, 0, pw, ph);
    ctx.restore();
  }
}

// ── POSICIÓN DE BOTONES ───────────────────────────────────────
// Los botones se anclan a los bordes del canvas, no a la ventana.
// Se llama cada vez que el canvas cambia de tamaño o posición.
// Posicionar botones sobre el canvas del estado activo en modo scroll
function _positionScrollBtns(stateIdx) {
  const entry = RS.scrollMap?.[stateIdx];
  if (!entry) return;
  const { panelIdx, canvas } = entry;
  if (!canvas) return;
  const { pw, ph } = _panelDims(panelIdx);
  const vw = window.innerWidth, vh = window.innerHeight;
  const scale = Math.min(vw / pw, vh / ph);
  const dw = Math.round(pw * scale);
  const dh = Math.round(ph * scale);
  const cl = Math.round((vw - dw) / 2);
  const ct = Math.round((vh - dh) / 2);
  const PAD = 8, OFY = 10;
  const fsBtn    = document.getElementById('fullscreenToggle');
  const closeBtn = document.getElementById('closeBtn');
  if (fsBtn)    { fsBtn.style.left    = (cl + PAD) + 'px'; fsBtn.style.top    = (ct + OFY) + 'px'; }
  if (closeBtn) { const btnW = closeBtn.getBoundingClientRect().width || 32;
                  closeBtn.style.left = (cl + dw - PAD - btnW) + 'px'; closeBtn.style.top = (ct + OFY) + 'px'; }
}

function _positionBtns() {
  const PAD = 8, OFY = 10;
  let cl, ct, cw;

  const scrollContainer = document.getElementById('scrollReader');
  const isScrollMode = scrollContainer && scrollContainer.className.includes('scroll-');

  if (isScrollMode) {
    // Modo scroll: calcular posición del canvas desde dimensiones del panel activo
    const { pw, ph } = _panelDims(RS.idx);
    const vw = window.innerWidth, vh = window.innerHeight;
    const scale = Math.min(vw / pw, vh / ph);
    const dw = Math.round(pw * scale), dh = Math.round(ph * scale);
    cl = Math.round((vw - dw) / 2);
    ct = Math.round((vh - dh) / 2);
    cw = dw;
  } else {
    // Modo fixed: el canvas tiene position:absolute con left/top explícitos
    const c = RS.canvas;
    if (!c) return;
    cl = parseInt(c.style.left)  || 0;
    ct = parseInt(c.style.top)   || 0;
    cw = parseInt(c.style.width) || 0;
  }

  const fsBtn    = document.getElementById('fullscreenToggle');
  const closeBtn = document.getElementById('closeBtn');

  if (fsBtn) {
    fsBtn.style.left = (cl + PAD) + 'px';
    fsBtn.style.top  = (ct + OFY) + 'px';
  }
  if (closeBtn) {
    const btnW = closeBtn.getBoundingClientRect().width || 32;
    closeBtn.style.left = (cl + cw - PAD - btnW) + 'px';
    closeBtn.style.top  = (ct + OFY) + 'px';
  }
}

// ── TAMAÑO DEL CANVAS ─────────────────────────────────────────
function _panelDims(idx) {
  const isH = (RS.panels[idx]?.orientation || 'v') === 'h';
  return { pw: isH ? ED_PAGE_H : ED_PAGE_W, ph: isH ? ED_PAGE_W : ED_PAGE_H };
}

function _resizeCanvas() {
  const panel = RS.panels[RS.idx];
  const { pw, ph } = _panelDims(RS.idx);
  RS.canvas.width  = pw;
  RS.canvas.height = ph;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Panel de créditos: escalar como vertical normal (contain)
  // Hojas horizontales reales: llenar toda la altura
  const isHorizPanel = pw > ph && !panel?.isCredits;

  let scale;
  if (isHorizPanel) {
    scale = vh / ph;
    if (pw * scale > vw * 1.5) scale = vw / pw;
  } else {
    scale = Math.min(vw / pw, vh / ph);
  }

  const dw = Math.round(pw * scale), dh = Math.round(ph * scale);
  RS.canvas.style.width  = dw + 'px';
  RS.canvas.style.height = dh + 'px';
  RS.canvas.style.left   = Math.round((vw - dw) / 2) + 'px';
  RS.canvas.style.top    = Math.round((vh - dh) / 2) + 'px';
  _positionBtns();
}

// ── RENDER PRINCIPAL ──────────────────────────────────────────
function _render() {
  const panel = RS.panels[RS.idx];
  if (!panel || !RS.ctx) return;

  // Panel de créditos — render especial con fade
  if (panel.isCredits) {
    RS.isCredits = true;
    const { pw, ph } = _panelDims(RS.idx);
    // Solo llamar _showCredits si no hay fade en marcha ni ya mostrado
    // para evitar el parpadeo al redibujar con alpha=0
    if (!RS.creditsTimer && !RS.fadeRaf) {
      _showCredits();
    } else {
      _renderCredits(pw, ph);
    }
    return;
  }

  // Si venimos de los créditos, resetear su estado
  if (RS.creditsTimer || RS.creditsAlpha > 0) _resetCredits();

  const { pw, ph } = _panelDims(RS.idx);
  const ctx = RS.ctx;

  ctx.clearRect(0, 0, pw, ph);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pw, ph);
  // Dibujar capas en orden: image/draw/stroke primero, bubble/text al final (via _drawTexts)
  const layers    = panel.layers    || [];
  const layerImgs = panel.layerImgs || [];

  layers.forEach((layer, j) => {
    const type = layer.type;
    if (type === 'gif') {
      if (!layer._gifReady || !layer._gifOc) return;
      ctx.save();
      ctx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1;
      const _gx = (layer.x || 0.5) * pw;
      const _gy = (layer.y || 0.5) * ph;
      const _gw = (layer.width  || 0.5) * pw;
      const _gh = (layer.height || 0.5) * ph;
      const _gr = (layer.rotation || 0) * Math.PI / 180;
      ctx.translate(_gx, _gy);
      if (_gr) ctx.rotate(_gr);
      ctx.drawImage(layer._gifOc, -_gw/2, -_gh/2, _gw, _gh);
      ctx.restore();
      return;
    }
    if (type === 'image' || type === 'draw' || type === 'stroke') {
      // Animación PNG del editor GIF — usar _pngOc en lugar de layerImgs[j]
      if (type === 'image' && layer._animReady && layer._animOc) {
        const _oc = layer._animOc;
        const x = (layer.x || 0.5) * pw;
        const y = (layer.y || 0.5) * ph;
        const w = (layer.width || 1) * pw;
        const h = (layer.height || 1) * ph;
        const rot = layer.rotation || 0;
        ctx.save();
        ctx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1;
        ctx.translate(x, y);
        if (rot) ctx.rotate(rot * Math.PI / 180);
        ctx.drawImage(_oc, -w/2, -h/2, w, h);
        ctx.restore();
        return;
      }
      const img = layerImgs[j];
      if (!img) return;
      ctx.save();
      ctx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1;
      if (type === 'image' || type === 'stroke') {
        const x = (layer.x      || 0.5) * pw;
        const y = (layer.y      || 0.5) * ph;
        const w = (layer.width  || 1)   * pw;
        const h = (layer.height || 1)   * ph;
        const rot = layer.rotation || 0;
        ctx.translate(x, y);
        if (rot) ctx.rotate(rot * Math.PI / 180);
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
      } else {
        ctx.drawImage(img, 0, 0, pw, ph);
      }
      ctx.restore();
    } else if (type === 'shape') {
      ctx.save();
      ctx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1;
      const x = (layer.x || 0.5) * pw, y = (layer.y || 0.5) * ph;
      const w = (layer.width || 0.3) * pw, h = (layer.height || 0.2) * ph;
      const rot = (layer.rotation || 0) * Math.PI / 180;
      ctx.translate(x, y);
      if (rot) ctx.rotate(rot);
      if (layer.renderDataUrl && layerImgs[j]) {
        // Shape con cornerRadii: usar bitmap fiel
        const _pad = layer._renderPad || 0;
        ctx.drawImage(layerImgs[j], -w/2-_pad, -h/2-_pad, w+_pad*2, h+_pad*2);
      } else {
        ctx.lineJoin = 'round';
        ctx.beginPath();
        if (layer.shape === 'ellipse') ctx.ellipse(0, 0, w/2, h/2, 0, 0, Math.PI*2);
        else ctx.rect(-w/2, -h/2, w, h);
        if (layer.fillColor && layer.fillColor !== 'none') { ctx.fillStyle = layer.fillColor; ctx.fill(); }
        if ((layer.lineWidth || 0) > 0) { ctx.strokeStyle = layer.color || '#000'; ctx.lineWidth = layer.lineWidth; ctx.stroke(); }
      }
      ctx.restore();
    } else if (type === 'line' && layer.points && layer.points.length >= 2) {
      ctx.save();
      ctx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1;
      const x = (layer.x || 0.5) * pw, y = (layer.y || 0.5) * ph;
      const w = (layer.width  || 0.3) * pw, h = (layer.height || 0.2) * ph;
      const rot = (layer.rotation || 0) * Math.PI / 180;
      ctx.translate(x, y);
      if (rot) ctx.rotate(rot);
      // Si tiene renderDataUrl (línea con curvas), usarlo directamente
      if (layer.renderDataUrl && layerImgs[j]) {
        const _pad = layer._renderPad || 0; // pad en px de página
        const _pw2 = pw, _ph2 = ph;
        // El bitmap cubre w+2*pad × h+2*pad centrado en el objeto
        const _bw = (layer.width || 0.3) * _pw2 + (layer._renderPad||0)*2;
        const _bh = (layer.height || 0.2) * _ph2 + (layer._renderPad||0)*2;
        ctx.drawImage(layerImgs[j], -_bw/2, -_bh/2, _bw, _bh);
      } else {
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        // Dividir points en contornos por null
        const _rContours = []; let _rCur = [];
        for(const p of layer.points){ if(p===null){ if(_rCur.length>=2) _rContours.push(_rCur); _rCur=[]; } else _rCur.push(p); }
        if(_rCur.length>=2) _rContours.push(_rCur);
        if(_rContours.length > 1){
          // Múltiples contornos → evenodd
          const _rPath = new Path2D();
          for(const c of _rContours){
            _rPath.moveTo(c[0].x*pw, c[0].y*ph);
            for(let i=1;i<c.length;i++) _rPath.lineTo(c[i].x*pw, c[i].y*ph);
            _rPath.closePath();
          }
          if (layer.fillColor && layer.fillColor !== 'none') { ctx.fillStyle = layer.fillColor; ctx.fill(_rPath, 'evenodd'); }
          if ((layer.lineWidth || 0) > 0) { ctx.strokeStyle = layer.color || '#000'; ctx.lineWidth = layer.lineWidth; ctx.stroke(_rPath); }
        } else {
          ctx.beginPath();
          const _pts0 = _rContours[0] || [];
          if(_pts0.length){ ctx.moveTo(_pts0[0].x*pw, _pts0[0].y*ph); for(let i=1;i<_pts0.length;i++) ctx.lineTo(_pts0[i].x*pw, _pts0[i].y*ph); }
          if (layer.closed) ctx.closePath();
          if (layer.closed && layer.fillColor && layer.fillColor !== 'none') { ctx.fillStyle = layer.fillColor; ctx.fill(); }
          if ((layer.lineWidth || 0) > 0) { ctx.strokeStyle = layer.color || '#000'; ctx.lineWidth = layer.lineWidth; ctx.stroke(); }
        }
      }
      ctx.restore();
    }
    // bubble/text: siempre gestionado por _drawTexts (forma + texto juntos, con sequential)
  });

  _drawTexts(ctx, panel, pw, ph, panel.layerImgs || []);
  _updateCounter();
}

// ── TEXTOS / BOCADILLOS ───────────────────────────────────────
function _drawTexts(ctx, panel, pw, ph, layerImgs) {
  const texts = panel.texts || [];
  if (!texts.length) return;
  // Asociar cada panel_text con su layerImg (solo layers bubble/text)
  const layers = panel.layers || [];
  const allLayerImgs = layerImgs || panel.layerImgs || [];
  // Solo capas bubble/text que tienen texto (sincronizado con panel_texts que filtra sin texto)
  const bubbleLayersWithText2 = [];
  const bubbleLayerGlobalIdx2 = [];
  layers.forEach((l, gi) => {
    if ((l.type==='bubble'||l.type==='text') && l._hasText !== false) {
      bubbleLayersWithText2.push(l);
      bubbleLayerGlobalIdx2.push(gi);
    }
  });
  texts.forEach((t, i) => {
    t._bubbleLayerImg = (bubbleLayerGlobalIdx2[i] !== undefined) ? allLayerImgs[bubbleLayerGlobalIdx2[i]] : null;
    t._bubbleLayer    = bubbleLayersWithText2[i] || null;
  });

  const isSeq = (panel.text_mode || 'sequential') === 'sequential';
  if (!isSeq) {
    texts.forEach(t => _drawBubble(ctx, t, pw, ph, 1));
    return;
  }
  // Modo sequential — replica exacta del visor interno del editor (edUpdateViewer):
  // - type 'text' (cajas): siempre al 100% cuando reveladas, permanecen visibles
  // - type 'bubble': el actual al 100%, el anterior con fade-out, los más viejos desaparecen
  const toShow = texts.slice(0, RS.textStep);
  toShow.forEach((t, vi) => {
    if (t.type === 'text') {
      _drawBubble(ctx, t, pw, ph, 1);
    } else {
      const isCurrent  = vi === toShow.length - 1;
      const isPrevious = vi === toShow.length - 2;
      if (isCurrent) {
        _drawBubble(ctx, t, pw, ph, 1);
      } else if (isPrevious && RS.fadeAlpha > 0) {
        _drawBubble(ctx, t, pw, ph, RS.fadeAlpha);
      }
      // Bocadillos más antiguos: ya desaparecieron
    }
  });
}

function _drawBubble(ctx, t, pw, ph, alpha) {
  // Si tiene bitmap prerenderizado: dibujar forma + texto juntos (respeta sequential)
  if (t._bubbleLayerImg && t._bubbleLayer && t._bubbleLayer.renderDataUrl) {
    const bl = t._bubbleLayer;
    const x = (bl.x || 0.5) * pw, y = (bl.y || 0.5) * ph;
    const _rw = bl._renderW !== undefined ? bl._renderW * pw : (bl.width || 0.3) * pw;
    const _rh = bl._renderH !== undefined ? bl._renderH * ph : (bl.height || 0.15) * ph;
    const _pad = bl._renderPad || 0;
    const rot = bl.rotation || 0;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot * Math.PI / 180);
    // Dibujar bitmap de la forma
    ctx.drawImage(t._bubbleLayerImg, -_rw/2-_pad, -_rh/2-_pad, _rw+_pad*2, _rh+_pad*2);
    // Superponer texto (thought: texto separado; explosion: texto ya en bitmap)
    if (bl.style !== 'explosion') {
      const fs = Math.max(10, t.font_size||t.fontSize||bl.fontSize||30);
      ctx.font=(t.font_italic||t.fontItalic||bl.fontItalic?'italic ':'')+(t.font_bold||t.fontBold||bl.fontBold?'bold ':'')+fs+'px '+(t.font_family||t.fontFamily||bl.fontFamily||'Patrick Hand');
      ctx.fillStyle=t.color||bl.color||'#000'; ctx.textAlign='center'; ctx.textBaseline='middle';
      const _lines=_getLines(t.text||bl.text||''); const _lh=fs*1.2; const _th=_lines.length*_lh;
      _lines.forEach((l,i)=>ctx.fillText(l,0,-_th/2+_lh/2+i*_lh));
    }
    ctx.restore();
    return;
  }
  // Si tiene bitmap prerenderizado (thought/explosion), usarlo directamente
  if (t.renderDataUrl && t._renderImg) {
    const _fromLayers = t.width !== undefined;
    const _rx = _fromLayers ? (t.x - t.width/2) : (t.x/100);
    const _ry = _fromLayers ? (t.y - t.height/2) : (t.y/100);
    const _rw = _fromLayers ? t.width : ((t.w||30)/100);
    const _rh = _fromLayers ? t.height : ((t.h||15)/100);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (t.rotation) { ctx.translate((_rx+_rw/2)*pw,(_ry+_rh/2)*ph); ctx.rotate(t.rotation*Math.PI/180); ctx.drawImage(t._renderImg,-_rw*pw/2,-_rh*ph/2,_rw*pw,_rh*ph); }
    else ctx.drawImage(t._renderImg,_rx*pw,_ry*ph,_rw*pw,_rh*ph);
    ctx.restore();
    // Aún dibujar el texto encima
    const _cx = _fromLayers ? t.x*pw : (_rx+_rw/2)*pw;
    const _cy = _fromLayers ? t.y*ph : (_ry+_rh/2)*ph;
    const fs = Math.max(10, t.font_size||t.fontSize||30);
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.translate(_cx,_cy);
    if (t.rotation) ctx.rotate(t.rotation*Math.PI/180);
    ctx.font=(t.font_italic||t.fontItalic?'italic ':'')+(t.font_bold||t.fontBold?'bold ':'')+fs+'px '+(t.font_family||t.fontFamily||'Patrick Hand');
    ctx.fillStyle=t.color||'#000'; ctx.textAlign='center'; ctx.textBaseline='middle';
    const _lines=_getLines(t.text||''); const _lh=fs*1.2; const _th=_lines.length*_lh;
    _lines.forEach((l,i)=>ctx.fillText(l,0,-_th/2+_lh/2+i*_lh));
    ctx.restore();
    return;
  }
  // Detectar formato de coordenadas:
  // panel_texts: x,y,w,h en % (0-100) con campos w,h
  // panel_layers: x,y en 0-1 (centro), width,height en 0-1
  const _fromLayers = t.width !== undefined || t.height !== undefined;
  const _rawX = _fromLayers ? (t.x - (t.width  || 0.3) / 2) : (t.x / 100);
  const _rawY = _fromLayers ? (t.y - (t.height || 0.15)/ 2) : (t.y / 100);
  const _rawW = _fromLayers ? (t.width  || 0.3)              : ((t.w  || 30) / 100);
  const _rawH = _fromLayers ? (t.height || 0.15)             : ((t.h  || 15) / 100);
  const x = _rawX * pw;
  const y = _rawY * ph;
  const w = _rawW * pw;
  const h = _rawH * ph;
  // scale = 1: canvas lógico idéntico al editor, sin conversión
  const scale = 1;
  // Normalizar campos: panel_texts usa snake_case; panel_layers usa camelCase del editor
  const fontSize_  = t.font_size   || t.fontSize   || 30;
  const fontFamily_= t.font_family || t.fontFamily  || 'Patrick Hand';
  const fontBold_  = t.font_bold   ?? t.fontBold   ?? false;
  const fontItalic_= t.font_italic ?? t.fontItalic ?? false;
  const bgColor_   = t.bg          || t.backgroundColor || '#ffffff';
  const bgOpacity_ = t.bg_opacity  ?? t.bgOpacity ?? 1;
  const borderW_   = t.border !== undefined && t.border !== null ? t.border
                   : t.borderWidth !== undefined ? t.borderWidth : 2;
  const borderC_   = t.border_color || t.borderColor || '#000000';
  const textColor_ = t.color || '#000000';
  const padding_   = t.padding || 10;
  const fs = Math.max(10, Math.round(fontSize_ * scale));
  const bg     = bgColor_;
  const border = borderC_;
  const bw     = borderW_ * scale;
  const style  = t.style || 'conventional';
  const type   = t.type  || 'bubble';
  const cx = x + w / 2;
  const cy = y + h / 2;
  const isSingle = (t.text||'').trim().length===1 && /[a-zA-Z0-9]/.test((t.text||'').trim());
  // Normalizar cola: panel_texts usa snake_case + JSON string; panel_layers usa camelCase + array
  let tailStarts = t.tailStarts || t.tail_starts;
  let tailEnds   = t.tailEnds   || t.tail_ends;
  if (typeof tailStarts === 'string') { try { tailStarts = JSON.parse(tailStarts); } catch(e) { tailStarts = null; } }
  if (typeof tailEnds   === 'string') { try { tailEnds   = JSON.parse(tailEnds);   } catch(e) { tailEnds   = null; } }
  const hasTail    = t.hasTail    ?? t.has_tail    ?? true;
  const voiceCount = t.voiceCount ?? t.voice_count ?? 1;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  if (t.rotation) ctx.rotate(t.rotation * Math.PI / 180);
  // Helper: aplica bgOpacity_ solo al fill del fondo
  const _bgFill = (fn) => {
    const _prev = ctx.globalAlpha;
    ctx.globalAlpha = _prev * bgOpacity_;
    fn();
    ctx.globalAlpha = _prev;
  };

  if (style === 'thought') {
    // Nube de pensamiento: 4 círculos solapados
    const circles = [{x:0,y:-h/4,r:w/3},{x:w/4,y:0,r:w/3},{x:-w/4,y:0,r:w/3},{x:0,y:h/4,r:w/3}];
    ctx.fillStyle = bg; ctx.strokeStyle = border; ctx.lineWidth = bw;
    circles.forEach(c => {
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI*2);
      _bgFill(()=>ctx.fill()); ctx.stroke();
    });
    function ci(c1, c2) {
      const dx=c2.x-c1.x, dy=c2.y-c1.y, d=Math.hypot(dx,dy);
      if (d>c1.r+c2.r||d<Math.abs(c1.r-c2.r)||d===0) return [];
      const a=(c1.r*c1.r-c2.r*c2.r+d*d)/(2*d), h2=c1.r*c1.r-a*a;
      if (h2<0) return []; const hh=Math.sqrt(h2), x0=c1.x+a*dx/d, y0=c1.y+a*dy/d;
      const rx=-dy*(hh/d), ry=dx*(hh/d);
      return [{x:x0+rx,y:y0+ry},{x:x0-rx,y:y0-ry}];
    }
    let maxDist = 0;
    [[0,1],[0,2],[1,3],[2,3],[0,3],[1,2]].forEach(([a,b]) => {
      ci(circles[a],circles[b]).forEach(p => { maxDist = Math.max(maxDist, Math.hypot(p.x,p.y)); });
    });
    if (maxDist === 0) maxDist = Math.min(w,h)*0.4;
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0,0,maxDist,0,Math.PI*2); ctx.fill();
    // Cola de pensamiento: burbujas pequeñas — misma referencia que el editor (workspace completo)
    const canvasSize = ED_CANVAS_MIN * scale;
    const thoughtTailEnd = (tailEnds && tailEnds[0]) || {x:-0.4, y:0.6};
    [0.09,0.055,0.03].forEach((r, i) => {
      const f = 1 - i * 0.3;
      const tx = thoughtTailEnd.x * w * f, ty = thoughtTailEnd.y * h * f;
      ctx.beginPath(); ctx.arc(tx, ty, r * canvasSize, 0, Math.PI*2);
      ctx.fillStyle = bg; _bgFill(()=>ctx.fill());
      ctx.strokeStyle = border; ctx.lineWidth = bw; ctx.stroke();
    });
    // Texto centrado
    ctx.font = (fontItalic_ ? 'italic ' : '') + (fontBold_ ? 'bold ' : '') + fs + 'px ' + fontFamily_;
    ctx.fillStyle = textColor_;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const padT = padding_ * scale;
    const linesT = _getLines(t.text || '');
    const lhT = fs * 1.2, totalHT = linesT.length * lhT;
    linesT.forEach((line, i) => ctx.fillText(line, 0, -totalHT/2 + lhT/2 + i*lhT));
    ctx.restore();
    return;
  }

  if (style === 'explosion') {
    const pts = 12, step = (2*Math.PI)/pts;
    ctx.beginPath();
    for (let i = 0; i < pts; i++) {
      const angle = i * step;
      const rr = (0.8+0.3*Math.sin(i*1.5)+0.2*Math.cos(i*2.3)) * (isSingle ? Math.min(w,h)/2 : (i%2===0?w/2:h/2));
      i===0 ? ctx.moveTo(Math.cos(angle)*rr, Math.sin(angle)*rr) : ctx.lineTo(Math.cos(angle)*rr, Math.sin(angle)*rr);
    }
    ctx.closePath();
  } else if (type === 'text') {
    // Caja de texto: rectángulo con esquinas ligeramente redondeadas
    const rr = Math.min(6 * scale, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(-w/2+rr, -h/2);
    ctx.lineTo( w/2-rr, -h/2); ctx.arcTo( w/2,-h/2,  w/2,-h/2+rr, rr);
    ctx.lineTo( w/2,    h/2-rr); ctx.arcTo( w/2, h/2,  w/2-rr, h/2, rr);
    ctx.lineTo(-w/2+rr, h/2); ctx.arcTo(-w/2,  h/2, -w/2, h/2-rr, rr);
    ctx.lineTo(-w/2,   -h/2+rr); ctx.arcTo(-w/2,-h/2, -w/2+rr,-h/2, rr);
    ctx.closePath();
  } else if (isSingle) {
    ctx.beginPath(); ctx.arc(0, 0, Math.min(w,h)/2, 0, Math.PI*2);
  } else {
    // Elipse — igual que el editor
    ctx.beginPath(); ctx.ellipse(0, 0, w/2, h/2, 0, 0, Math.PI*2);
  }

  ctx.fillStyle = bg; _bgFill(()=>ctx.fill());
  if (bw > 0) {
    ctx.strokeStyle = border; ctx.lineWidth = bw;
    if (style === 'lowvoice') ctx.setLineDash([5*scale, 3*scale]); else ctx.setLineDash([]);
    ctx.stroke(); ctx.setLineDash([]);
  }

  // Cola (solo bocadillos, no cajas de texto)
  if (type === 'bubble' && hasTail && style !== 'radio') {
    const vc = voiceCount;
    const starts = tailStarts || [{x:-0.4, y:0.4}];
    const ends   = tailEnds   || [{x:-0.4, y:0.6}];
    for (let v = 0; v < vc; v++) {
      const ts = starts[v] || starts[0];
      const te = ends[v]   || ends[0];
      _drawTail(ctx, ts, te, w, h, bg, border, bw, scale, bgOpacity_);
    }
  } else if (type === 'bubble' && style === 'radio') {
    const te = (tailEnds && tailEnds[0]) || {x:0, y:0.5};
    const ex = te.x * w, ey = te.y * h;
    ctx.save(); ctx.strokeStyle = border; ctx.lineWidth = 1 * scale;
    for (let r = 5*scale; r < 25*scale; r += 5*scale) { ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI*2); ctx.stroke(); }
    ctx.restore();
  }

  // Texto centrado
  ctx.font = (fontItalic_ ? 'italic ' : '') + (fontBold_ ? 'bold ' : '') + fs + 'px ' + fontFamily_;
  const isPlaceholder = (t.text||'') === 'Escribe aquí';
  ctx.fillStyle = isPlaceholder ? '#999999' : textColor_;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lines = _getLines(t.text || '');
  const lh = fs * 1.2, totalH = lines.length * lh;
  lines.forEach((line, i) => ctx.fillText(line, 0, -totalH/2 + lh/2 + i*lh));

  ctx.restore();
}

// Cola — coordenadas relativas al centro del bocadillo (ctx ya tiene translate)
function _drawTail(ctx, ts, te, w, h, bg, border, bw, scale, bgOpacity) {
  const sx = ts.x * w, sy = ts.y * h;
  const ex = te.x * w, ey = te.y * h;
  const tailW = 10 * (scale||1);
  const angle = Math.atan2(ey-sy, ex-sx);
  const perp = {x:-Math.sin(angle), y:Math.cos(angle)};
  const left  = {x: sx+perp.x*tailW/2, y: sy+perp.y*tailW/2};
  const right = {x: sx-perp.x*tailW/2, y: sy-perp.y*tailW/2};
  ctx.beginPath(); ctx.moveTo(left.x,left.y); ctx.lineTo(ex,ey); ctx.lineTo(right.x,right.y);
  ctx.closePath();
  ctx.fillStyle = bg;
  const _bgo = bgOpacity ?? 1; const _pga = ctx.globalAlpha;
  ctx.globalAlpha = _pga * _bgo; ctx.fill(); ctx.globalAlpha = _pga;
  if (bw > 0) { ctx.strokeStyle = border; ctx.lineWidth = bw; ctx.stroke(); }
  // Línea de cobertura en la base del triángulo
  const extra = 1 * (scale||1);
  const extL = {x:left.x +perp.x*extra, y:left.y +perp.y*extra};
  const extR = {x:right.x-perp.x*extra, y:right.y-perp.y*extra};
  ctx.beginPath(); ctx.moveTo(extL.x,extL.y); ctx.lineTo(extR.x,extR.y);
  ctx.strokeStyle = bg; ctx.lineWidth = bw*2+2*(scale||1); ctx.lineCap='round';
  ctx.globalAlpha = _pga * _bgo; ctx.stroke(); ctx.globalAlpha = _pga;
  ctx.lineCap='butt';
}

function _getLines(text) {
  // Idéntico al editor: solo divide por saltos de línea explícitos, sin wrap automático
  return String(text || '').split('\n');
}

// ── NAVEGACIÓN ────────────────────────────────────────────────
function _initTextStep(idx) {
  const p = RS.panels[idx];
  return ((p?.text_mode || 'sequential') === 'sequential' && (p?.texts || []).length > 0) ? 1 : 0;
}

function advance() {
  if (RS.fadeRaf) { cancelAnimationFrame(RS.fadeRaf); RS.fadeRaf = null; RS.fadeAlpha = 0; }
  const panel = RS.panels[RS.idx];
  const tl    = panel?.texts || [];
  const isSeq = (panel?.text_mode || 'sequential') === 'sequential';

  if (isSeq && RS.textStep < tl.length) {
    _startFade(); RS.textStep++; _render(); return;
  }
  if (RS.idx < RS.panels.length - 1) {
    RS.idx++; RS.textStep = _initTextStep(RS.idx); RS.fadeAlpha = 0;
    _resizeCanvas(); _render();
  }
}

function goBack() {
  if (RS.fadeRaf) { cancelAnimationFrame(RS.fadeRaf); RS.fadeRaf = null; RS.fadeAlpha = 0; }
  const panel = RS.panels[RS.idx];
  const isSeq = (panel?.text_mode || 'sequential') === 'sequential';

  if (isSeq && RS.textStep > 1) { RS.textStep--; RS.fadeAlpha = 0; _render(); return; }
  if (RS.idx > 0) {
    RS.idx--;
    const pp = RS.panels[RS.idx];
    RS.textStep  = (pp?.text_mode || 'sequential') === 'sequential' ? (pp?.texts || []).length : 0;
    RS.fadeAlpha = 0;
    _resizeCanvas(); _render();
  }
}

function _startFade() {
  if (RS.fadeRaf) { cancelAnimationFrame(RS.fadeRaf); RS.fadeRaf = null; }
  RS.fadeAlpha   = 1;
  const start    = performance.now();
  const duration = 400;
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    RS.fadeAlpha = 1 - t;
    _render();
    if (t < 1) RS.fadeRaf = requestAnimationFrame(step);
    else { RS.fadeRaf = null; RS.fadeAlpha = 0; _render(); }
  }
  RS.fadeRaf = requestAnimationFrame(step);
}

// ── PANTALLA FINAL DE CRÉDITOS ────────────────────────────────
// Se llama desde _render() cuando el panel actual es el de créditos.
// La posición del canvas ya la gestiona _resizeCanvas() normalmente.
function _showCredits() {
  // Si ya se mostró antes: renderizar directamente con alpha=1, sin fade ni parpadeo
  if (RS.creditsShown) {
    RS.creditsAlpha = 1;
    const { pw, ph } = _panelDims(RS.idx);
    _renderCredits(pw, ph);
    return;
  }
  // Evitar relanzar si ya está en curso
  if (RS.creditsTimer || RS.creditsAlpha > 0) return;
  RS.creditsAlpha = 0;

  // Dibujar inmediatamente solo la parte estática (autor + social) sin parpadeo
  // El logo/eslogan/enlace aparecerán con fade tras 1 segundo
  const { pw: pw0, ph: ph0 } = _panelDims(RS.idx);
  _renderCredits(pw0, ph0);

  // Tras 1 segundo, iniciar fade-in del resto
  RS.creditsTimer = setTimeout(() => {
    const start = performance.now();
    const dur   = 1200;
    function fadeStep(now) {
      RS.creditsAlpha = Math.min(1, (now - start) / dur);
      const { pw, ph } = _panelDims(RS.idx);
      _renderCredits(pw, ph);
      if (RS.creditsAlpha < 1) RS.fadeRaf = requestAnimationFrame(fadeStep);
      else { RS.fadeRaf = null; RS.creditsShown = true; }
    }
    RS.fadeRaf = requestAnimationFrame(fadeStep);
  }, 1000);
}

function _resetCredits() {
  if (RS.creditsTimer) { clearTimeout(RS.creditsTimer); RS.creditsTimer = null; }
  if (RS.fadeRaf)      { cancelAnimationFrame(RS.fadeRaf); RS.fadeRaf = null; }
  RS.creditsAlpha = 0;
  RS.isCredits    = false;
}

function _creditsClick() {
  if (RS.creditsTimer)  { clearTimeout(RS.creditsTimer);        RS.creditsTimer = null; }
  if (RS.fadeRaf)       { cancelAnimationFrame(RS.fadeRaf);     RS.fadeRaf = null; }
  RS.isCredits = false;
  RS.idx = 0; RS.textStep = _initTextStep(0); RS.fadeAlpha = 0;
  _resizeCanvas(); _render();
}

function _renderCredits(pw, ph) {
  const ctx   = RS.ctx;
  const alpha = RS.creditsAlpha || 0;
  ctx.clearRect(0, 0, pw, ph);

  // Fondo blanco limpio
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pw, ph);

  const isHoriz = pw > ph;
  const socialText = RS._workSocial || '';
  const authorText = RS._workAuthor || '';
  ctx.textBaseline = 'middle';

  // Función auxiliar: divide texto en líneas respetando \n explícitos y wrap por maxW.
  // Si una palabra sola supera maxW, se corta carácter a carácter.
  function wrapText(text, maxW) {
    const result = [];
    const paragraphs = text.split('\n');
    paragraphs.forEach(para => {
      if (!para.trim()) { result.push(''); return; }
      const words = para.split(' ');
      let cur = '';
      words.forEach(w => {
        // Si la palabra sola es más ancha que maxW, cortarla por caracteres
        if (ctx.measureText(w).width > maxW) {
          if (cur) { result.push(cur); cur = ''; }
          let chunk = '';
          for (const ch of w) {
            const test = chunk + ch;
            if (ctx.measureText(test).width > maxW && chunk) {
              result.push(chunk); chunk = ch;
            } else { chunk = test; }
          }
          if (chunk) {
            // intentar unir con lo que siga
            cur = chunk;
          }
          return;
        }
        const test = cur ? cur + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && cur) { result.push(cur); cur = w; }
        else cur = test;
      });
      if (cur) result.push(cur);
    });
    return result;
  }

  if (isHoriz) {
    // ── LAYOUT HORIZONTAL: dos columnas ──────────────────────
    // Columna izquierda (55%): social + autor
    // Columna derecha (45%): logo + eslogan + enlace (con fade)
    const fRef   = ph;  // base de escala = altura (dimensión corta)
    const colGap = pw * 0.04;
    const leftW  = pw * 0.52;
    const rightW = pw * 0.44;
    const leftX  = pw * 0.04;
    const rightCX = leftW + colGap + rightW / 2;
    const padV   = ph * 0.08;

    // Separador vertical central
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#888888';
    ctx.fillRect(leftW + colGap * 0.4, ph * 0.1, 1, ph * 0.8);
    ctx.globalAlpha = 1;

    // ── Columna izquierda: social + autor ──
    const socialFS   = Math.round(fRef * 0.055);
    const authorFS   = Math.round(fRef * 0.072);
    const socialMaxW = leftW - leftX - pw * 0.02;  // ancho disponible desde leftX hasta borde columna

    let socialLines = [];
    if (socialText) {
      ctx.font      = `400 ${socialFS}px Patrick Hand, sans-serif`;
      socialLines   = wrapText(socialText, socialMaxW);
    }
    const socialLineH  = socialFS * 1.5;
    const totalSocialH = socialLines.length * socialLineH;
    const blockH       = totalSocialH + (socialText ? socialFS * 1.2 : 0) + authorFS * 1.5;
    let y = (ph - blockH) / 2 + socialLineH * 0.5;

    if (socialText) {
      ctx.font      = `400 ${socialFS}px Patrick Hand, sans-serif`;
      ctx.fillStyle = '#444444';
      ctx.textAlign = 'left';
      socialLines.forEach(line => {
        ctx.fillText(line, leftX, y);
        y += socialLineH;
      });
      y += socialFS * 0.8;
    }

    // Nombre del autor — centrado en columna izquierda
    ctx.font      = `600 ${authorFS}px Patrick Hand, sans-serif`;
    ctx.fillStyle = '#222222';
    ctx.textAlign = 'center';
    ctx.fillText(authorText, leftX + leftW / 2, y);

    // ── Columna derecha: logo + eslogan + enlace (con fade) ──
    // Mismas proporciones que el layout vertical, ancladas desde el centro vertical
    ctx.globalAlpha = alpha;

    const logoFS   = Math.round(fRef * 0.11);
    const sloganFS = Math.round(fRef * 0.042);
    const linkFS   = Math.round(fRef * 0.038);
    const lineH    = ph * 0.09;
    // Bloque centrado verticalmente en la columna derecha
    const rightBlockH = lineH * 1.3 + logoFS + sloganFS * 2 + sloganFS * 3 + linkFS;
    const rightStartY = (ph - rightBlockH) / 2 + logoFS * 0.5;

    // Logo imagen (síncrono via data URL precargada)
    if(typeof _LOGO_DATA_URL !== 'undefined') {
      const _limg = new Image();
      _limg.src = _LOGO_DATA_URL;
      const _lh = logoFS * 1.1;
      const _lw = _limg.naturalWidth > 0 ? _limg.naturalWidth * (_lh / _limg.naturalHeight) : _lh * (191/42);
      ctx.drawImage(_limg, rightCX - _lw/2, rightStartY - _lh * 0.8, _lw, _lh);
    }

    const sloganY = rightStartY + sloganFS * 2;
    ctx.font      = `400 ${sloganFS}px Patrick Hand, sans-serif`;
    ctx.fillStyle = '#555555';
    ctx.fillText('Crea y Comparte', rightCX, sloganY);

    const linkY   = sloganY + sloganFS * 3;
    const linkText = 'Visita más obras del autor';
    ctx.font      = `400 ${linkFS}px Patrick Hand, sans-serif`;
    ctx.fillStyle = '#1a73e8';
    ctx.fillText(linkText, rightCX, linkY);
    const lw = ctx.measureText(linkText).width;
    ctx.beginPath();
    ctx.strokeStyle = '#1a73e8';
    ctx.lineWidth   = Math.max(1, linkFS * 0.06);
    ctx.moveTo(rightCX - lw/2, linkY + linkFS * 0.6);
    ctx.lineTo(rightCX + lw/2, linkY + linkFS * 0.6);
    ctx.stroke();

    // Botón "Volver a leer"
    const restartFS   = Math.round(fRef * 0.038);
    const restartY    = linkY + linkFS * 2.2;
    const restartText = '↩ Volver a leer';
    ctx.font      = `600 ${restartFS}px Patrick Hand, sans-serif`;
    ctx.fillStyle = '#888888';
    ctx.textAlign = 'center';
    ctx.fillText(restartText, rightCX, restartY);
    const rw = ctx.measureText(restartText).width;
    RS.creditsRestartArea = { x: rightCX - rw/2 - 10, y: restartY - restartFS, w: rw + 20, h: restartFS * 2.2 };

    ctx.globalAlpha = 1;
    RS.creditsLinkArea = { x: rightCX - lw/2, y: linkY - linkFS, w: lw, h: linkFS * 2 };

  } else {
    // ── LAYOUT VERTICAL: columna única ───────────────────────
    const fRef   = pw;
    const cx     = pw / 2;
    const marginX = pw * 0.09;
    const maxW    = pw * 0.82;

    // Social
    let authorY = ph * 0.11;
    if (socialText) {
      const socialFS    = Math.round(fRef * 0.038);
      ctx.font          = `400 ${socialFS}px Patrick Hand, sans-serif`;
      ctx.fillStyle     = '#444444';
      ctx.textAlign     = 'left';
      const socialLines = wrapText(socialText, maxW);
      const socialLineH = socialFS * 1.4;
      const socialStartY = ph * 0.26;
      socialLines.forEach((line, i) => ctx.fillText(line, marginX, socialStartY + i * socialLineH));
      authorY = socialStartY + socialLines.length * socialLineH + socialFS * 0.9;
    }

    // Autor
    ctx.font      = `600 ${Math.round(fRef * 0.055)}px Patrick Hand, sans-serif`;
    ctx.fillStyle = '#222222';
    ctx.textAlign = 'center';
    ctx.fillText(authorText, cx, authorY);

    // Resto con fade
    ctx.globalAlpha = alpha;

    const lineH    = ph * 0.09;
    const logoFS   = Math.round(fRef * 0.11);
    const logoY    = authorY + lineH * 1.3;
    // Logo imagen (síncrono via data URL precargada)
    if(typeof _LOGO_DATA_URL !== 'undefined') {
      const _limg2 = new Image();
      _limg2.src = _LOGO_DATA_URL;
      const _lh2 = logoFS * 1.1;
      const _lw2 = _limg2.naturalWidth > 0 ? _limg2.naturalWidth * (_lh2 / _limg2.naturalHeight) : _lh2 * (191/42);
      ctx.drawImage(_limg2, cx - _lw2/2, logoY - _lh2 * 0.8, _lw2, _lh2);
    }

    const sloganFS = Math.round(fRef * 0.042);
    const sloganY  = logoY + sloganFS * 2;
    ctx.font      = `400 ${sloganFS}px Patrick Hand, sans-serif`;
    ctx.fillStyle = '#555555';
    ctx.fillText('Crea y Comparte', cx, sloganY);

    const linkFS   = Math.round(fRef * 0.038);
    const linkY    = sloganY + sloganFS * 3;
    const linkText = 'Visita más obras del autor';
    ctx.font      = `400 ${linkFS}px Patrick Hand, sans-serif`;
    ctx.fillStyle = '#1a73e8';
    ctx.fillText(linkText, cx, linkY);
    const lw = ctx.measureText(linkText).width;
    ctx.beginPath();
    ctx.strokeStyle = '#1a73e8';
    ctx.lineWidth   = Math.max(1, linkFS * 0.06);
    ctx.moveTo(cx - lw/2, linkY + linkFS * 0.6);
    ctx.lineTo(cx + lw/2, linkY + linkFS * 0.6);
    ctx.stroke();

    // Botón "Volver a leer"
    const restartFS   = Math.round(fRef * 0.038);
    const restartY    = linkY + linkFS * 2.2;
    const restartText = '↩ Volver a leer';
    ctx.font      = `600 ${restartFS}px Patrick Hand, sans-serif`;
    ctx.fillStyle = '#888888';
    ctx.textAlign = 'center';
    ctx.fillText(restartText, cx, restartY);
    const rw = ctx.measureText(restartText).width;
    RS.creditsRestartArea = { x: cx - rw/2 - 10, y: restartY - restartFS, w: rw + 20, h: restartFS * 2.2 };

    ctx.globalAlpha = 1;
    RS.creditsLinkArea = { x: cx - lw/2, y: linkY - linkFS, w: lw, h: linkFS * 2 };
  }
}


// ── CONTROLES ─────────────────────────────────────────────────
function _updateCounter() { /* sin pastilla — no se muestra */ }

function _showControls() { /* botones de esquina siempre visibles */ }

// El navegador transforma las coordenadas táctiles al sistema del usuario.
// "Izquierda del usuario" es siempre endX < W/2, independientemente del ángulo.
function _isBackSide(endX, endY) {
  return endX < window.innerWidth / 2;
}

function _setupControls() {
  // closeBtn y fullscreenToggle configurados en DOMContentLoaded

  // Teclado PC
  RS.keyHandler = e => {
    if (['ArrowRight','ArrowDown','Space','Enter'].includes(e.code)) { e.preventDefault(); advance(); }
    if (['ArrowLeft','ArrowUp'].includes(e.code))                    { e.preventDefault(); goBack(); }
    if (e.key === 'Escape') {
      if (RS.isEmbed) { try { window.parent.postMessage({ type: 'reader:close' }, '*'); } catch(_) {} }
      else _doClose();
    }
  };
  document.addEventListener('keydown', RS.keyHandler);

  // Click ratón en canvas: en créditos detecta enlace
  RS.canvas.addEventListener('click', e => {
    if (RS.isCredits) { _handleCreditsClick(e.clientX, e.clientY); }
  });

  // Swipe táctil con AbortController
  RS.ac = new AbortController();
  const sig = { signal: RS.ac.signal };
  let sx = null, sy = null, cancelled = false;

  RS.canvas.addEventListener('touchstart', e => {
    sx = null; sy = null; cancelled = false;
    if (e.touches.length !== 1) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true, ...sig });

  RS.canvas.addEventListener('touchmove', e => {
    if (sx === null) return;
    const dy = e.touches[0].clientY - sy;
    if (Math.abs(dy) > 20) cancelled = true;
  }, { passive: true, ...sig });

  RS.canvas.addEventListener('touchend', e => {
    if (sx === null || cancelled) { sx = null; return; }
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const dy   = Math.abs(endY - sy);
    sx = null;
    if (dy > 40) return;
    // En créditos: lado retroceder → goBack, lado avanzar → detecta enlace/botón
    if (RS.isCredits) {
      if (_isBackSide(endX, endY)) goBack();
      else _handleCreditsClick(endX, endY);
      return;
    }
    // Navegación normal
    if (_isBackSide(endX, endY)) goBack(); else advance();
  }, { passive: true, ...sig });
}

// ── UI HELPERS ────────────────────────────────────────────────
function _readerToast(msg, duration) {
  let el = document.getElementById('readerToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'readerToast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.remove('rt-hide');
  el.classList.add('rt-show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.classList.remove('rt-show');
    el.classList.add('rt-hide');
  }, duration || 2500);
}


function _handleCreditsClick(clientX, clientY) {
  // Convertir coordenadas de pantalla a coordenadas del canvas lógico
  const rect   = RS.canvas.getBoundingClientRect();
  const scaleX = RS.canvas.width  / rect.width;
  const scaleY = RS.canvas.height / rect.height;
  const cx = (clientX - rect.left) * scaleX;
  const cy = (clientY - rect.top)  * scaleY;

  const la = RS.creditsLinkArea;
  if (la && cx >= la.x && cx <= la.x + la.w && cy >= la.y && cy <= la.y + la.h) {
    window.open('https://sargentopez.github.io/ComiXou/index.html', '_blank');
    return;
  }
  const ra = RS.creditsRestartArea;
  if (ra && cx >= ra.x && cx <= ra.x + ra.w && cy >= ra.y && cy <= ra.y + ra.h) {
    _creditsClick(); // Volver a leer → reinicia desde la primera hoja
  }
  // Tap fuera de ambas zonas → no hacer nada
}


function setLoadingMsg(msg) { const el = document.getElementById('loadingMsg'); if (el) el.textContent = msg; }
function setLoadingProgress(pct, label) {
  const bar = document.getElementById('loadingBar');
  const lbl = document.getElementById('loadingLabel');
  if (bar) bar.style.width = Math.round(Math.min(100, Math.max(0, pct))) + '%';
  if (lbl) lbl.textContent = label || '';
}

function _updateOGMeta(title, author) {
  const t = (title || 'ComiXow') + ' — ComiXow';
  const d = author ? `Una obra de ${author} en ComiXow` : 'Abre esta obra en el reproductor de ComiXow';
  document.title = t;
  document.querySelector('meta[property="og:title"]')      ?.setAttribute('content', t);
  document.querySelector('meta[property="og:description"]')?.setAttribute('content', d);
  document.querySelector('meta[name="twitter:title"]')     ?.setAttribute('content', t);
  document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', d);
}
function showError(msg) {
  document.getElementById('loadingScreen').classList.add('hidden');
  document.getElementById('errorScreen').classList.remove('hidden');
  const el = document.getElementById('errorMsg');
  if (el) el.textContent = msg;
}

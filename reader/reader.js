/* Comxow/COMXOW, creada por A. Gavina Costero  2026, contacto@comxow.com */
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
 *
 * - Trix (editor de texto enriquecido)
 *     Autor: 37signals, LLC (Basecamp) — Javan Makhmali y Sam Stephenson
 *     Licencia: MIT
 *     https://trix-editor.org/  ·  https://github.com/basecamp/trix
 */
/* ============================================================
   ComXow Reader — Reproductor externo standalone
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

/* ── ApngDecoder reader ── */
window.ApngDecoder = (function(){
  function decodeFrameArray(dataUrls, delay) {
    if (!dataUrls || !dataUrls.length) return Promise.reject(new Error('sin frames'));
    var results = [], W = 0, H = 0;
    var _delayFor = function(i) { return Array.isArray(delay) ? (delay[i] || 100) : (delay || 100); };
    function loadOne(i) {
      if (i >= dataUrls.length) return Promise.resolve({frames:results,width:W,height:H});
      return new Promise(function(res) {
        var img = new Image();
        img.onload = function() {
          if (!W) { W=img.naturalWidth; H=img.naturalHeight; }
          var oc=document.createElement('canvas'); oc.width=W; oc.height=H;
          oc.getContext('2d').drawImage(img,0,0);
          results[i]={imageData:oc.getContext('2d').getImageData(0,0,W,H),delay:_delayFor(i)};
          res();
        };
        img.onerror=function(){
          results[i]={imageData:new ImageData(W||1,H||1),delay:_delayFor(i)};
          res();
        };
        img.src=dataUrls[i];
      }).then(function(){return loadOne(i+1);});
    }
    return loadOne(0);
  }
  function decodeApng(dataUrl,delay){
    return new Promise(function(res,rej){
      try{
        var b64=dataUrl.split(',')[1],bin=atob(b64),u8=new Uint8Array(bin.length);
        for(var i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);
        var decoded=UPNG.decode(u8.buffer),rgba8=UPNG.toRGBA8(decoded);
        if(!rgba8||!rgba8.length){rej(new Error('UPNG sin frames'));return;}
        var W=decoded.width,H=decoded.height;
        var oc=document.createElement('canvas');oc.width=W;oc.height=H;
        var ox=oc.getContext('2d');
        var frames=rgba8.map(function(buf,fi){
          var imgd=new ImageData(new Uint8ClampedArray(buf),W,H);
          ox.clearRect(0,0,W,H);ox.putImageData(imgd,0,0);
          var fd=(decoded.frames&&decoded.frames[fi]&&decoded.frames[fi].delay)||delay||100;
          return{imageData:ox.getImageData(0,0,W,H),delay:Math.round(fd)};
        });
        res({frames:frames,width:W,height:H});
      }catch(e){rej(e);}
    });
  }
  function decode(input,delay){
    if(Array.isArray(input))return decodeFrameArray(input,delay);
    if(typeof UPNG!=='undefined'){
      return decodeApng(input,delay).catch(function(){return decodeFrameArray([input],delay);});
    }
    return decodeFrameArray([input],delay);
  }
  return{decode:decode,decodeFrameArray:decodeFrameArray,decodeApng:decodeApng};
})();
/* ── fin ApngDecoder reader ── */

const SUPABASE_URL = 'https://qqgsbyylaugsagbxsetc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_1bB9Y8TtvFjhP49kwLpZmA_nTVsE2Hd';

// Dimensiones del canvas — IDÉNTICAS al editor para render 1:1
// El escalado para ocupar la pantalla lo hace CSS (canvas.style.width/height)
const ED_PAGE_W = 360;
const ED_PAGE_H = 780;
// El workspace del editor es 5×ancho × 3×alto del panel vertical
// Necesario para reproducir el tamaño de las burbujas de cola "thought"
const ED_CANVAS_MIN = Math.min(ED_PAGE_W * 5, ED_PAGE_H * 3); // 1800
const ED_CANVAS_W = ED_PAGE_W * 5; // 1800 - workspace completo
const ED_CANVAS_H = ED_PAGE_H * 3; // 2340 - workspace completo

// ── ESTADO ──────────────────────────────────────────────────
// Imagen del logo — se precarga completamente en preloadImages() antes de mostrar créditos
let _logoImg = null;
// Icono estático (sin animar) — misma hoja de créditos, junto al logo
let _iconImg = null;
// Caché de imágenes insertadas en el flujo de texto (hoja de texto paginada,
// ver richLines/_tdInsertImage/_tdInsertFromBib en editor-textdoc.js) —
// misma idea que _tdImgCache en editor.js: caché GLOBAL por src (data URL),
// porque el mismo objeto de biblioteca puede insertarse varias veces en un
// mismo documento. A diferencia de editor.js (carga perezosa + redibujado al
// cargar), aquí se precarga entera en preloadImages() antes de renderizar,
// igual que el resto de imágenes de capas — así _drawRichTextLines() nunca
// dibuja a medias ni necesita su propio bucle de redibujado.
const _tdImgCache = Object.create(null);

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
  navMode:      'fixed', // 'fixed' | 'horizontal' | 'vertical'
};

// ── ZOOM DEL CONTENIDO (pedido explícito de Alberto) ───────────────────────
// Amplía visualmente la hoja actual sin volver a renderizarla a mayor
// resolución — igual que el pinch-zoom nativo del navegador haría con una
// imagen: se aplica un transform CSS (translate + scale) sobre el <canvas>
// activo. Android: pellizco con dos dedos + arrastre de un dedo cuando ya
// hay zoom. PC: Ctrl+rueda hacia el cursor, igual que edZoomAt() en el
// editor — misma fórmula, adaptada de "cámara de todo el lienzo" a
// "transform de un elemento".
//
// Nunca debe impedir pasar de hoja: los taps en los bordes/botones siguen
// resolviéndose exactamente igual que siempre (ver _rGoToPanel/advance/
// goBack, sin tocar), y un arrastre de un dedo solo se interpreta como
// paneo cuando YA hay zoom aplicado — si no, sigue siendo un swipe de
// navegación como hasta ahora. El retardo de 120ms antes de "armar" el
// paneo en vivo es el mismo criterio que usa el editor (ver edPinchStart/
// _edMpTouchTimer) para no reaccionar al primer dedo hasta estar razonablemente
// seguros de que no va a llegar un segundo (pellizco).
//
// Nunca persiste entre hojas: RZ se resetea siempre que cambia la hoja
// visible (modo fixed: dentro de _resizeCanvas, que TODA navegación llama
// antes de redibujar; modo scroll: en el detector de scroll, al abandonar
// el canvas anterior) — así la hoja siguiente nunca aparece ya ampliada, y
// si se vuelve a visitar una hoja ya vista aparece de nuevo a tamaño normal.
const RZ = { scale: 1, tx: 0, ty: 0, MIN: 1, MAX: 4 };
const RZ_TOUCH_DELAY_MS = 120; // mismo retardo que usa el editor para pinch vs dibujo

function _rzApply(canvas) {
  if (!canvas) return;
  canvas.style.transform = (RZ.scale === 1 && RZ.tx === 0 && RZ.ty === 0)
    ? ''
    : `translate(${RZ.tx}px, ${RZ.ty}px) scale(${RZ.scale})`;
}

function _rzReset(canvas) {
  RZ.scale = 1; RZ.tx = 0; RZ.ty = 0;
  if (canvas) canvas.style.transform = '';
}

// Recuadro ORIGINAL (sin el transform actual) del canvas, en coordenadas de
// pantalla — se obtiene invirtiendo el transform que nosotros mismos hemos
// aplicado. Válido sea cual sea la estructura del DOM (fixed o scroll),
// porque no depende de offsetParent ni de ningún otro supuesto de layout.
function _rzOrigRect(canvas) {
  if (!canvas) return { left: 0, top: 0, width: 0, height: 0 };
  const r = canvas.getBoundingClientRect();
  return {
    left:   r.left - RZ.tx,
    top:    r.top  - RZ.ty,
    width:  r.width  / RZ.scale,
    height: r.height / RZ.scale,
  };
}

// Limita tx/ty para que el canvas ampliado siga cubriendo por completo su
// propio recuadro original — igual que cualquier visor de imágenes: nunca
// se puede arrastrar tan lejos que aparezca hueco vacío donde debería
// seguir habiendo contenido.
function _rzClamp(orig) {
  const minTx = orig.width  * (1 - RZ.scale);
  const minTy = orig.height * (1 - RZ.scale);
  RZ.tx = Math.min(0, Math.max(minTx, RZ.tx));
  RZ.ty = Math.min(0, Math.max(minTy, RZ.ty));
}

// Zoom manteniendo fijo el punto de pantalla (clientX,clientY) — misma
// fórmula que edZoomAt() en el editor, adaptada al recuadro ORIGINAL del
// canvas (que puede no empezar en 0,0 de la ventana, a diferencia del
// lienzo del editor).
function _rzZoomAt(canvas, clientX, clientY, factor) {
  const orig = _rzOrigRect(canvas);
  const sx = clientX - orig.left, sy = clientY - orig.top;
  const newScale = Math.min(RZ.MAX, Math.max(RZ.MIN, RZ.scale * factor));
  const fReal = newScale / RZ.scale;
  RZ.tx = sx - (sx - RZ.tx) * fReal;
  RZ.ty = sy - (sy - RZ.ty) * fReal;
  RZ.scale = newScale;
  if (RZ.scale === RZ.MIN) { RZ.tx = 0; RZ.ty = 0; } // exactamente en 1x: nunca queda deriva residual
  _rzClamp(orig);
  _rzApply(canvas);
}

// ── Pellizco de 2 dedos — estado compartido por los dos modos (fixed/scroll) ──
let _rzPinch = null; // { canvas, dist0, ctr0:{x,y}, scale0, tx0, ty0, orig }
function _rzPinchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}
function _rzPinchCenter(touches) {
  return { x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 };
}
function _rzPinchStart(canvas, touches) {
  if (!canvas) { _rzPinch = null; return; }
  _rzPinch = {
    canvas,
    dist0:  Math.max(1, _rzPinchDist(touches)),
    ctr0:   _rzPinchCenter(touches),
    scale0: RZ.scale, tx0: RZ.tx, ty0: RZ.ty,
    orig:   _rzOrigRect(canvas),
  };
}
function _rzPinchMove(touches) {
  if (!_rzPinch) return;
  const p = _rzPinch;
  const ratio = _rzPinchDist(touches) / p.dist0;
  const ctr   = _rzPinchCenter(touches);
  const newScale = Math.min(RZ.MAX, Math.max(RZ.MIN, p.scale0 * ratio));
  const sx0 = p.ctr0.x - p.orig.left, sy0 = p.ctr0.y - p.orig.top;
  RZ.tx = (ctr.x - p.orig.left) - newScale * (sx0 - p.tx0) / p.scale0;
  RZ.ty = (ctr.y - p.orig.top)  - newScale * (sy0 - p.ty0) / p.scale0;
  RZ.scale = newScale;
  _rzClamp(p.orig);
  _rzApply(p.canvas);
}
function _rzPinchEnd() { _rzPinch = null; }

// ── Ctrl+rueda (PC) — estándar del resto de la web, hacia el cursor ──────
function _rzWheelZoom(e, canvas) {
  if (!canvas) return false;
  if (!(e.ctrlKey || e.metaKey)) return false;
  e.preventDefault();
  const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15;
  _rzZoomAt(canvas, e.clientX, e.clientY, factor);
  return true;
}

// ── ARRANQUE ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  const params = new URLSearchParams(window.location.search);
  const id     = params.get('id');
  const draft  = params.get('draft');   // token de borrador (obra no publicada)
  const wantsFs = params.get('fs') === '1'; // heredar fullscreen de la app

  // Modo embed: incrustado en iframe desde admin/expositor
  RS.isEmbed = params.get('embed') === '1' || window.self !== window.top;

  // Cerrar SIEMPRE intenta volver en el historial de ESTA pestaña/ventana y,
  // si no hay nada a lo que volver, cerrarla — nunca navegar de vuelta a la
  // app. NUEVO (pedido explícito de Alberto): el lector se abre ahora en
  // una pestaña nueva (ver home.js/my-works.js/admin.js — window.open), así
  // que la app nunca se abandona al leer una obra; cerrar el lector debe
  // cerrar SOLO esa pestaña, no "volver" a ningún sitio de la app (que ni
  // se ha movido de donde estaba).
  //
  // Antes esto navegaba con window.location.href = base + '#my-works'
  // siempre que se abría "desde dentro de la app" (parámetro from=app, ya
  // retirado) — además de forzar una recarga completa de index.html cada
  // vez (repetía la animación de bienvenida, otro bug ya corregido antes),
  // volvía SIEMPRE a "my-works" aunque la obra se hubiera abierto desde
  // "index".
  //
  // Con pestaña nueva como vía principal, esta misma lógica (antes solo
  // para "acceso externo por enlace compartido") ya vale también para el
  // caso, más raro, de que el navegador bloquee window.open y la app tenga
  // que recurrir a navegar en la MISMA pestaña como último recurso (ver
  // _openReaderTab en utils.js): si eso pasa, history.length será > 1 (la
  // app queda justo antes en el historial de esa pestaña) y "atrás" vuelve
  // exactamente a la vista de la que se vino, fuera index o my-works — sin
  // necesitar distinguir el origen a mano.
  const _doClose = () => {
    if (history.length > 1) { history.back(); return; }
    window.close();
    setTimeout(() => {
      _readerToast(I18n.t('reader_closeTabHint'), 4000);
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
        // No añadimos 'click' — consumiría el primer tap en los créditos
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

  // Archivo standalone (descargado para distribuir fuera de la app, ver
  // _buildStandaloneBundle): la obra viene incrustada en la propia página,
  // sin id ni token — no hace falta ni hay red de por medio.
  if (window.__EMBEDDED_WORK__) {
    _startFromOfflineSnapshot(window.__EMBEDDED_WORK__, { standalone: true });
    return;
  }

  if (draft) { loadDraft(draft); return; }
  if (id)    { loadWork(id);     return; }
  showError(I18n.t('reader_errorNoWorkId'));
});

function _toggleFullscreen() {
  if (RS.isEmbed) return;
  // Usar el mismo módulo Fullscreen que el editor de ComXow
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
  setLoadingMsg(I18n.t('reader_loadingWork'));
  try {
    const work = await sbGet('works?id=eq.' + workId + '&published=eq.true');
    if (!work || !work.length) { showError(I18n.t('reader_errorWorkNotFound')); return; }

    setLoadingMsg(I18n.t('reader_loadingPages'));
    await _loadPanels(workId);
    document.title = (work[0].title || I18n.t('reader_defaultWorkTitle')) + ' — ComXow';
    RS._workId     = workId;
    RS._workAuthor = work[0].author_name || "";
    RS._workSocial = work[0].social      || "";
    RS._workTitle  = work[0].title       || '';
    RS.navMode     = work[0].nav_mode    || 'fixed';
    // Copia "limpia" de los paneles tal como quedan justo aquí — sin el
    // estado de ejecución (frames decodificados, canvases offscreen, etc.)
    // que preloadImages() añade a continuación. Es la base de la que parte
    // la descarga para lectura offline (ver _buildOfflineSnapshot) — así no
    // hay que filtrar campos de ejecución de un objeto ya mutado, ni
    // mantener una lista de qué excluir cada vez que algo nuevo se añada
    // al pipeline de precarga.
    RS._sourcePanels = JSON.parse(JSON.stringify(RS.panels));
    // Actualizar meta OG con datos reales de la obra
    _updateOGMeta(work[0].title, work[0].author_name, work[0].cover_url);
    // Añadir hoja de créditos como último panel — se trata como hoja normal
    const _lastPanel = RS.panels[RS.panels.length - 1];
    RS.panels.push({ id: 'credits', isCredits: true, orientation: _lastPanel?.orientation || 'v', layers: [], texts: [] });
    setLoadingMsg(I18n.t('reader_preparingImages'));
    await preloadImages();
    startReader();

  } catch(err) {
    console.error('Error:', err);
    // Sin red (o Supabase inalcanzable): comprobar si hay una copia
    // descargada para lectura offline de esta misma obra antes de rendirse.
    try {
      const _offline = await _offlineLoad(workId);
      if (_offline) { await _startFromOfflineSnapshot(_offline); return; }
    } catch(_e) {}
    showError(I18n.t('reader_errorConnection'));
  }
}

// ── CARGA BORRADOR (obra no publicada, acceso por token) ─────
async function loadDraft(token) {
  setLoadingMsg(I18n.t('reader_loadingDraft'));
  try {
    // Intento 1: acceso público por UUID (funciona cuando la RLS lo permite para todos)
    let work = null;
    let useAuth = false;
    try { work = await sbGet('works?id=eq.' + token); } catch(_) {}

    // Intento 2: con JWT del autor autenticado en este navegador (fallback)
    if (!work || !work.length) {
      try { work = await sbGetAuth('works?id=eq.' + token); useAuth = !!work?.length; } catch(_) {}
    }

    if (!work || !work.length) {
      showError(I18n.t('reader_errorDraftNotAvailable'));
      return;
    }

    setLoadingMsg(I18n.t('reader_loadingPages'));
    await _loadPanels(token, useAuth);
    document.title = (work[0].title || I18n.t('reader_defaultDraftTitle')) + ' — ComXow';
    RS._workId     = token;
    RS._workAuthor = work[0].author_name || '';
    RS._workSocial = work[0].social      || '';
    RS._workTitle  = work[0].title       || '';
    RS.navMode     = work[0].nav_mode    || 'fixed';
    // Copia limpia para descarga/exportación offline — ver el mismo criterio
    // en loadWork(). Alberto: los borradores también deben poder descargarse
    // (un autor puede querer probar la distribución antes de publicar).
    RS._sourcePanels = JSON.parse(JSON.stringify(RS.panels));
    _updateOGMeta(work[0].title, work[0].author_name, work[0].cover_url);
    const _lastPanel = RS.panels[RS.panels.length - 1];
    RS.panels.push({ id: 'credits', isCredits: true, orientation: _lastPanel?.orientation || 'v', layers: [], texts: [] });
    setLoadingMsg(I18n.t('reader_preparingImages'));
    await preloadImages();
    startReader();
  } catch(err) {
    console.error('Error loadDraft:', err);
    try {
      const _offline = await _offlineLoad(token);
      if (_offline) { await _startFromOfflineSnapshot(_offline); return; }
    } catch(_e) {}
    showError(I18n.t('reader_errorLoadingDraft'));
  }
}

// ── DESCARGA PARA LECTURA OFFLINE ─────────────────────────────
// Guarda en el propio dispositivo, en IndexedDB, todo lo que el LECTOR
// necesita para mostrar la obra sin red — no una copia editable del
// proyecto (eso vive aparte, en el almacenamiento del editor/WorkStore,
// dentro de la app principal): solo lo que ya se descarga hoy para leer
// (paneles, capas, textos, imágenes de fondo/animaciones ya resueltas a
// data URL) más los metadatos mínimos (título, autor, red social, modo de
// navegación). Base de datos separada de las del editor (cxAutosave,
// cxAnims, cxBiblioteca) — el lector es un contexto de solo lectura.
const _OFFLINE_DB   = 'cxReaderOffline';
const _OFFLINE_STORE = 'works';

function _offlineDbOpen() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(_OFFLINE_DB, 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(_OFFLINE_STORE)) db.createObjectStore(_OFFLINE_STORE);
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = () => reject(req.error);
    } catch(e) { reject(e); }
  });
}

async function _offlineSave(workId, snapshot) {
  const db = await _offlineDbOpen();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(_OFFLINE_STORE, 'readwrite');
      tx.objectStore(_OFFLINE_STORE).put(snapshot, workId);
      tx.oncomplete = () => resolve(true);
      tx.onerror    = () => reject(tx.error);
    } catch(e) { reject(e); }
  });
}

async function _offlineLoad(workId) {
  try {
    const db = await _offlineDbOpen();
    return await new Promise(resolve => {
      const tx  = db.transaction(_OFFLINE_STORE, 'readonly');
      const req = tx.objectStore(_OFFLINE_STORE).get(workId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = () => resolve(null);
    });
  } catch(e) { return null; }
}

async function _offlineDelete(workId) {
  try {
    const db = await _offlineDbOpen();
    return await new Promise(resolve => {
      const tx = db.transaction(_OFFLINE_STORE, 'readwrite');
      tx.objectStore(_OFFLINE_STORE).delete(workId);
      tx.oncomplete = () => resolve(true);
      tx.onerror    = () => resolve(false);
    });
  } catch(e) { return false; }
}

// Construye la instantánea a partir de RS._sourcePanels (copia limpia,
// tomada justo tras _loadPanels — ver loadWork). Lo único que en ese punto
// todavía es una URL de red sin resolver es el GIF importado (layer._gifUrl,
// bucket 'anims') — las imágenes estáticas ya vienen como data URL embebida
// en layer_data, y el APNG animado ya se resolvió a _apngSrc durante
// _loadPanels. Se descarga aquí, una sola vez, específicamente para la
// instantánea (evita depender del estado ya decodificado en RS.panels, que
// mezclaría campos de ejecución difíciles de enumerar por completo).
async function _buildOfflineSnapshot() {
  if (!RS._sourcePanels) return null;
  const panels = await Promise.all(RS._sourcePanels.map(async panel => {
    const layers = await Promise.all((panel.layers || []).map(async layer => {
      if (layer.type === 'gif' && layer._gifUrl) {
        try {
          const r = await fetch(layer._gifUrl, { cache: 'no-store' });
          if (r.ok) {
            const blob = await r.blob();
            layer._gifUrl = await new Promise(res => {
              const fr = new FileReader();
              fr.onload  = e => res(e.target.result);
              fr.onerror = () => res(layer._gifUrl); // si falla, dejar la URL original
              fr.readAsDataURL(blob);
            });
          }
        } catch(_) {} // sin red para este GIF concreto: se queda con la URL — se reintentará en la próxima descarga
      }
      return layer;
    }));
    return { ...panel, layers };
  }));
  return {
    workId:  RS._workId,
    title:   RS._workTitle  || '',
    author:  RS._workAuthor || '',
    social:  RS._workSocial || '',
    navMode: RS.navMode     || 'fixed',
    panels,
    savedAt: new Date().toISOString(),
  };
}

// Arranca el lector a partir de una instantánea guardada (sin red). Reusa
// preloadImages() tal cual: layer._gifUrl con un data: URL en vez de una
// URL http funciona igual con fetch() (los data: URL están soportados de
// forma nativa), así que no hace falta ninguna rama de código aparte para
// decodificar GIF/APNG sin conexión.
//
// opts.standalone: true cuando se arranca desde un archivo HTML autónomo
// exportado con _buildStandaloneBundle (obra + lector + fuentes incrustados
// en un único archivo para distribuir fuera de la app) — a diferencia del
// repliegue automático de loadWork() al fallar la red, aquí NO hay ningún
// workId de la app al que asociar un futuro "volver a exportar", así que el
// botón de descarga (inferior derecha) se mantiene oculto.
async function _startFromOfflineSnapshot(snapshot, opts) {
  const standalone = !!(opts && opts.standalone);
  setLoadingMsg(standalone ? I18n.t('reader_loadingWork') : I18n.t('reader_loadingOfflineCopy'));
  RS._workId     = snapshot.workId;
  RS._workAuthor = snapshot.author  || '';
  RS._workSocial = snapshot.social  || '';
  RS._workTitle  = snapshot.title   || '';
  RS.navMode     = snapshot.navMode || 'fixed';
  document.title = (snapshot.title || I18n.t('reader_defaultWorkTitle')) + ' — ComXow';
  // Clonar antes de usar — RS._sourcePanels debe quedar limpio para que una
  // futura re-descarga desde esta misma copia offline no arrastre estado.
  RS.panels        = JSON.parse(JSON.stringify(snapshot.panels));
  RS._sourcePanels = JSON.parse(JSON.stringify(snapshot.panels));
  const _lastPanel = RS.panels[RS.panels.length - 1];
  RS.panels.push({ id: 'credits', isCredits: true, orientation: _lastPanel?.orientation || 'v', layers: [], texts: [] });
  setLoadingMsg(I18n.t('reader_preparingImages'));
  await preloadImages();
  // Fijar ANTES de startReader(): esa función ya llama a _setupOfflineBtn()
  // internamente, que se apoya en esta bandera para mantener oculto el
  // botón de descarga (ni hay red que usar en un repliegue offline, ni
  // tiene sentido "volver a exportar" desde dentro de un archivo standalone).
  RS._isOfflineSession = true;
  startReader();
  if (!standalone) _readerToast(I18n.t('reader_viewingOfflineCopy'), 3500);
}

// ── CARGA PANELES + CAPAS + TEXTOS ────────────────────────────
// Rellena RS.panels con capas del editor (panel_layers) y textos (panel_texts).
// panel_layers → render fiel por capas (imagen, draw, stroke, bubble, text)
// panel_texts  → lógica sequential (text_order, text_mode, contador)

// ── Descompresión gzip de layer_data (CompressionStream W3C nativo) ──
const _CZ_PFX = 'gz:';

// Descarga frames PNG desde bucket 'anims'
async function _animDownload(animUrl) {
  if (!animUrl) return null;
  // cache:'no-store' — el lector se comparte por enlace y lo puede abrir
  // cualquiera; si el navegador sirviera una copia cacheada de una
  // animación ya editada, quien lea la obra vería la versión antigua.
  const r = await fetch(animUrl, { cache: 'no-store' });
  if (!r.ok) return null;
  const blob = await r.blob();
  return new Promise(res => {
    const fr = new FileReader();
    fr.onload  = e => res(e.target.result);
    fr.onerror = () => res(null);
    fr.readAsDataURL(blob);
  });
}

async function _czDecompress(str) {
  if (!str || !str.startsWith(_CZ_PFX)) return str;
  const b64 = str.slice(_CZ_PFX.length);
  // Intentar atob completo primero; si falla (base64 corrupto), chunk a chunk
  let bytes = null;
  try {
    const rem0 = b64.length % 4;
    const bin0 = atob(rem0 ? b64 + '===='.slice(rem0) : b64);
    bytes = new Uint8Array(bin0.length);
    for (let j = 0; j < bin0.length; j++) bytes[j] = bin0.charCodeAt(j);
  } catch(e) {
    const parts = []; let byteLen = 0;
    for (let i = 0; i < b64.length; i += 4) {
      const slice = b64.slice(i, i + 4);
      if (slice.length < 4) continue;
      try {
        const bin = atob(slice);
        const part = new Uint8Array(bin.length);
        for (let j = 0; j < bin.length; j++) part[j] = bin.charCodeAt(j);
        parts.push(part); byteLen += part.length;
      } catch(e2) { continue; }
    }
    if (!byteLen) return str;
    bytes = new Uint8Array(byteLen);
    let off2 = 0;
    for (const p of parts) { bytes.set(p, off2); off2 += p.length; }
  }
  // Pako primero — más fiable en Android WebView
  if (typeof pako !== 'undefined') {
    try {
      const result = new TextDecoder().decode(pako.inflate(bytes));
      if (result && result.length > 0) return result;
    } catch(e) {}
  }
  if (typeof DecompressionStream === 'undefined') return str;
  try {
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

async function _loadPanels(workId, useAuth) {
  const _sbFetch = useAuth ? sbGetAuth : sbGet;
  const panels = await _sbFetch('panels?work_id=eq.' + workId + '&order=panel_order.asc');
  if (!panels || !panels.length) { showError(I18n.t('reader_errorNoPages')); return; }

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
          if (l.type === 'image' && r.anim_url) {
            try {
              const _apngDl = await _animDownload(r.anim_url);
              if (_apngDl) l._apngSrc = _apngDl;
            } catch(e) {}
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

  // Precargar el logo aquí, garantizando que complete=true antes de mostrar créditos
  if (typeof _LOGO_DATA_URL !== 'undefined') {
    await new Promise(resolve => {
      const img = new Image();
      img.onload  = () => { _logoImg = img; resolve(); };
      img.onerror = () => resolve(); // no bloquear si falla
      img.src = _LOGO_DATA_URL;
    });
  }
  // Precargar el icono estático (misma hoja de créditos, junto al logo)
  if (typeof _ICON_DATA_URL !== 'undefined') {
    await new Promise(resolve => {
      const img = new Image();
      img.onload  = () => { _iconImg = img; resolve(); };
      img.onerror = () => resolve();
      img.src = _ICON_DATA_URL;
    });
  }

  // Contar hojas con contenido real (excluir créditos y hojas sin capas)
  const totalPanels = RS.panels.filter(p => !p.isCredits && (p.layers||[]).length > 0).length;
  let loadedPanels = 0;
  setLoadingProgress(0, '');

  // Cargar todos los paneles en paralelo (máximo rendimiento)
  // El progreso se actualiza con un contador atómico conforme cada panel termina.
  // Esto evita el problema de cargar secuencialmente (N veces más lento).
  setLoadingMsg(I18n.t('reader_loadingImages'));
  await Promise.all(RS.panels.map(async (panel, pi) => {
    panel.layerImgs = await Promise.all((panel.layers || []).map(layer => {
      // GIF: descargar de Storage y decodificar frames (antes de comprobar src)
      if (layer.type === 'gif') {
        if (!layer._gifUrl) return Promise.resolve(null);
        // cache:'no-store' — mismo motivo que _animDownload arriba.
        return fetch(layer._gifUrl, { cache: 'no-store' })
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
      // APNG: decodificar con ApngDecoder
      if (layer._apngSrc && window.ApngDecoder) {
        return window.ApngDecoder.decode(layer._apngSrc, layer._gcpFrameDelay || 100)
          .then(function(result) {
            layer._animFrames    = result.frames;
            layer._animIdx       = 0;
            layer._animLastTick  = 0;
            layer._animPlayCount = 0;
            layer._animOc        = document.createElement('canvas');
            layer._animOc.width  = result.width;
            layer._animOc.height = result.height;
            layer._animOc.getContext('2d').putImageData(result.frames[0].imageData, 0, 0);
            layer._animReady     = true;
            return layer._animOc;
          }).catch(function() { return null; });
      }

      // Si tiene renderDataUrl (bitmap prerenderizado), cargarlo
      const src = layer.renderDataUrl || layer.src || layer.dataUrl;
      if (!src) return Promise.resolve(null);
      const needsImg = layer.renderDataUrl ||
        layer.type === 'image' || layer.type === 'draw' || layer.type === 'stroke' ||
        layer.type === 'line' || layer.type === 'shape' || layer.type === 'fill' ||
        layer.type === 'pencil' || layer.type === 'watercolor';
      if (!needsImg) return Promise.resolve(null);
      return new Promise(resolve => {
        const img = new Image();
        img.onload  = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });
    }));
    // (renderDataUrl de bubbles se carga via panel.layers en el paso anterior)

    // Cachear referencia de imagen en capas botón para alpha hit testing en trayectorias
    (panel.layers || []).forEach((layer, j) => {
      if (layer._buttonAction && panel.layerImgs[j]) layer._btnHitImg = panel.layerImgs[j];
    });

    // Actualizar progreso conforme cada panel termina (paralelo — orden no garantizado)
    if (!panel.isCredits && (panel.layers||[]).length > 0) {
      loadedPanels++;
      const pct = totalPanels > 0 ? (loadedPanels / totalPanels) * 95 : 0;
      setLoadingMsg(I18n.t('reader_loadingPageOf', { loaded: loadedPanels, total: totalPanels }));
      setLoadingProgress(pct, '');
    }
  }));

  // Precargar imágenes insertadas en el flujo de texto (hoja de texto,
  // richLines) de todas las capas de texto de todos los paneles — ver
  // _tdImgCache más arriba. Recogidas y deduplicadas primero (un mismo
  // objeto de biblioteca puede insertarse varias veces) para no descargar
  // la misma data URL dos veces.
  const _richImgSrcs = new Set();
  RS.panels.forEach(panel => {
    (panel.layers || []).forEach(layer => {
      if (!Array.isArray(layer.richLines)) return;
      layer.richLines.forEach(line => {
        if (line.kind === 'image' && line.src) _richImgSrcs.add(line.src);
      });
    });
  });
  if (_richImgSrcs.size) {
    await Promise.all(Array.from(_richImgSrcs).map(src => new Promise(resolve => {
      const img = new Image();
      img.onload  = () => { _tdImgCache[src] = img; resolve(); };
      img.onerror = () => resolve(); // fallo aislado: esa imagen no se dibuja, el resto del documento sigue
      img.src = src;
    })));
  }

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

// sbGet / sbGetAuth: timeout de 12s con AbortController para evitar freeze en Android
// con conexión móvil inestable (patrón idéntico a _get() en supabase-client.js)
const _SB_TIMEOUT_MS = 12000;

async function sbGet(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), _SB_TIMEOUT_MS);
  try {
    // cache:'no-store' — sin esto el navegador puede servir una respuesta
    // guardada de una visita anterior al mismo enlace, mostrando la obra
    // con páginas/animaciones desactualizadas aunque el autor ya la haya
    // vuelto a guardar.
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY },
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error('Supabase ' + res.status);
    return res.json();
  } catch(e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new Error('Timeout cargando obra (sin respuesta en ' + (_SB_TIMEOUT_MS/1000) + 's)');
    throw e;
  }
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), _SB_TIMEOUT_MS);
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
      headers: _sbAuthHeaders(),
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error('Supabase ' + res.status);
    return res.json();
  } catch(e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new Error('Timeout cargando obra (sin respuesta en ' + (_SB_TIMEOUT_MS/1000) + 's)');
    throw e;
  }
}

// ── INICIAR ───────────────────────────────────────────────────
// ── Bezier sampling para trayectorias cerradas (reader) ────────────────────────────
// v38.06: toda la matemática de trayectoria/tiempo de esta sección ahora vive en
// js/anim-clock.js (AnimClock), cargado antes que este archivo — fuente ÚNICA
// compartida con el editor (visor interno + editor de trayectorias). Las
// funciones de aquí abajo se conservan con su nombre histórico como envoltorios
// finos porque tienen varios puntos de llamada en este mismo archivo. Antes de
// v38.06 esta sección era una copia independiente que había divergido del
// editor en dos puntos (_bezierSampleClosed sin el ajuste de esquina dura/
// alineación de origen, _pathPositionAt sin distinguir trayecto abierto de
// cerrado al llegar a t=1) — unificarla corrige ambos de raíz.
function _bezierSampleClosed(pts, numSamples) {
  return AnimClock.bezierSampleClosed(pts, numSamples);
}

// ── Helper: posición a lo largo de un trayecto (t = fracción de longitud de arco) ─
// pw/ph: dimensiones reales del lienzo en px para arc-length en espacio píxel real
function _easeT(t,accel){
  return AnimClock.easeT(t, accel);
}
function _pathPositionAt(points, closed, t, pw, ph) {
  return AnimClock.pathPositionAt(points, closed, t, pw, ph);
}

// ── Motion path: ángulo de la tangente (grados) en el punto t ── (idem editor.js)
function _pathTangentDeg(points, closed, t, pw, ph) {
  return AnimClock.pathTangentDeg(points, closed, t, pw, ph);
}
// Delta de rotación (grados), relativo a la tangente inicial (t=0) — idem editor.js
function _pathOrientDelta(points, closed, t, pw, ph) {
  return AnimClock.pathOrientDelta(points, closed, t, pw, ph);
}
// Grados extra de rotación de trayectoria a aplicar ahora al dibujar una capa
function _layerPathRotDeg(la) {
  return (la && la._pathCurRotDeg != null) ? la._pathCurRotDeg : 0;
}

// ── Animación GIF en el reproductor ─────────────────────────────────────────
function _readerGifTick() {
  const now = Date.now();
  RS.panels.forEach((panel, pi) => {
    let panelChanged = false;
    (panel.layers || []).forEach(layer => {
      // GIF importado (el ticker se suspende si el motion path con ciclos controla el frame)
      if (layer._gifReady && layer._gifFrames && layer._gifOc) {
        const _gifMpSync = layer._motionPath && layer._motionCycles != null;
        if (!_gifMpSync) {
          if (!layer._gifLastTick) return;
          const frame = layer._gifFrames[layer._gifIdx];
          const _gd = frame.delay || 100;
          if (now - layer._gifLastTick >= _gd) {
            layer._gifIdx = (layer._gifIdx + 1) % layer._gifFrames.length;
            layer._gifOc.getContext('2d').putImageData(layer._gifFrames[layer._gifIdx].imageData, 0, 0);
            // AUTOCORRECCIÓN (v38.21 — auditoría de tiempos pedida por Alberto):
            // sumar el delay IDEAL al último tick en vez de resetear a 'now' —
            // así un tick que llega unos ms tarde (normal, la comprobación solo
            // corre una vez por frame de pantalla) no desplaza el origen de
            // todos los fotogramas siguientes con él. Si el retraso ya es
            // grande (pestaña en segundo plano, etc.) se resincroniza a 'now'
            // en vez de intentar recuperar de golpe varios fotogramas seguidos.
            layer._gifLastTick = (now - layer._gifLastTick > _gd * 2) ? now : layer._gifLastTick + _gd;
            panelChanged = true;
          }
        }
      }
      // APNG: tick con delay real (suspendido si motion path con ciclos controla el frame)
      if (layer._animReady && layer._animFrames && layer._animFrames.length > 1) {
        const _animMpSync = layer._motionPath && layer._motionCycles != null;
        // Actualizar fade activo (fade-in / fade-out)
        if (layer._animFadeStart != null) {
          const _fp = Math.min((now - layer._animFadeStart) / (layer._animFadeDur || 300), 1);
          const _nat = layer.opacity !== undefined ? layer.opacity : 1;
          layer._animFadeOpacity = layer._animFadeDir === 'in' ? _fp * _nat : (1 - _fp) * _nat;
          if (_fp >= 1) {
            layer._animFadeStart = null;
            if (layer._animFadeDir === 'in') layer._animFadeOpacity = null; // restaurar opacidad natural
          }
          panelChanged = true;
        }
        // BUG CORREGIDO (v38.12 — Alberto: animación con trayectoria sincronizada
        // por ciclos que nunca llega a verse en el lector externo, aunque se
        // guarda y se ve bien en el visor interno): este bloque resuelve el
        // temporizador "_gcpStartDelay + _gcpInvisBeforeStart" (retardo de
        // inicio con la capa invisible mientras tanto, _animFadeOpacity=0
        // puesto por _resetPanelAnims). Antes, ese bloque vivía SOLO dentro de
        // la rama "else if (!layer._animLastTick)", que el `if (_animMpSync)`
        // de arriba saltaba por completo para cualquier capa en modo
        // sincronizado (trayectoria + _motionCycles) — así que una capa con
        // retardo+invisible-antes-de-empezar Y trayectoria sincronizada nunca
        // llegaba a restaurar su opacidad: se quedaba en _animFadeOpacity=0
        // para siempre, con independencia de la forma/posición de la
        // trayectoria (de ahí que cambiarla no cambiara nada). El visor interno
        // (editor.js) no tiene este fallo porque resuelve el retardo con un
        // setTimeout real (_startDelayTimer), independiente de si hay
        // trayectoria sincronizada o no. Arreglo: comprobar primero si la capa
        // sigue esperando su temporizador de inicio (!layer._animLastTick),
        // ANTES de mirar si está en modo sincronizado — así el temporizador se
        // resuelve siempre, y el modo sincronizado solo decide, después, si
        // hace falta avanzar fotogramas por su cuenta (no le corresponde,
        // los controla el motor de trayectoria más abajo).
        if (!layer._animLastTick) {
          // Esperar hasta que expire el temporizador de inicio
          if (layer._animStartAt && now >= layer._animStartAt) {
            layer._animLastTick = now;
            layer._animStartAt  = null;
            // Fade in si gcpInvisBeforeStart (inmediato si _gcpInvisGradual===false)
            if (layer._gcpInvisBeforeStart && layer._animFadeOpacity === 0) {
              if (layer._gcpInvisGradual === false) {
                layer._animFadeOpacity = null;
              } else {
                layer._animFadeStart = now;
                layer._animFadeDur   = 300;
                layer._animFadeDir   = 'in';
              }
            }
            panelChanged = true;
          }
        }
        else if (_animMpSync) { /* frame controlado por motor de path — ver más abajo */ }
        else {
        // Reinicio automático: si la animación está detenida y el plazo ha pasado, reiniciar
        if (layer._animStopped) {
          if (layer._gcpRestartDelay > 0 && layer._animRestartAt && now >= layer._animRestartAt) {
            layer._animStopped   = false;
            layer._animRestartAt = null;
            layer._animIdx       = 0;
            layer._animPlayCount = 0;
            if (layer._animOc && layer._animFrames && layer._animFrames.length) {
              layer._animOc.getContext('2d').putImageData(layer._animFrames[0].imageData, 0, 0);
            }
            // Invisibilidad en inicio del nuevo ciclo (mismo comportamiento que _rStartPageAnims)
            if (layer._gcpInvisBeforeStart && (layer._gcpStartDelay || 0) > 0) {
              layer._animFadeOpacity = 0;
              layer._animFadeStart   = null;
              layer._animLastTick    = null; // suspender tick hasta que arranque
              layer._animStartAt     = now + layer._gcpStartDelay * 1000;
            } else {
              layer._animFadeOpacity = null; // restaurar opacidad natural
              layer._animLastTick    = now;
            }
            // Reiniciar la trayectoria sincronizada con la animación
            if (layer._motionPath && layer._motionPath.length >= 2) {
              const _hasStartDelay = layer._gcpInvisBeforeStart && (layer._gcpStartDelay || 0) > 0;
              layer._pathStartTime = _hasStartDelay ? null : now;
              delete layer._pathStopped;
              layer._pathCurX = layer.x || 0.5;
              layer._pathCurY = layer.y || 0.5;
              delete layer._pathCurRotDeg;
            }
            panelChanged = true;
          }
          // Si está detenida (con o sin restart) no avanzar frames
        } else {
        const _af = layer._animFrames[layer._animIdx];
        const _ad = (_af && _af.delay) || layer._gcpFrameDelay || 100;
        if (now - layer._animLastTick >= _ad) {
          const _stopAtEnd   = layer._gcpStopAtEnd   || false;
          const _repeatCount = layer._gcpRepeatCount || 0;
          let _nextIdx = layer._animIdx + 1;
          if (_nextIdx >= layer._animFrames.length) {
            layer._animPlayCount = (layer._animPlayCount || 0) + 1;
            if (_stopAtEnd || (_repeatCount > 0 && layer._animPlayCount >= _repeatCount)) {
              // Con interpolación circular y repeticiones finitas: volver al frame 0.
              // Con stopAtEnd: detener en el último frame (comportamiento explícito).
              const _circEnd = !_stopAtEnd && _repeatCount > 0 && (layer._gcpCircularEnd || false);
              _nextIdx = _circEnd ? 0 : layer._animFrames.length - 1;
              // Programar reinicio si hay delay configurado
              const _rd = layer._gcpRestartDelay || 0;
              if (_rd > 0) {
                layer._animStopped   = true;
                layer._animRestartAt = now + _rd * 1000;
              }
              // Fade out si gcpInvisAtEnd y reproducción finita (inmediato si _gcpInvisGradual===false)
              if (layer._gcpInvisAtEnd && _repeatCount > 0) {
                if (layer._gcpInvisGradual === false) {
                  layer._animFadeOpacity = 0;
                } else {
                  layer._animFadeStart = now;
                  layer._animFadeDur   = 150;
                  layer._animFadeDir   = 'out';
                }
                panelChanged = true;
              }
            } else {
              _nextIdx = 0; // loop infinito o más repeticiones
            }
          }
          layer._animIdx = _nextIdx;
          layer._animOc.getContext('2d').putImageData(layer._animFrames[_nextIdx].imageData, 0, 0);
          // AUTOCORRECCIÓN (v38.21) — mismo criterio que el bloque GIF de
          // arriba: sumar el delay ideal en vez de resetear a 'now', salvo
          // que el retraso ya sea grande. No aplica al reinicio tras parada
          // (líneas ~1652-1669 más arriba), que ancla a 'now' correctamente
          // porque ahí sí empieza una secuencia nueva tras un hueco real.
          layer._animLastTick = (now - layer._animLastTick > _ad * 2) ? now : layer._animLastTick + _ad;
          panelChanged = true;
        }
        } // end else (!_animStopped)
        } // end else (!_animMpSync)
      }
      // Frame sincronizado al path respetando el comportamiento de la animación
// ── Sincronización trayectoria↔animación respetando pausas por frame (T) ──────
// v38.06: delegan en AnimClock (js/anim-clock.js) — misma fuente que
// _edLayerCumTimeMs/_edFrameProgressAt/_edApplyHoldFreeze/_edMpSyncFrame en
// editor.js. Antes de v38.06 esta era una copia independiente del reader.
function _rLayerCumTimeMs(layer, totalF) {
  return AnimClock.layerCumTimeMs(layer, totalF);
}
function _rFrameProgressAt(cumTime, totalF, tMs, holds) {
  return AnimClock.frameProgressAt(cumTime, totalF, tMs, holds);
}
function _rApplyHoldFreeze(cumTime, totalF, holds, cycles, pathFrac01) {
  return AnimClock.applyHoldFreeze(cumTime, totalF, holds, cycles, pathFrac01);
}
function _rMpSyncFrame(rawT, cycles, totalF, stopAtEnd, repeatCnt, pathEnd, circularEnd, cumTime, holds) {
  return AnimClock.mpSyncFrame(rawT, cycles, totalF, stopAtEnd, repeatCnt, pathEnd, circularEnd, cumTime, holds);
}

// ── Trayectoria de animación (motion path) — velocidad por ciclos o px/s ────
      if (layer._motionPath && layer._motionPath.length >= 2) {
        // Solo procesar la trayectoria del panel activo. Los paneles no visibles no
        // deben acumular tiempo ni llegar a _pathStopped mientras el usuario no los lee.
        // La trayectoria arranca de cero cada vez que _resetPanelAnims es llamado al
        // navegar a ese panel.
        if (pi !== RS.idx) return;
        if (!layer._pathStartTime) {
          // Esperar al temporizador de inicio junto con la animación
          if (layer._animStartAt && now < layer._animStartAt) return;
          layer._pathStartTime = now;
        }
        // Congelar trayectoria durante el periodo de espera del reinicio.
        // _animRestartAt indica que la animación está esperando para reiniciarse;
        // el path también debe esperar para reiniciarse sincrónicamente (FIX6).
        if (layer._animRestartAt) return;
        const { pw: _mpPw, ph: _mpPh } = _panelDims(pi);
        const _mpElapsed = (now - layer._pathStartTime) / 1000;
        const _mpClosed  = layer._motionPathClosed || false;
        const _mpPts     = (_mpClosed && layer._motionPath.length >= 3)
          ? _bezierSampleClosed(layer._motionPath, 200)
          : (_mpClosed ? [...layer._motionPath, layer._motionPath[0]] : layer._motionPath);
        let _mpTotalPx = 0;
        for (let _i = 1; _i < _mpPts.length; _i++)
          _mpTotalPx += Math.hypot((_mpPts[_i].x - _mpPts[_i-1].x) * _mpPw,
                                   (_mpPts[_i].y - _mpPts[_i-1].y) * _mpPh);
        if (_mpTotalPx < 1) _mpTotalPx = 1;
        // Calcular duración del ciclo de animación (ms) — usa el tiempo acumulado
        // real (_rLayerCumTimeMs), que respeta las pausas por frame (T); antes
        // multiplicaba frames × delay uniforme, ignorándolas.
        // _gcpLayersData.length = nº de capas GCP (NO de frames) → no usar para duración
        let _mpTF = AnimClock.layerTotalFrames(layer);
        const _mpCumTime = _mpTF > 0 ? _rLayerCumTimeMs(layer, _mpTF) : null;
        const _mpCycleDurMs = _mpCumTime ? _mpCumTime[_mpTF] : 0;
        // Si es animada y tiene ciclos definidos → duración = ciclos × duración_ciclo
        // Si no → fallback a velocidad en px/s (comportamiento legado)
        const _mpRawT = (_mpCycleDurMs > 0 && layer._motionCycles != null)
          ? _mpElapsed / (layer._motionCycles * _mpCycleDurMs / 1000)
          : (_mpElapsed * (layer._motionSpeed || 100)) / _mpTotalPx;
        // ── Scrubbing: frame sincronizado al path, respetando comportamiento anim ────
        if (_mpCycleDurMs > 0 && layer._motionCycles != null && _mpTF > 0) {
          const _mpSyncF = _rMpSyncFrame(
            _mpRawT, layer._motionCycles, _mpTF,
            layer._gcpStopAtEnd || false,
            layer._gcpRepeatCount || 0,
            layer._motionPathEnd || 'restart',
            layer._gcpCircularEnd || false,
            _mpCumTime, layer._gcpFrameHolds
          );
          if (layer._gifReady && layer._gifFrames && layer._gifOc && _mpSyncF !== layer._gifIdx) {
            layer._gifIdx = _mpSyncF;
            layer._gifOc.getContext('2d').putImageData(layer._gifFrames[_mpSyncF].imageData, 0, 0);
            panelChanged = true;
          }
          if (layer._animReady && layer._animFrames && layer._animOc && _mpSyncF !== layer._animIdx) {
            layer._animIdx = _mpSyncF;
            layer._animOc.getContext('2d').putImageData(layer._animFrames[_mpSyncF].imageData, 0, 0);
            panelChanged = true;
          }
          // BUG CORREGIDO (ver el comentario extenso en _edViewerMpTick,
          // editor.js — misma función, implementación paralela para el
          // lector externo, mismo hueco): "Invisibilidad → Al final"
          // (layer._gcpInvisAtEnd) solo estaba conectada en la rama NO
          // sincronizada (más abajo, "else" de _animMpSync) — para una capa
          // con trayectoria sincronizada esa rama nunca se alcanza, así que
          // nunca llegaba a desvanecerse al agotar las repeticiones. Mismo
          // criterio de "terminado" que usa _rMpSyncFrame internamente
          // (ciclos de ANIMACIÓN completos, deliberadamente independiente de
          // si el recorrido en sí ya se ha detenido).
          const _mpRepeatCntR = layer._gcpRepeatCount || 0;
          if (_mpRepeatCntR > 0 && (_mpRawT * layer._motionCycles) >= _mpRepeatCntR && layer._gcpInvisAtEnd && !layer._mpInvisTriggered) {
            layer._mpInvisTriggered = true;
            if (layer._gcpInvisGradual === false) {
              layer._animFadeOpacity = 0;
            } else {
              layer._animFadeStart = now;
              layer._animFadeDur   = 150;
              layer._animFadeDir   = 'out';
            }
            panelChanged = true;
          }
        }
        const _mpEndB    = layer._motionPathEnd   || 'restart';
        const _mpAcl     = layer._motionPathAccel || 'none';
        const _isSyncMR  = _mpCycleDurMs > 0 && layer._motionCycles != null;
        // Congela la fracción cruda (antes de easing) durante las pausas por frame.
        const _rFreeze = f => _mpCumTime ? _rApplyHoldFreeze(_mpCumTime, _mpTF, layer._gcpFrameHolds, layer._motionCycles, f) : f;
        if (_mpEndB === 'stop' && layer._pathStopped) {
          panelChanged = true;
        } else {
          // v38.06: fase de la trayectoria (stop/rewind/restart → relT con
          // easing) — ver AnimClock.pathPhaseAt (js/anim-clock.js), misma
          // fuente que el visor interno y el editor de trayectorias. El
          // recorrido SIEMPRE se detiene tras una sola vuelta completa
          // (rawT>=1) en modo 'stop', sea cual sea el nº de repeticiones de
          // la animación (dos contadores independientes).
          const _mpPhase = AnimClock.pathPhaseAt(_mpRawT, _mpEndB, _mpAcl, _isSyncMR, _rFreeze);
          const _mpRelT = _mpPhase.relT;
          const _mpPos  = _pathPositionAt(layer._motionPath, _mpClosed, _mpRelT, _mpPw, _mpPh);
          if (_mpPhase.justStopped) {
            layer._pathStopped = true;
            // En sync mode: programar reinicio (el mecanismo _animRestartAt de FIX6 lo gestiona)
            if (_isSyncMR && layer._gcpRestartDelay > 0 && !layer._animRestartAt) {
              layer._animStopped   = true;
              layer._animRestartAt = now + layer._gcpRestartDelay * 1000;
            }
          }
          if (_mpPos) {
            const _mpAngleDegR = layer._motionPathOrient
              ? _pathOrientDelta(layer._motionPath, _mpClosed, _mpRelT, _mpPw, _mpPh)
              : null;
            const _mpGidxsR = layer.groupId
              ? (panel.layers||[]).reduce((acc,l2,i2)=>{ if (l2 && l2.groupId===layer.groupId) acc.push(i2); return acc; }, [])
              : null;
            // AnimClock.applyPathOffset: misma función que usa el visor interno
            // y el editor de trayectorias — mueve el objeto suelto o, si forma
            // parte de un grupo, a TODOS sus compañeros (con o sin orientación
            // automática).
            AnimClock.applyPathOffset(panel.layers, layer, _mpGidxsR, _mpPos, _mpAngleDegR, _mpPw, _mpPh);
          }
          panelChanged = true;
        }
      }
    });
    if (panelChanged) {
      // Modo fixed: redibujar si es el panel activo
      if (pi === RS.idx && RS.ctx) { _render(); }
      // Modo scroll: redibujar en el canvas del slide (no si estamos en créditos)
      else if (panel._scrollCtx && !RS.isCredits) {
        const _sc = RS.idx; RS.idx = pi;
        const _sctx = RS.ctx; RS.ctx = panel._scrollCtx;
        _pageNavSuppressUpdate = true;
        _render();
        _pageNavSuppressUpdate = false;
        RS.idx = _sc; RS.ctx = _sctx;
      }
    }
  });
  requestAnimationFrame(_readerGifTick);
}

// ── FUENTES: detección y carga forzosa antes del primer dibujado ──────
// BUG CORREGIDO — Alberto: "alguna obra no se puede leer correctamente
// online en un dispositivo que no contiene las fuentes utilizadas".
//
// Causa real (confirmada en la documentación del propio CSS Font Loading
// API, MDN): document.fonts.ready "se cumple cuando terminan de cargar
// TODAS LAS FUENTES USADAS" — pero una fuente @font-face no se considera
// "usada" hasta que algo la solicita de verdad, y el texto en canvas
// (ctx.font + fillText) no siempre dispara esa solicitud a tiempo antes de
// la propia llamada que lo dibuja: la primera vez se pinta con la fuente
// de reserva del sistema, y como el canvas es un mapa de bits ya no se
// vuelve a redibujar solo cuando la fuente real termina de llegar — queda
// "grabado" mal para siempre en ese dispositivo. Por eso el fallo dependía
// del dispositivo: variaba según si esa fuente concreta ya estaba cacheada
// de una visita anterior a comxow.com o no.
//
// Solución: en vez de esperar pasivamente a document.fonts.ready, se
// detectan las fuentes que la obra usa de verdad (recorriendo capas de
// texto/bocadillo y texto enriquecido) y se solicita su carga de forma
// EXPLÍCITA con document.fonts.load() antes del primer _render().

// No se intenta replicar aquí toda la cadena de prioridades que usa el
// motor de dibujado (t.fontFamily || bl.fontFamily || 'Patrick Hand', etc.)
// — más simple y más seguro recoger CUALQUIER valor de fuente presente en
// cualquiera de los campos donde puede aparecer, y cargarlos todos: como
// mucho se solicita alguna fuente de más que quede sobreescrita por otro
// campo con más prioridad, nunca se deja de cargar la que de verdad haga
// falta por no haber replicado bien esa cadena.
function _scanUsedFonts(panels) {
  const fonts = new Set();
  const _add = v => { if (v && typeof v === 'string' && v.trim()) fonts.add(v.trim()); };
  const _scanTextish = obj => {
    if (!obj) return;
    _add(obj.font_family);
    _add(obj.fontFamily);
    _add(obj.richFontFamily);
    if (Array.isArray(obj.richLines)) {
      obj.richLines.forEach(line => {
        (line.runs || []).forEach(r => { if (!r.mono) _add(r.fontFamily); });
      });
    }
  };
  let hasAnyText = false;
  (panels || []).forEach(panel => {
    (panel.texts || []).forEach(t => { hasAnyText = true; _scanTextish(t); });
    (panel.layers || []).forEach(l => {
      if (l.type === 'bubble' || l.type === 'text') { hasAnyText = true; _scanTextish(l); }
    });
  });
  // Cubrir los valores por defecto del motor de dibujado (_drawBubble,
  // _richFontStr) para cuando una capa de texto no especifica fuente
  // explícita — no se puede saber sin repetir toda la cadena de fallback si
  // ALGUNA capa concreta cae en el valor por defecto, así que si hay
  // cualquier texto en la obra se cargan también los dos por si acaso.
  if (hasAnyText) { fonts.add('Patrick Hand'); fonts.add('Lora'); }
  return [...fonts];
}

async function _ensureFontsLoaded(panels) {
  if (!document.fonts) return; // navegador sin CSS Font Loading API — degradar sin bloquear
  const names = _scanUsedFonts(panels);
  if (!names.length) return;
  // Por cada fuente detectada, pedir las 4 combinaciones de peso/estilo
  // (normal, negrita, cursiva, negrita cursiva) — igual que hace el editor
  // interno para esta misma lista de fuentes (ver EditorView_init,
  // _edFontVariants). Una capa con negrita/cursiva activa dispara una regla
  // @font-face DISTINTA de la variante normal; pedir solo "16px FontName"
  // no garantiza que esa variante concreta llegue a tiempo.
  const specs = [];
  names.forEach(name => {
    const fam = name.includes(' ') ? '"' + name + '"' : name;
    specs.push('400 16px ' + fam);
    specs.push('700 16px ' + fam);
    specs.push('400 italic 16px ' + fam);
    specs.push('700 italic 16px ' + fam);
  });
  try {
    await Promise.all(specs.map(spec => {
      // .load() no debe hacer fallar todo el arranque si UNA combinación en
      // concreto no existe o no llega a cargar (p.ej. nombre mal escrito
      // por el autor, o una variante que esa fuente no tiene) — se ignora
      // ese caso puntual y se sigue con las demás.
      return document.fonts.load(spec).catch(() => {});
    }));
  } catch(_) {}
  // Verificación final de conjunto — normalmente ya resuelto por las cargas
  // explícitas de arriba, pero cubre cualquier otra fuente que sí se haya
  // llegado a "usar" por otra vía mientras tanto.
  try { await document.fonts.ready; } catch(_) {}
}

function startReader() {
  document.getElementById('loadingScreen').classList.add('hidden');
  document.getElementById('readerApp').classList.remove('hidden');

  _setupPageNavBar();
  _setupOfflineBtn();

  // Arrancar loop de animación GIF si hay alguno en la obra
  const _hasGifs = RS.panels.some(p => (p.layers||[]).some(l => l._gifReady || l._animReady || (l._motionPath && l._motionPath.length >= 2)));
  if (_hasGifs) {
    _resetPanelAnims(0); // inicializar animaciones del primer panel
    requestAnimationFrame(_readerGifTick);
  }

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
  _ensureFontsLoaded(RS.panels).then(() => {
    _render();
    _showControls();
  });
  _setupControls();
  requestAnimationFrame(_positionBtns);

  RS.resizeFn = () => { _resizeCanvas(); _render(); };
  setTimeout(() => window.addEventListener('resize', RS.resizeFn), 300);

  const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const msg = isTouch
    ? I18n.t('reader_navTouchFixed')
    : I18n.t('reader_navKeyboardFixed');
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
    // Hoja con restricción direccional (con botón propio, o destino de un
    // salto — ver más abajo _panelHasNavButton/_panelIsJumpTarget): impedir
    // que un gesto rápido/enérgico la "salte" por encima durante el fling de
    // scroll-snap nativo, sea cual sea el sentido que tenga bloqueado. Sin
    // esto, el fling puede pasar de largo por esta hoja hacia otra más allá,
    // y el listener 'scroll' de más abajo corrige la posición A POSTERIORI
    // (rebote) mientras el fling nativo, que sigue en marcha, insiste en
    // seguir moviéndose — de ahí el temblor/parpadeo que reportó Alberto.
    // `scroll-snap-stop:always` resuelve esto a nivel nativo: el propio
    // navegador se ve obligado a parar en esta hoja aunque el gesto sea muy
    // rápido, sin necesidad de ninguna corrección por JS después del hecho.
    // No afecta a saltos programáticos exactos (`container.scrollTo({left/
    // top: destino})`, usados por el slider de hojas y por los botones de
    // autor vía _rGoToPanel) — ver MDN/spec: scroll-snap-stop solo entra en
    // juego en desplazamientos por inercia ("fling"), no en saltos directos.
    if (_panelHasNavButton(panel) || _panelIsJumpTarget(pi)) slide.style.scrollSnapStop = 'always';

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
  RS.idx        = 0;
  RS.textStep   = 0;
  _updateContainerTouchAction();

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
  _ensureFontsLoaded(RS.panels).then(() => {
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
  // Zoom táctil (pellizco/paneo) — mismo criterio que en modo fixed (ver RZ).
  let _oArmTimer = null, _oPanning = false, _oPanned = false;
  let _oPanTx0 = 0, _oPanTy0 = 0, _oPanOrig = null;

  overlay.addEventListener('touchstart', e => {
    if (_oArmTimer) { clearTimeout(_oArmTimer); _oArmTimer = null; }
    if (e.touches.length >= 2) {
      _osx = null; _osy = null; _oPanning = false;
      _rzPinchStart(RS.canvas, e.touches);
      return;
    }
    if (e.touches.length !== 1) { _osx = null; return; }
    _osx = e.touches[0].clientX;
    _osy = e.touches[0].clientY;
    _oPanning = false; _oPanned = false;
    // Retardo habitual en táctil: si en 120ms no llega un segundo dedo, se
    // arma el paneo en vivo (solo actúa de verdad si ya hay zoom > 1).
    _oArmTimer = setTimeout(() => {
      _oArmTimer = null;
      if (RZ.scale > 1) {
        _oPanning = true;
        _oPanOrig = _rzOrigRect(RS.canvas);
        _oPanTx0 = RZ.tx; _oPanTy0 = RZ.ty;
      }
    }, RZ_TOUCH_DELAY_MS);
  }, { passive: true });

  overlay.addEventListener('touchmove', e => {
    if (e.touches.length >= 2) { _rzPinchMove(e.touches); return; }
    if (_osx === null) return;
    if (_oPanning) {
      RZ.tx = _oPanTx0 + (e.touches[0].clientX - _osx);
      RZ.ty = _oPanTy0 + (e.touches[0].clientY - _osy);
      _rzClamp(_oPanOrig);
      _rzApply(RS.canvas);
      _oPanned = true;
      return;
    }
    // Bloquear el arrastre DESDE EL PRIMER INSTANTE del gesto (no dejar que
    // el scroll nativo llegue a moverse y corregirlo después) en el sentido
    // que la hoja actual tenga prohibido — ver _panelHasNavButton (hoja con
    // botón propio: prohibido AVANZAR, solo se avanza con el botón) y
    // _panelIsJumpTarget (hoja destino de un salto: prohibido RETROCEDER).
    // Cada una bloquea solo su propio sentido; el otro queda libre desde
    // esta misma hoja.
    //
    // BUG CORREGIDO — Alberto: la versión anterior dejaba que el navegador
    // moviera el contenido y lo corregía después (vía el listener 'scroll'
    // más abajo), lo que producía un tirón/temblor visible y, peor,
    // interfería con la detección del propio toque en el botón del autor
    // de esa misma hoja — el botón dejaba de responder porque el gesto de
    // "tocar el botón" arrancaba como un ligerísimo arrastre involuntario
    // (habitual en pantallas táctiles reales) que el código de corrección
    // interrumpía a mitad de camino. Con preventDefault() aquí, el
    // navegador nunca llega a mover nada, así que no hay nada que corregir
    // ni que pueda confundir al touchend que detecta el botón.
    const _odx = e.touches[0].clientX - _osx, _ody = e.touches[0].clientY - _osy;
    if (_panelHasNavButton(RS.panels[RS.idx])) {
      const goingFwd = isH ? _odx < 0 : _ody < 0;
      if (goingFwd) e.preventDefault();
    }
    if (_panelIsJumpTarget(RS.idx)) {
      const goingBack = isH ? _odx > 0 : _ody > 0;
      if (goingBack) e.preventDefault();
    }
  }, { passive: false });

  overlay.addEventListener('touchend', e => {
    if (_oArmTimer) { clearTimeout(_oArmTimer); _oArmTimer = null; }
    if (_rzPinch) { _rzPinchEnd(); _osx = null; return; }
    if (_oPanning) { _oPanning = false; _osx = null; if (_oPanned) return; }
    if (_osx === null) return;
    const ex = e.changedTouches[0].clientX;
    const ey = e.changedTouches[0].clientY;
    const dx = ex - _osx, dy = ey - _osy;
    _osx = null;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    // Botones de capa: prioridad absoluta sobre navegación de texto/panel
    if (!RS.isCredits) {
      const _obhit = _rBtnHitTestCanvas(ex, ey);
      if (_obhit) {
        const _oba = _obhit._buttonAction;
        if (_oba.type === 'page') { _navGoToPanelLocked(_oba.pageIdx); return; }
        if (_oba.type === 'url')  { window.open(_oba.url, '_blank', 'noopener'); return; }
      }
    }
    // En pantalla de créditos: tap (movimiento mínimo) → detectar enlace/botón
    if (RS.isCredits && adx < 20 && ady < 20) {
      return; // el overlay HTML gestiona los clicks en créditos
    }
    if (isH && adx < 20) return;
    if (!isH && ady < 20) return;
    if (isH && ady > adx * 1.5) return;
    if (!isH && adx > ady * 1.5) return;

    const goFwd = isH ? dx < 0 : dy < 0;
    const goBwd = isH ? dx > 0 : dy > 0;

    if (goFwd) _vsForward();
    else if (goBwd) _vsBack();
  }, { passive: true });

  // PC: Ctrl+rueda para zoom hacia el cursor (llega aquí cuando el overlay
  // está activo — con textos pendientes; ver también el listener gemelo en
  // container, para cuando el overlay tiene pointer-events:none)
  overlay.addEventListener('wheel', e => { _rzWheelZoom(e, RS.canvas); }, { passive: false });

  // ── Avanzar/Retroceder ──
  // Centralizadas aquí (en vez de repetir la misma lógica en el touchend de
  // arriba Y en el teclado, más abajo) para que el bloqueo de navegación
  // (_navLocked — ver _navDisable/_navEnable, cabecera de _rGoToPanel) se
  // compruebe en un único sitio por dirección, no en cada llamador.
  function _vsForward() {
    if (_navBlockedFwd()) return;
    if (_hasPendingTexts()) {
      _startFade();
      RS.textStep++;
      _activateCanvas(RS.idx);
      _render();
      _updateOverlay();
    } else if (RS.idx < RS.panels.length - 1) {
      _snapTo(RS.idx + 1);
    }
  }
  function _vsBack() {
    if (_navLocked) return;
    if (RS.fadeRaf) { cancelAnimationFrame(RS.fadeRaf); RS.fadeRaf = null; RS.fadeAlpha = 0; }
    const panel = RS.panels[RS.idx];
    const isSeq = (panel?.text_mode || 'sequential') === 'sequential';
    const texts = panel?.texts || [];
    if (isSeq && RS.textStep > 1) {
      RS.textStep--;
      _activateCanvas(RS.idx);
      _render();
      _updateOverlay();
    } else if (_panelIsJumpTarget(RS.idx)) {
      // Hoja destino de un salto: prohibido retroceder desde aquí (ver
      // _panelIsJumpTarget) — revelar texto hacia atrás en ESTA misma hoja
      // (arriba) sigue funcionando con normalidad, esto solo afecta al
      // cambio de hoja.
      return;
    } else if (RS.idx > 0) {
      _snapTo(RS.idx - 1);
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

      // _navLocked (ver _navDisable/_navEnable, cabecera de _rGoToPanel) lo
      // pone a true _navGoToPanelLocked() justo antes de lanzar el propio
      // scrollTo() del botón de autor — es la señal de "este cambio de
      // posición lo ha causado un salto deliberado, no un arrastre real del
      // usuario". Sin comprobarla aquí, la protección de abajo interceptaría
      // TAMBIÉN los saltos del propio botón que la originan.
      if (!_navLocked) {
        const _goingFwdNow  = si > _prevSI;
        const _goingBackNow = si < _prevSI;
        // Hoja con botón propio (prohibido AVANZAR desde ella — retroceder
        // SÍ está permitido): si nos alejamos de ella hacia adelante sin
        // usar el botón, corregir. El arrastre nativo del dedo no pasa por
        // advance()/_vsForward(), que gestionan solo teclado y toque/clic
        // discretos, así que se colaba igual sin esto.
        // BUG CORREGIDO — Alberto: "permite el desplazamiento de hoja con
        // gestos" en una hoja con botón propio.
        if (_goingFwdNow && _panelHasNavButton(RS.panels[_prevSI])) {
          container.scrollTo({ left: isH ? _prevSI * size : 0, top: isH ? 0 : _prevSI * size, behavior: 'instant' });
          return;
        }
        // Hoja destino de un salto (prohibido RETROCEDER desde ella —
        // avanzar SÍ está permitido): recorre desde la posición actual
        // hacia atrás buscando la hoja marcada más alta que se cruzaría —
        // cubre tanto un paso sencillo (7→6) como un arrastre largo que
        // salte varias hojas de golpe (10→2 cruzando la 7) — y recorta el
        // aterrizaje justo en esa hoja en vez de dejarlo pasar de largo.
        if (_goingBackNow) {
          let _jumpBoundary = null;
          for (let i = _prevSI; i > si; i--) {
            if (_panelIsJumpTarget(i)) { _jumpBoundary = i; break; }
          }
          if (_jumpBoundary !== null) {
            container.scrollTo({ left: isH ? _jumpBoundary * size : 0, top: isH ? 0 : _jumpBoundary * size, behavior: 'instant' });
            return;
          }
        }
      }
      const goingBack = si < _prevSI;
      // Zoom del contenido: nunca debe sobrevivir a un cambio de hoja — se
      // resetea la hoja que se abandona, así que si se vuelve a visitar más
      // tarde aparece de nuevo a tamaño normal (pedido explícito de Alberto).
      _rzReset(_canvases[_prevSI]);
      _prevSI = si;
      RS.idx  = si;
      _activateCanvas(si);
      _updateContainerTouchAction();
      _resetPanelAnims(si); // reiniciar animaciones al llegar a un nuevo panel
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
      // Si es la hoja de créditos en modo scroll, esperar a que el scroll
      // se detenga completamente antes de montar los botones interactivos
      if (RS.panels[si]?.isCredits) {
        _mountCreditsWhenScrollEnds(container, isH);
      }
    });
  }, { passive: true });

  // ── Botones de capa — container táctil (cuando overlay está inactivo) ──
  // El overlay tiene pointer-events:none cuando no hay textos pendientes;
  // en ese caso los toques llegan al container de scroll. Es también la vía
  // principal por la que llega el pellizco de zoom, ya que la mayor parte
  // de la lectura transcurre con el overlay inactivo.
  let _csx = null, _csy = null;
  let _cArmTimer = null, _cPanning = false, _cPanned = false;
  let _cPanTx0 = 0, _cPanTy0 = 0, _cPanOrig = null;

  container.addEventListener('touchstart', e => {
    if (_cArmTimer) { clearTimeout(_cArmTimer); _cArmTimer = null; }
    if (e.touches.length >= 2) {
      _csx = null; _cPanning = false;
      _rzPinchStart(RS.canvas, e.touches);
      return;
    }
    if (e.touches.length !== 1) { _csx = null; return; }
    _csx = e.touches[0].clientX;
    _csy = e.touches[0].clientY;
    _cPanning = false; _cPanned = false;
    // Retardo habitual en táctil: si en 120ms no llega un segundo dedo, se
    // arma el paneo en vivo (solo actúa de verdad si ya hay zoom > 1) — con
    // zoom en 1x el arrastre sigue siendo el scroll nativo de siempre.
    _cArmTimer = setTimeout(() => {
      _cArmTimer = null;
      if (RZ.scale > 1) {
        _cPanning = true;
        _cPanOrig = _rzOrigRect(RS.canvas);
        _cPanTx0 = RZ.tx; _cPanTy0 = RZ.ty;
      }
    }, RZ_TOUCH_DELAY_MS);
  }, { passive: true });

  container.addEventListener('touchmove', e => {
    if (e.touches.length >= 2) { _rzPinchMove(e.touches); e.preventDefault(); return; }
    if (_csx === null) return;
    if (_cPanning) {
      // Tomar el control sobre el scroll nativo mientras se panea con zoom activo
      RZ.tx = _cPanTx0 + (e.touches[0].clientX - _csx);
      RZ.ty = _cPanTy0 + (e.touches[0].clientY - _csy);
      _rzClamp(_cPanOrig);
      _rzApply(RS.canvas);
      _cPanned = true;
      e.preventDefault();
      return;
    }
    // Bloquear el arrastre DESDE EL PRIMER INSTANTE del gesto (no dejar que
    // el scroll nativo llegue a moverse y corregirlo después) — mismo
    // criterio y mismo bug corregido que en el touchmove gemelo de overlay,
    // ver su comentario para el detalle completo.
    const _cdx = e.touches[0].clientX - _csx, _cdy = e.touches[0].clientY - _csy;
    if (_panelHasNavButton(RS.panels[RS.idx])) {
      const goingFwd = isH ? _cdx < 0 : _cdy < 0;
      if (goingFwd) e.preventDefault();
    }
    if (_panelIsJumpTarget(RS.idx)) {
      const goingBack = isH ? _cdx > 0 : _cdy > 0;
      if (goingBack) e.preventDefault();
    }
  }, { passive: false });

  container.addEventListener('touchend', e => {
    if (_cArmTimer) { clearTimeout(_cArmTimer); _cArmTimer = null; }
    if (_rzPinch) { _rzPinchEnd(); _csx = null; return; }
    if (_cPanning) { _cPanning = false; _csx = null; if (_cPanned) return; }
    if (_csx === null) return;
    const _cex = e.changedTouches[0].clientX;
    const _cey = e.changedTouches[0].clientY;
    const _cadx = Math.abs(_cex - _csx), _cady = Math.abs(_cey - _csy);
    _csx = null;
    // Botones de capa: prioridad absoluta — comprobarlo ANTES de la
    // distancia de movimiento, igual que ya hacen el touchend gemelo de
    // overlay (más arriba) y el de modo fijo (más abajo).
    //
    // BUG CORREGIDO — Alberto: "el botón no navega". Aquí la comprobación
    // de distancia (línea de abajo, "solo taps < 30px") se hacía ANTES del
    // hit-test del botón, así que si el dedo se movía 30px o más durante el
    // propio toque — más probable ahora que el arrastre nativo ya no
    // "absorbe" ese movimiento visualmente (ver el touchmove de arriba,
    // que impide el scroll con preventDefault en una hoja con botón) — el
    // código salía antes de comprobar siquiera si se había tocado el botón.
    const _cbhit = _rBtnHitTestCanvas(_cex, _cey);
    if (_cbhit) {
      const _cba = _cbhit._buttonAction;
      if (_cba.type === 'page') { _navGoToPanelLocked(_cba.pageIdx); return; }
      if (_cba.type === 'url')  { window.open(_cba.url, '_blank', 'noopener'); return; }
    }
    // Solo taps (< 30 px): los swipes los maneja el scroll nativo
    if (isH ? _cadx >= 30 : _cady >= 30) return;
  }, { passive: true });

  // PC: Ctrl+rueda para zoom hacia el cursor (llega aquí cuando el overlay
  // está inactivo — sin textos pendientes; ver también el listener gemelo
  // en overlay, para cuando sí hay textos pendientes)
  container.addEventListener('wheel', e => { _rzWheelZoom(e, RS.canvas); }, { passive: false });

  // ── Botones de capa — ratón / PC (container) + arrastre para panear con zoom ──
  let _smpdX = null, _smpdY = null, _smpPanning = false, _smpPanTx0 = 0, _smpPanTy0 = 0, _smpPanOrig = null;
  container.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') return;
    _smpdX = e.clientX; _smpdY = e.clientY;
    _smpPanning = RZ.scale > 1;
    if (_smpPanning) {
      _smpPanOrig = _rzOrigRect(RS.canvas);
      _smpPanTx0 = RZ.tx; _smpPanTy0 = RZ.ty;
    }
  }, { passive: true });
  container.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || _smpdX === null || !_smpPanning) return;
    RZ.tx = _smpPanTx0 + (e.clientX - _smpdX);
    RZ.ty = _smpPanTy0 + (e.clientY - _smpdY);
    _rzClamp(_smpPanOrig);
    _rzApply(RS.canvas);
  }, { passive: true });
  container.addEventListener('pointerup', e => {
    if (e.pointerType !== 'mouse' || _smpdX === null) return;
    const _sdx = Math.abs(e.clientX - _smpdX), _sdy = Math.abs(e.clientY - _smpdY);
    const _wasPanning = _smpPanning;
    _smpdX = null; _smpdY = null; _smpPanning = false;
    if (_wasPanning) return; // fue paneo, no un clic
    // Botones de capa: prioridad absoluta — mismo criterio que touchend,
    // ver su comentario para el detalle del bug corregido.
    const _sbhit = _rBtnHitTestCanvas(e.clientX, e.clientY);
    if (_sbhit) {
      const _sba = _sbhit._buttonAction;
      if (_sba.type === 'page') { _navGoToPanelLocked(_sba.pageIdx); return; }
      if (_sba.type === 'url')  { window.open(_sba.url, '_blank', 'noopener'); return; }
    }
    if (_sdx > 15 || _sdy > 15) return; // fue arrastre, no clic
  }, { passive: true });

  // ── Teclado PC ──
  RS.keyHandler = e => {
    const fwd = ['ArrowRight','ArrowDown','Space','Enter'].includes(e.code);
    const bwd = ['ArrowLeft','ArrowUp'].includes(e.code);
    if (fwd) { e.preventDefault(); _vsForward(); }
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
        // Zoom del contenido: las dimensiones base cambian con el resize —
        // resetear también aquí para no arrastrar un transform calculado
        // sobre medidas que ya no son válidas.
        _rzReset(cv);
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
    isH ? (isTouch ? I18n.t('reader_navSwipeH') : I18n.t('reader_navKeysH'))
        : (isTouch ? I18n.t('reader_navSwipeV') : I18n.t('reader_navKeysV')),
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
  let cl, ct, cw, ch;

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
    ch = dh;
  } else {
    // Modo fixed: el canvas tiene position:absolute con left/top explícitos
    const c = RS.canvas;
    if (!c) return;
    cl = parseInt(c.style.left)   || 0;
    ct = parseInt(c.style.top)    || 0;
    cw = parseInt(c.style.width)  || 0;
    ch = parseInt(c.style.height) || 0;
  }

  const fsBtn      = document.getElementById('fullscreenToggle');
  const closeBtn    = document.getElementById('closeBtn');
  const pageNavBtn  = document.getElementById('pageNavToggle');
  const offlineBtn  = document.getElementById('offlineDlBtn');

  if (fsBtn) {
    fsBtn.style.left = (cl + PAD) + 'px';
    fsBtn.style.top  = (ct + OFY) + 'px';
  }
  if (closeBtn) {
    const btnW = closeBtn.getBoundingClientRect().width || 32;
    closeBtn.style.left = (cl + cw - PAD - btnW) + 'px';
    closeBtn.style.top  = (ct + OFY) + 'px';
  }
  if (pageNavBtn) {
    // Simétrico a fsBtn (esquina superior izquierda) pero pegado abajo
    const btnH = pageNavBtn.getBoundingClientRect().height || 24;
    pageNavBtn.style.left = (cl + PAD) + 'px';
    pageNavBtn.style.top  = (ct + ch - OFY - btnH) + 'px';
  }
  if (offlineBtn) {
    // Simétrico a closeBtn (esquina superior derecha) pero pegado abajo
    const btnW = offlineBtn.getBoundingClientRect().width  || 32;
    const btnH = offlineBtn.getBoundingClientRect().height || 24;
    offlineBtn.style.left = (cl + cw - PAD - btnW) + 'px';
    offlineBtn.style.top  = (ct + ch - OFY - btnH) + 'px';
  }
}

// ── BARRA DE NAVEGACIÓN POR HOJA ──────────────────────────────
// Botón inferior izquierdo: muestra "hoja actual/total" y abre una barra
// inferior con un slider para saltar directamente a cualquier hoja
// arrastrando — mismo patrón que lectores de ebooks/PDF habituales (Kindle,
// Apple Books, Google Play Books). El salto real reutiliza _rGoToPanel, ya
// corregido para funcionar igual en los tres modos de navegación
// (fixed/horizontal/vertical) — ver su comentario de cabecera.
let _pageNavOpen      = false;
let _pageNavDragging  = false;
// Ver _readerGifTick más arriba: al redibujar en segundo plano una hoja CON
// ANIMACIÓN que no es la visible (para mantenerla al día aunque no se esté
// mirando), ese código cambia RS.idx TEMPORALMENTE a esa otra hoja mientras
// llama a _render() y lo restaura justo después. Sin esta bandera,
// _pageNavUpdate() (llamada desde dentro de _render()) leía RS.idx justo en
// ese instante y mostraba el número de ESA hoja de fondo en vez de la que de
// verdad se está viendo — de ahí que el contador/slider "saltara" a la hoja
// con la animación de forma intermitente (justo cuando le tocaba redibujar
// un fotograma). BUG CORREGIDO — Alberto, verificado leyendo el código de
// _readerGifTick, no es un problema de scroll ni de flujo de texto.
let _pageNavSuppressUpdate = false;
// Temporizador del cierre automático de la barra tras soltar el dedo.
let _pageNavAutoCloseTimer = null;

// Mantiene el botón (y la barra, si está abierta) al día con la hoja real.
// Se llama desde _render(), así que cubre CUALQUIER vía de navegación
// (swipe, teclado, botones "ir a hoja" dentro de la obra, o esta misma
// barra) sin tener que enganchar el contador en cada sitio por separado.
function _pageNavUpdate() {
  if (_pageNavSuppressUpdate) return;
  const total    = RS.panels.length;
  const current  = RS.idx + 1;
  const toggleBtn = document.getElementById('pageNavToggle');
  // Hoja de recorrido dirigido (Alberto: botón de autor "ir a hoja...") — la
  // barra tampoco debe poder usarse como atajo para saltarse esa restricción.
  const restricted = _panelHasNavButton(RS.panels[RS.idx]);
  if (toggleBtn) {
    toggleBtn.textContent = current + '/' + total;
    toggleBtn.disabled = restricted;
    toggleBtn.classList.toggle('page-nav-restricted', restricted);
  }
  if (restricted && _pageNavOpen) _pageNavCloseBar();
  if (_pageNavOpen && !_pageNavDragging) {
    const slider = document.getElementById('pageNavSlider');
    const label  = document.getElementById('pageNavLabel');
    if (slider) slider.value = current;
    if (label)  label.textContent = I18n.t('reader_pageOf', { current, total });
  }
}

function _pageNavOpenBar() {
  // Defensa adicional: aunque el botón esté deshabilitado (lo normal), no
  // abrir si por lo que sea se llega a llamar igualmente en una hoja
  // restringida.
  if (_panelHasNavButton(RS.panels[RS.idx])) return;
  const bar    = document.getElementById('pageNavBar');
  const scrim  = document.getElementById('pageNavScrim');
  const slider = document.getElementById('pageNavSlider');
  const label  = document.getElementById('pageNavLabel');
  if (!bar || !slider) return;
  clearTimeout(_pageNavAutoCloseTimer);
  const total = RS.panels.length;
  slider.max   = total;
  slider.value = RS.idx + 1;
  if (label) label.textContent = I18n.t('reader_pageOf', { current: RS.idx + 1, total });
  bar.classList.remove('hidden');
  if (scrim) scrim.classList.remove('hidden');
  _pageNavOpen = true;
  // Mientras la barra está abierta (dedo/cursor sobre ella) la navegación
  // normal (swipe/tap/teclado) queda desactivada — ver _navDisable, cabecera
  // de _rGoToPanel. Se reactiva en _pageNavCloseBar.
  _navDisable();
}

function _pageNavCloseBar() {
  clearTimeout(_pageNavAutoCloseTimer);
  const bar   = document.getElementById('pageNavBar');
  const scrim = document.getElementById('pageNavScrim');
  if (bar)   bar.classList.add('hidden');
  if (scrim) scrim.classList.add('hidden');
  _pageNavOpen = false;
  _navEnable();
}

// Se llama una sola vez, desde startReader() — RS.panels ya está completo
// en ese punto (incluida la hoja de créditos añadida al final).
function _setupPageNavBar() {
  const toggleBtn = document.getElementById('pageNavToggle');
  const bar       = document.getElementById('pageNavBar');
  const scrim     = document.getElementById('pageNavScrim');
  const slider    = document.getElementById('pageNavSlider');
  const label     = document.getElementById('pageNavLabel');
  if (!toggleBtn || !bar || !slider) return;

  slider.max = RS.panels.length;
  _pageNavUpdate();

  toggleBtn.addEventListener('click', () => {
    if (_pageNavOpen) _pageNavCloseBar(); else _pageNavOpenBar();
  });
  toggleBtn.addEventListener('touchend', e => { e.stopPropagation(); }, { passive: false });

  // Cerrar al tocar fuera: el scrim absorbe el toque para que no llegue al
  // canvas/scroll de debajo y dispare, encima, un cambio de hoja por swipe.
  if (scrim) scrim.addEventListener('pointerdown', _pageNavCloseBar);

  // Arrastre: solo previsualiza la etiqueta (barato). Navegar en cada pixel
  // de arrastre sería costoso — sobre todo en modo scroll, donde cada salto
  // dispara un scrollTo — y daría sensación de tirón. El salto real ocurre
  // al soltar (evento 'change').
  slider.addEventListener('input', () => {
    _pageNavDragging = true;
    // El usuario sigue interactuando — cancelar cualquier cierre automático pendiente
    clearTimeout(_pageNavAutoCloseTimer);
    if (label) label.textContent = I18n.t('reader_pageOf', { current: slider.value, total: slider.max });
  });
  slider.addEventListener('change', () => {
    _pageNavDragging = false;
    _navGoToPanelLocked(parseInt(slider.value, 10) - 1);
    // Alberto: cerrar la barra sola 1s después de levantar el dedo
    clearTimeout(_pageNavAutoCloseTimer);
    _pageNavAutoCloseTimer = setTimeout(_pageNavCloseBar, 1000);
  });
  // Mientras el foco está en el slider, que las flechas lo muevan a él (su
  // comportamiento nativo) y no, ADEMÁS, disparen advance()/goBack() vía el
  // keydown global de _setupControls.
  slider.addEventListener('keydown', e => e.stopPropagation());
}

// ── EXPORTAR COMO ARCHIVO STANDALONE (distribución fuera de la app) ──
// Alberto: "un autor puede querer distribuir su obra fuera de la app". A
// diferencia de la copia en IndexedDB (solo sirve en este mismo dispositivo,
// para releer el mismo enlace más tarde), esto genera un único archivo
// .html que lleva DENTRO el lector completo + la obra + las fuentes que usa
// — se puede compartir por cualquier medio (email, USB, mensajería) y
// abrirse en cualquier dispositivo con navegador, sin conexión, sin haber
// visitado nunca comxow.com. La hoja de créditos (con el enlace a
// comxow.com en pestaña nueva, ver _mountCreditsButtons) es la única vía de
// vuelta a la app desde un archivo así — por eso _startFromOfflineSnapshot
// la añade siempre, pase lo que pase.

async function _fetchText(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('No se pudo descargar ' + url);
  return r.text();
}
async function _fetchDataUrl(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('No se pudo descargar ' + url);
  const blob = await r.blob();
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload  = e => res(e.target.result);
    fr.onerror = () => rej(new Error('No se pudo leer ' + url));
    fr.readAsDataURL(blob);
  });
}

// fonts.css tal cual, con cada url('XXX.woff2') sustituida por su data: URI
// — se incrustan TODAS las fuentes disponibles (no solo las que usa esta
// obra en concreto) para no depender de enumerar correctamente cada posible
// campo de fuente (incluidos overrides por tramo de texto enriquecido);
// ~900KB de más en el archivo final es un margen razonable a cambio de no
// arriesgarse a que una burbuja se vea con una fuente equivocada.
async function _buildFontsCssInline() {
  const fontsUrl = new URL('../fonts/fonts.css', location.href).href;
  let css = await _fetchText(fontsUrl);
  const names = [...new Set([...css.matchAll(/url\('([^']+\.woff2)'\)/g)].map(m => m[1]))];
  const resolved = {};
  for (const fname of names) {
    const fontUrl = new URL('../fonts/' + fname, location.href).href;
    resolved[fname] = await _fetchDataUrl(fontUrl);
  }
  return css.replace(/url\('([^']+\.woff2)'\)/g, (full, fname) => "url('" + (resolved[fname] || full) + "')");
}

// Nombre de archivo seguro a partir del título de la obra
function _safeFileName(title) {
  const base = (title || I18n.t('reader_defaultWorkTitle').toLowerCase()).trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar acentos
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80);
  return (base || 'work') + '.html';
}

// Construye el documento HTML autocontenido completo. Usa una plantilla
// estática (no el DOM en vivo de la sesión de lectura actual) a propósito:
// el DOM en vivo puede tener posiciones/estados calculados para ESTA
// ventana concreta (tamaño de pantalla, hoja actual, barra abierta, botón
// ya en estado "descargada"...) que no deben quedar grabados en el archivo
// — el archivo exportado debe arrancar siempre limpio, sea quien sea que lo
// abra y en el dispositivo que sea.
async function _buildStandaloneBundle() {
  if (!RS._sourcePanels) return null;
  const snapshot = await _buildOfflineSnapshot();
  if (!snapshot) return null;

  // IMPORTANTE: cada dependencia se incrusta DENTRO de una etiqueta
  // <script>/<style> del propio documento generado — cualquier '</script'
  // o '</style' que aparezca LITERALMENTE dentro de ese texto (p.ej.
  // reader.js contiene, en su propio código fuente, la cadena '</script>'
  // — la propia línea que construye las etiquetas de las demás
  // dependencias, más abajo) cerraría esa etiqueta de golpe para el
  // analizador HTML, dejando el resto del script como marcado suelto. La
  // barra escapada (\/) no cambia el JS/CSS resultante en tiempo de
  // ejecución, solo rompe la coincidencia literal para el parser HTML.
  const _escClose = (s, tag) => s.replace(new RegExp('</' + tag, 'gi'), '<\\/' + tag);

  const scriptSrcs = Array.from(document.querySelectorAll('script[src]')).map(el => el.src);
  const scripts = [];
  for (const src of scriptSrcs) scripts.push(_escClose(await _fetchText(src), 'script'));

  const readerCss  = _escClose(await _fetchText(new URL('reader.css', location.href).href), 'style');
  const fontsCss   = _escClose(await _buildFontsCssInline(), 'style');
  const logoData   = await _fetchDataUrl(new URL('../logo.svg', location.href).href);
  const loadingImg = await _fetchDataUrl(new URL('../loading-icon.png', location.href).href);

  const title = (snapshot.title || I18n.t('reader_defaultWorkTitle')) + ' — ComXow';
  const snapshotJson = JSON.stringify(snapshot).replace(/</g, '\\u003c'); // evitar cierre prematuro de </script>

  const html = `<!DOCTYPE html>
<html lang="${I18n.getLang()}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover">
<title>${title.replace(/</g, '&lt;')}</title>
<meta name="theme-color" content="#111111">
<style>${fontsCss}</style>
<style>${readerCss}</style>
</head>
<body>

<div id="loadingScreen" class="loading-screen">
  <div class="loading-logo">
    <img src="${loadingImg}" data-i18n-alt="loadingAlt" alt="Cargando" style="height:40px;width:auto;">
    <img src="${logoData}" alt="Comxow" style="height:40px;width:auto;">
  </div>
  <div id="loadingMsg" class="loading-msg" data-i18n="reader_loadingWork">${I18n.t('reader_loadingWork')}</div>
  <div class="loading-progress-wrap">
    <div class="loading-progress-bar" id="loadingBar"></div>
  </div>
  <div class="loading-progress-label" id="loadingLabel"></div>
</div>

<div id="errorScreen" class="error-screen hidden">
  <div class="error-card">
    <div class="error-icon">\u{1F4ED}</div>
    <h2 data-i18n="reader_workNotAvailableTitle">${I18n.t('reader_workNotAvailableTitle')}</h2>
    <p id="errorMsg" data-i18n="reader_errorWorkNotFound">${I18n.t('reader_errorWorkNotFound')}</p>
    <a href="javascript:history.back()" class="btn-yellow" data-i18n="intro_back">${I18n.t('intro_back')}</a>
  </div>
</div>

<div id="readerApp" class="reader-app hidden">
  <canvas id="readerCanvas"></canvas>
  <div id="scrollReader"></div>
  <button id="fullscreenToggle" class="corner-btn corner-tl" data-i18n-aria="reader_fullscreenLabel" aria-label="${I18n.t('reader_fullscreenLabel')}">[ ]</button>
  <button id="closeBtn" class="corner-btn corner-tr" data-i18n-aria="reader_closeLabel" aria-label="${I18n.t('reader_closeLabel')}">&#x2715;</button>
  <button id="pageNavToggle" class="corner-btn corner-bl" data-i18n-aria="reader_goToPageLabel" aria-label="${I18n.t('reader_goToPageLabel')}">1/1</button>
  <button id="offlineDlBtn" class="corner-btn corner-br hidden" data-i18n-aria="reader_downloadOfflineTitle" aria-label="${I18n.t('reader_downloadOfflineTitle')}">&#x2B07;</button>
  <div id="pageNavScrim" class="page-nav-scrim hidden"></div>
  <div id="pageNavBar" class="page-nav-bar hidden">
    <div class="page-nav-bar-label" id="pageNavLabel">${I18n.t('reader_pageOf', { current: 1, total: 1 })}</div>
    <input type="range" id="pageNavSlider" class="page-nav-slider" min="1" max="1" value="1" step="1" data-i18n-aria="reader_selectPageLabel" aria-label="${I18n.t('reader_selectPageLabel')}">
  </div>
  <div id="readerToast" class="reader-toast"></div>
</div>

<script>window.__EMBEDDED_WORK__ = ${snapshotJson};</script>
${scripts.map(s => '<script>' + s + '</script>').join('\n')}
</body>
</html>`;

  return { html, fileName: _safeFileName(snapshot.title) };
}

async function _downloadStandaloneBundle() {
  const bundle = await _buildStandaloneBundle();
  if (!bundle) return false;
  const blob = new Blob([bundle.html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = bundle.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}

// ── BOTÓN DE DESCARGA OFFLINE ─────────────────────────────────
// Disponible para cualquier obra cargada por red (RS._workId +
// RS._sourcePanels — publicada o borrador, ver loadWork/loadDraft): no en
// una sesión que ya está viendo una copia offline/standalone (no hay red
// para descargar nada nuevo) ni embebida en un iframe ajeno. Se llama una
// vez desde startReader().
//
// Cada clic hace DOS cosas: guarda una copia en IndexedDB de este mismo
// dispositivo (para releer el mismo enlace más tarde, con o sin red) Y
// descarga el archivo .html autocontenido para distribuir fuera de la app
// (Alberto). Una sola acción cubre ambos usos.
async function _setupOfflineBtn() {
  const btn = document.getElementById('offlineDlBtn');
  if (!btn) return;
  if (!RS._workId || RS._isOfflineSession || RS.isEmbed) return;
  btn.classList.remove('hidden');

  const _refreshState = async () => {
    const has = await _offlineLoad(RS._workId);
    btn.textContent = has ? '\u2713' : '\u2B07'; // ✓ : ⬇
    btn.classList.toggle('offline-dl-saved', !!has);
    btn.title = has
      ? I18n.t('reader_alreadyDownloadedTitle')
      : I18n.t('reader_downloadOfflineTitle');
  };
  await _refreshState();

  btn.addEventListener('touchend', e => { e.stopPropagation(); }, { passive: false });
  btn.addEventListener('click', async e => {
    e.stopPropagation();
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = '\u2026'; // …
    try {
      const snapshot = await _buildOfflineSnapshot();
      if (snapshot) {
        await _offlineSave(RS._workId, snapshot);
        await _downloadStandaloneBundle();
        _readerToast(I18n.t('reader_downloadedToast'), 3500);
      } else {
        _readerToast(I18n.t('reader_downloadPrepareFail'), 3000);
      }
    } catch(err) {
      console.error('[offline] error al descargar:', err);
      _readerToast(I18n.t('reader_downloadFail'), 3000);
    }
    await _refreshState();
    btn.disabled = false;
  });
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
  RS.canvas.style.touchAction = 'manipulation';
  // Zoom del contenido: nunca debe sobrevivir a un cambio de hoja (ni a un
  // redimensionado de ventana, que recalcula las dimensiones base sobre las
  // que se apoya el transform) — pedido explícito de Alberto.
  _rzReset(RS.canvas);
  _positionBtns();

}

// ── RENDER PRINCIPAL ──────────────────────────────────────────
function _render() {
  const panel = RS.panels[RS.idx];
  if (!panel || !RS.ctx) return;

  // Mantener el contador de hoja (botón inferior izquierdo + barra, si está
  // abierta) siempre al día, sea cual sea la vía de navegación (swipe,
  // teclado, botones "ir a hoja" dentro de la obra, o la propia barra).
  _pageNavUpdate();

  // Panel de créditos — redibujar y remontar botones cada vez que se navega a él
  if (panel.isCredits) {
    _showCredits();
    return;
  }

  // Si venimos de los créditos, limpiar siempre al salir
  if (RS.isCredits) _resetCredits();

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
    if (layer.hidden) return; // capa oculta: no renderizar en el lector
    if (type === 'gif') {
      if (!layer._gifReady || !layer._gifOc) return;
      ctx.save();
      ctx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1;
      const _gx = (layer._pathCurX != null ? layer._pathCurX : (layer.x || 0.5)) * pw;
      const _gy = (layer._pathCurY != null ? layer._pathCurY : (layer.y || 0.5)) * ph;
      const _gw = (layer.width  || 0.5) * pw;
      const _gh = (layer.height || 0.5) * ph;
      const _gr = ((layer.rotation || 0) + _layerPathRotDeg(layer)) * Math.PI / 180;
      ctx.translate(_gx, _gy);
      if (_gr) ctx.rotate(_gr);
      ctx.drawImage(layer._gifOc, -_gw/2, -_gh/2, _gw, _gh);
      ctx.restore();
      return;
    }
    if (type === 'fill' || type === 'pencil' || type === 'watercolor') {
      const img = layerImgs[j];
      if (!img) return;
      ctx.save();
      ctx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1;
      // SF: el fill tiene x/y/width/height/rotation — igual que StrokeLayer.
      // Renderizar con translate+rotate+drawImage centrado en (x*pw, y*ph).
      const _fx = (layer._pathCurX != null ? layer._pathCurX : (layer.x != null ? layer.x : 0.5)) * pw;
      const _fy = (layer._pathCurY != null ? layer._pathCurY : (layer.y != null ? layer.y : 0.5)) * ph;
      const _fw = (layer.width  != null ? layer.width  : 1) * pw;
      const _fh = (layer.height != null ? layer.height : 1) * ph;
      const _fr = ((layer.rotation || 0) + _layerPathRotDeg(layer)) * Math.PI / 180;
      ctx.translate(_fx, _fy);
      if (_fr) ctx.rotate(_fr);
      ctx.drawImage(img, -_fw / 2, -_fh / 2, _fw, _fh);
      ctx.restore();
      return;
    }
    if (type === 'image' || type === 'draw' || type === 'stroke') {
      // APNG animado
      if (type === 'image' && layer._animReady && layer._animOc) {
        const x=(layer._pathCurX != null ? layer._pathCurX : (layer.x||0.5))*pw;
        const y=(layer._pathCurY != null ? layer._pathCurY : (layer.y||0.5))*ph;
        const w=(layer.width||1)*pw, h=(layer.height||1)*ph;
        const rot=((layer.rotation||0) + _layerPathRotDeg(layer))*Math.PI/180;
        ctx.save(); ctx.globalAlpha=layer._animFadeOpacity!=null?layer._animFadeOpacity:(layer.opacity!==undefined?layer.opacity:1);
        ctx.translate(x,y); if(rot)ctx.rotate(rot);
        ctx.drawImage(layer._animOc,-w/2,-h/2,w,h); ctx.restore(); return;
      }
      const img = layerImgs[j];
      if (!img) return;
      ctx.save();
      ctx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1;
      if (type === 'image' && layer._blendMode) ctx.globalCompositeOperation = layer._blendMode;
      if (type === 'image' || type === 'stroke') {
        const x = ((type==='stroke'||type==='image') && layer._pathCurX!=null ? layer._pathCurX : (layer.x||0.5)) * pw;
        const y = ((type==='stroke'||type==='image') && layer._pathCurY!=null ? layer._pathCurY : (layer.y||0.5)) * ph;
        const w = (layer.width  || 1) * pw;
        const h = (layer.height || 1) * ph;
        const rot = (layer.rotation || 0) + _layerPathRotDeg(layer);
        ctx.translate(x, y);
        if (rot) ctx.rotate(rot * Math.PI / 180);
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
      } else {
        // draw: aplicar offset de motion path si existe
        if (layer._pathCurX != null) {
          ctx.translate((layer._pathCurX - (layer.x||0.5)) * pw,
                        (layer._pathCurY - (layer.y||0.5)) * ph);
        }
        ctx.drawImage(img, 0, 0, pw, ph);
      }
      ctx.restore();
    } else if (type === 'shape') {
      ctx.save();
      ctx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1;
      const x = (layer._pathCurX != null ? layer._pathCurX : (layer.x||0.5)) * pw;
      const y = (layer._pathCurY != null ? layer._pathCurY : (layer.y||0.5)) * ph;
      const w = (layer.width || 0.3) * pw, h = (layer.height || 0.2) * ph;
      const rot = ((layer.rotation || 0) + _layerPathRotDeg(layer)) * Math.PI / 180;
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
      const x = (layer._pathCurX != null ? layer._pathCurX : (layer.x||0.5)) * pw;
      const y = (layer._pathCurY != null ? layer._pathCurY : (layer.y||0.5)) * ph;
      const w = (layer.width  || 0.3) * pw, h = (layer.height || 0.2) * ph;
      const rot = ((layer.rotation || 0) + _layerPathRotDeg(layer)) * Math.PI / 180;
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
    if ((l.type==='bubble'||l.type==='text') && l._hasText !== false && !l.hidden) {
      bubbleLayersWithText2.push(l);
      bubbleLayerGlobalIdx2.push(gi);
    }
  });
  texts.forEach((t, i) => {
    t._bubbleLayerImg = (bubbleLayerGlobalIdx2[i] !== undefined) ? allLayerImgs[bubbleLayerGlobalIdx2[i]] : null;
    t._bubbleLayer    = bubbleLayersWithText2[i] || null;
  });

  // Hoja de texto paginada (Editor de textos): el resumen de panel_texts no lleva
  // richLines (serían filas enormes en una tabla pensada para ser ligera) — para
  // esas capas se dibuja la capa completa (panel_layers), que sí las tiene.
  const _pick = t => (t._bubbleLayer && Array.isArray(t._bubbleLayer.richLines) && t._bubbleLayer.richLines.length)
    ? t._bubbleLayer : t;

  const isSeq = (panel.text_mode || 'sequential') === 'sequential';
  if (!isSeq) {
    texts.forEach(t => _drawBubble(ctx, _pick(t), pw, ph, 1));
    return;
  }
  // Modo sequential — replica exacta del visor interno del editor (edUpdateViewer):
  // - type 'text' (cajas): siempre al 100% cuando reveladas, permanecen visibles
  // - type 'bubble': el actual al 100%, el anterior con fade-out, los más viejos desaparecen
  const toShow = texts.slice(0, RS.textStep);
  toShow.forEach((t, vi) => {
    if (t.type === 'text') {
      _drawBubble(ctx, _pick(t), pw, ph, 1);
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
    const _bl1CurX = t._pathCurX != null ? t._pathCurX : (bl.x || 0.5);
    const _bl1CurY = t._pathCurY != null ? t._pathCurY : (bl.y || 0.5);
    const x = _bl1CurX * pw, y = _bl1CurY * ph;
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
    const _rtCurX = _fromLayers && t._pathCurX != null ? t._pathCurX : t.x;
    const _rtCurY = _fromLayers && t._pathCurY != null ? t._pathCurY : t.y;
    const _rx = _fromLayers ? (_rtCurX - t.width/2) : (t.x/100);
    const _ry = _fromLayers ? (_rtCurY - t.height/2) : (t.y/100);
    const _rw = _fromLayers ? t.width : ((t.w||30)/100);
    const _rh = _fromLayers ? t.height : ((t.h||15)/100);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (t.rotation) { ctx.translate((_rx+_rw/2)*pw,(_ry+_rh/2)*ph); ctx.rotate(t.rotation*Math.PI/180); ctx.drawImage(t._renderImg,-_rw*pw/2,-_rh*ph/2,_rw*pw,_rh*ph); }
    else ctx.drawImage(t._renderImg,_rx*pw,_ry*ph,_rw*pw,_rh*ph);
    ctx.restore();
    // Aún dibujar el texto encima
    const _cx = _fromLayers ? _rtCurX*pw : (_rx+_rw/2)*pw;
    const _cy = _fromLayers ? _rtCurY*ph : (_ry+_rh/2)*ph;
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
  const _tCurX = _fromLayers && t._pathCurX != null ? t._pathCurX : t.x;
  const _tCurY = _fromLayers && t._pathCurY != null ? t._pathCurY : t.y;
  const _rawX = _fromLayers ? (_tCurX - (t.width  || 0.3) / 2) : (t.x / 100);
  const _rawY = _fromLayers ? (_tCurY - (t.height || 0.15)/ 2) : (t.y / 100);
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
  // Hoja de texto paginada: panel_texts no tiene richLines (columnas fijas),
  // así que se resuelve desde la capa de panel_layers ya asociada por _drawTexts.
  const richSource = (t._bubbleLayer && Array.isArray(t._bubbleLayer.richLines) && t._bubbleLayer.richLines.length)
    ? t._bubbleLayer
    : (Array.isArray(t.richLines) && t.richLines.length ? t : null);
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
  const _txtPathRot = (type === 'text') ? _layerPathRotDeg(t) : 0;
  if (t.rotation || _txtPathRot) ctx.rotate(((t.rotation||0) + _txtPathRot) * Math.PI / 180);
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
    // Caja de texto: rectángulo con esquinas ligeramente redondeadas.
    // Flujo de texto paginado CON marco: relleno y marco se retranquean del
    // borde de la página (frameMarginPx, 10px por defecto) — mismo ajuste y
    // misma razón que en editor.js (TextLayer.draw): el marco de un flujo
    // ocupa siempre toda la página, así que sin este retranqueo quedaba
    // pegado al borde físico de la hoja. Escalado igual que bw (=
    // borderW_*scale) por ser la misma clase de valor.
    const _fm = (richSource && bw > 0) ? (t.frameMarginPx ?? 10) * scale : 0;
    const _fL = -w/2+_fm, _fR = w/2-_fm, _fT = -h/2+_fm, _fB = h/2-_fm;
    const rr = Math.min(6 * scale, (_fR-_fL)/2, (_fB-_fT)/2);
    ctx.beginPath();
    ctx.moveTo(_fL+rr, _fT);
    ctx.lineTo( _fR-rr, _fT); ctx.arcTo( _fR,_fT,  _fR,_fT+rr, rr);
    ctx.lineTo( _fR,    _fB-rr); ctx.arcTo( _fR, _fB,  _fR-rr, _fB, rr);
    ctx.lineTo(_fL+rr, _fB); ctx.arcTo(_fL,  _fB, _fL, _fB-rr, rr);
    ctx.lineTo(_fL,   _fT+rr); ctx.arcTo(_fL,_fT, _fL+rr,_fT, rr);
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

  // Hoja de texto paginada (Editor de textos): formato enriquecido ya maquetado.
  // Coordenadas (line.y, run.x) son absolutas dentro de la página lógica
  // (0,0 = esquina superior izquierda) — mismo criterio que editor.js.
  if (type === 'text' && richSource) {
    _drawRichTextLines(ctx, richSource, w, h, textColor_);
    ctx.restore();
    return;
  }

  // Texto centrado
  ctx.font = (fontItalic_ ? 'italic ' : '') + (fontBold_ ? 'bold ' : '') + fs + 'px ' + fontFamily_;
  // Comparar contra el placeholder en AMBOS idiomas: lo puso el editor de
  // quien creó la obra, en el idioma de SU dispositivo en aquel momento —
  // no necesariamente el mismo idioma en el que se está leyendo ahora aquí.
  const isPlaceholder = (t.text||'') === TRANSLATIONS.es.ed_writeHerePlaceholder
                      || (t.text||'') === TRANSLATIONS.en.ed_writeHerePlaceholder;
  ctx.fillStyle = isPlaceholder ? '#999999' : textColor_;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lines = _getLines(t.text || '');
  const lh = fs * 1.2, totalH = lines.length * lh;
  lines.forEach((line, i) => ctx.fillText(line, 0, -totalH/2 + lh/2 + i*lh));

  ctx.restore();
}

// Fuente para una línea/fragmento de texto enriquecido — misma lógica que
// TextLayer._richFontStr() en editor.js.
function _richFontStr(fontSize, bold, italic, mono, richFontFamily) {
  const fam = mono ? 'monospace' : (richFontFamily || 'Lora');
  const _fam = fam.includes(' ') ? '"' + fam + '"' : fam;
  return (italic ? 'italic ' : '') + (bold ? 'bold ' : '') + fontSize + 'px ' + _fam;
}
// Dibuja las líneas ya maquetadas/paginadas por _tdLayoutPages (js/editor-textdoc.js),
// serializadas en t.richLines — implementación paralela a TextLayer._drawRichLines().
function _drawRichTextLines(ctx, t, w, h, textColor_) {
  ctx.save();
  ctx.translate(-w/2, -h/2);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const _col = textColor_ || '#000000';
  const _quoteCol = '#4A4540'; // --gray-700 — mismo tono atenuado que .td-editor blockquote
  const _fam = t.richFontFamily;
  (t.richLines || []).forEach(line => {
    // Imagen insertada en el flujo de texto (ver _tdParseBlocks/_tdLayoutPages
    // en editor-textdoc.js) — se dibuja con drawImage, no con fillText. La
    // imagen ya está precargada en _tdImgCache por preloadImages() (más
    // arriba), a diferencia de editor.js que la carga de forma perezosa —
    // aquí no hace falta redibujar al cargar porque ya está lista antes de
    // la primera pasada de render.
    if (line.kind === 'image' && line.src) {
      const img = _tdImgCache[line.src];
      if (img && img.complete && img.naturalWidth > 0) {
        // line.imgX ya viene calculada por _tdLayoutPages (editor-textdoc.js),
        // igual que con la x de cada run de texto — mismo criterio que
        // TextLayer._drawRichLines() en editor.js (bug ya corregido ahí de
        // alineación a la izquierda).
        const ix = line.imgX !== undefined ? line.imgX : line.indent;
        ctx.drawImage(img, ix, line.y, line.imgW, line.imgH);
      }
      return;
    }
    const _lineCol = line.kind === 'quote' ? _quoteCol : _col;
    if (line.kind === 'quote') {
      ctx.save();
      ctx.strokeStyle = _lineCol; ctx.globalAlpha = ctx.globalAlpha * 0.32;
      ctx.lineWidth = Math.max(2, line.fontSize * 0.08);
      ctx.beginPath();
      ctx.moveTo(line.indent - 10, line.y - line.fontSize * 0.85);
      ctx.lineTo(line.indent - 10, line.y + line.fontSize * 0.28);
      ctx.stroke();
      ctx.restore();
    }
    if (line.marker) {
      ctx.font = _richFontStr(line.fontSize, false, false, false, _fam);
      ctx.fillStyle = _lineCol;
      ctx.fillText(line.marker, Math.max(0, line.indent - line.fontSize * 0.95), line.y);
    }
    (line.runs || []).forEach(r => {
      const _rfs = r.fontSize || line.fontSize;
      ctx.font = _richFontStr(_rfs, r.bold, r.italic || line.kind === 'quote', r.mono, r.fontFamily || _fam);
      ctx.fillStyle = _lineCol;
      ctx.fillText(r.text, r.x, line.y);
      if (r.strike) {
        ctx.beginPath();
        ctx.lineWidth = Math.max(1, _rfs * 0.06);
        ctx.strokeStyle = _lineCol;
        ctx.moveTo(r.x, line.y - _rfs * 0.32);
        ctx.lineTo(r.x + r.width, line.y - _rfs * 0.32);
        ctx.stroke();
      }
    });
  });
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

// Resetear animaciones de un panel al frame 0 para que se reproduzcan desde el inicio
function _resetPanelAnims(idx) {
  const panel = RS.panels[idx];
  if (!panel) return;
  (panel.layers || []).forEach(layer => {
    if (layer._gifReady) {
      layer._gifIdx      = 0;
      layer._gifLastTick = Date.now(); // iniciar tick desde ahora
      if (layer._gifOc && layer._gifFrames && layer._gifFrames.length) {
        layer._gifOc.getContext('2d').putImageData(layer._gifFrames[0].imageData, 0, 0);
      }
    }
    if (layer._animReady && layer._animFrames) {
      layer._animIdx       = 0;
      layer._animPlayCount = 0;
      layer._animStopped   = false;
      layer._animRestartAt = null;
      // v38.07 — BUG CORREGIDO (reportado por Alberto: animación programada
      // para "desaparecer al final" + temporizador de inicio — si se dejaba
      // reproducir hasta desaparecer, cambiar de hoja y volver YA NO la
      // reproducía; si se cambiaba de hoja ANTES de desaparecer, sí volvía a
      // reproducirse bien). Causa raíz: layer._animFadeOpacity (y su fundido
      // en curso, _animFadeStart/_animFadeDir) solo se limpiaban en la rama
      // "sin retardo de inicio" (el else de abajo) — con retardo configurado
      // Y sin "invisible antes de empezar" marcado (el caso de Alberto: la
      // invisibilidad es AL FINAL, no al principio), ninguna rama tocaba
      // estos campos. El fundido a opacidad 0 disparado por "Invisibilidad →
      // Al final" en el ciclo anterior (ver _readerGifTick, sección
      // _gcpInvisAtEnd) se quedaba fijo para siempre: el frame y el
      // temporizador SÍ se reiniciaban correctamente, pero el objeto seguía
      // invisible sin que nada llegara a restaurar su opacidad. Arreglo:
      // limpiar SIEMPRE aquí, antes de la rama de retardo — que, si aplica,
      // vuelve a poner opacidad 0 explícitamente para el caso "invisible
      // antes de empezar", igual que antes.
      layer._animFadeOpacity = null;
      layer._animFadeStart   = null;
      layer._animFadeDir     = null;
      // Temporizador de inicio: si _gcpStartDelay > 0, no arrancar hasta que pase el tiempo
      const _initDelay = (layer._gcpStartDelay || 0) * 1000;
      if (_initDelay > 0) {
        layer._animLastTick = null;           // no empezar aún
        layer._animStartAt  = Date.now() + _initDelay;
        // Invisibilidad antes del inicio
        if (layer._gcpInvisBeforeStart) { layer._animFadeOpacity = 0; }
      } else {
        layer._animLastTick = Date.now();     // iniciar tick desde ahora
        layer._animStartAt  = null;
      }
      if (layer._animOc && layer._animFrames.length) {
        layer._animOc.getContext('2d').putImageData(layer._animFrames[0].imageData, 0, 0);
      }
    }
    // Trayectoria: reiniciar — si hay delay de inicio, el path espera junto a la animación
    if (layer._motionPath && layer._motionPath.length >= 2) {
      const _hasDelay = (layer._gcpStartDelay || 0) > 0;
      layer._pathStartTime = _hasDelay ? null : Date.now();
      delete layer._pathStopped;
      delete layer._mpInvisTriggered; // permitir que "Invisibilidad → Al final" pueda dispararse de nuevo
      layer._pathCurX = layer.x || 0.5;
      layer._pathCurY = layer.y || 0.5;
      delete layer._pathCurRotDeg;
    }
  });
}

// ── Hit test de botones de capa ──────────────────────────────────────────────
// Helper: recibe coordenadas de ventana, devuelve la capa botón bajo el punto
function _rBtnHitTestCanvas(winX, winY) {
  if (!RS.canvas) return null;
  const _rect = RS.canvas.getBoundingClientRect();
  if (winX < _rect.left || winX > _rect.right || winY < _rect.top || winY > _rect.bottom) return null;
  const { pw, ph } = _panelDims(RS.idx);
  const _sc = Math.min(_rect.width / pw, _rect.height / ph);
  const _ox = (_rect.width  - pw * _sc) / 2;
  const _oy = (_rect.height - ph * _sc) / 2;
  const _tpx = (winX - _rect.left - _ox) / _sc;
  const _tpy = (winY - _rect.top  - _oy) / _sc;
  const _panel = RS.panels[RS.idx];
  return _panel ? _rBtnHitTest(_panel.layers || [], _tpx, _tpy, pw, ph, _panel) : null;
}

// Comprueba el alfa de la imagen renderizada de UNA capa en (lx,ly) — offset en
// px de página respecto a su propio centro, rotación ya deshecha. Devuelve
// true/false si pudo comprobarlo, o null si esa capa no tiene imagen alguna
// (ni _btnHitImg cacheado —solo se cachea ahí si la capa tiene botón— ni
// entrada en panel.layerImgs, que sí existe para cualquier capa con dataUrl).
// 'draw' (formato antiguo): la imagen cubre la página entera, origen (la.x,la.y).
// Resto (stroke, fill, pencil, watercolor, etc.): imagen recortada a su propio
// bbox — normalizar respecto al centro de esa caja.
function _rAlphaHitOwnBitmap(la, lx, ly, pw, ph, layers, panel) {
  let hitImg = la._btnHitImg;
  if (!hitImg && panel && panel.layerImgs && layers) {
    const idx = layers.indexOf(la);
    if (idx >= 0) hitImg = panel.layerImgs[idx];
  }
  if (!hitImg) return null;
  // Crear canvas offscreen la primera vez y cachearlo en la capa
  if (!la._btnAlphaOc) {
    const _oc = document.createElement('canvas');
    const nw = (hitImg.naturalWidth  || hitImg.width  || 256);
    const nh = (hitImg.naturalHeight || hitImg.height || 256);
    _oc.width = nw; _oc.height = nh;
    try {
      _oc.getContext('2d').drawImage(hitImg, 0, 0);
      la._btnAlphaOc = _oc;
    } catch(e) {
      la._btnAlphaOc = null;
      return true; // canvas CORS tainted → solo bbox
    }
  }
  if (!la._btnAlphaOc) return null;
  const boc = la._btnAlphaOc;
  // Mapear coordenadas locales → normalizado [0,1] → pixel del canvas offscreen.
  // Capas 'draw': la imagen cubre la página entera (pw×ph); el origen es (la.x, la.y).
  // Resto: imagen centrada de tamaño (la.width×pw) × (la.height×ph).
  const isDraw = (la.type === 'draw');
  const w = (la.width  || 1) * pw;
  const h = (la.height || 1) * ph;
  const nx = isDraw ? (lx + (la.x || 0.5) * pw) / pw
                    : (lx + w / 2) / w;
  const ny = isDraw ? (ly + (la.y || 0.5) * ph) / ph
                    : (ly + h / 2) / h;
  const px = Math.round(nx * boc.width);
  const py = Math.round(ny * boc.height);
  if (px < 0 || py < 0 || px >= boc.width || py >= boc.height) return false;
  try {
    return boc.getContext('2d').getImageData(px, py, 1, 1).data[3] > 10;
  } catch(e) { return true; }
}

// Alpha hit testing: devuelve true si el toque tiene alpha suficiente.
// lx/ly son coordenadas locales centradas en 0,0 (rotación ya deshecha).
// Soporta: GIF/APNG (canvas offscreen), e imágenes estáticas (draw, stroke, image, etc.)
//
// 'layers'/'panel' (opcionales): el botón de autor se asigna siempre a la capa
// "representante" de un grupo de dibujo a mano (stroke/draw — así se edita el
// grupo como una unidad desde el editor), pero si ese grupo se creó usando
// solo relleno/lápiz/acuarela, la imagen de esa capa representante está vacía
// y el contenido visible real está en la capa HERMANA (fill/pencil/watercolor,
// vinculada por _uid/_drawLayerId). Si el toque no tiene alfa en la imagen
// propia de 'la', se comprueban también las hermanas del mismo grupo antes de
// descartarlo — mismo criterio que el visor interno del editor (_edAlphaHit).
function _rAlphaHit(la, lx, ly, pw, ph, layers, panel) {
  // 1. Animaciones (GIF/APNG): usar su canvas offscreen existente
  const oc = la._animOc || la._gifOc;
  if (oc) {
    const w = (la.width  || 1) * pw;
    const h = (la.height || 1) * ph;
    const px = Math.round((lx + w / 2) / w * oc.width);
    const py = Math.round((ly + h / 2) / h * oc.height);
    if (px < 0 || py < 0 || px >= oc.width || py >= oc.height) return false;
    try {
      return oc.getContext('2d').getImageData(px, py, 1, 1).data[3] > 10;
    } catch(e) { return true; }
  }
  // 2. Bitmap estático de la propia capa
  const ownHit = _rAlphaHitOwnBitmap(la, lx, ly, pw, ph, layers, panel);
  if (ownHit === true) return true;
  if (ownHit === false) {
    if (Array.isArray(layers)) {
      const gid = la._drawLayerId || la._uid;
      if (gid) {
        for (const sib of layers) {
          if (!sib || sib === la) continue;
          if (sib._drawLayerId !== gid && sib._uid !== gid) continue;
          if (_rAlphaHitOwnBitmap(sib, lx, ly, pw, ph, layers, panel) === true) return true;
        }
      }
    }
    return false;
  }
  return true; // sin imagen en absoluto → solo bbox
}

function _rBtnHitTest(layers, tapPx, tapPy, pw, ph, panel) {
  for (let i = layers.length - 1; i >= 0; i--) {
    const la = layers[i];
    if (!la || !la._buttonAction) continue;
    // Usar posición actual de la trayectoria si está en movimiento, si no la original
    const cx = (la._pathCurX != null ? la._pathCurX : (la.x || 0.5)) * pw;
    const cy = (la._pathCurY != null ? la._pathCurY : (la.y || 0.5)) * ph;
    const hw = (la.width  || 1) * pw / 2;
    const hh = (la.height || 1) * ph / 2;
    const dx = tapPx - cx, dy = tapPy - cy;
    const ang = -(la.rotation || 0) * Math.PI / 180;
    const lx = dx * Math.cos(ang) - dy * Math.sin(ang);
    const ly = dx * Math.sin(ang) + dy * Math.cos(ang);
    if (Math.abs(lx) <= hw && Math.abs(ly) <= hh && _rAlphaHit(la, lx, ly, pw, ph, layers, panel)) return la;
  }
  return null;
}

// ── Bloqueo de navegación ────────────────────────────────────
// Reutilizable: cualquier acción que dispare una navegación DELIBERADA a una
// hoja concreta — la barra de navegación por hoja (mientras hay un
// dedo/cursor sobre ella) o un botón "ir a hoja..." colocado por el autor
// dentro de la obra — debe "apagar" momentáneamente la navegación genérica
// (swipe/tap/teclado de avance-retroceso normal). Sin esto, el mismo gesto
// que activa el salto deliberado — o el que llega justo después, mientras
// el salto todavía se está resolviendo (p.ej. el scroll instantáneo de
// _rGoToPanel en modo scroll) — podría interpretarse ADEMÁS como un
// avance/retroceso normal según en qué mitad de la pantalla cae.
let _navLocked = false;
function _navDisable() { _navLocked = true; }
function _navEnable()  { _navLocked = false; }

// Tiempo de margen tras un salto deliberado (botón de autor) antes de
// reactivar la navegación normal — cubre el instante en que _rGoToPanel
// todavía está resolviendo el scroll en modo horizontal/vertical.
const _NAV_RELOCK_MS = 400;
function _navGoToPanelLocked(idx) {
  _navDisable();
  _rGoToPanel(idx);
  setTimeout(_navEnable, _NAV_RELOCK_MS);
}

// Hoja "de recorrido dirigido" (Alberto): si tiene AL MENOS un botón de
// autor de tipo "ir a hoja...", la navegación normal (swipe/tap/teclado/
// barra de hojas) queda desactivada mientras se está viendo — solo se puede
// salir de ella usando alguno de esos botones. Se evalúa en el momento (no
// se guarda en una bandera de estado que haya que refrescar en cada sitio
// que cambia RS.idx) — siempre lee el panel actual directamente.
// Solo cuenta el tipo "page" — un botón "url" abre un enlace externo y no
// ofrece una salida real dentro del lector, así que su sola presencia no
// debe dejar al lector atrapado sin más forma de avanzar/retroceder.
function _panelHasNavButton(panel) {
  if (!panel || !panel.layers) return false;
  return panel.layers.some(l => l && l._buttonAction && l._buttonAction.type === 'page');
}

// Hoja "destino de salto" (Alberto): si ALGÚN botón de autor en CUALQUIER
// hoja de la obra apunta a esta hoja como destino, no se puede retroceder
// DESDE ella — aunque esta hoja en concreto no tenga ningún botón propio.
// Ej.: un botón salta a la hoja 7 → desde la 7 no se puede ir a la 6, pero
// sí a la 8, 9, 10...; y de la 10 se puede volver a la 9, 8, 7 con
// normalidad, pero de nuevo no más allá de la 7. Es decir: bloquea SOLO el
// paso "hacia atrás" al salir de la hoja marcada, no el avance, y no afecta
// a hojas intermedias que no sean, ellas mismas, destino de ningún botón.
// Igual que _panelHasNavButton, se evalúa en el momento — no hay bandera
// que mantener sincronizada al crear/editar/borrar botones, así que
// funciona automáticamente con cualquier cambio guardado desde el editor.
function _panelIsJumpTarget(idx) {
  return RS.panels.some(p => p && p.layers && p.layers.some(
    l => l && l._buttonAction && l._buttonAction.type === 'page' && l._buttonAction.pageIdx === idx
  ));
}

// Fija el touch-action del contenedor de scroll según el sentido que la
// hoja actual tenga prohibido:
//   - Con botón propio (_panelHasNavButton): prohibido AVANZAR — solo se
//     avanza usando el botón; retroceder sigue funcionando con normalidad.
//   - Destino de un salto (_panelIsJumpTarget): prohibido RETROCEDER — no
//     se puede volver a la hoja anterior desde aquí; avanzar sigue
//     funcionando con normalidad.
// Estos dos casos son intencionadamente opuestos y pueden, en teoría,
// coincidir en la misma hoja (tiene botón propio Y es además destino de
// otro salto) — en ese caso quedan bloqueadas las dos direcciones a la vez.
//
// BUG CORREGIDO — Alberto: "el botón funciona en PC, mal en táctil". Un
// elemento con overflow:scroll se convierte, a efectos de touch-action, en
// "el elemento que implementa el gesto de scroll" — y la restricción
// touch-action:none de sus antepasados (html/body, en este proyecto) NO SE
// PROPAGA dentro de él (documentado: MDN, y varios hilos de la spec de
// touch-action/pointerevents). Esto significa que, en hardware táctil real,
// el navegador puede empezar a desplazar #scrollReader de forma nativa, en
// el hilo de composición (para máxima fluidez), ANTES de que el
// preventDefault() del touchmove en JS (la corrección anterior) llegue a
// ejecutarse — es una carrera que Chromium de escritorio (y los eventos
// táctiles sintéticos que no son "trusted") no reproducen de la misma
// forma, por eso no aparecía en las pruebas. Fijar touch-action a nivel de
// CSS aquí elimina la carrera de raíz: el navegador ya sabe, antes de que
// el gesto arranque, qué sentido no debe reservarse para el scroll nativo.
//
// Mapeo confirmado (MDN, CSS-Tricks, contraintuitivo): el nombre del valor
// describe hacia dónde se desplaza el CONTENIDO, no el dedo — "pan-left"
// ocurre cuando el dedo se arrastra hacia la DERECHA (y "pan-up" cuando se
// arrastra hacia ABAJO). En este lector, retroceder (idx--) es arrastrar el
// dedo hacia la derecha en horizontal o hacia abajo en vertical — es decir,
// "pan-left"/"pan-up" — y avanzar (idx++) es "pan-right"/"pan-down".
function _updateContainerTouchAction() {
  const container = document.getElementById('scrollReader');
  if (!container) return;
  const isH = RS.navMode === 'horizontal';
  const blockFwd  = _panelHasNavButton(RS.panels[RS.idx]);
  const blockBack = _panelIsJumpTarget(RS.idx);
  if (blockFwd && blockBack) {
    container.style.touchAction = 'none';
  } else if (blockFwd) {
    container.style.touchAction = isH ? 'pan-left' : 'pan-up';    // permite retroceder, bloquea avanzar
  } else if (blockBack) {
    container.style.touchAction = isH ? 'pan-right' : 'pan-down'; // permite avanzar, bloquea retroceder
  } else {
    container.style.touchAction = '';
  }
}

// Bloqueo transitorio (_navLocked, mientras se resuelve un salto deliberado)
// combinado con la prohibición de AVANZAR de una hoja con botón propio —
// usado por advance()/_vsForward(). Retroceder tiene su propia condición
// (_panelIsJumpTarget), comprobada aparte en goBack()/_vsBack() porque debe
// dejar pasar primero la revelación de texto hacia atrás en la misma hoja.
function _navBlockedFwd() {
  return _navLocked || _panelHasNavButton(RS.panels[RS.idx]);
}

// Navegar a un panel específico respetando el estado del reader
function _rGoToPanel(idx) {
  if (idx < 0 || idx >= RS.panels.length) return;
  if (RS.navMode === 'horizontal' || RS.navMode === 'vertical') {
    // Modo scroll: desplazar el contenedor nativo — el listener 'scroll' de
    // _startScrollReader ya se encarga de actualizar RS.idx, activar el
    // canvas correcto, resetear animaciones y volver a renderizar en cuanto
    // el scroll llega a la posición (ver ese listener más abajo).
    //
    // BUG CORREGIDO (v_reader — verificado con test real): sin esto,
    // _rGoToPanel solo cambiaba RS.idx y volvía a renderizar sobre lo que
    // en ese momento fuera RS.ctx (el canvas de la hoja QUE SE ESTABA
    // VIENDO, no el destino) — el contenido de la hoja destino aparecía
    // pintado encima de la hoja visible, sin que la vista se moviera de
    // verdad a ninguna parte. Afectaba tanto a los botones "ir a hoja X" ya
    // existentes dentro de una obra como a cualquier navegación programática
    // a un índice concreto en modo scroll.
    //
    // BUG CORREGIDO (v_reader2 — Alberto, probando con obra de flujo de
    // texto largo: "el deslizador no tiene claro en qué parte de la barra
    // situarse"). Causa real: con behavior:'smooth', saltar de una hoja
    // lejana a otra (p.ej. de la 3 a la 50) anima el scroll pasando de
    // verdad por CADA hoja intermedia — y el listener 'scroll' de más abajo
    // recalcula RS.idx en cada una mientras dura la animación, así que el
    // valor del slider (actualizado desde _pageNavUpdate, dentro de
    // _render()) iba saltando de posición en posición en vez de ir directo
    // al destino. Cuantas más hojas de por medio, más visible el efecto.
    // behavior:'instant' resuelve el scroll de una vez, sin pasar por las
    // intermedias — el slider llega directo al valor final. El ARRASTRE del
    // slider en sí (evento 'input', que solo previsualiza la etiqueta sin
    // llamar aquí) no se toca y sigue exactamente igual.
    const container = document.getElementById('scrollReader');
    if (container) {
      const isH   = RS.navMode === 'horizontal';
      const size  = isH ? container.clientWidth : container.clientHeight;
      if (size) {
        container.scrollTo({ left: isH ? idx * size : 0, top: isH ? 0 : idx * size, behavior: 'instant' });
        return;
      }
    }
    // Sin contenedor o medida válida: seguir como red de seguridad con el camino de modo fixed.
  }
  RS.idx = idx;
  RS.textStep = _initTextStep(idx);
  RS.fadeAlpha = 0;
  _resetPanelAnims(idx);
  _resizeCanvas();
  _render();
}

function advance() {
  if (_navBlockedFwd()) return;
  if (RS.fadeRaf) { cancelAnimationFrame(RS.fadeRaf); RS.fadeRaf = null; RS.fadeAlpha = 0; }
  const panel = RS.panels[RS.idx];
  const tl    = panel?.texts || [];
  const isSeq = (panel?.text_mode || 'sequential') === 'sequential';

  if (isSeq && RS.textStep < tl.length) {
    _startFade(); RS.textStep++; _render(); return;
  }
  if (RS.idx < RS.panels.length - 1) {
    RS.idx++; RS.textStep = _initTextStep(RS.idx); RS.fadeAlpha = 0;
    _resetPanelAnims(RS.idx); // reiniciar animaciones desde frame 0
    _resizeCanvas(); _render();
  }
}

function goBack() {
  if (_navLocked) return;
  if (RS.fadeRaf) { cancelAnimationFrame(RS.fadeRaf); RS.fadeRaf = null; RS.fadeAlpha = 0; }
  const panel = RS.panels[RS.idx];
  const isSeq = (panel?.text_mode || 'sequential') === 'sequential';

  if (isSeq && RS.textStep > 1) { RS.textStep--; RS.fadeAlpha = 0; _render(); return; }
  // Hoja destino de un salto (ver _panelIsJumpTarget): prohibido retroceder
  // desde aquí, aunque revelar texto hacia atrás en ESTA misma hoja (arriba)
  // sigue funcionando con normalidad.
  if (_panelIsJumpTarget(RS.idx)) return;
  if (RS.idx > 0) {
    RS.idx--;
    const pp = RS.panels[RS.idx];
    RS.textStep  = (pp?.text_mode || 'sequential') === 'sequential' ? (pp?.texts || []).length : 0;
    RS.fadeAlpha = 0;
    _resetPanelAnims(RS.idx); // reiniciar animaciones desde frame 0
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

function _hideCreditsButtons() {
  document.querySelectorAll('._cxCreditBtn').forEach(el => el.remove());
  // NO borrar _creditsLink/_creditsRestart — se reutilizan al volver a créditos
}

function _mountCreditsWhenScrollEnds(container, isH) {
  // Esperar a que el scroll-snap termine: detectar que la posición no cambia
  let lastPos = isH ? container.scrollLeft : container.scrollTop;
  let stable  = 0;
  function check() {
    if (!RS.isCredits) return; // el usuario ya navegó a otro panel
    const pos = isH ? container.scrollLeft : container.scrollTop;
    if (pos === lastPos) {
      stable++;
      if (stable >= 3) {
        _mountCreditsButtons();
        return;
      }
    } else {
      stable  = 0;
      lastPos = pos;
    }
    requestAnimationFrame(check);
  }
  requestAnimationFrame(check);
}

function _showCredits() {
  RS.isCredits = true;
  _hideCreditsButtons(); // limpiar botones previos antes de remontar
  _renderCredits();

  const isScrollMode = document.getElementById('scrollReader')?.className?.includes('scroll-');
  if (!isScrollMode) {
    _mountCreditsButtons();
  }
}

function _renderCredits() {
  const { pw, ph } = _panelDims(RS.idx);
  const ctx = RS.ctx;
  const isHoriz    = pw > ph;
  const socialText = RS._workSocial || '';
  const authorText = RS._workAuthor || '';

  ctx.clearRect(0, 0, pw, ph);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pw, ph);
  ctx.textBaseline = 'middle';

  function wrapText(text, maxW) {
    const result = [];
    text.split('\n').forEach(para => {
      if (!para.trim()) { result.push(''); return; }
      const words = para.split(' ');
      let cur = '';
      words.forEach(w => {
        if (ctx.measureText(w).width > maxW) {
          if (cur) { result.push(cur); cur = ''; }
          let chunk = '';
          for (const ch of w) {
            const test = chunk + ch;
            if (ctx.measureText(test).width > maxW && chunk) { result.push(chunk); chunk = ch; }
            else chunk = test;
          }
          if (chunk) cur = chunk;
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
    const fRef = ph;
    const leftW = pw * 0.52, leftX = pw * 0.04, colGap = pw * 0.04;
    const rightCX = leftW + colGap + pw * 0.44 / 2;
    const socialMaxW = leftW - leftX - pw * 0.02;
    const socialFS = Math.round(fRef * 0.055);
    const authorFS = Math.round(fRef * 0.072);

    ctx.globalAlpha = 0.15; ctx.fillStyle = '#888';
    ctx.fillRect(leftW + colGap * 0.4, ph * 0.1, 1, ph * 0.8);
    ctx.globalAlpha = 1;

    let socialLines = [];
    if (socialText) {
      ctx.font = '400 ' + socialFS + 'px Arial, Helvetica, sans-serif';
      socialLines = wrapText(socialText, socialMaxW);
    }
    const socialLineH = socialFS * 1.5;
    const blockH = socialLines.length * socialLineH + (socialText ? socialFS * 1.2 : 0) + authorFS * 1.5;
    let y = (ph - blockH) / 2 + socialLineH * 0.5;
    if (socialText) {
      ctx.font = '400 ' + socialFS + 'px Arial, Helvetica, sans-serif';
      ctx.fillStyle = '#444'; ctx.textAlign = 'center';
      socialLines.forEach(line => { ctx.fillText(line, leftX + leftW / 2, y); y += socialLineH; });
      y += socialFS * 0.8;
    }
    ctx.font = '600 ' + authorFS + 'px Arial, Helvetica, sans-serif';
    ctx.fillStyle = '#222'; ctx.textAlign = 'center';
    ctx.fillText(authorText, leftX + leftW / 2, y);

    const logoFS = Math.round(fRef * 0.11), sloganFS = Math.round(fRef * 0.042), linkFS = socialFS;
    const lineH = ph * 0.09;
    const rightBlockH = lineH * 1.3 + logoFS + sloganFS * 2 + sloganFS * 3 + linkFS;
    const rightStartY = (ph - rightBlockH) / 2 + logoFS * 0.5;
    if (_iconImg && _iconImg.complete && _iconImg.naturalWidth > 0 && _logoImg && _logoImg.complete && _logoImg.naturalWidth > 0) {
      const lh = logoFS * 1.1;
      const lw2 = _logoImg.naturalWidth * (lh / _logoImg.naturalHeight);
      const iw2 = _iconImg.naturalWidth * (lh / _iconImg.naturalHeight);
      const gap = lh * 0.3;
      const startX = rightCX - (iw2 + gap + lw2) / 2, topY = rightStartY - lh * 0.8;
      ctx.drawImage(_iconImg, startX, topY, iw2, lh);
      ctx.drawImage(_logoImg, startX + iw2 + gap, topY, lw2, lh);
    } else if (_logoImg && _logoImg.complete && _logoImg.naturalWidth > 0) {
      const lh = logoFS * 1.1, lw2 = _logoImg.naturalWidth * (lh / _logoImg.naturalHeight);
      ctx.drawImage(_logoImg, rightCX - lw2/2, rightStartY - lh * 0.8, lw2, lh);
    }
    const sloganY = rightStartY + sloganFS * 2;
    ctx.font = '400 ' + sloganFS + 'px Arial, Helvetica, sans-serif'; ctx.fillStyle = '#555';
    ctx.fillText(I18n.t('tagline'), rightCX, sloganY);
    const linkY = sloganY + sloganFS * 3;
    ctx.font = '400 ' + linkFS + 'px Arial, Helvetica, sans-serif'; ctx.fillStyle = '#1a73e8';
    const _visitTxt = I18n.t('reader_visitMoreWorks');
    ctx.fillText(_visitTxt, rightCX, linkY);
    const lw = ctx.measureText(_visitTxt).width;
    ctx.beginPath(); ctx.strokeStyle = '#1a73e8'; ctx.lineWidth = Math.max(1, linkFS * 0.06);
    ctx.moveTo(rightCX - lw/2, linkY + linkFS * 0.6); ctx.lineTo(rightCX + lw/2, linkY + linkFS * 0.6); ctx.stroke();
    const restartFS = socialFS, restartY = linkY + linkFS * 2.2;
    ctx.font = '600 ' + restartFS + 'px Arial, Helvetica, sans-serif'; ctx.fillStyle = '#888';
    ctx.fillText(I18n.t('reader_backToReading'), rightCX, restartY);
    // Guardar coordenadas canvas para los botones HTML
    RS._creditsLink    = { cx: rightCX, cy: linkY,    fs: linkFS,    pw, ph };
    RS._creditsRestart = { cx: rightCX, cy: restartY, fs: restartFS, pw, ph };

  } else {
    const fRef = pw, cx = pw / 2, maxW = pw * 0.82;
    let authorY = ph * 0.11;
    const socialFS = Math.round(fRef * 0.038);
    if (socialText) {
      ctx.font = '400 ' + socialFS + 'px Arial, Helvetica, sans-serif';
      ctx.fillStyle = '#444'; ctx.textAlign = 'center';
      const socialLines = wrapText(socialText, maxW);
      const socialLineH = socialFS * 1.4, socialStartY = ph * 0.26;
      socialLines.forEach((line, i) => ctx.fillText(line, cx, socialStartY + i * socialLineH));
      authorY = socialStartY + socialLines.length * socialLineH + socialFS * 0.9;
    }
    ctx.font = '600 ' + Math.round(fRef * 0.055) + 'px Arial, Helvetica, sans-serif';
    ctx.fillStyle = '#222'; ctx.textAlign = 'center';
    ctx.fillText(authorText, cx, authorY);
    const lineH = ph * 0.09, logoFS = Math.round(fRef * 0.11), logoY = authorY + lineH * 1.3;
    if (_iconImg && _iconImg.complete && _iconImg.naturalWidth > 0 && _logoImg && _logoImg.complete && _logoImg.naturalWidth > 0) {
      const lh2 = logoFS * 1.1;
      const lw2 = _logoImg.naturalWidth * (lh2 / _logoImg.naturalHeight);
      const iw2 = _iconImg.naturalWidth * (lh2 / _iconImg.naturalHeight);
      const gap2 = lh2 * 0.3;
      const startX2 = cx - (iw2 + gap2 + lw2) / 2, topY2 = logoY - lh2 * 0.8;
      ctx.drawImage(_iconImg, startX2, topY2, iw2, lh2);
      ctx.drawImage(_logoImg, startX2 + iw2 + gap2, topY2, lw2, lh2);
    } else if (_logoImg && _logoImg.complete && _logoImg.naturalWidth > 0) {
      const lh2 = logoFS * 1.1, lw2 = _logoImg.naturalWidth * (lh2 / _logoImg.naturalHeight);
      ctx.drawImage(_logoImg, cx - lw2/2, logoY - lh2 * 0.8, lw2, lh2);
    }
    const sloganFS = Math.round(fRef * 0.042), sloganY = logoY + sloganFS * 2;
    ctx.font = '400 ' + sloganFS + 'px Arial, Helvetica, sans-serif'; ctx.fillStyle = '#555';
    ctx.fillText(I18n.t('tagline'), cx, sloganY);
    const linkFS = socialFS, linkY = sloganY + sloganFS * 3;
    ctx.font = '400 ' + linkFS + 'px Arial, Helvetica, sans-serif'; ctx.fillStyle = '#1a73e8';
    const _visitTxt2 = I18n.t('reader_visitMoreWorks');
    ctx.fillText(_visitTxt2, cx, linkY);
    const lw = ctx.measureText(_visitTxt2).width;
    ctx.beginPath(); ctx.strokeStyle = '#1a73e8'; ctx.lineWidth = Math.max(1, linkFS * 0.06);
    ctx.moveTo(cx - lw/2, linkY + linkFS * 0.6); ctx.lineTo(cx + lw/2, linkY + linkFS * 0.6); ctx.stroke();
    const restartFS = socialFS, restartY = linkY + linkFS * 2.2;
    ctx.font = '600 ' + restartFS + 'px Arial, Helvetica, sans-serif'; ctx.fillStyle = '#888';
    ctx.fillText(I18n.t('reader_backToReading'), cx, restartY);
    RS._creditsLink    = { cx, cy: linkY,    fs: linkFS,    pw, ph };
    RS._creditsRestart = { cx, cy: restartY, fs: restartFS, pw, ph };
  }
}

function _mountCreditsButtons() {
  const cl = RS._creditsLink;
  const cr = RS._creditsRestart;
  if (!cl || !cr) return;

  // Posición real del canvas en pantalla (funciona en modo fixed y scroll)
  const rect = RS.canvas.getBoundingClientRect();
  const cW = rect.width;
  const cH = rect.height;
  const sx = cW / cl.pw;
  const sy = cH / cl.ph;

  function makeBtn(data, isLink) {
    const el = isLink ? document.createElement('a') : document.createElement('button');
    if (isLink) { el.href = 'https://comxow.com/'; el.target = '_blank'; el.rel = 'noopener'; }
    el.className = '_cxCreditBtn';
    // Coordenadas canvas → pantalla
    const screenX = rect.left + data.cx * sx;
    const screenY = rect.top  + data.cy * sy;
    const bw = Math.round(data.fs * 10 * sx);
    const bh = Math.round(data.fs * 3  * sy);
    el.style.cssText = [
      'position:fixed',
      'left:'   + Math.round(screenX - bw/2) + 'px',
      'top:'    + Math.round(screenY - bh/2) + 'px',
      'width:'  + bw + 'px',
      'height:' + bh + 'px',
      'z-index:2147483647',
      'background:transparent',
      'border:none',
      'outline:none',
      '-webkit-appearance:none',
      'appearance:none',
      'cursor:pointer',
      'pointer-events:all',
      'touch-action:manipulation',
      '-webkit-tap-highlight-color:transparent',
      'padding:0',
      'margin:0',
      'display:block',
    ].join(';');
    return el;
  }

  const lk = makeBtn(cl, true);
  document.body.appendChild(lk);

  const rb = makeBtn(cr, false);
  rb.addEventListener('click',    e => { e.stopPropagation(); _creditsClick(); });
  rb.addEventListener('touchend', e => { e.stopPropagation(); e.preventDefault(); _creditsClick(); }, { passive: false });
  document.body.appendChild(rb);
}

function _resetCredits() {
  RS.isCredits = false;
  _hideCreditsButtons();
}

function _creditsClick() {
  // Recargar la obra desde el principio — la forma más simple y fiable
  window.location.reload();
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

  // Swipe táctil con AbortController
  RS.ac = new AbortController();
  const sig = { signal: RS.ac.signal };
  let sx = null, sy = null, cancelled = false;
  // Zoom táctil (pellizco/paneo) — ver módulo RZ más arriba.
  let _rzArmTimer = null, _rzArmed = false, _rzPanning = false, _rzPanned = false;
  let _rzPanTx0 = 0, _rzPanTy0 = 0, _rzPanOrig = null;

  RS.canvas.addEventListener('touchstart', e => {
    if (_rzArmTimer) { clearTimeout(_rzArmTimer); _rzArmTimer = null; }
    if (e.touches.length >= 2) {
      // Segundo dedo: es un pellizco — cancelar cualquier candidatura a swipe/paneo.
      sx = null; sy = null; cancelled = false; _rzArmed = false; _rzPanning = false;
      _rzPinchStart(RS.canvas, e.touches);
      return;
    }
    // Un solo dedo: capturar posición YA (para que un tap rápido siga
    // funcionando exactamente igual que siempre), pero esperar
    // RZ_TOUCH_DELAY_MS antes de "armar" el paneo en vivo — así, si llega
    // un segundo dedo durante ese margen, se cede el control al pellizco
    // de arriba sin que este dedo haya llegado a mover nada todavía.
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    cancelled = false; _rzArmed = false; _rzPanning = false; _rzPanned = false;
    _rzArmTimer = setTimeout(() => {
      _rzArmTimer = null;
      _rzArmed = true;
      if (RZ.scale > 1) {
        _rzPanning = true;
        _rzPanOrig = _rzOrigRect(RS.canvas);
        _rzPanTx0 = RZ.tx; _rzPanTy0 = RZ.ty;
      }
    }, RZ_TOUCH_DELAY_MS);
  }, { passive: true, ...sig });

  RS.canvas.addEventListener('touchmove', e => {
    if (e.touches.length >= 2) { _rzPinchMove(e.touches); e.preventDefault(); return; }
    if (sx === null) return;
    if (_rzPanning) {
      RZ.tx = _rzPanTx0 + (e.touches[0].clientX - sx);
      RZ.ty = _rzPanTy0 + (e.touches[0].clientY - sy);
      _rzClamp(_rzPanOrig);
      _rzApply(RS.canvas);
      _rzPanned = true;
      e.preventDefault();
      return;
    }
    const dy = e.touches[0].clientY - sy;
    if (Math.abs(dy) > 30) cancelled = true;
  }, { passive: false, ...sig });

  RS.canvas.addEventListener('touchend', e => {
    if (_rzArmTimer) { clearTimeout(_rzArmTimer); _rzArmTimer = null; }
    if (_rzPinch) { _rzPinchEnd(); sx = null; return; } // venía de un pellizco — no navegar
    if (_rzPanning) { _rzPanning = false; sx = null; if (_rzPanned) return; } // paneo real — no navegar
    if (sx === null) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const dx   = Math.abs(endX - sx);
    const dy   = Math.abs(endY - sy);
    const wasCancelled = cancelled;
    sx = null; cancelled = false;

    // Botones de capa: prioridad absoluta (incluso sobre cancelled/swipe)
    const _bhit = _rBtnHitTestCanvas(endX, endY);
    if (_bhit) {
      const _ba = _bhit._buttonAction;
      if (_ba.type === 'page') { _navGoToPanelLocked(_ba.pageIdx); return; }
      if (_ba.type === 'url')  { window.open(_ba.url, '_blank', 'noopener'); return; }
    }

    if (wasCancelled) return;
    if (dy > 40) return;
    // En créditos: swipe horizontal o tap en mitad izquierda → navegar atrás.
    // Tap en mitad derecha o sobre botones HTML → el overlay gestiona.
    if (RS.isCredits) {
      if (dx > 30 && dx > dy * 1.5) { goBack(); return; } // swipe
      if (dx < 20 && dy < 20 && endX < window.innerWidth * 0.5) { goBack(); return; } // tap izq
      return; // tap derecha: el overlay HTML gestiona los clicks
    }
    // Navegación normal
    if (_isBackSide(endX, endY)) goBack(); else advance();
  }, { passive: true, ...sig });

  // PC: Ctrl+rueda para zoom hacia el cursor (estándar del resto de la web)
  RS.canvas.addEventListener('wheel', e => {
    _rzWheelZoom(e, RS.canvas);
  }, { passive: false, ...sig });

  // RATÓN / PC: detección de botones de capa + arrastre para panear cuando ya hay zoom
  let _mpX = null, _mpY = null, _mpPanning = false, _mpPanTx0 = 0, _mpPanTy0 = 0, _mpPanOrig = null;
  RS.canvas.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') return;
    _mpX = e.clientX; _mpY = e.clientY;
    _mpPanning = RZ.scale > 1;
    if (_mpPanning) {
      _mpPanOrig = _rzOrigRect(RS.canvas);
      _mpPanTx0 = RZ.tx; _mpPanTy0 = RZ.ty;
    }
  }, { passive: true, ...sig });
  RS.canvas.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || _mpX === null || !_mpPanning) return;
    RZ.tx = _mpPanTx0 + (e.clientX - _mpX);
    RZ.ty = _mpPanTy0 + (e.clientY - _mpY);
    _rzClamp(_mpPanOrig);
    _rzApply(RS.canvas);
  }, { passive: true, ...sig });
  RS.canvas.addEventListener('pointerup', e => {
    if (e.pointerType !== 'mouse' || _mpX === null) return;
    const _mdx = Math.abs(e.clientX - _mpX), _mdy = Math.abs(e.clientY - _mpY);
    const _wasPanning = _mpPanning;
    _mpX = null; _mpY = null; _mpPanning = false;
    if (_wasPanning) return; // fue paneo, no un clic de botón
    // Botones de capa: prioridad absoluta — mismo criterio que el resto de
    // manejadores (touchend de fixed/scroll, pointerup de scroll).
    const _bhit = _rBtnHitTestCanvas(e.clientX, e.clientY);
    if (_bhit) {
      const _ba = _bhit._buttonAction;
      if (_ba.type === 'page') { _navGoToPanelLocked(_ba.pageIdx); return; }
      if (_ba.type === 'url')  { window.open(_ba.url, '_blank', 'noopener'); return; }
    }
    if (_mdx > 15 || _mdy > 15) return; // fue un arrastre, no un clic
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




function setLoadingMsg(msg) { const el = document.getElementById('loadingMsg'); if (el) el.textContent = msg; }
function setLoadingProgress(pct, label) {
  const bar = document.getElementById('loadingBar');
  const lbl = document.getElementById('loadingLabel');
  if (bar) bar.style.width = Math.round(Math.min(100, Math.max(0, pct))) + '%';
  if (lbl) lbl.textContent = label || '';
}

function _updateOGMeta(title, author, coverUrl) {
  const t = (title || 'ComXow') + ' — ComXow';
  const d = author ? I18n.t('reader_ogDescriptionWithAuthor', { author }) : I18n.t('reader_ogDescriptionDefault');
  document.title = t;
  document.querySelector('meta[property="og:title"]')       ?.setAttribute('content', t);
  document.querySelector('meta[property="og:description"]') ?.setAttribute('content', d);
  document.querySelector('meta[name="twitter:title"]')      ?.setAttribute('content', t);
  document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', d);
  if (coverUrl) {
    document.querySelector('meta[property="og:image"]')      ?.setAttribute('content', coverUrl);
    document.querySelector('meta[property="og:image:width"]') ?.setAttribute('content', '');
    document.querySelector('meta[property="og:image:height"]')?.setAttribute('content', '');
    document.querySelector('meta[name="twitter:image"]')      ?.setAttribute('content', coverUrl);
  }
}
function showError(msg) {
  document.getElementById('loadingScreen').classList.add('hidden');
  document.getElementById('errorScreen').classList.remove('hidden');
  const el = document.getElementById('errorMsg');
  if (el) el.textContent = msg;
}

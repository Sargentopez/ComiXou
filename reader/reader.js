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
    function loadOne(i) {
      if (i >= dataUrls.length) return Promise.resolve({frames:results,width:W,height:H});
      return new Promise(function(res) {
        var img = new Image();
        img.onload = function() {
          if (!W) { W=img.naturalWidth; H=img.naturalHeight; }
          var oc=document.createElement('canvas'); oc.width=W; oc.height=H;
          oc.getContext('2d').drawImage(img,0,0);
          results[i]={imageData:oc.getContext('2d').getImageData(0,0,W,H),delay:delay||100};
          res();
        };
        img.onerror=function(){
          results[i]={imageData:new ImageData(W||1,H||1),delay:delay||100};
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
    if (fromApp) {
      // Abierto desde dentro de la app: volver a my-comics directamente.
      // NO usar history.back() — en Android Chrome PWA lleva al inicio del
      // navegador en lugar de a la app.
      const base = window.location.href.replace(/\/reader\/.*$/, '/');
      window.location.href = base + '#my-comics';
      return;
    }
    // Acceso externo (enlace compartido): intentar cerrar la pestaña
    if (history.length > 1) { history.back(); return; }
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

  if (draft) { loadDraft(draft); return; }
  if (id)    { loadWork(id);     return; }
  showError('No se indicó ninguna obra. Comprueba el enlace.');
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
  setLoadingMsg('Cargando obra...');
  try {
    const work = await sbGet('works?id=eq.' + workId + '&published=eq.true');
    if (!work || !work.length) { showError('Esta obra no existe o no está publicada.'); return; }

    setLoadingMsg('Cargando páginas...');
    await _loadPanels(workId);
    document.title = (work[0].title || 'Obra') + ' — ComXow';
    RS._workAuthor = work[0].author_name || "";
    RS._workSocial = work[0].social      || "";
    RS._workTitle  = work[0].title       || '';
    RS.navMode     = work[0].nav_mode    || 'fixed';
    // Actualizar meta OG con datos reales de la obra
    _updateOGMeta(work[0].title, work[0].author_name, work[0].cover_url);
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
    // Intento 1: acceso público por UUID (funciona cuando la RLS lo permite para todos)
    let work = null;
    let useAuth = false;
    try { work = await sbGet('works?id=eq.' + token); } catch(_) {}

    // Intento 2: con JWT del autor autenticado en este navegador (fallback)
    if (!work || !work.length) {
      try { work = await sbGetAuth('works?id=eq.' + token); useAuth = !!work?.length; } catch(_) {}
    }

    if (!work || !work.length) {
      showError('Este borrador no está disponible. Comprueba que el enlace es correcto o que la obra no ha sido eliminada.');
      return;
    }

    setLoadingMsg('Cargando páginas...');
    await _loadPanels(token, useAuth);
    document.title = (work[0].title || 'Borrador') + ' — ComXow';
    RS._workAuthor = work[0].author_name || '';
    RS._workSocial = work[0].social      || '';
    RS._workTitle  = work[0].title       || '';
    RS.navMode     = work[0].nav_mode    || 'fixed';
    _updateOGMeta(work[0].title, work[0].author_name, work[0].cover_url);
    const _lastPanel = RS.panels[RS.panels.length - 1];
    RS.panels.push({ id: 'credits', isCredits: true, orientation: _lastPanel?.orientation || 'v', layers: [], texts: [] });
    setLoadingMsg('Preparando imágenes...');
    await preloadImages();
    startReader();
  } catch(err) {
    console.error('Error loadDraft:', err);
    showError('Error al cargar el borrador. Comprueba tu conexión e inténtalo de nuevo.');
  }
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

    // Cachear referencia de imagen en capas botón para alpha hit testing en recorridos
    (panel.layers || []).forEach((layer, j) => {
      if (layer._buttonAction && panel.layerImgs[j]) layer._btnHitImg = panel.layerImgs[j];
    });

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

// sbGet / sbGetAuth: timeout de 12s con AbortController para evitar freeze en Android
// con conexión móvil inestable (patrón idéntico a _get() en supabase-client.js)
const _SB_TIMEOUT_MS = 12000;

async function sbGet(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), _SB_TIMEOUT_MS);
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY },
      signal: controller.signal,
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
// ── Bezier sampling para recorridos cerrados (reader) ────────────────────────────
function _bezierSampleClosed(pts, numSamples) {
  const n = pts.length;
  const result = [];
  for (let s = 0; s < numSamples; s++) {
    const tFull = (s / numSamples) * n;
    const seg  = Math.floor(tFull) % n;
    const u    = tFull - Math.floor(tFull);
    const prev = (seg - 1 + n) % n, next = (seg + 1) % n;
    const mp0x = (pts[prev].x + pts[seg].x) / 2, mp0y = (pts[prev].y + pts[seg].y) / 2;
    const mp1x = (pts[seg].x + pts[next].x)  / 2, mp1y = (pts[seg].y + pts[next].y)  / 2;
    result.push({
      x: (1-u)*(1-u)*mp0x + 2*(1-u)*u*pts[seg].x + u*u*mp1x,
      y: (1-u)*(1-u)*mp0y + 2*(1-u)*u*pts[seg].y + u*u*mp1y
    });
  }
  result.push({ x: result[0].x, y: result[0].y });
  return result;
}

// ── Helper: posición a lo largo de un trayecto (t = fracción de longitud de arco) ─
// pw/ph: dimensiones reales del lienzo en px para arc-length en espacio píxel real
function _easeT(t,accel){
  if(!accel||accel==='none')return t;
  const c=t<0?0:t>1?1:t;
  const _eo=(x)=>{
    const kt=0.75,kp=0.9,sl=kp/kt;
    if(x<kt)return sl*x;
    const u=(x-kt)/(1-kt),m=sl*(1-kt);
    return(2*u*u*u-3*u*u+1)*kp+(u*u*u-2*u*u+u)*m+(-2*u*u*u+3*u*u);
  };
  if(accel==='start') return _eo(c);
  if(accel==='end')   return 1-_eo(1-c);
  if(accel==='middle')return c<0.5?(1-_eo(1-2*c))/2:(1+_eo(2*c-1))/2;
  return t;
}
function _pathPositionAt(points, closed, t, pw, ph) {
  if (!points || points.length === 0) return null;
  if (points.length === 1) return { x: points[0].x, y: points[0].y };
  const _pw = pw || 360, _ph = ph || 780;
  // Para bucles cerrados: bezier sample → misma curva que el render, sin costura brusca
  const pts = (closed && points.length >= 3)
    ? _bezierSampleClosed(points, 200)
    : (closed ? [...points, points[0]] : points);
  const dists = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot((pts[i].x - pts[i-1].x) * _pw, (pts[i].y - pts[i-1].y) * _ph);
    dists.push(d);
    total += d;
  }
  if (total === 0) return { x: pts[0].x, y: pts[0].y };
  const _t = ((t % 1) + 1) % 1;
  const target = _t * total;
  let cum = 0;
  for (let i = 0; i < dists.length; i++) {
    if (cum + dists[i] >= target) {
      const f = dists[i] > 0 ? (target - cum) / dists[i] : 0;
      return { x: pts[i].x + (pts[i+1].x - pts[i].x) * f,
               y: pts[i].y + (pts[i+1].y - pts[i].y) * f };
    }
    cum += dists[i];
  }
  return { x: pts[pts.length-1].x, y: pts[pts.length-1].y };
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
          if (now - layer._gifLastTick >= (frame.delay || 100)) {
            layer._gifIdx = (layer._gifIdx + 1) % layer._gifFrames.length;
            layer._gifOc.getContext('2d').putImageData(layer._gifFrames[layer._gifIdx].imageData, 0, 0);
            layer._gifLastTick = now;
            panelChanged = true;
          }
        }
      }
      // APNG: tick con delay real (suspendido si motion path con ciclos controla el frame)
      if (layer._animReady && layer._animFrames && layer._animFrames.length > 1) {
        const _animMpSync = layer._motionPath && layer._motionCycles != null;
        if (_animMpSync) { /* frame controlado por motor de path — ver más abajo */ }
        else if (!layer._animLastTick) {
          // Esperar hasta que expire el temporizador de inicio
          if (layer._animStartAt && now >= layer._animStartAt) {
            layer._animLastTick = now;
            layer._animStartAt  = null;
            panelChanged = true;
          }
        }
        else {
        // Reinicio automático: si la animación está detenida y el plazo ha pasado, reiniciar
        if (layer._animStopped) {
          if (layer._gcpRestartDelay > 0 && layer._animRestartAt && now >= layer._animRestartAt) {
            layer._animStopped   = false;
            layer._animRestartAt = null;
            layer._animIdx       = 0;
            layer._animPlayCount = 0;
            layer._animLastTick  = now;
            if (layer._animOc && layer._animFrames && layer._animFrames.length) {
              layer._animOc.getContext('2d').putImageData(layer._animFrames[0].imageData, 0, 0);
            }
            // Reiniciar el recorrido sincronizado con la animación
            if (layer._motionPath && layer._motionPath.length >= 2) {
              layer._pathStartTime = now;
              delete layer._pathStopped;
              layer._pathCurX = layer.x || 0.5;
              layer._pathCurY = layer.y || 0.5;
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
            } else {
              _nextIdx = 0; // loop infinito o más repeticiones
            }
          }
          layer._animIdx = _nextIdx;
          layer._animOc.getContext('2d').putImageData(layer._animFrames[_nextIdx].imageData, 0, 0);
          layer._animLastTick = now;
          panelChanged = true;
        }
        } // end else (!_animStopped)
        } // end else (!_animMpSync)
      }
      // Frame sincronizado al path respetando el comportamiento de la animación
function _rMpSyncFrame(rawT, cycles, totalF, stopAtEnd, repeatCnt, pathEnd, circularEnd) {
  if (totalF < 1 || cycles <= 0) return 0;
  const _stopLimit = (pathEnd === 'stop' && repeatCnt > 1) ? repeatCnt : 1;
  if (pathEnd === 'stop' && rawT >= _stopLimit && circularEnd && repeatCnt > 0 && !stopAtEnd) return 0;
  const iterT = (pathEnd === 'stop') ? Math.min(rawT, _stopLimit - 1e-9)
              : (pathEnd === 'rewind') ? (rawT % 2 < 1 ? rawT % 2 : 2 - rawT % 2)
              : (rawT % 1);
  const animProgress = iterT * cycles * totalF;
  if (stopAtEnd) return Math.min(Math.floor(animProgress), totalF - 1);
  if (repeatCnt > 0) {
    const _done = (pathEnd === 'stop' && rawT >= _stopLimit)
               || animProgress >= repeatCnt * totalF;
    return _done ? (circularEnd ? 0 : totalF - 1) : Math.floor(animProgress) % totalF;
  }
  return Math.floor(animProgress) % totalF;
}

// ── Recorrido de animación (motion path) — velocidad por ciclos o px/s ────
      if (layer._motionPath && layer._motionPath.length >= 2) {
        // Solo procesar el recorrido del panel activo. Los paneles no visibles no
        // deben acumular tiempo ni llegar a _pathStopped mientras el usuario no los lee.
        // El recorrido arranca de cero cada vez que _resetPanelAnims es llamado al
        // navegar a ese panel.
        if (pi !== RS.idx) return;
        if (!layer._pathStartTime) {
          // Esperar al temporizador de inicio junto con la animación
          if (layer._animStartAt && now < layer._animStartAt) return;
          layer._pathStartTime = now;
        }
        // Congelar recorrido durante el periodo de espera del reinicio.
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
        // Calcular duración del ciclo de animación (ms)
        // _gcpLayersData.length = nº de capas GCP (NO de frames) → no usar para duración
        const _mpCycleDurMs = (layer._gifFrames && layer._gifFrames.length)
          ? layer._gifFrames.reduce((s, f) => s + (f.delay || 100), 0)
          : (layer._gcpFramesData && layer._gcpFramesData[0] && layer._gcpFramesData[0].length)
            ? layer._gcpFramesData[0].length * (layer._gcpFrameDelay || 100)
            : (layer._pngFrames && layer._pngFrames.length)
              ? layer._pngFrames.length * (layer._gcpFrameDelay || 100)
              : 0;
        // Si es animada y tiene ciclos definidos → duración = ciclos × duración_ciclo
        // Si no → fallback a velocidad en px/s (comportamiento legado)
        const _mpRawT = (_mpCycleDurMs > 0 && layer._motionCycles != null)
          ? _mpElapsed / (layer._motionCycles * _mpCycleDurMs / 1000)
          : (_mpElapsed * (layer._motionSpeed || 100)) / _mpTotalPx;
        // ── Scrubbing: frame sincronizado al path, respetando comportamiento anim ────
        if (_mpCycleDurMs > 0 && layer._motionCycles != null) {
          const _mpTF = layer._gifFrames ? layer._gifFrames.length
            : (layer._gcpFramesData && layer._gcpFramesData[0]) ? layer._gcpFramesData[0].length
            : (layer._animFrames ? layer._animFrames.length : 0);
          if (_mpTF > 0) {
            const _mpSyncF = _rMpSyncFrame(
              _mpRawT, layer._motionCycles, _mpTF,
              layer._gcpStopAtEnd || false,
              layer._gcpRepeatCount || 0,
              layer._motionPathEnd || 'restart',
              layer._gcpCircularEnd || false
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
          }
        }
        const _mpEndB    = layer._motionPathEnd   || 'restart';
        const _mpAcl     = layer._motionPathAccel || 'none';
        const _isSyncMR  = _mpCycleDurMs > 0 && layer._motionCycles != null;
        const _mpStopAtR = _isSyncMR && layer._gcpRepeatCount > 0 ? layer._gcpRepeatCount : 1;
        let _mpPos = null;
        if (_mpEndB === 'stop') {
          if (layer._pathStopped) {
            panelChanged = true;
          } else if (_mpRawT >= _mpStopAtR) {
            _mpPos = _pathPositionAt(layer._motionPath, _mpClosed, 0.9999, _mpPw, _mpPh);
            layer._pathStopped = true;
            // En sync mode: programar reinicio (el mecanismo _animRestartAt de FIX6 lo gestiona)
            if (_isSyncMR && layer._gcpRestartDelay > 0 && !layer._animRestartAt) {
              layer._animStopped   = true;
              layer._animRestartAt = now + layer._gcpRestartDelay * 1000;
            }
          } else {
            const _pFracR = _isSyncMR ? _mpRawT % 1 : _mpRawT;
            _mpPos = _pathPositionAt(layer._motionPath, _mpClosed, _easeT(_pFracR,_mpAcl), _mpPw, _mpPh);
          }
        } else if (_mpEndB === 'rewind') {
          const _mpCycle = _mpRawT % 2;
          const _mpPosT  = _mpCycle <= 1 ? _mpCycle : (2 - _mpCycle);
          const _mpIsRwd  = _mpCycle > 1;
          const _mpRwdAcl = (_mpIsRwd && _mpAcl === 'start') ? 'end'
                          : (_mpIsRwd && _mpAcl === 'end')   ? 'start'
                          : _mpAcl;
          _mpPos = _pathPositionAt(layer._motionPath, _mpClosed, _easeT(_mpPosT,_mpRwdAcl), _mpPw, _mpPh);
        } else {
          // restart: fracción + easing
          _mpPos = _pathPositionAt(layer._motionPath, _mpClosed, _easeT(_mpRawT%1,_mpAcl), _mpPw, _mpPh);
        }
        if (_mpPos) {
          layer._pathCurX = (layer.x || 0.5) + _mpPos.x;
          layer._pathCurY = (layer.y || 0.5) + _mpPos.y;
          // Propagar a capas fill/pencil/watercolor vinculadas
          const _mpUid = layer._uid || layer._fillLayerId;
          if (_mpUid) {
            (panel.layers||[]).forEach(_lk => {
              if ((_lk.type==='fill'||_lk.type==='pencil'||_lk.type==='watercolor') && _lk._drawLayerId===_mpUid) {
                _lk._pathCurX = layer._pathCurX; _lk._pathCurY = layer._pathCurY;
              }
            });
          }
        }
        panelChanged = true;
      }
    });
    if (panelChanged) {
      // Modo fixed: redibujar si es el panel activo
      if (pi === RS.idx && RS.ctx) { _render(); }
      // Modo scroll: redibujar en el canvas del slide (no si estamos en créditos)
      else if (panel._scrollCtx && !RS.isCredits) {
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
  RS.idx        = 0;
  RS.textStep   = 0;

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
    // Botones de capa: prioridad absoluta sobre navegación de texto/panel
    if (!RS.isCredits) {
      const _obhit = _rBtnHitTestCanvas(ex, ey);
      if (_obhit) {
        const _oba = _obhit._buttonAction;
        if (_oba.type === 'page') { _rGoToPanel(_oba.pageIdx); return; }
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
  // en ese caso los toques llegan al container de scroll.
  let _csx = null, _csy = null;
  container.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { _csx = null; return; }
    _csx = e.touches[0].clientX;
    _csy = e.touches[0].clientY;
  }, { passive: true });
  container.addEventListener('touchend', e => {
    if (_csx === null) return;
    const _cex = e.changedTouches[0].clientX;
    const _cey = e.changedTouches[0].clientY;
    const _cadx = Math.abs(_cex - _csx), _cady = Math.abs(_cey - _csy);
    _csx = null;
    // Solo taps (< 30 px): los swipes los maneja el scroll nativo
    if (isH ? _cadx >= 30 : _cady >= 30) return;
    const _cbhit = _rBtnHitTestCanvas(_cex, _cey);
    if (!_cbhit) return;
    const _cba = _cbhit._buttonAction;
    if (_cba.type === 'page') _rGoToPanel(_cba.pageIdx);
    else if (_cba.type === 'url') window.open(_cba.url, '_blank', 'noopener');
  }, { passive: true });

  // ── Botones de capa — ratón / PC (container) ──
  let _smpdX = null, _smpdY = null;
  container.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') return;
    _smpdX = e.clientX; _smpdY = e.clientY;
  }, { passive: true });
  container.addEventListener('pointerup', e => {
    if (e.pointerType !== 'mouse' || _smpdX === null) return;
    const _sdx = Math.abs(e.clientX - _smpdX), _sdy = Math.abs(e.clientY - _smpdY);
    _smpdX = null; _smpdY = null;
    if (_sdx > 15 || _sdy > 15) return; // fue arrastre, no clic
    const _sbhit = _rBtnHitTestCanvas(e.clientX, e.clientY);
    if (!_sbhit) return;
    const _sba = _sbhit._buttonAction;
    if (_sba.type === 'page') _rGoToPanel(_sba.pageIdx);
    else if (_sba.type === 'url') window.open(_sba.url, '_blank', 'noopener');
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
  RS.canvas.style.touchAction = 'manipulation';
  _positionBtns();

}

// ── RENDER PRINCIPAL ──────────────────────────────────────────
function _render() {
  const panel = RS.panels[RS.idx];
  if (!panel || !RS.ctx) return;

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
      const _gr = (layer.rotation || 0) * Math.PI / 180;
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
      const _fr = (layer.rotation || 0) * Math.PI / 180;
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
        const rot=(layer.rotation||0)*Math.PI/180;
        ctx.save(); ctx.globalAlpha=layer.opacity!==undefined?layer.opacity:1;
        ctx.translate(x,y); if(rot)ctx.rotate(rot);
        ctx.drawImage(layer._animOc,-w/2,-h/2,w,h); ctx.restore(); return;
      }
      const img = layerImgs[j];
      if (!img) return;
      ctx.save();
      ctx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1;
      if (type === 'image' || type === 'stroke') {
        const x = (type==='stroke' && layer._pathCurX!=null ? layer._pathCurX : (layer.x||0.5)) * pw;
        const y = (type==='stroke' && layer._pathCurY!=null ? layer._pathCurY : (layer.y||0.5)) * ph;
        const w = (layer.width  || 1) * pw;
        const h = (layer.height || 1) * ph;
        const rot = layer.rotation || 0;
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
      const x = (layer._pathCurX != null ? layer._pathCurX : (layer.x||0.5)) * pw;
      const y = (layer._pathCurY != null ? layer._pathCurY : (layer.y||0.5)) * ph;
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
    if ((l.type==='bubble'||l.type==='text') && l._hasText !== false && !l.hidden) {
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
      // Temporizador de inicio: si _gcpStartDelay > 0, no arrancar hasta que pase el tiempo
      const _initDelay = (layer._gcpStartDelay || 0) * 1000;
      if (_initDelay > 0) {
        layer._animLastTick = null;           // no empezar aún
        layer._animStartAt  = Date.now() + _initDelay;
      } else {
        layer._animLastTick = Date.now();     // iniciar tick desde ahora
        layer._animStartAt  = null;
      }
      if (layer._animOc && layer._animFrames.length) {
        layer._animOc.getContext('2d').putImageData(layer._animFrames[0].imageData, 0, 0);
      }
    }
    // Recorrido: reiniciar — si hay delay de inicio, el path espera junto a la animación
    if (layer._motionPath && layer._motionPath.length >= 2) {
      const _hasDelay = (layer._gcpStartDelay || 0) > 0;
      layer._pathStartTime = _hasDelay ? null : Date.now();
      delete layer._pathStopped;
      layer._pathCurX = layer.x || 0.5;
      layer._pathCurY = layer.y || 0.5;
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
  return _panel ? _rBtnHitTest(_panel.layers || [], _tpx, _tpy, pw, ph) : null;
}

// Alpha hit testing: devuelve true si el píxel en (lx,ly) tiene alpha suficiente.
// lx/ly son coordenadas locales centradas en 0,0 (rotación ya deshecha).
// Soporta: GIF/APNG (canvas offscreen), e imágenes estáticas (draw, stroke, image, etc.)
function _rAlphaHit(la, lx, ly, pw, ph) {
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
  // 2. Capas con bitmap estático (_btnHitImg cacheado durante la carga del panel)
  const hitImg = la._btnHitImg;
  if (!hitImg) return true; // sin imagen → solo bbox
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
  if (!la._btnAlphaOc) return true;
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

function _rBtnHitTest(layers, tapPx, tapPy, pw, ph) {
  for (let i = layers.length - 1; i >= 0; i--) {
    const la = layers[i];
    if (!la || !la._buttonAction) continue;
    // Usar posición actual del recorrido si está en movimiento, si no la original
    const cx = (la._pathCurX != null ? la._pathCurX : (la.x || 0.5)) * pw;
    const cy = (la._pathCurY != null ? la._pathCurY : (la.y || 0.5)) * ph;
    const hw = (la.width  || 1) * pw / 2;
    const hh = (la.height || 1) * ph / 2;
    const dx = tapPx - cx, dy = tapPy - cy;
    const ang = -(la.rotation || 0) * Math.PI / 180;
    const lx = dx * Math.cos(ang) - dy * Math.sin(ang);
    const ly = dx * Math.sin(ang) + dy * Math.cos(ang);
    if (Math.abs(lx) <= hw && Math.abs(ly) <= hh && _rAlphaHit(la, lx, ly, pw, ph)) return la;
  }
  return null;
}

// Navegar a un panel específico respetando el estado del reader
function _rGoToPanel(idx) {
  if (idx < 0 || idx >= RS.panels.length) return;
  RS.idx = idx;
  RS.textStep = _initTextStep(idx);
  RS.fadeAlpha = 0;
  _resetPanelAnims(idx);
  _resizeCanvas();
  _render();
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
    _resetPanelAnims(RS.idx); // reiniciar animaciones desde frame 0
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
      ctx.font = '400 ' + socialFS + 'px Patrick Hand, sans-serif';
      socialLines = wrapText(socialText, socialMaxW);
    }
    const socialLineH = socialFS * 1.5;
    const blockH = socialLines.length * socialLineH + (socialText ? socialFS * 1.2 : 0) + authorFS * 1.5;
    let y = (ph - blockH) / 2 + socialLineH * 0.5;
    if (socialText) {
      ctx.font = '400 ' + socialFS + 'px Patrick Hand, sans-serif';
      ctx.fillStyle = '#444'; ctx.textAlign = 'left';
      socialLines.forEach(line => { ctx.fillText(line, leftX, y); y += socialLineH; });
      y += socialFS * 0.8;
    }
    ctx.font = '600 ' + authorFS + 'px Patrick Hand, sans-serif';
    ctx.fillStyle = '#222'; ctx.textAlign = 'center';
    ctx.fillText(authorText, leftX + leftW / 2, y);

    const logoFS = Math.round(fRef * 0.11), sloganFS = Math.round(fRef * 0.042), linkFS = Math.round(fRef * 0.038);
    const lineH = ph * 0.09;
    const rightBlockH = lineH * 1.3 + logoFS + sloganFS * 2 + sloganFS * 3 + linkFS;
    const rightStartY = (ph - rightBlockH) / 2 + logoFS * 0.5;
    if (_logoImg && _logoImg.complete && _logoImg.naturalWidth > 0) {
      const lh = logoFS * 1.1, lw2 = _logoImg.naturalWidth * (lh / _logoImg.naturalHeight);
      ctx.drawImage(_logoImg, rightCX - lw2/2, rightStartY - lh * 0.8, lw2, lh);
    }
    const sloganY = rightStartY + sloganFS * 2;
    ctx.font = '400 ' + sloganFS + 'px Patrick Hand, sans-serif'; ctx.fillStyle = '#555';
    ctx.fillText('Crea y Comparte', rightCX, sloganY);
    const linkY = sloganY + sloganFS * 3;
    ctx.font = '400 ' + linkFS + 'px Patrick Hand, sans-serif'; ctx.fillStyle = '#1a73e8';
    ctx.fillText('Visita más obras del autor', rightCX, linkY);
    const lw = ctx.measureText('Visita más obras del autor').width;
    ctx.beginPath(); ctx.strokeStyle = '#1a73e8'; ctx.lineWidth = Math.max(1, linkFS * 0.06);
    ctx.moveTo(rightCX - lw/2, linkY + linkFS * 0.6); ctx.lineTo(rightCX + lw/2, linkY + linkFS * 0.6); ctx.stroke();
    const restartFS = Math.round(fRef * 0.038), restartY = linkY + linkFS * 2.2;
    ctx.font = '600 ' + restartFS + 'px Patrick Hand, sans-serif'; ctx.fillStyle = '#888';
    ctx.fillText('↩ Volver a leer', rightCX, restartY);
    // Guardar coordenadas canvas para los botones HTML
    RS._creditsLink    = { cx: rightCX, cy: linkY,    fs: linkFS,    pw, ph };
    RS._creditsRestart = { cx: rightCX, cy: restartY, fs: restartFS, pw, ph };

  } else {
    const fRef = pw, cx = pw / 2, marginX = pw * 0.09, maxW = pw * 0.82;
    let authorY = ph * 0.11;
    if (socialText) {
      const socialFS = Math.round(fRef * 0.038);
      ctx.font = '400 ' + socialFS + 'px Patrick Hand, sans-serif';
      ctx.fillStyle = '#444'; ctx.textAlign = 'left';
      const socialLines = wrapText(socialText, maxW);
      const socialLineH = socialFS * 1.4, socialStartY = ph * 0.26;
      socialLines.forEach((line, i) => ctx.fillText(line, marginX, socialStartY + i * socialLineH));
      authorY = socialStartY + socialLines.length * socialLineH + socialFS * 0.9;
    }
    ctx.font = '600 ' + Math.round(fRef * 0.055) + 'px Patrick Hand, sans-serif';
    ctx.fillStyle = '#222'; ctx.textAlign = 'center';
    ctx.fillText(authorText, cx, authorY);
    const lineH = ph * 0.09, logoFS = Math.round(fRef * 0.11), logoY = authorY + lineH * 1.3;
    if (_logoImg && _logoImg.complete && _logoImg.naturalWidth > 0) {
      const lh2 = logoFS * 1.1, lw2 = _logoImg.naturalWidth * (lh2 / _logoImg.naturalHeight);
      ctx.drawImage(_logoImg, cx - lw2/2, logoY - lh2 * 0.8, lw2, lh2);
    }
    const sloganFS = Math.round(fRef * 0.042), sloganY = logoY + sloganFS * 2;
    ctx.font = '400 ' + sloganFS + 'px Patrick Hand, sans-serif'; ctx.fillStyle = '#555';
    ctx.fillText('Crea y Comparte', cx, sloganY);
    const linkFS = Math.round(fRef * 0.038), linkY = sloganY + sloganFS * 3;
    ctx.font = '400 ' + linkFS + 'px Patrick Hand, sans-serif'; ctx.fillStyle = '#1a73e8';
    ctx.fillText('Visita más obras del autor', cx, linkY);
    const lw = ctx.measureText('Visita más obras del autor').width;
    ctx.beginPath(); ctx.strokeStyle = '#1a73e8'; ctx.lineWidth = Math.max(1, linkFS * 0.06);
    ctx.moveTo(cx - lw/2, linkY + linkFS * 0.6); ctx.lineTo(cx + lw/2, linkY + linkFS * 0.6); ctx.stroke();
    const restartFS = Math.round(fRef * 0.038), restartY = linkY + linkFS * 2.2;
    ctx.font = '600 ' + restartFS + 'px Patrick Hand, sans-serif'; ctx.fillStyle = '#888';
    ctx.fillText('↩ Volver a leer', cx, restartY);
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
    if (isLink) { el.href = 'https://sargentopez.github.io/ComiXou/index.html'; }
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

  RS.canvas.addEventListener('touchstart', e => {
    sx = null; sy = null; cancelled = false;
    if (e.touches.length !== 1) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true, ...sig });

  RS.canvas.addEventListener('touchmove', e => {
    if (sx === null) return;
    const dy = e.touches[0].clientY - sy;
    if (Math.abs(dy) > 30) cancelled = true;
  }, { passive: true, ...sig });

  RS.canvas.addEventListener('touchend', e => {
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
      if (_ba.type === 'page') { _rGoToPanel(_ba.pageIdx); return; }
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

  // RATÓN / PC: detección de botones de capa
  let _mpX = null, _mpY = null;
  RS.canvas.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') return;
    _mpX = e.clientX; _mpY = e.clientY;
  }, { passive: true, ...sig });
  RS.canvas.addEventListener('pointerup', e => {
    if (e.pointerType !== 'mouse' || _mpX === null) return;
    const _mdx = Math.abs(e.clientX - _mpX), _mdy = Math.abs(e.clientY - _mpY);
    _mpX = null; _mpY = null;
    if (_mdx > 15 || _mdy > 15) return; // fue un arrastre, no un clic
    const _bhit = _rBtnHitTestCanvas(e.clientX, e.clientY);
    if (!_bhit) return;
    const _ba = _bhit._buttonAction;
    if (_ba.type === 'page') _rGoToPanel(_ba.pageIdx);
    else if (_ba.type === 'url') window.open(_ba.url, '_blank', 'noopener');
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
  const d = author ? `Una obra de ${author} en ComXow` : 'Abre esta obra en el reproductor de ComXow';
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

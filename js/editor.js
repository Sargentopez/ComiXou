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

/* ── ApngDecoder — igual firma que GifDecoder: {frames:[{imageData,delay}],width,height}
   Modo 1: array de PNG dataUrls individuales (sistema _pngFrames de biblioteca)
   Modo 2: dataUrl APNG único — usa UPNG.decode + UPNG.toRGBA8
   Canvas independiente por llamada — sin estado compartido entre llamadas concurrentes.
   ─────────────────────────────────────────────────────────────────────────────────── */
window.ApngDecoder = (function(){

  function decodeFrameArray(dataUrls, delay) {
    // Cargar frames en secuencia para garantizar orden correcto
    // Cada frame usa su propio canvas — evita contaminación entre frames asíncronos
    if (!dataUrls || !dataUrls.length) return Promise.reject(new Error('sin frames'));
    var results = [];
    var W = 0, H = 0;
    function loadOne(i) {
      if (i >= dataUrls.length) return Promise.resolve({ frames: results, width: W, height: H });
      return new Promise(function(res) {
        var img = new Image();
        img.onload = function() {
          if (!W) { W = img.naturalWidth; H = img.naturalHeight; }
          var oc = document.createElement('canvas'); oc.width = W; oc.height = H;
          var ox = oc.getContext('2d');
          ox.drawImage(img, 0, 0);
          results[i] = { imageData: ox.getImageData(0, 0, W, H), delay: delay || 100 };
          res();
        };
        img.onerror = function() {
          results[i] = { imageData: new ImageData(W||1, H||1), delay: delay || 100 };
          res();
        };
        img.src = dataUrls[i];
      }).then(function() { return loadOne(i + 1); });
    }
    return loadOne(0);
  }

  function decodeApng(dataUrl, delay) {
    return new Promise(function(res, rej) {
      try {
        var b64 = dataUrl.split(',')[1];
        var bin = atob(b64);
        var u8  = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        var decoded = UPNG.decode(u8.buffer);
        var rgba8   = UPNG.toRGBA8(decoded);
        if (!rgba8 || !rgba8.length) { rej(new Error('UPNG: sin frames')); return; }
        var W = decoded.width, H = decoded.height;
        // Canvas PRIVADO por llamada
        var oc = document.createElement('canvas'); oc.width = W; oc.height = H;
        var ox = oc.getContext('2d');
        var frames = rgba8.map(function(buf, fi) {
          var imgd = new ImageData(new Uint8ClampedArray(buf), W, H);
          ox.clearRect(0, 0, W, H);
          ox.putImageData(imgd, 0, 0);
          var frameDelay = delay || 100;
          if (decoded.frames && decoded.frames[fi] && decoded.frames[fi].delay) {
            frameDelay = Math.round(decoded.frames[fi].delay);
          }
          return { imageData: ox.getImageData(0, 0, W, H), delay: frameDelay };
        });
        res({ frames: frames, width: W, height: H });
      } catch(e) { rej(e); }
    });
  }

  function decode(input, delay) {
    if (Array.isArray(input)) return decodeFrameArray(input, delay);
    // dataUrl único: intentar como APNG, fallback a frame estático
    if (typeof UPNG !== 'undefined') {
      return decodeApng(input, delay).catch(function() {
        return decodeFrameArray([input], delay);
      });
    }
    return decodeFrameArray([input], delay);
  }

  return { decode: decode, decodeFrameArray: decodeFrameArray, decodeApng: decodeApng };
})();
/* ── fin ApngDecoder ── */

/* ============================================================
   editor.js — ComiXow v5.4
   Motor canvas fiel al referEditor.
   Menú tipo page-nav, botón flotante al minimizar.
   ============================================================ */

/* ── ESTADO ── */
let edCanvas, edCtx, edViewerCanvas, edViewerCtx;
let edPages = [], edCurrentPage = 0, edLayers = [];
// ── Sistema de Reglas (T29) ──
let edRules = [];          // array de reglas de la hoja actual
let _edCanvasTop = 0;      // top del canvas en viewport — cacheado en edFitCanvas
let edRulesHidden = false; // true = guías ocultas (invisibles, no seleccionables, sin snap)
let _edRuleId = 0;         // contador para IDs únicos
let _edRuleDrag = null;    // { ruleId, part:'a'|'b'|'line', offX, offY } — drag activo
let edRuleNodes = [];      // nodos compartidos entre reglas: {id, x, y, ruleIds, locked}
let _edRuleNodeId = 0;     // contador IDs de nodos
let _edRulePanelId = null; // id de la regla con panel abierto
let edSelectedIdx = -1;
let edIsDragging = false, edIsResizing = false, edIsTailDragging = false, edIsRotating = false;
let edTailPointType = null, edResizeCorner = null, edTailVoiceIdx = 0;
let edDragOffX = 0, edDragOffY = 0, edInitialSize = {};
let edRotateStartAngle = 0;  // ángulo inicial al empezar rotación
let edOrientation = 'vertical';
let edProjectId = null;
let edProjectMeta = { title:'', author:'', genre:'', navMode:'fixed', social:'' };
let edActiveTool = 'select';  // select | draw | eraser | fill | shape | line
// Estado herramienta shape
let _edShapeType  = 'rect';   // 'rect' | 'ellipse'
let _edShapeStart = null;     // {x,y} inicio drag normalizado
let _edShapePreview = null;   // ShapeLayer temporal en preview
let _edPendingShape = null;   // ShapeLayer/LineLayer creada pero no confirmada (no seleccionable)
let edDrawFillColor = '#ffffff'; // relleno blanco por defecto // color de relleno para nuevas shapes
let _edLineLayer  = null;     // LineLayer en construcción
let _edLineType   = 'draw';   // 'draw' | 'select'
let _edLineFusionId = null;   // T1: ID de fusión — LineLayer del mismo ID se fusionan al OK
let edLastPointerIsTouch = false; // se actualiza en edOnStart con e.pointerType real
let edPainting = false;
let _edPenPendingStroke = null; // punto inicial diferido para lápiz
const _ED_PEN_MIN_PRESSURE = 0.05; // tldraw/perfect-freehand: presión mínima para considerar contacto real
let _edPenLowPressureTimer = null; // timer de 250ms para presión baja — si expira, termina el trazo
let _edPenCanDraw = false;         // true cuando se ha confirmado presión suficiente al menos una vez
let edDrawHistory = [], edDrawHistoryIdx = -1;  // historial local de dibujo
const ED_MAX_DRAW_HISTORY = 20;
// Icono simetría (T14): triángulo izq (cateto horiz + cateto vertical derecho) | gap | línea discontinua | gap | triángulo der (espejo)
const _ED_MIRROR_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16" width="20" height="14" style="display:block;pointer-events:none"><polygon points="1,1 9,1 9,15" fill="currentColor"/><line x1="12" y1="0" x2="12" y2="16" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.5 2"/><polygon points="15,1 23,1 15,15" fill="currentColor"/></svg>`;
let edDrawColor = '#000000', edDrawSize = 4, edEraserSize = 20, edDrawOpacity = 100;
// Cursor desplazado (T18): el trazado se aplica 1cm más arriba del toque real
let _edCursorOffset = false;           // estado del botón (activo/inactivo)
let _edCursorOffsetAngle = 0;          // ángulo respecto a vertical: -40, 0, +40 grados
let _edOffsetFirstMove = false;        // true: el primer move debe incluir el punto inicial
let _edFromSaved = false;              // true: venimos de edStartPaintFromSaved — ignorar posición del primer move
let _edOffsetLastTouch = null;         // última posición táctil conocida {x, y, sz} para refrescar el cursor
const _ED_CURSOR_OFFSET_PX = 76;       // 2 cm en px CSS (2 × 96/2.54 ≈ 76)
// Cursor offset — modo "posición guardada":
// Al arrastrar solo se posiciona el cursor (no dibuja). Al levantar el dedo se guarda la posición.
// Si el siguiente tap llega en < 500ms, el trazo empieza desde la posición guardada.
let _edCursorSavedPos = null;          // {nx, ny, clientX, clientY} posición guardada del cursor
let _edCursorSavedTime = 0;            // timestamp del último levantamiento de dedo con cursor activo
let _edCursorPositioning = false;      // true: arrastre actual es solo posicionamiento (no dibuja)
const _ED_CURSOR_TAP_MS = 1000;         // ventana activa tras ubicar cursor (ms antes de volver a azul)
const _ED_CURSOR_STROKE_MS = 500;       // ventana activa tras terminar trazo (ms antes de volver a azul)
let _edCursorExpireTimer = null;       // timer que vuelve a azul al expirar el estado rojo
let _edCursorLineColor = 'rgba(60,140,255,0.75)';
// ── Nuevo sistema de cursor desplazado: objeto de estado ──
const _cof = {
  state: 'off',           // 'off'|'idle_blue'|'red_ready'|'red_cool'
  on: false,
  touchX: 0, touchY: 0,  // punto de arrastre (cuadrado) en px CSS pantalla
  cursorX: 0, cursorY: 0,// punto de dibujo (círculo) en px CSS pantalla
  dist: 76,               // distancia actual arrastre→cursor
  distDefault: 76,        // distancia por defecto (~2cm)
  MARGIN: 20,             // radio de margen alrededor del punto de arrastre (px)
  MS_READY: 1000,         // ms en red_ready antes de volver a azul
  MS_COOL: 500,           // ms en red_cool tras levantar el dedo
  savedClientX: 0,        // posición del cursor guardada para inicio de trazo
  savedClientY: 0,
  _timer: null,
  _dragging: false,       // dedo arrastrando el punto de arrastre
  _strokeStarted: false,  // trazo en curso
  _pendingStart: false,   // calculando nueva distancia antes del trazo
  _pendingMoveX: 0, _pendingMoveY: 0,
};
let edColorPalette = ['#000000','#ffffff','#e63030','#e67e22','#f1c40f','#2ecc71','#3498db','#9b59b6','#e91e8c','#795548'];
let edSelectedPaletteIdx = 0; // índice del dot de paleta actualmente seleccionado
let edMenuOpen = null;     // id del dropdown abierto
let edMinimized = false;
let edFloatX = 12, edFloatY = 12; // posición del botón flotante (esquina superior izquierda)
// Pinch-to-zoom
let edPinching = false, edPinchDist0 = 0, edPinchAngle0 = 0, edPinchScale0 = null;
let _edPinchHappened = false; // true desde que empieza el pinch hasta que se levantan TODOS los dedos
let edPinchCenter0 = null, edPinchCamera0 = null;
// Transformación de DrawLayer durante pinch
let _edDrawPinch = null; // { snapshotImg, tx, ty, scale } — activo durante pinch en modo draw
let edPanelUserClosed = false;  // true = usuario cerró panel con ✓, no reabrir al seleccionar
let _edFocusDone = false;       // true mientras panel abierto — inhibe recentrado repetido
let _edCropMode     = false;    // true cuando el modo recorte está activo
let _edCropLayer    = null;     // referencia al layer que se está recortando
let _edCropPts      = [];       // vértices del polígono de recorte en coords fraccionarias de página
let _edCropDragIdx  = -1;       // índice del nodo que se está arrastrando (-1 = ninguno)
let _edCropDragging = false;    // true durante un drag de nodo
let _edCropLastTapSeg = -1;     // índice de segmento del último tap (doble tap)
let _edCropLastTapTime = 0;     // timestamp del último tap sobre segmento
let _edCropHistory = [];        // historial de snapshots del polígono (para ↩)
let _edCropHistIdx = -1;        // índice actual en el historial
// edZoom eliminado — reemplazado por edCamera.z
// ── Cámara del editor (patrón Figma/tldraw) ──
// x,y = traslación del canvas (donde aparece el origen del workspace en pantalla)
// z   = escala (1 = lienzo ocupa el viewport)
const edCamera = { x: 0, y: 0, z: 1 };
let _edLastTapTime = 0, _edLastTapIdx = -1; // para detectar doble tap
let _edLastNodeTapTime = 0, _edLastNodeTapIdx = -1; // doble tap sobre nodo/segmento de línea
let _edTouchMoved = false; // true si el dedo se movió durante el toque actual
let edHistory = [], edHistoryIdx = -1;
let _edSavedHistoryIdx = -1; // historyIdx en el último guardado explícito con 💾
let _edCloudSaving = false;  // true mientras edCloudSave() está en curso
const ED_MAX_HISTORY = 10;
let edViewerTextStep = 0;  // nº de textos revelados en modo secuencial
// ── Multi-selección ──
let edMultiSel = [];        // índices seleccionados
let edMultiSelAnchor = -1;  // índice del objeto ancla para Shift+flechas (último seleccionado individualmente)
let edMultiDragging = false;
let edMultiResizing = false;
let edMultiRotating = false;
let edRubberBand = null;    // {x0,y0,x1,y1} norm coords mientras se arrastra
let edMultiDragOffs = [];   // [{dx,dy}] offset de arrastre por objeto
let edMultiTransform = null;// snapshot del gesto activo (solo durante el gesto)
let edMultiGroupRot = 0;    // rotación acumulada del bbox del grupo (grados)
// bbox persistente del grupo — solo lo actualiza _msRecalcBbox()
// {w, h, cx, cy, offX, offY}  (offX/Y = offset centro respecto al centroide)
let edMultiBbox = null;

// ── Dimensiones del lienzo (la página reproducible) ──
// Ratio 6:13 (≈2.167) cabe sin corte en OPPO A38 (720×1612, útil ~720×1588)
const ED_PAGE_W  = 360;   // ancho del lienzo en orientación vertical
const ED_PAGE_H  = 780;   // alto  del lienzo en orientación vertical (ratio 6:13)
// ── Canvas de trabajo: 5× ancho y 3× alto del lienzo vertical ──
const ED_CANVAS_W = ED_PAGE_W * 5;  // 1800
const ED_CANVAS_H = ED_PAGE_H * 3;  // 2340

const $ = id => document.getElementById(id);

// Dimensiones del lienzo según orientación de la hoja actual (o global si no definida)
function _edCurrentOrientation(){
  // Si estamos renderizando para el visor (edOrientation ya seteado temporalmente),
  // usar edOrientation directamente — NO leer de la página del editor
  return edOrientation;
}
function edPageW(){ return _edCurrentOrientation() === 'vertical' ? ED_PAGE_W : ED_PAGE_H; }
function edPageH(){ return _edCurrentOrientation() === 'vertical' ? ED_PAGE_H : ED_PAGE_W; }
// Offset del lienzo dentro del workspace (centrado)
function edMarginX(){ return (ED_CANVAS_W - edPageW()) / 2; }
function edMarginY(){ return (ED_CANVAS_H - edPageH()) / 2; }

// ── Conversiones de coordenadas ──
// Pantalla → workspace interno
function edScreenToWorld(sx, sy){
  return { x: (sx - edCamera.x) / edCamera.z,
           y: (sy - edCamera.y) / edCamera.z };
}
// Workspace → pantalla
function edWorldToScreen(wx, wy){
  return { x: wx * edCamera.z + edCamera.x,
           y: wy * edCamera.z + edCamera.y };
}
// Zoom hacia un punto de pantalla (sx,sy), con factor multiplicativo
function edZoomAt(sx, sy, factor){
  // Límites
  const newZ = Math.min(Math.max(edCamera.z * factor, 0.05), 8);
  const fReal = newZ / edCamera.z;
  edCamera.x = sx - (sx - edCamera.x) * fReal;
  edCamera.y = sy - (sy - edCamera.y) * fReal;
  edCamera.z = newZ;
  // Actualizar dots de grosor en barras flotantes para reflejar el nuevo zoom
  _edSyncSizeDots();
}
function _edSyncSizeDots(){
  const z = edCamera.z;
  // Actualizar preview del panel si está abierto
  _edbSyncSizePreview();
  // Actualizar cursor del pincel al cambiar zoom
  if(typeof _edRefreshOffsetCursor === 'function') _edRefreshOffsetCursor();
  const _bCur = $('edBrushCursor');
  if(_bCur && _bCur.style.display !== 'none'){
    const _szB = Math.round((edActiveTool==='eraser' ? edEraserSize : edDrawSize) * z);
    _bCur.style.width = _szB + 'px'; _bCur.style.height = _szB + 'px';
  }
  // Dot barra flotante de objetos
  const dotS = $('esb-size-dot');
  if(dotS){
    const la = edSelectedIdx>=0 ? edLayers[edSelectedIdx] : null;
    const lw = la ? (la.lineWidth||0) : 0;
    const d2 = Math.max(3, Math.min(22, Math.round(lw * z)));
    dotS.style.width=d2+'px'; dotS.style.height=d2+'px';
  }
}
// ¿Necesita scrollbars? (el lienzo no cabe entero en el viewport)
function edNeedsScroll(){
  // En PC: siempre mostrar barras para permitir navegación a cualquier zoom
  if(!edCanvas) return { h: false, v: false };
  if(window._edIsTouch) return { h: false, v: false };
  return { h: true, v: true };
}

/* ══════════════════════════════════════════
   CLASES (motor referEditor)
   ══════════════════════════════════════════ */

class BaseLayer {
  constructor(type,x=0.5,y=0.5,width=0.3,height=0.2){
    this.type=type;this.x=x;this.y=y;this.width=width;this.height=height;this.rotation=0;
  }
  contains(px,py){
    const rot = (this.rotation||0)*Math.PI/180;
    if(rot === 0){
      return px>=this.x-this.width/2&&px<=this.x+this.width/2&&
             py>=this.y-this.height/2&&py<=this.y+this.height/2;
    }
    // Transformar punto al espacio local (sin rotación) del objeto
    const pw=edPageW(), ph=edPageH();
    const dx=(px-this.x)*pw, dy=(py-this.y)*ph;
    const lx=( dx*Math.cos(-rot)-dy*Math.sin(-rot))/pw;
    const ly=( dx*Math.sin(-rot)+dy*Math.cos(-rot))/ph;
    return Math.abs(lx)<=this.width/2 && Math.abs(ly)<=this.height/2;
  }
  getControlPoints(){
    const hw = this.width/2;
    const rot = (this.rotation||0)*Math.PI/180;
    const pw=edPageW(), ph=edPageH();
    // height de todos los tipos es fraccion de ph — uniforme
    const hhPh = this.height/2;
    const rp = (dx,dy) => {
      const rx=dx*pw, ry=dy*ph;
      return { x: this.x+(rx*Math.cos(rot)-ry*Math.sin(rot))/pw,
               y: this.y+(rx*Math.sin(rot)+ry*Math.cos(rot))/ph };
    };
    const tl=rp(-hw,-hhPh), tr=rp(hw,-hhPh), bl=rp(-hw,hhPh), br=rp(hw,hhPh);
    const ml=rp(-hw,0),     mr=rp(hw,0),      mt=rp(0,-hhPh), mb=rp(0,hhPh);
    const rotOffset = 28/(ph * edCamera.z);
    const rotHandle = rp(0,-hhPh-rotOffset);
    // Para LineLayer rect (4 nodos cerrado): handles solo en centros de segmento
    // Los nodos están en las esquinas — no superponer handles con nodos
    const _isRect = this.type==='line' && this.closed && !this._fromEllipse
      && this.points && this.points.filter(Boolean).length === 4;
    if (_isRect) return [
      {...ml,corner:'ml'}, {...mr,corner:'mr'},
      {...mt,corner:'mt'}, {...mb,corner:'mb'},
      {...rotHandle,corner:'rotate'},
    ];
    return[
      {...tl,corner:'tl'}, {...tr,corner:'tr'},
      {...bl,corner:'bl'}, {...br,corner:'br'},
      {...ml,corner:'ml'}, {...mr,corner:'mr'},
      {...mt,corner:'mt'}, {...mb,corner:'mb'},
      {...rotHandle,corner:'rotate'},
    ];
  }
  resizeToFitText(){}
}

class ImageLayer extends BaseLayer {
  constructor(imgEl,x=0.5,y=0.5,width=0.4){
    super('image',x,y,width,0.3);
    if(imgEl){
      this.img=imgEl; this.src=imgEl.src||'';
      if(imgEl.naturalWidth&&imgEl.naturalHeight){
        const pw=edPageW()||ED_PAGE_W, ph=edPageH()||ED_PAGE_H;
        this.height = width * (imgEl.naturalHeight / imgEl.naturalWidth) * (pw / ph);
      }
    } else {
      this.img=null; this.src='';
    }
  }
  draw(ctx,can){
    // Si hay canvas offscreen de animación PNG, usarlo (igual que GifLayer usa _oc)
    const src = this._oc || this.img;
    if (!src) return;
    if (src === this.img && (!this.img.complete || this.img.naturalWidth===0)) return;
    const pw=edPageW(), ph=edPageH();
    const w = this.width  * pw;
    const h = this.height * ph;
    const px = edMarginX() + this.x*pw;
    const py = edMarginY() + this.y*ph;
    ctx.save();
    ctx.globalAlpha = this.opacity ?? 1;
    ctx.translate(px,py);
    ctx.rotate(this.rotation*Math.PI/180);
    ctx.drawImage(src, -w/2, -h/2, w, h);
    ctx.restore();
  }
  // ── loadAnim: carga frames en _animFrames + _oc único — patrón idéntico a GifLayer.load()
  loadAnim(input, cb) {
    if (!input || (Array.isArray(input) && !input.length)) { cb && cb(); return; }
    // Si ya está listo Y no fue reseteado por stopAnim, reusar sin redecodificar
    if (this._animReady && this._animFrames && this._animFrames.length) { cb && cb(); return; }
    if (!window.ApngDecoder) { console.warn('ApngDecoder no disponible'); cb && cb(); return; }
    const delay = this._gcpFrameDelay || window._gcpFrameDelay || 100;
    window.ApngDecoder.decode(input, delay).then((result) => {
      this._animFrames = result.frames;
      this._fIdx  = 0;
      this._oc    = document.createElement('canvas');
      this._oc.width  = result.width;
      this._oc.height = result.height;
      this._animReady = true;
      // Pintar frame 0 en _oc para que draw() tenga contenido inmediatamente
      if (result.frames.length) {
        this._oc.getContext('2d').putImageData(result.frames[0].imageData, 0, 0);
      }
      cb && cb();
    }).catch(function(e) { console.warn('ApngDecoder error:', e); cb && cb(); });
  }

  // ── _applyFrame: IDÉNTICO a GifLayer._applyFrame — putImageData en _oc único
  _applyFrame(i) {
    if (!this._animReady || !this._animFrames || !this._animFrames.length) return;
    const total = this._animFrames.length;
    const stopAtEnd   = this._gcpStopAtEnd   || false;
    const repeatCount = this._gcpRepeatCount || 0;
    let idx = i;
    if (idx >= total) {
      this._gcpPlayCount = (this._gcpPlayCount || 0) + 1;
      if (stopAtEnd || (repeatCount > 0 && this._gcpPlayCount >= repeatCount)) {
        this._fIdx = total - 1;
        this._oc.getContext('2d').putImageData(this._animFrames[this._fIdx].imageData, 0, 0);
        this._playing = false;
        requestAnimationFrame(() => {
          if (typeof edRedraw === 'function') edRedraw();
          if (typeof edUpdateViewer === 'function') edUpdateViewer();
        });
        return;
      }
      idx = idx % total;
    }
    this._fIdx = idx;
    const frame = this._animFrames[this._fIdx];
    this._oc.getContext('2d').putImageData(frame.imageData, 0, 0);
    if (!this._playing) return;
    if (this._timer) clearTimeout(this._timer);
    const delay = frame.delay || this._gcpFrameDelay || window._gcpFrameDelay || 100;
    this._timer = setTimeout(() => {
      this._applyFrame(this._fIdx + 1);
      requestAnimationFrame(() => {
        if ($('editorViewer')?.classList.contains('open') && typeof edUpdateViewer === 'function') {
          edUpdateViewer();
        } else if (typeof edRedraw === 'function') {
          edRedraw();
        }
      });
    }, delay);
  }

  // Stubs de compatibilidad (código externo que aún usa los nombres antiguos)
  _preloadPngFrames(cb) { this.loadAnim(this._pngFrames, cb); }
  _applyPngFrame(i)     { this._applyFrame(i); }

  stopAnim() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    this._playing = false;
    this._fIdx = 0;
    this._gcpPlayCount = 0;
    if (this._animReady && this._animFrames && this._animFrames.length) {
      this._oc.getContext('2d').putImageData(this._animFrames[0].imageData, 0, 0);
    }
    if (typeof edRedraw === 'function') requestAnimationFrame(() => edRedraw());
  }

  contains(px, py) {
    // 1. Comprobar bbox primero (rápido)
    if (!super.contains(px, py)) return false;
    // 2. Hit-test por alpha de píxel real — ignora zonas transparentes
    if (!this.img || !this.img.complete || this.img.naturalWidth === 0) return true;
    try {
      const pw = edPageW(), ph = edPageH();
      // Transformar punto al espacio local de la imagen (con rotación)
      const rot = (this.rotation || 0) * Math.PI / 180;
      const dx = (px - this.x) * pw, dy = (py - this.y) * ph;
      const lx = dx * Math.cos(-rot) - dy * Math.sin(-rot);
      const ly = dx * Math.sin(-rot) + dy * Math.cos(-rot);
      const iw = this.width * pw, ih = this.height * ph;
      // Convertir a coordenadas de píxel en la imagen original
      const imgX = (lx / iw + 0.5) * this.img.naturalWidth;
      const imgY = (ly / ih + 0.5) * this.img.naturalHeight;
      if (imgX < 0 || imgY < 0 || imgX >= this.img.naturalWidth || imgY >= this.img.naturalHeight) return false;
      // Leer alpha con canvas 1×1
      const _oc = ImageLayer._alphaCanvas || (ImageLayer._alphaCanvas = document.createElement('canvas'));
      _oc.width = 1; _oc.height = 1;
      const _octx = _oc.getContext('2d');
      _octx.clearRect(0, 0, 1, 1);
      _octx.drawImage(this.img, -imgX, -imgY);
      return _octx.getImageData(0, 0, 1, 1).data[3] > 10;
    } catch(e) {
      return true; // fallback: si falla (CORS), usar bbox
    }
  }
}

/* ══════════════════════════════════════════
   GIF LAYER — animación GIF en canvas
   Usa gifuct.js para decodificar frames.
   Cada frame se pinta en _oc (canvas offscreen).
   La animación la gestiona _applyFrame() con setTimeout.
   ══════════════════════════════════════════ */
class GifLayer extends BaseLayer {
  constructor(gifKey, x=0.5, y=0.5, width=0.7) {
    super('gif', x, y, width, 0.3);
    this.gifKey  = gifKey;
    this._frames = [];
    this._fIdx   = 0;
    this._timer  = null;
    this._oc     = null;
    this._ready  = false;
  }
  load(dataUrl, cb) {
    if (!window.GifDecoder) { if (cb) cb(); return; }
    GifDecoder.decode(dataUrl).then(({ frames, width, height }) => {
      this._frames = frames;
      this._fIdx   = 0;
      this._oc     = document.createElement('canvas');
      this._oc.width  = width;
      this._oc.height = height;
      this._ready  = true;
      this._applyFrame(0);
      if (cb) cb();
      // Regenerar miniatura de hojas ahora que _oc tiene el primer frame
      requestAnimationFrame(() => {
        if (typeof _edRefreshCurrentPageThumb === 'function') _edRefreshCurrentPageThumb();
        if (typeof edUpdateNavPages === 'function') edUpdateNavPages();
      });
    }).catch(e => { console.warn('GIF decode:', e); if (cb) cb(); });
  }
  _applyFrame(i) {
    if (!this._ready || !this._frames.length) return;
    this._fIdx = i % this._frames.length;
    const frame = this._frames[this._fIdx];
    this._oc.getContext('2d').putImageData(frame.imageData, 0, 0);
    // En el editor: no animar automáticamente — mostrar frame actual como imagen fija
    // La animación se activará en los reproductores (Fase 2)
    if (!this._playing) return;
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      this._applyFrame(this._fIdx + 1);
      if (typeof edRedraw === 'function' && typeof edCanvas !== 'undefined' && edCanvas) {
        requestAnimationFrame(() => {
          if ($('editorViewer')?.classList.contains('open') && typeof edUpdateViewer === 'function') {
            edUpdateViewer();
          } else {
            edRedraw();
          }
        });
      }
    }, frame.delay);
  }
  stopAnim() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    this._fIdx = 0;
    if (this._ready && this._frames && this._frames.length && this._oc) {
      this._oc.getContext('2d').putImageData(this._frames[0].imageData, 0, 0);
    }
  }
  draw(ctx) {
    if (!this._oc || !this._ready) return;
    const pw = edPageW(), ph = edPageH();
    const w  = this.width  * pw;
    const h  = this.height * ph;
    const px = edMarginX() + this.x * pw;
    const py = edMarginY() + this.y * ph;
    ctx.save();
    ctx.globalAlpha = this.opacity ?? 1;
    ctx.translate(px, py);
    ctx.rotate((this.rotation || 0) * Math.PI / 180);
    ctx.drawImage(this._oc, -w/2, -h/2, w, h);
    ctx.restore();
  }
  contains(px, py) { return super.contains(px, py); }
}

class TextLayer extends BaseLayer {
  constructor(text='Escribe aquí',x=0.5,y=0.5){
    super('text',x,y,0.2,0.1);
    this.text=text;this.fontSize=30;this.fontFamily='Patrick Hand';
    this.fontBold=false;this.fontItalic=false;
    this.color='#000000';this.backgroundColor='#ffffff';this.bgOpacity=1;
    this.borderColor='#000000';this.borderWidth=0;this.padding=10;
  }
  getLines(){return this.text.split('\n');}
  _fontStr(){ return `${this.fontItalic?'italic ':''}${this.fontBold?'bold ':''}${this.fontSize}px ${this.fontFamily}`; }
  measure(ctx){
    ctx.font=this._fontStr();
    let mw=0,th=0;
    this.getLines().forEach(l=>{mw=Math.max(mw,ctx.measureText(l).width);th+=this.fontSize*1.2;});
    return{width:mw,height:th};
  }
  resizeToFitText(can){
    const pw=edPageW(), ph=edPageH();
    const ctx=can.getContext('2d'),{width,height}=this.measure(ctx);
    this.width=Math.max(0.05,(width+this.padding*2)/pw);
    this.height=Math.max(0.05,(height+this.padding*2)/ph);
  }
  draw(ctx,can){
    const pw=edPageW(), ph=edPageH();
    const w=this.width*pw, h=this.height*ph;
    const px=edMarginX()+this.x*pw, py=edMarginY()+this.y*ph;
    ctx.save();
    ctx.translate(px,py); ctx.rotate(this.rotation*Math.PI/180);
    // Fondo y borde se dibujan en espacio local (tras la rotación)
    const _bgo=this.bgOpacity??1;
    const _ctxAlpha=ctx.globalAlpha;
    if(_bgo>0){ctx.globalAlpha=_ctxAlpha*_bgo;ctx.fillStyle=this.backgroundColor;ctx.fillRect(-w/2,-h/2,w,h);ctx.globalAlpha=_ctxAlpha;}
    if(this.borderWidth>0){
      ctx.strokeStyle=this.borderColor; ctx.lineWidth=this.borderWidth;
      ctx.strokeRect(-w/2,-h/2,w,h);
    }
    ctx.font=this._fontStr();
    const isPlaceholder = this.text==='Escribe aquí';
    ctx.fillStyle=isPlaceholder?'#aaaaaa':this.color;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    const lines=this.getLines(),lh=this.fontSize*1.2,totalH=lines.length*lh;
    lines.forEach((l,i)=>ctx.fillText(l,0,-totalH/2+lh/2+i*lh));
    ctx.restore();
  }
}


class BubbleLayer extends BaseLayer {
  constructor(text='Escribe aquí',x=0.5,y=0.5){
    super('bubble',x,y,0.3,0.15);
    this.text=text;this.fontSize=30;this.fontFamily='Patrick Hand';
    this.fontBold=false;this.fontItalic=false;
    this.color='#000000';this.backgroundColor='#ffffff';
    this.borderColor='#000000';this.borderWidth=2;
    this.tail=true;
    this.tailStart={x:-0.4,y:0.4};this.tailEnd={x:-0.4,y:0.6}; // voz 0 (legacy)
    this.tailStarts=[{x:-0.4,y:0.4}];this.tailEnds=[{x:-0.4,y:0.6}]; // arrays por voz
    this.style='conventional';this.voiceCount=1;this.padding=15;
    // Cola pensamiento: posiciones normalizadas de elipse grande y pequeña
    // tBig = centro elipse grande (más cercana al bocadillo), tSmall = elipse pequeña (más lejana)
    this.thoughtBig  = {x:0.35, y:0.55};  // relativo al centro, en fracción del tamaño
    this.thoughtSmall= {x:0.55, y:0.80};
    // Radios editables para estilo explosión (12 vértices, normalizados 0..1)
    this.explosionRadii=null; // null = usar valores por defecto
  }
  getLines(){return this.text.split('\n');}
  _fontStr(){ return `${this.fontItalic?'italic ':''}${this.fontBold?'bold ':''}${this.fontSize}px ${this.fontFamily}`; }
  measure(ctx){
    ctx.font=this._fontStr();
    let mw=0,th=0;
    this.getLines().forEach(l=>{mw=Math.max(mw,ctx.measureText(l).width);th+=this.fontSize*1.2;});
    return{width:mw,height:th};
  }
  resizeToFitText(can){
    const pw=edPageW(), ph=edPageH();
    const ctx=can.getContext('2d');
    ctx.font=this._fontStr();
    const lines=this.getLines();
    const lh=this.fontSize*1.2;
    const maxW=lines.reduce((m,l)=>Math.max(m,ctx.measureText(l).width),0);
    const totalH=lines.length*lh;
    if(this.style==='thought'){
      // El texto cabe en el círculo interior de radio maxDist-padding
      // maxDist ≈ 0.45 * w (constante para proporciones razonables, ver análisis geométrico)
      // → w = (textW/2 + padding) / 0.45 * 1.05 (margen 5%)
      // → h = (textH/2 + padding) / 0.45 * 1.05
      // El bbox se adapta al texto en ambos ejes sin espacio desperdiciado
      const _C=0.45, _mg=1.05;
      const w2=(maxW/2+this.padding)/_C*_mg;
      const h2=(totalH/2+this.padding)/_C*_mg;
      this.width=Math.max(0.10,w2/pw);
      this.height=Math.max(0.07,h2/ph);
      return;
    }
    if(this.style==='explosion'){
      // Para explosión: el texto debe caber dentro del área interior (delimitada por los valles)
      // Los valles (índices impares) tienen radio ~0.55-0.65 del borde de la caja
      // El radio interior mínimo de los valles es ~0.55 en cada eje
      // Área interior disponible: (w/2)*minValleOx x (h/2)*minValleOy
      // Necesitamos: caja tal que los valles dejen espacio para maxW x totalH + padding
      this._initExplosionRadii();
      // Calcular el radio mínimo de los valles en cada dirección
      const valleys = this.explosionRadii.filter((_,i)=>i%2!==0);
      const minValleR = valleys.reduce((m,v)=>Math.min(m,Math.hypot(v.ox,v.oy)),1);
      // El texto + padding debe caber en el rectángulo inscrito dentro del círculo de radio minValleR
      // Para un cuadrado inscrito en un círculo de radio r: lado = r * sqrt(2)
      // Pero usamos el rectángulo real del texto: necesitamos que
      // sqrt((maxW/2/ax)² + (totalH/2/ay)²) <= minValleR
      // Simplificación: escalar la caja para que el texto quepa con margen
      const textDiag = Math.hypot(maxW/2 + this.padding, totalH/2 + this.padding);
      const scale = 1 / minValleR; // cuánto más grande debe ser la caja respecto al texto
      const w = (maxW + this.padding*2) * scale * 1.1;
      const h = (totalH + this.padding*2) * scale * 1.1;
      this.width=Math.max(0.05,w/pw);
      this.height=Math.max(0.05,h/ph);
    } else {
      const factor = lines.length === 1 ? 1.15 : 1.05;
      const w = maxW * factor + this.padding * 2;
      const h = totalH * factor + this.padding * 2;
      this.width=Math.max(0.05,w/pw);
      this.height=Math.max(0.05,h/ph);
    }
  }
  _initExplosionRadii(){
    if(this.explosionRadii&&this.explosionRadii.length===14&&typeof this.explosionRadii[0]==='object') return;
    // 14 vértices: 7 picos + 7 valles alternos, detectados desde imagen de referencia real
    // Coordenadas normalizadas: ox=1 = borde derecho de la caja (semieje X)
    this.explosionRadii=[
      {ox:+0.9776,oy:+0.3105},
      {ox:+0.5129,oy:+0.4912},
      {ox:+0.4159,oy:+0.8929},
      {ox:+0.0346,oy:+0.5928},
      {ox:-0.3742,oy:+0.9992},
      {ox:-0.4809,oy:+0.6768},
      {ox:-0.9476,oy:+0.6897},
      {ox:-0.7042,oy:+0.0887},
      {ox:-0.9825,oy:-0.5075},
      {ox:-0.3880,oy:-0.6292},
      {ox:-0.2012,oy:-0.9957},
      {ox:-0.0315,oy:-0.5401},
      {ox:+0.3289,oy:-0.8785},
      {ox:+0.4461,oy:-0.5839}
    ];
  }
  getExplosionControlPoints(){
    if(this.style!=='explosion')return[];
    this._initExplosionRadii();
    const pw=edPageW(),ph=edPageH();
    const w=this.width*pw, h=this.height*ph;
    // Todos los vértices son arrastrables (picos en índices pares, valles en impares)
    return this.explosionRadii
      .map((v,i)=>({nx:this.x+v.ox*w/2/pw, ny:this.y+v.oy*h/2/ph, idx:i, type:'explosion'}));
  }
  getTailControlPoints(){
    if(!this.tail)return[];
    const vc=this.voiceCount||1;
    // Asegurar que los arrays tienen suficientes entradas
    if(!this.tailStarts)this.tailStarts=[{...this.tailStart}];
    if(!this.tailEnds)  this.tailEnds  =[{...this.tailEnd}];
    while(this.tailStarts.length<vc){
      const off=(this.tailStarts.length-(vc-1)/2)*0.25;
      this.tailStarts.push({x:this.tailStart.x+off,y:this.tailStart.y});
      this.tailEnds.push(  {x:this.tailEnd.x+off,  y:this.tailEnd.y});
    }
    const pts=[];
    for(let v=0;v<vc;v++){
      const s=this.tailStarts[v],e=this.tailEnds[v];
      pts.push({x:this.x+s.x*this.width,y:this.y+s.y*this.height,type:'start',voice:v});
      pts.push({x:this.x+e.x*this.width,y:this.y+e.y*this.height,type:'end',  voice:v});
    }
    return pts;
  }
  drawTail(ctx,sx,sy,ex,ey){
    ctx.save();
    ctx.fillStyle=this.backgroundColor;ctx.strokeStyle=this.borderColor;ctx.lineWidth=this.borderWidth;
    const angle=Math.atan2(ey-sy,ex-sx),bw=10;
    const perp={x:-Math.sin(angle),y:Math.cos(angle)};
    const dir={x:Math.cos(angle),y:Math.sin(angle)};
    const left={x:sx+perp.x*bw/2,y:sy+perp.y*bw/2};
    const right={x:sx-perp.x*bw/2,y:sy-perp.y*bw/2};
    ctx.beginPath();ctx.moveTo(left.x,left.y);ctx.lineTo(ex,ey);ctx.lineTo(right.x,right.y);
    ctx.closePath();ctx.fill();ctx.stroke();
    // Línea blanca: tapa el stroke negro en la base sin cubrir los vértices del triángulo
    // lineCap='butt' para no crear semicírculos que tapan los ángulos
    const extra=1;
    const extL={x:left.x +perp.x*extra, y:left.y +perp.y*extra};
    const extR={x:right.x-perp.x*extra, y:right.y-perp.y*extra};
    ctx.beginPath();ctx.moveTo(extL.x,extL.y);ctx.lineTo(extR.x,extR.y);
    ctx.strokeStyle=this.backgroundColor;ctx.lineWidth=this.borderWidth*2+2;
    ctx.lineCap='round';ctx.stroke();ctx.lineCap='butt';
    ctx.restore();
  }
  draw(ctx,can){
    const pw=edPageW(), ph=edPageH();
    const w=this.width*pw, h=this.height*ph;
    const pos={x:edMarginX()+this.x*pw, y:edMarginY()+this.y*ph};
    const isSingle=this.text.trim().length===1&&/[a-zA-Z0-9]/.test(this.text.trim());
    ctx.save();ctx.translate(pos.x,pos.y);

    if(this.style==='thought'){
      const circles=[{x:0,y:-h/4,r:w/3},{x:w/4,y:0,r:w/3},{x:-w/4,y:0,r:w/3},{x:0,y:h/4,r:w/3}];
      ctx.fillStyle=this.backgroundColor;ctx.strokeStyle=this.borderColor;ctx.lineWidth=this.borderWidth;
      circles.forEach(c=>{ctx.beginPath();ctx.arc(c.x,c.y,c.r,0,Math.PI*2);ctx.fill();ctx.stroke();});
      function ci(c1,c2){
        const dx=c2.x-c1.x,dy=c2.y-c1.y,d=Math.hypot(dx,dy);
        if(d>c1.r+c2.r||d<Math.abs(c1.r-c2.r)||d===0)return[];
        const a=(c1.r*c1.r-c2.r*c2.r+d*d)/(2*d),h2=c1.r*c1.r-a*a;
        if(h2<0)return[];const hh=Math.sqrt(h2),x0=c1.x+a*dx/d,y0=c1.y+a*dy/d;
        const rx=-dy*(hh/d),ry=dx*(hh/d);
        return[{x:x0+rx,y:y0+ry},{x:x0-rx,y:y0-ry}];
      }
      let maxDist=0;
      [[0,1],[0,2],[1,3],[2,3],[0,3],[1,2]].forEach(([a,b])=>{
        ci(circles[a],circles[b]).forEach(p=>{maxDist=Math.max(maxDist,Math.hypot(p.x,p.y));});
      });
      if(maxDist===0)maxDist=Math.min(w,h)*0.4;
      ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(0,0,maxDist,0,Math.PI*2);ctx.fill();
      // Burbujas cola pensamiento: 3 elipses editables
      if(this.tail){
        const bx=this.thoughtBig.x*w,   by=this.thoughtBig.y*h;
        const sx=this.thoughtSmall.x*w, sy=this.thoughtSmall.y*h;
        // Radios proporcionales al bocadillo — tamaño doble manteniendo proporciones relativas
        const rBig  = Math.min(w,h)*0.156;
        const rSmall= Math.min(w,h)*0.070;
        // Elipse mediana: a mitad de distancia entre contorno grande y contorno pequeña
        // Contorno grande más cercano a pequeña: punto en bx,by en dirección a sx,sy a distancia rBig
        const dx=sx-bx,dy=sy-by,dist=Math.hypot(dx,dy)||1;
        const ux=dx/dist,uy=dy/dist;
        // Contornos de grande y pequeña (punto más cercano entre ellas)
        const edgeBig  ={x:bx+ux*rBig,   y:by+uy*rBig};
        const edgeSmall={x:sx-ux*rSmall, y:sy-uy*rSmall};
        const freeD=Math.hypot(edgeSmall.x-edgeBig.x,edgeSmall.y-edgeBig.y);
        // Radios interpolados linealmente: rSmall < r2 < r3 < rBig
        // Elipses 1(rojo/pequeña) < 2 < 3 < 4(azul/grande)
        const r2=rSmall+(rBig-rSmall)*1/3; // elipse 2: 1/3 del camino entre pequeña y grande
        const r3=rSmall+(rBig-rSmall)*2/3; // elipse 3: 2/3 del camino entre pequeña y grande
        // gap igual entre todos los contornos adyacentes
        const gap=Math.max(0,(freeD-2*r3-2*r2)/3);
        // Desde edgeSmall hacia edgeBig (orden 2→3)
        const e2x=edgeSmall.x-ux*(gap+r2), e2y=edgeSmall.y-uy*(gap+r2);
        const e3x=edgeSmall.x-ux*(gap+2*r2+gap+r3), e3y=edgeSmall.y-uy*(gap+2*r2+gap+r3);
        [[sx,sy,rSmall],[e2x,e2y,r2],[e3x,e3y,r3],[bx,by,rBig]].forEach(([cx2,cy2,r])=>{
          ctx.beginPath();ctx.ellipse(cx2,cy2,r,r*2/3,0,0,Math.PI*2);
          ctx.fillStyle=this.backgroundColor;ctx.fill();
          ctx.strokeStyle=this.borderColor;ctx.lineWidth=this.borderWidth;ctx.stroke();
        });
      }
      // Texto centrado
      ctx.font=this._fontStr();
      const isPlaceholderT=this.text==='Escribe aquí';
      ctx.fillStyle=isPlaceholderT?'#999999':this.color;ctx.textAlign='center';ctx.textBaseline='middle';
      const linesT=this.getLines(),lhT=this.fontSize*1.2,totalHT=linesT.length*lhT;
      linesT.forEach((l,i)=>ctx.fillText(l,0,-totalHT/2+lhT/2+i*lhT));
      ctx.restore();return;
    }

    if(this.style==='explosion'){
      this._initExplosionRadii();
      ctx.beginPath();
      this.explosionRadii.forEach((v,i)=>{
        const vx=v.ox*w/2, vy=v.oy*h/2;
        i===0?ctx.moveTo(vx,vy):ctx.lineTo(vx,vy);
      });
      ctx.closePath();
    }else if(isSingle){
      ctx.beginPath();ctx.arc(0,0,Math.min(w,h)/2,0,Math.PI*2);
    }else{
      ctx.beginPath();ctx.ellipse(0,0,w/2,h/2,0,0,Math.PI*2);
    }

    ctx.fillStyle=this.backgroundColor;ctx.fill();
    if(this.borderWidth>0){
      ctx.strokeStyle=this.borderColor;ctx.lineWidth=this.borderWidth;
      if(this.style==='lowvoice')ctx.setLineDash([5,3]);else ctx.setLineDash([]);
      ctx.stroke();ctx.setLineDash([]);
    }

    if(this.tail){
      {
        const vc=this.voiceCount||1;
        if(!this.tailStarts)this.tailStarts=[{...this.tailStart}];
        if(!this.tailEnds)  this.tailEnds  =[{...this.tailEnd}];
        for(let v=0;v<vc;v++){
          const s=this.tailStarts[v]||this.tailStarts[0];
          const e=this.tailEnds[v]  ||this.tailEnds[0];
          this.drawTail(ctx,s.x*w,s.y*h,e.x*w,e.y*h);
        }
      }
    }

    ctx.font=this._fontStr();
    const isPlaceholder = this.text==='Escribe aquí';
    ctx.fillStyle=isPlaceholder?'#999999':this.color;
    ctx.textAlign='center';ctx.textBaseline='middle';
    const lines=this.getLines(),lh=this.fontSize*1.2,totalH=lines.length*lh;
    // Para explosión: centrar el texto en el centroide de los valles (índices impares)
    let textCx=0, textCy=0;
    if(this.style==='explosion' && this.explosionRadii && this.explosionRadii.length>1){
      const valleys=this.explosionRadii.filter((_,i)=>i%2!==0);
      textCx=valleys.reduce((s,v)=>s+v.ox*w/2,0)/valleys.length;
      textCy=valleys.reduce((s,v)=>s+v.oy*h/2,0)/valleys.length;
    }
    lines.forEach((l,i)=>ctx.fillText(l,textCx,textCy-totalH/2+lh/2+i*lh));
    ctx.restore();
  }
}

/* ══════════════════════════════════════════
   CANVAS: TAMAÑO Y FIT
   ══════════════════════════════════════════ */
function edSetOrientation(o, persist=true){
  const prevOrientation = edOrientation;
  edOrientation=o;
  // Persistir en la hoja actual (no al inicializar el editor)
  if(persist && edPages[edCurrentPage]) edPages[edCurrentPage].orientation=o;
  // Recalcular height de ImageLayers si la orientacion realmente cambio
  if(persist && prevOrientation !== o){
    const _isV = o === 'vertical';
    const _pw = _isV ? ED_PAGE_W : ED_PAGE_H;
    const _ph = _isV ? ED_PAGE_H : ED_PAGE_W;
    (edPages[edCurrentPage]?.layers || []).forEach(l => {
      if(l.type === 'image' && l.img && l.img.naturalWidth > 0){
        l.height = l.width * (l.img.naturalHeight / l.img.naturalWidth) * (_pw / _ph);
      }
    });
  }
  if(edViewerCanvas){ edViewerCanvas.width=edPageW(); edViewerCanvas.height=edPageH(); }
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    window._edUserRequestedReset=true; edFitCanvas(true);
    edRedraw();
  }));
}


class DrawLayer extends BaseLayer {
  constructor(){
    super('draw', 0.5, 0.5, 1.0, 1.0);
    // El canvas interno cubre todo el workspace (no solo la página)
    // para permitir dibujar en la zona de trabajo fuera del lienzo.
    this._canvas = document.createElement('canvas');
    this._canvas.width  = ED_CANVAS_W;
    this._canvas.height = ED_CANVAS_H;
    this._ctx = this._canvas.getContext('2d');
    this._lastX = 0;
    this._lastY = 0;
  }
  static fromDataUrl(dataUrl, pw, ph){
    const dl = new DrawLayer();
    const img = new Image();
    img.onload = () => {
      const mx = (ED_CANVAS_W - pw) / 2;
      const my = (ED_CANVAS_H - ph) / 2;
      dl._ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, mx, my, pw, ph);
      if(typeof edRedraw === 'function') edRedraw();
      if(window._gcpActive && typeof _gcpRedraw === 'function') _gcpRedraw();
    };
    img.src = dataUrl;
    return dl;
  }
  static fromDataUrlFull(dataUrl){
    const dl = new DrawLayer();
    const img = new Image();
    img.onload = () => {
      dl._ctx.drawImage(img, 0, 0, ED_CANVAS_W, ED_CANVAS_H);
      if(typeof edRedraw === 'function') edRedraw();
      if(window._gcpActive && typeof _gcpRedraw === 'function') _gcpRedraw();
    };
    img.src = dataUrl;
    return dl;
  }
  toDataUrl(){
    // Exportar solo la zona de la página para compatibilidad con guardado
    const pw = edPageW(), ph = edPageH();
    const tmp = document.createElement('canvas');
    tmp.width = pw; tmp.height = ph;
    tmp.getContext('2d').drawImage(this._canvas,
      edMarginX(), edMarginY(), pw, ph, 0, 0, pw, ph);
    return tmp.toDataURL();
  }
  toDataUrlFull(){
    // Exportar el workspace completo (incluye dibujo fuera del lienzo)
    return this._canvas.toDataURL();
  }
  clear(){
    this._ctx.clearRect(0, 0, ED_CANVAS_W, ED_CANVAS_H);
  }
  // Coordenadas en workspace (px absoluto dentro del canvas de trabajo)
  _wsCoords(nx, ny){
    return {
      x: edMarginX() + nx * edPageW(),
      y: edMarginY() + ny * edPageH()
    };
  }
  beginStroke(nx, ny, color, size, isEraser, opacity, clipR){
    const {x,y} = this._wsCoords(nx, ny);
    const alpha = (opacity ?? 100) / 100;
    this._ctx.save();
    if(clipR > 0){ this._ctx.beginPath(); this._ctx.arc(x,y,clipR,0,Math.PI*2); this._ctx.clip(); }
    this._ctx.globalAlpha = alpha;
    if(isEraser){ this._ctx.globalCompositeOperation='destination-out'; this._ctx.fillStyle='rgba(0,0,0,1)'; }
    else { this._ctx.globalCompositeOperation='source-over'; this._ctx.fillStyle=color; }
    this._ctx.beginPath(); this._ctx.arc(x,y,size/2,0,Math.PI*2); this._ctx.fill();
    this._ctx.restore(); this._ctx.globalCompositeOperation='source-over';
    this._lastX=x; this._lastY=y;
  }
  // Como beginStroke pero sin dibujar el punto inicial — para cursor offset
  beginStrokeNoDot(nx, ny){
    const {x,y} = this._wsCoords(nx, ny);
    this._lastX=x; this._lastY=y;
  }
  continueStroke(nx, ny, color, size, isEraser, opacity, clipR){
    const {x,y} = this._wsCoords(nx, ny);
    const alpha = (opacity ?? 100) / 100;
    this._ctx.save();
    if(clipR > 0){ this._ctx.beginPath(); this._ctx.arc(x,y,clipR,0,Math.PI*2); this._ctx.clip(); }
    this._ctx.globalAlpha = alpha;
    this._ctx.beginPath(); this._ctx.moveTo(this._lastX,this._lastY); this._ctx.lineTo(x,y);
    if(isEraser){ this._ctx.globalCompositeOperation='destination-out'; this._ctx.strokeStyle='rgba(0,0,0,1)'; }
    else { this._ctx.globalCompositeOperation='source-over'; this._ctx.strokeStyle=color; }
    this._ctx.lineWidth=size; this._ctx.lineCap='round'; this._ctx.lineJoin='round'; this._ctx.stroke();
    this._ctx.restore(); this._ctx.globalCompositeOperation='source-over';
    this._lastX=x; this._lastY=y;
  }
  draw(ctx){
    // Pintar el workspace entero con el mismo transform de cámara ya activo en ctx
    ctx.save();
    ctx.drawImage(this._canvas, 0, 0);
    ctx.restore();
  }
  contains(px, py, exactMode){
    // DrawLayer: pixel-hit sobre el canvas del workspace completo.
    // exactMode=true → solo píxel exacto (R=1 para antialiasing); usado en la primera
    //   pasada de selección para no "ganar" sobre capas inferiores en huecos.
    // exactMode=false/undefined → radio R=10 para facilitar selección cuando no hay
    //   ningún objeto exacto bajo el toque.
    try {
      const wx = Math.round(edMarginX() + px * edPageW());
      const wy = Math.round(edMarginY() + py * edPageH());
      const R = exactMode ? 1 : 10;
      const x0=Math.max(0,wx-R), y0=Math.max(0,wy-R);
      const x1=Math.min(this._canvas.width-1,wx+R);
      const y1=Math.min(this._canvas.height-1,wy+R);
      if(x1<x0||y1<y0) return false;
      const data=this._ctx.getImageData(x0,y0,x1-x0+1,y1-y0+1).data;
      for(let i=3;i<data.length;i+=4){ if(data[i]>10) return true; }
      return false;
    } catch(e) {
      return true;
    }
  }
}


class StrokeLayer extends BaseLayer {
  constructor(srcCanvas){
    // srcCanvas es el workspace completo (ED_CANVAS_W × ED_CANVAS_H)
    // Calcular bounding box del contenido pintado
    const bb = StrokeLayer._boundingBox(srcCanvas);
    const pw = edPageW(), ph = edPageH();
    if(!bb){
      super('stroke', 0.5, 0.5, 0.1, 0.1);
      this._canvas = document.createElement('canvas');
      this._canvas.width = Math.round(pw * 0.1);
      this._canvas.height = Math.round(ph * 0.1);
      return;
    }
    // Coordenadas fraccionarias relativas a la PÁGINA
    // bb está en coordenadas de workspace → convertir
    const cx = (bb.x + bb.w/2 - edMarginX()) / pw;
    const cy = (bb.y + bb.h/2 - edMarginY()) / ph;
    const fw = bb.w / pw;
    const fh = bb.h / ph;
    super('stroke', cx, cy, fw, fh);
    // Recortar bitmap a la zona del bounding box
    this._canvas = document.createElement('canvas');
    this._canvas.width  = Math.max(1, bb.w);
    this._canvas.height = Math.max(1, bb.h);
    this._canvas.getContext('2d').drawImage(srcCanvas, bb.x, bb.y, bb.w, bb.h, 0, 0, bb.w, bb.h);
  }
  // Calcular bounding box del contenido no-transparente del canvas
  static _boundingBox(canvas){
    const ctx = canvas.getContext('2d');
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const W = canvas.width, H = canvas.height;
    let minX=W, minY=H, maxX=0, maxY=0, found=false;
    // Iterar buscando solo píxeles CON contenido real (alpha > 10)
    // No contar píxeles borrados (alpha = 0) aunque estén dentro del bb
    for(let y=0; y<H; y++){
      const row = y * W;
      for(let x=0; x<W; x++){
        if(d[(row+x)*4+3] > 10){
          if(x<minX)minX=x; if(x>maxX)maxX=x;
          if(y<minY)minY=y; if(y>maxY)maxY=y;
          found=true;
        }
      }
    }
    if(!found) return null;
    // Margen mínimo (1px) para no cortar antialiasing en el borde exacto
    const pad = 1;
    return {
      x: Math.max(0, minX-pad), y: Math.max(0, minY-pad),
      w: Math.min(W, maxX-minX+1+pad*2),
      h: Math.min(H, maxY-minY+1+pad*2)
    };
  }
  // Restaurar desde dataUrl (carga de proyecto)
  static fromDataUrl(dataUrl, x, y, width, height, pw, ph){
    const sl = new StrokeLayer(document.createElement('canvas'), pw||ED_PAGE_W, ph||ED_PAGE_H);
    sl.x = x; sl.y = y; sl.width = width; sl.height = height;
    const bw = Math.max(1, Math.round(width  * (pw||ED_PAGE_W)));
    const bh = Math.max(1, Math.round(height * (ph||ED_PAGE_H)));
    sl._canvas = document.createElement('canvas');
    sl._canvas.width  = bw;
    sl._canvas.height = bh;
    const img = new Image();
    img.onload = () => {
      sl._canvas.getContext('2d').drawImage(img, 0, 0, bw, bh);
      if(typeof edRedraw === 'function') edRedraw();
      if(window._gcpActive && typeof _gcpRedraw === 'function') _gcpRedraw();
    };
    img.src = dataUrl;
    return sl;
  }
  // Exportar bitmap recortado
  toDataUrl(){ return this._canvas.toDataURL(); }
  // Expandir a DrawLayer para edición — devuelve un DrawLayer con el contenido restaurado
  toDrawLayer(){
    // Hacer bake del StrokeLayer con TODAS sus transformaciones aplicadas
    // (rotation, resize, opacity) en un DrawLayer del tamaño del workspace.
    // El resultado visual es idéntico a como se ve en el canvas del editor.
    const dl = new DrawLayer();
    const pw = edPageW(), ph = edPageH();
    const cx = edMarginX() + this.x * pw;
    const cy = edMarginY() + this.y * ph;
    const w  = this.width  * pw;
    const h  = this.height * ph;
    dl._ctx.save();
    dl._ctx.globalAlpha = this.opacity ?? 1;
    dl._ctx.translate(cx, cy);
    dl._ctx.rotate((this.rotation || 0) * Math.PI / 180);
    dl._ctx.drawImage(this._canvas, -w/2, -h/2, w, h);
    dl._ctx.restore();
    return dl;
  }
  draw(ctx){
    if(!this._canvas || this._canvas.width === 0) return;
    const pw = edPageW(), ph = edPageH();
    const w = this.width  * pw;
    const h = this.height * ph;
    const px = edMarginX() + this.x * pw;
    const py = edMarginY() + this.y * ph;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate((this.rotation||0) * Math.PI/180);
    ctx.drawImage(this._canvas, -w/2, -h/2, w, h);
    ctx.restore();
  }
  contains(px, py){
    // 1. Bbox rápido primero
    if(!super.contains(px, py)) return false;
    // 2. Pixel-hit real sobre el bitmap recortado
    if(!this._canvas || this._canvas.width === 0) return true;
    try {
      const pw = edPageW(), ph = edPageH();
      // Transformar punto al espacio local del stroke (con rotación)
      const rot = (this.rotation || 0) * Math.PI / 180;
      const dx = (px - this.x) * pw, dy = (py - this.y) * ph;
      const lx = dx * Math.cos(-rot) - dy * Math.sin(-rot);
      const ly = dx * Math.sin(-rot) + dy * Math.cos(-rot);
      const w = this.width * pw, h = this.height * ph;
      // Convertir a coordenadas de píxel en el canvas recortado
      const bx = Math.round((lx / w + 0.5) * this._canvas.width);
      const by = Math.round((ly / h + 0.5) * this._canvas.height);
      // Radio de expansión: 10px en coords de workspace, escalado al canvas recortado
      const scaleX = this._canvas.width / w;
      const scaleY = this._canvas.height / h;
      const Rx = Math.ceil(10 * scaleX), Ry = Math.ceil(10 * scaleY);
      const x0=Math.max(0,bx-Rx), y0=Math.max(0,by-Ry);
      const x1=Math.min(this._canvas.width-1,bx+Rx);
      const y1=Math.min(this._canvas.height-1,by+Ry);
      if(x1<x0||y1<y0) return false;
      const _sctx=this._canvas.getContext('2d');
      const data=_sctx.getImageData(x0,y0,x1-x0+1,y1-y0+1).data;
      for(let i=3;i<data.length;i+=4){ if(data[i]>10) return true; }
      return false;
    } catch(e) {
      return true; // fallback si falla
    }
  }
}

/* ══════════════════════════════════════════
   SHAPE LAYER — rectángulo y elipse editables
   ══════════════════════════════════════════ */
class ShapeLayer extends BaseLayer {
  constructor(shape='rect', x=0.5, y=0.5, w=0.3, h=0.2) {
    super('shape', x, y, w, h);
    this.shape     = shape;       // 'rect' | 'ellipse'
    this.color     = '#000000';   // color del borde
    this.fillColor = 'none';       // sin relleno por defecto
    this.lineWidth = 3;
    this.opacity   = 1;
  }
  draw(ctx) {
    const pw = edPageW(), ph = edPageH();
    const mx = edMarginX(), my = edMarginY();
    const cx = mx + this.x * pw;
    const cy = my + this.y * ph;
    const w  = this.width  * pw;
    const h  = this.height * ph;
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * (this.opacity ?? 1);
    ctx.translate(cx, cy);
    ctx.rotate((this.rotation || 0) * Math.PI / 180);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (this.shape === 'ellipse') {
      ctx.ellipse(0, 0, w/2, h/2, 0, 0, Math.PI * 2);
    } else {
      // Radios por vértice (TL, TR, BR, BL) o radio global
      const crs=this.cornerRadii;
      if(crs&&crs.length===4&&crs.some(r=>r>0)){
        const maxR=Math.min(w,h)/2;
        ctx.roundRect(-w/2,-h/2,w,h,crs.map(r=>Math.min(r||0,maxR)));
      } else {
        const cr=this.cornerRadius||0;
        if(cr>0){ ctx.roundRect(-w/2,-h/2,w,h,Math.min(cr,Math.min(w,h)/2)); }
        else { ctx.rect(-w/2,-h/2,w,h); }
      }
    }
    if (this.fillColor && this.fillColor !== 'none') {
      ctx.fillStyle = this.fillColor;
      ctx.fill();
    }
    if (this.lineWidth > 0) {
      ctx.strokeStyle = this.color;
      ctx.lineWidth   = this.lineWidth;
      ctx.stroke();
    }
    ctx.restore();
  }
  contains(px, py) {
    // 1. Bbox rápido primero
    if (!super.contains(px, py)) return false;
    // 2. Pixel-hit real — renderizar en offscreen y leer alpha
    try {
      const pw = edPageW(), ph = edPageH();
      const w  = this.width  * pw;
      const h  = this.height * ph;
      // Transformar punto al espacio local (con rotación)
      const rot = (this.rotation || 0) * Math.PI / 180;
      const dx = (px - this.x) * pw, dy = (py - this.y) * ph;
      const lx = dx * Math.cos(-rot) - dy * Math.sin(-rot);
      const ly = dx * Math.sin(-rot) + dy * Math.cos(-rot);
      // Crear canvas offscreen del tamaño de la shape
      const cw = Math.max(1, Math.ceil(w)), ch = Math.max(1, Math.ceil(h));
      const oc = document.createElement('canvas');
      oc.width = cw; oc.height = ch;
      const octx = oc.getContext('2d');
      octx.translate(cw/2, ch/2);
      octx.beginPath();
      if (this.shape === 'ellipse') {
        octx.ellipse(0, 0, w/2, h/2, 0, 0, Math.PI * 2);
      } else {
        octx.rect(-w/2, -h/2, w, h);
      }
      if (this.fillColor && this.fillColor !== 'none') {
        octx.fillStyle = this.fillColor;
        octx.fill();
      }
      // Sin relleno: ampliar zona de hit al contorno (mínimo 12px) para facilitar selección
      if (this.lineWidth > 0) {
        octx.strokeStyle = '#000';
        const noFill = !this.fillColor || this.fillColor === 'none';
        octx.lineWidth = noFill ? Math.max(this.lineWidth, 12) : this.lineWidth;
        octx.stroke();
      }
      const bx = Math.floor(lx + cw/2);
      const by = Math.floor(ly + ch/2);
      if (bx < 0 || by < 0 || bx >= cw || by >= ch) return false;
      return octx.getImageData(bx, by, 1, 1).data[3] > 10;
    } catch(e) {
      return true;
    }
  }
}

/* ══════════════════════════════════════════
   LINE LAYER — rectas y polígonos editables
   Vértices en coordenadas normalizadas (0-1) de la página
   ══════════════════════════════════════════ */
class LineLayer extends BaseLayer {
  constructor() {
    super('line', 0.5, 0.5, 0, 0);
    this.points    = [];   // coords normalizadas en espacio LOCAL (relativas al centro, sin rotación)
    this.closed    = false;
    this.color     = '#000000';
    this.fillColor = 'none';       // sin relleno por defecto
    this.lineWidth = 3;
    this.opacity   = 1;
    this.subPaths  = [];   // T1: sub-paths adicionales para huecos con even-odd fill rule
    // rotation heredado de BaseLayer
  }
  // Recalcular bbox desde puntos locales; centra los puntos en (0,0)
  _updateBbox() {
    if (!this.points.length) return;
    const pw = edPageW(), ph = edPageH();
    const cr = this.cornerRadii || {};
    const n = this.points.length;
    const hasRadii = n>0 && Object.keys(cr).some(k=>(cr[k]||0)>0);

    if(hasRadii){
      const xs2=this.points.filter(Boolean).map(p=>p.x), ys2=this.points.filter(Boolean).map(p=>p.y);
      const minX2=Math.min(...xs2),maxX2=Math.max(...xs2);
      const minY2=Math.min(...ys2),maxY2=Math.max(...ys2);
      const newCx2=(minX2+maxX2)/2, newCy2=(minY2+maxY2)/2;
      if(Math.abs(newCx2)>0.001||Math.abs(newCy2)>0.001){
        const rot=(this.rotation||0)*Math.PI/180;
        const cos=Math.cos(rot),sin=Math.sin(rot);
        const dxPx=newCx2*pw, dyPx=newCy2*ph;
        this.x+=(dxPx*cos-dyPx*sin)/pw;
        this.y+=(dxPx*sin+dyPx*cos)/ph;
        this.points=this.points.map(p=>p?{x:p.x-newCx2,y:p.y-newCy2}:null);
      }
      this.width  = Math.max(maxX2-minX2, 0.01);
      this.height = Math.max(maxY2-minY2, 0.01);
    } else {
      // Sin radios: comportamiento original
      const xs=this.points.filter(Boolean).map(p=>p.x), ys=this.points.filter(Boolean).map(p=>p.y);
      const minX=Math.min(...xs),maxX=Math.max(...xs);
      const minY=Math.min(...ys),maxY=Math.max(...ys);
      const newCx=(minX+maxX)/2, newCy=(minY+maxY)/2;
      if(Math.abs(newCx)>0.001||Math.abs(newCy)>0.001){
        const rot=(this.rotation||0)*Math.PI/180;
        const cos=Math.cos(rot),sin=Math.sin(rot);
        const dxPx=newCx*pw, dyPx=newCy*ph;
        this.x+=(dxPx*cos-dyPx*sin)/pw;
        this.y+=(dxPx*sin+dyPx*cos)/ph;
        this.points=this.points.map(p=>p?{x:p.x-newCx,y:p.y-newCy}:null);
      }
      this.width  = Math.max(maxX-minX, 0.01);
      this.height = Math.max(maxY-minY, 0.01);
    }
  }
  // Puntos en coords absolutas (para primera inserción y cerrar polígono)
  absPoints() {
    const rot = (this.rotation || 0) * Math.PI / 180;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    return this.points.map(p => p ? ({
      x: this.x + p.x * cos - p.y * sin,
      y: this.y + p.x * sin + p.y * cos
    }) : null);
  }
  // Añadir punto en coords absolutas (convierte a local)
  addAbsPoint(ax, ay) {
    const rot = -(this.rotation || 0) * Math.PI / 180;
    const dx = ax - this.x, dy = ay - this.y;
    this.points.push({
      x: dx * Math.cos(rot) - dy * Math.sin(rot),
      y: dx * Math.sin(rot) + dy * Math.cos(rot)
    });
    this._updateBbox();
  }
  draw(ctx) {
    if (this.points.length < 2) return;
    const pw = edPageW(), ph = edPageH();
    const cx = edMarginX() + this.x * pw;
    const cy = edMarginY() + this.y * ph;
    const rot = (this.rotation || 0) * Math.PI / 180;
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * (this.opacity ?? 1);
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.lineJoin = 'round';
    ctx.lineCap  = 'round';
    const pts = this.points;
    const cr  = this.cornerRadii || {};
    const n   = pts.length;
    const px2 = p => p ? ({x: p.x*pw, y: p.y*ph}) : {x:0,y:0};

    const norm = (vx,vy) => { const l=Math.hypot(vx,vy); return l>0?{x:vx/l,y:vy/l}:{x:0,y:0}; };

    // Dividir points en contornos separados por null — antes de construir tangents
    const _contours = [];
    let _cur = [];
    for(const p of pts){ if(p===null){ if(_cur.length>=2) _contours.push(_cur); _cur=[]; } else _cur.push(p); }
    if(_cur.length>=2) _contours.push(_cur);
    const _multiContour = _contours.length > 1;

    // tangents solo se necesita para contorno único sin null
    const effR = i => {
      const r=cr[i]||0; if(!r) return 0;
      if(!pts[(i-1+n)%n]||!pts[i]||!pts[(i+1)%n]) return 0;
      const prev=px2(pts[(i-1+n)%n]), cur=px2(pts[i]), next=px2(pts[(i+1)%n]);
      const d1=Math.hypot(cur.x-prev.x,cur.y-prev.y);
      const d2=Math.hypot(next.x-cur.x,next.y-cur.y);
      return Math.max(0,Math.min(r,Math.min(d1/2,d2/2)));
    };

    const tangents = _multiContour ? [] : Array.from({length:n}, (_,i) => {
      if(!pts[i]) return {p1:{x:0,y:0},p2:{x:0,y:0},cur:{x:0,y:0},r:0};
      const prev=px2(pts[(i-1+n)%n]), cur=px2(pts[i]), next=px2(pts[(i+1)%n]);
      const v1=norm(cur.x-prev.x, cur.y-prev.y);
      const v2=norm(next.x-cur.x, next.y-cur.y);
      const r=effR(i);
      return {
        p1: {x:cur.x-v1.x*r, y:cur.y-v1.y*r},
        p2: {x:cur.x+v2.x*r, y:cur.y+v2.y*r},
        cur, r
      };
    });

    // Helper: construye un contorno cerrado con radios opcionales en un Path2D
    const _buildContour = (target, localPts, localCr, isClosed) => {
      const _n = localPts.length; if(_n < 2) return;
      const _cr2 = localCr || {};
      const _px2b = p => ({x: p.x*pw, y: p.y*ph});
      const _effR2 = i => {
        const r=_cr2[i]||0; if(!r) return 0;
        const prev=_px2b(localPts[(i-1+_n)%_n]), cur=_px2b(localPts[i]), next=_px2b(localPts[(i+1)%_n]);
        const d1=Math.hypot(cur.x-prev.x,cur.y-prev.y), d2=Math.hypot(next.x-cur.x,next.y-cur.y);
        return Math.max(0,Math.min(r,Math.min(d1/2,d2/2)));
      };
      const _tgs = Array.from({length:_n}, (_,i) => {
        const prev=_px2b(localPts[(i-1+_n)%_n]), cur=_px2b(localPts[i]), next=_px2b(localPts[(i+1)%_n]);
        const v1=norm(cur.x-prev.x, cur.y-prev.y), v2=norm(next.x-cur.x, next.y-cur.y);
        const r=_effR2(i);
        return {p1:{x:cur.x-v1.x*r,y:cur.y-v1.y*r}, p2:{x:cur.x+v2.x*r,y:cur.y+v2.y*r}, cur, r};
      });
      const t0=_tgs[0];
      // Abierto: empezar en el punto real; cerrado: empezar en p1 (antes del arco de esquina)
      if(isClosed) target.moveTo(t0.p1.x, t0.p1.y);
      else         target.moveTo(t0.cur.x, t0.cur.y);
      const _limit = isClosed ? _n : _n - 1;
      for(let i=0;i<_limit;i++){
        const {p1,p2,cur,r}=_tgs[i];
        if(isClosed && r>0){ target.quadraticCurveTo(cur.x,cur.y,p2.x,p2.y); }
        const next=_tgs[(i+1)%_n];
        if(isClosed && next.r>0){ target.lineTo(next.p1.x,next.p1.y); }
        else                     { target.lineTo(next.cur.x,next.cur.y); }
      }
      if(isClosed) target.closePath();
    };

    if(_multiContour){
      if(this.grouped){
        // Agrupado (⊕ Unir): cada contorno se pinta independientemente, sin fusión booleana
        const _gStyles = this.groupedStyles || [];
        // Acumular offset en pts para mapear cornerRadii correctamente por contorno
        let _ptBase = 0; // índice de inicio en pts del contorno actual (incluye nulls previos)
        _contours.forEach((c, _ci) => {
          const _st = _gStyles[_ci] || {};
          const _fc = _st.fillColor !== undefined ? _st.fillColor : this.fillColor;
          const _sc = _st.color     !== undefined ? _st.color     : this.color;
          const _lw = _st.lineWidth !== undefined ? _st.lineWidth : this.lineWidth;
          const _cl = _st.closed    !== undefined ? _st.closed    : this.closed;
          const _crC = {};
          // Mapear cornerRadii: avanzar en pts desde _ptBase, solo para este contorno
          let _lIdx = 0, _scan = _ptBase;
          for(; _scan < pts.length; _scan++){
            if(pts[_scan] === null){ if(_lIdx > 0) break; continue; } // null = fin del contorno
            const _r = cr[_scan]||0;
            if(_r) _crC[_lIdx] = _r;
            _lIdx++;
          }
          _ptBase = _scan + 1; // saltar el null separador
          const _path = new Path2D();
          _buildContour(_path, c, _crC, _cl);
          if(_cl && _fc && _fc !== 'none'){
            ctx.fillStyle = _fc;
            ctx.fill(_path);
          }
          if(_lw > 0){
            ctx.strokeStyle = _sc;
            ctx.lineWidth   = _lw;
            ctx.stroke(_path);
          }
        });
      } else {
        // Fusionado (⊕ Fusionar): evenodd para huecos booleanos
        const combined = new Path2D();
        _contours.forEach((c,ci) => {
          const _crC = {};
          let _gIdx = 0;
          for(let _ii=0; _ii<pts.length; _ii++){
            if(pts[_ii]===null){ continue; }
            if(_gIdx < c.length && pts[_ii] === c[_gIdx]){
              const _r = cr[_ii]||0;
              if(_r) _crC[_gIdx] = _r;
              _gIdx++;
            }
          }
          _buildContour(combined, c, _crC, this.closed);
        });
        if (this.fillColor && this.fillColor !== 'none') {
          ctx.fillStyle = this.fillColor;
          ctx.fill(combined, 'evenodd');
        }
        if (this.lineWidth > 0) {
          ctx.strokeStyle = this.color;
          ctx.lineWidth   = this.lineWidth;
          ctx.stroke(combined);
        }
      }
    } else {
      // Contorno único: comportamiento original
      ctx.beginPath();
      if(!this.closed){
        ctx.moveTo(tangents[0].cur.x, tangents[0].cur.y);
        for(let i=1;i<n;i++){
          const {p1,p2,cur,r}=tangents[i];
          if(r>0 && i>0 && i<n-1){
            ctx.lineTo(p1.x,p1.y);
            ctx.quadraticCurveTo(cur.x,cur.y,p2.x,p2.y);
          } else {
            ctx.lineTo(cur.x,cur.y);
          }
        }
      } else {
        const t0=tangents[0];
        ctx.moveTo(t0.p1.x, t0.p1.y);
        for(let i=0;i<n;i++){
          const {p1,p2,cur,r}=tangents[i];
          if(r>0){ ctx.quadraticCurveTo(cur.x,cur.y,p2.x,p2.y); }
          const next=tangents[(i+1)%n];
          if(next.r>0){ ctx.lineTo(next.p1.x,next.p1.y); }
          else         { ctx.lineTo(next.cur.x,next.cur.y); }
        }
        ctx.closePath();
      }
      if (this.closed && this.fillColor && this.fillColor !== 'none') {
        ctx.fillStyle = this.fillColor;
        ctx.fill();
      }
      if (this.lineWidth > 0) {
        ctx.strokeStyle = this.color;
        ctx.lineWidth   = this.lineWidth;
        ctx.stroke();
      }
    }
    ctx.restore();
  }
    contains(px, py) {
    if (this.points.length < 2) return false;
    // 1. Bbox rápido primero
    if (!super.contains(px, py)) return false;
    // 2. Pixel-hit real — renderizar en offscreen y leer alpha
    try {
      const pw = edPageW(), ph = edPageH();
      const w  = this.width  * pw;
      const h  = this.height * ph;
      // Transformar punto al espacio local (con rotación)
      const rot = (this.rotation || 0) * Math.PI / 180;
      const dx = (px - this.x) * pw, dy = (py - this.y) * ph;
      const lx = dx * Math.cos(-rot) - dy * Math.sin(-rot);
      const ly = dx * Math.sin(-rot) + dy * Math.cos(-rot);
      // Canvas offscreen del tamaño del bbox de la línea
      const pad = Math.max(this.lineWidth || 3, 8); // margen para el trazo
      const cw = Math.max(1, Math.ceil(w) + pad*2);
      const ch = Math.max(1, Math.ceil(h) + pad*2);
      const oc = document.createElement('canvas');
      oc.width = cw; oc.height = ch;
      const octx = oc.getContext('2d');
      // Origen en centro del bbox + pad
      octx.translate(cw/2, ch/2);
      // Dividir en contornos por null
      const _cPts = this.points;
      const _cContours = []; let _cCur = [];
      for(const p of _cPts){ if(p===null){ if(_cCur.length>=2) _cContours.push(_cCur); _cCur=[]; } else _cCur.push(p); }
      if(_cCur.length>=2) _cContours.push(_cCur);
      if(_cContours.length > 1){
        const _cPath = new Path2D();
        for(const c of _cContours){
          _cPath.moveTo(c[0].x*pw, c[0].y*ph);
          for(let i=1;i<c.length;i++) _cPath.lineTo(c[i].x*pw, c[i].y*ph);
          _cPath.closePath();
        }
        if (this.fillColor && this.fillColor !== 'none') { octx.fillStyle = this.fillColor; octx.fill(_cPath,'evenodd'); }
        octx.strokeStyle = '#000';
        octx.lineWidth = Math.max((this.lineWidth||0) > 0 ? Math.max(this.lineWidth,8) : 0, 0);
        if ((this.lineWidth||0) > 0) octx.stroke(_cPath);
      } else {
        octx.beginPath();
        const _pts0 = _cContours[0]||[];
        if(_pts0.length) { octx.moveTo(_pts0[0].x*pw, _pts0[0].y*ph); for(let i=1;i<_pts0.length;i++) octx.lineTo(_pts0[i].x*pw, _pts0[i].y*ph); }
        if (this.closed) octx.closePath();
        if (this.closed && this.fillColor && this.fillColor !== 'none') { octx.fillStyle = this.fillColor; octx.fill(); }
      }
      octx.strokeStyle = '#000';
      // Sin relleno: ampliar zona de hit al contorno (mínimo 12px)
      const _noFillL = !this.fillColor || this.fillColor === 'none';
      octx.lineWidth = Math.max(this.lineWidth > 0 ? Math.max(this.lineWidth, _noFillL ? 12 : 8) : 0, 0);
      if (this.lineWidth > 0) octx.stroke();
      const bx = Math.floor(lx + cw/2);
      const by = Math.floor(ly + ch/2);
      if (bx < 0 || by < 0 || bx >= cw || by >= ch) return false;
      return octx.getImageData(bx, by, 1, 1).data[3] > 10;
    } catch(e) {
      return true;
    }
  }
  nearestVertex(px, py, threshold=0.03) {
    const pw = edPageW(), ph = edPageH();
    const abs = this.absPoints();
    let best = -1, bestD = Infinity;
    abs.forEach((p, i) => {
      if(!p) return;
      const dx = (px - p.x) * pw, dy = (py - p.y) * ph;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d < bestD) { bestD = d; best = i; }
    });
    return (bestD < threshold * Math.min(pw, ph)) ? best : -1;
  }
  // getControlPoints() heredado de BaseLayer — usa this.rotation correctamente
}

/* ══════════════════════════════════════════
   HISTORIAL UNDO / REDO
   ══════════════════════════════════════════ */
function _edLayersSnapshot(){
  return JSON.stringify(edLayers.map(l => {
    if(l.type === 'draw'){
      // Serializar DrawLayer como StrokeLayer en el historial global.
      // Esto garantiza que restaurar un snapshot siempre produce un StrokeLayer
      // estático correcto, sin el problema del DrawLayer vacío al restaurar.
      const _bb = StrokeLayer._boundingBox(l._canvas);
      const _pw = edPageW(), _ph = edPageH();
      if(!_bb) return null; // DrawLayer vacío: no incluir en snapshot
      const _cx = (_bb.x + _bb.w/2 - edMarginX()) / _pw;
      const _cy = (_bb.y + _bb.h/2 - edMarginY()) / _ph;
      const _fw = _bb.w / _pw;
      const _fh = _bb.h / _ph;
      // Crear canvas recortado para el dataUrl
      const _tmp = document.createElement('canvas');
      _tmp.width = _bb.w; _tmp.height = _bb.h;
      _tmp.getContext('2d').drawImage(l._canvas, _bb.x, _bb.y, _bb.w, _bb.h, 0, 0, _bb.w, _bb.h);
      return { type: 'stroke', dataUrl: _tmp.toDataURL(),
        x: _cx, y: _cy, width: _fw, height: _fh,
        rotation: 0, opacity: l.opacity ?? 1,
        locked: l.locked || false };
    }
    if(l.type === 'stroke') return { type: 'stroke', dataUrl: l.toDataUrl(), frozenLine: l._frozenLine||null,
      x:l.x, y:l.y, width:l.width, height:l.height, rotation:l.rotation||0, opacity:l.opacity,
      color:l.color||'#000000', lineWidth:l.lineWidth??3, locked:l.locked||false };
    if(l.type === 'shape')  return { type:'shape', shape:l.shape, x:l.x, y:l.y,
      width:l.width, height:l.height, rotation:l.rotation||0,
      color:l.color, fillColor:l.fillColor||'none', lineWidth:l.lineWidth, opacity:l.opacity??1,
      cornerRadius: l.cornerRadius||0, locked:l.locked||false,
      cornerRadii: l.cornerRadii ? (Array.isArray(l.cornerRadii) ? [...l.cornerRadii] : {...l.cornerRadii}) : null };
    if(l.type === 'line')   return { type:'line', points:l.points.slice(),
      x:l.x, y:l.y, width:l.width, height:l.height, rotation:l.rotation||0,
      closed:l.closed, color:l.color, fillColor:l.fillColor||'#ffffff', lineWidth:l.lineWidth, opacity:l.opacity??1, locked:l.locked||false,
      grouped: l.grouped||false,
      groupedStyles: l.groupedStyles ? l.groupedStyles.map(s=>({...s})) : undefined,
      subPaths: l.subPaths&&l.subPaths.length ? l.subPaths.map(sp=>{const _s=sp.slice(); if(sp.cornerRadii)_s.cornerRadii={...sp.cornerRadii}; return _s;}) : undefined,
      cornerRadii: l.cornerRadii ? (Array.isArray(l.cornerRadii) ? [...l.cornerRadii] : {...l.cornerRadii}) : null };
    const o = {};
    for(const k of ['type','x','y','width','height','rotation',
                    'text','fontSize','fontFamily','fontBold','fontItalic','color','backgroundColor','bgOpacity',
                    'borderColor','borderWidth','padding','explosionRadii','thoughtBig','thoughtSmall',
                    'tail','tailStart','tailEnd','tailStarts','tailEnds','style','voiceCount']){
      if(l[k] !== undefined) o[k] = l[k];
    }
    if(l.type === 'group') return null; // obsoleto — ignorar grupos viejos
    if(l.groupId) o.groupId = l.groupId;
    if(l.locked) o.locked = true;
    if(l.img && l.img.complete && l.img.naturalWidth > 0) o._imgSrc = l.img.src || '';
    return o;
  }));
}

function edPushHistory(force){
  // Durante una sesión vectorial activa, bloquear push al historial global.
  // Solo la apertura del panel ("antes") y el OK ("después") deben registrarse.
  // Los estados intermedios solo van al historial vectorial local (_vs*).
  if(_vsHistory.length > 0){ edUpdateUndoRedoBtns(); return; }
  const layersJSON = _edLayersSnapshot();
  if(!force && edHistory.length > 0 && edHistoryIdx >= 0){
    const last = edHistory[edHistoryIdx];
    if(last.layersJSON === layersJSON){ edUpdateUndoRedoBtns(); return; }
  }

  edHistory = edHistory.slice(0, edHistoryIdx + 1);
  edHistory.push({ pageIdx: edCurrentPage, layersJSON });
  if(edHistory.length > ED_MAX_HISTORY) edHistory.shift();
  edHistoryIdx = edHistory.length - 1;
  edUpdateUndoRedoBtns();
}

function edUndo(){
  if(edHistoryIdx <= 0){ edToast('Nada que deshacer'); return; }
  edHistoryIdx--;
  edApplyHistory(edHistory[edHistoryIdx]);
}

function edRedo(){
  if(edHistoryIdx >= edHistory.length - 1){ edToast('Nada que rehacer'); return; }
  edHistoryIdx++;
  edApplyHistory(edHistory[edHistoryIdx]);
}

function edApplyHistory(snapshot){
  if(!snapshot) return;
  const raw = JSON.parse(snapshot.layersJSON);
  const imgPromises = [];
  edLayers = raw.map(o => {
    let l;
    if     (o.type === 'text')   l = new TextLayer(o.text, o.x, o.y);
    else if(o.type === 'bubble') l = new BubbleLayer(o.text, o.x, o.y);
    else if(o.type === 'image')  l = new ImageLayer(null, o.x, o.y);
    else if(o.type === 'draw') {
      const _isV = (edPages[snapshot.pageIdx]?.orientation||edOrientation)==='vertical';
      l = o.dataUrl ? DrawLayer.fromDataUrl(o.dataUrl, _isV?ED_PAGE_W:ED_PAGE_H, _isV?ED_PAGE_H:ED_PAGE_W)
                    : new DrawLayer();
      if(o.locked) l.locked = true;
      return l;
    }
    else if(o.type === 'stroke') {
      const _isV = (edPages[snapshot.pageIdx]?.orientation||edOrientation)==='vertical';
      const _pw = _isV?ED_PAGE_W:ED_PAGE_H, _ph = _isV?ED_PAGE_H:ED_PAGE_W;
      // Strokes antiguos (sin x/y/width/height) usan bbox completo de página
      const _lsx = o.x != null ? o.x : 0.5;
      const _lsy = o.y != null ? o.y : 0.5;
      const _lsw = o.width  != null ? o.width  : 1.0;
      const _lsh = o.height != null ? o.height : 1.0;
      l = StrokeLayer.fromDataUrl(o.dataUrl||'', _lsx, _lsy, _lsw, _lsh, _pw, _ph);
      if(o.frozenLine) l._frozenLine = o.frozenLine;
      if(o.rotation) l.rotation=o.rotation;
      if(o.opacity !== undefined) l.opacity=o.opacity;
      if(o.groupId) l.groupId=o.groupId;
      if(o.locked) l.locked=true;
      return l;
    }
    else if(o.type === 'shape') {
      l = new ShapeLayer(o.shape||'rect', o.x||0.5, o.y||0.5, o.width||0.3, o.height||0.2);
      l.color=o.color||'#000'; l.fillColor=o.fillColor||'none'; l.lineWidth=o.lineWidth??3; l.rotation=o.rotation||0; l.opacity=o.opacity??1;
      if(o.cornerRadius) l.cornerRadius=o.cornerRadius;
      if(o.cornerRadii) l.cornerRadii = Array.isArray(o.cornerRadii) ? [...o.cornerRadii] : {...o.cornerRadii};
      if(o.grouped) l.grouped = true;
      if(o.groupedStyles) l.groupedStyles = o.groupedStyles.map(s=>({...s}));
      if(o.groupId) l.groupId=o.groupId;
      if(o.locked) l.locked=true;
      return l;
    }
    else if(o.type === 'line') {
      l = new LineLayer();
      l.points=o.points||[]; l.closed=o.closed||false;
      l.color=o.color||'#000'; l.fillColor=o.fillColor||'#ffffff'; l.lineWidth=o.lineWidth??3; l.opacity=o.opacity??1;
      l.rotation=o.rotation||0;
      if(o.cornerRadii) l.cornerRadii = Array.isArray(o.cornerRadii) ? [...o.cornerRadii] : {...o.cornerRadii};
      if(o.subPaths&&o.subPaths.length) l.subPaths = o.subPaths.map(sp=>{const _s=sp.slice(); if(sp.cornerRadii)_s.cornerRadii={...sp.cornerRadii}; return _s;});
      if(o.x!=null){l.x=o.x;l.y=o.y;l.width=o.width||0.01;l.height=o.height||0.01;}
      else l._updateBbox();
      if(o.groupId) l.groupId=o.groupId;
      if(o.locked) l.locked=true;
      return l;
    }
    else if(o.type === 'group') return null; // obsoleto
    else return o;
    for(const k of Object.keys(o)){
      if(k !== '_imgSrc') l[k] = o[k];
    }
    if(o._imgSrc){
      const p = new Promise(resolve => {
        const img = new Image();
        img.onload  = () => {
          l.img = img;
          resolve();
        };
        img.onerror = () => resolve();
        img.src = o._imgSrc;
      });
      imgPromises.push(p);
    }
    return l;
  });
  if(edPages[snapshot.pageIdx]){
    edPages[snapshot.pageIdx].layers = edLayers;
  }
  edSelectedIdx = -1;
  edPanelUserClosed = false;
  edUpdateUndoRedoBtns();
  // Navegar a la página del snapshot si es distinta a la actual
  if(snapshot.pageIdx !== edCurrentPage && edPages[snapshot.pageIdx]){
    edCurrentPage = snapshot.pageIdx;
    edLayers = edPages[edCurrentPage].layers;
    const _po = edPages[edCurrentPage].orientation || 'vertical';
    if(_po !== edOrientation) edOrientation = _po;
    edUpdateNavPages();
  }
  Promise.all(imgPromises).then(() => edRedraw());
}

function edUpdateUndoRedoBtns(){
  const u = $('edUndoBtn'), r = $('edRedoBtn');
  if(u) u.disabled = edHistoryIdx <= 0;
  if(r) r.disabled = edHistoryIdx >= edHistory.length - 1;

}

/* ── edFitCanvas ──────────────────────────────────────────────────
   Ajusta las barras de UI y el tamaño del canvas DOM al viewport.
   El canvas ocupa SIEMPRE todo el área disponible (sin scroll CSS).
   La cámara (edCamera) controla qué parte del workspace se ve.
   ──────────────────────────────────────────────────────────────── */
function edFitCanvas(resetCamera){
  if(!edCanvas) return;
  // Preservar cámara salvo reset explícito autorizado por el usuario
  const _savedCam = {x:edCamera.x, y:edCamera.y, z:edCamera.z};
  const _doReset = resetCamera && window._edUserRequestedReset;

  const topbar=$('edTopbar'), menu=$('edMenuBar'), opts=$('edOptionsPanel');

  const topH  = (!edMinimized && topbar)  ? topbar.getBoundingClientRect().height  : 0;
  const menuH = (!edMinimized && menu)    ? menu.getBoundingClientRect().height    : 0;
  const optsH = (opts && opts.classList.contains('open') && opts.style.visibility !== 'hidden') ? opts.getBoundingClientRect().height : 0;
  if(menu && !edMinimized) menu.style.top = topH + 'px';
  if(opts) opts.style.top = (topH + menuH) + 'px';
  const totalBarsH = topH + menuH + optsH;

  const availW = window.innerWidth;
  const availH = window.innerHeight - totalBarsH;

  const newW = Math.round(availW);
  const newH = Math.round(availH);

  // Detectar cambio de VENTANA (no de panel de opciones)
  // _edWinW/_edWinH solo cambian con resize de ventana real
  // Actualizar dimensiones conocidas — sin resetear cámara automáticamente
  // La cámara solo se resetea cuando se pide explícitamente (primera carga, lupa, orientación)
  window._edWinW = window.innerWidth;
  window._edWinH = window.innerHeight;

  // Redimensionar canvas si es necesario
  const _prevW = edCanvas.width, _prevH = edCanvas.height;
  const _sizeChanged = _prevW !== newW || _prevH !== newH;
  if(_sizeChanged){
    edCanvas.width  = newW;
    edCanvas.height = newH;
    // Cuando el canvas ENCOGE por la apertura de un panel inferior,
    // compensar camera.y para que el workspace suba con el canvas
    // y el contenido que estaba visible siga visible.
    // Cuando crece (panel cerrándose), no compensar — el espacio extra aparece abajo.
    if(!_doReset && newH < _prevH){
      _savedCam.y -= (_prevH - newH);
    }
  }
  edCanvas.style.width  = newW + 'px';
  edCanvas.style.height = newH + 'px';
  edCanvas.style.position = 'absolute';
  edCanvas.style.left = '0';
  edCanvas.style.top  = totalBarsH + 'px';
  _edCanvasTop = totalBarsH; // cachear para edCoords
  edCanvas.style.margin = '0';
  // Mantener el canvas de dibujo libre sincronizado en posición y tamaño
  if(edDrawCanvas){
    const _sizeChangedDraw = edDrawCanvas.width !== newW || edDrawCanvas.height !== newH;
    if(_sizeChangedDraw){ edDrawCanvas.width = newW; edDrawCanvas.height = newH; }
    edDrawCanvas.style.width  = newW + 'px';
    edDrawCanvas.style.height = newH + 'px';
    edDrawCanvas.style.position = 'absolute';
    edDrawCanvas.style.left = '0';
    edDrawCanvas.style.top  = totalBarsH + 'px';
    edDrawCanvas.style.margin = '0';
  }

  if(_doReset){
    window._edUserRequestedReset = false;
    _edCameraReset();
  } else {
    // Restaurar cámara — el resize del canvas no debe moverla
    edCamera.x = _savedCam.x;
    edCamera.y = _savedCam.y;
    edCamera.z = _savedCam.z;
  }
  _edScrollbarsUpdate();
  // Siempre redibujar tras ajustar el canvas
  edRedraw();
}

/* ── Recentra el canvas como la lupa: ajusta cámara al lienzo y redibuja ── */
function _edResetCameraToFit(){
  window._edUserRequestedReset = true;
  edFitCanvas(true);
}

/* ── Resetea la cámara para que el LIENZO ocupe el viewport centrado ── */
function _edCameraReset(){

  const pw = edPageW(), ph = edPageH();
  const availW = edCanvas.width, availH = edCanvas.height;
  const scaleW = availW / pw;
  const scaleH = availH / ph;
  const z = Math.min(scaleW, scaleH);
  // Posición: el centro del lienzo (en workspace) queda en el centro de pantalla
  // centro_workspace_x = edMarginX + pw/2
  // pantalla_x = centro_workspace_x * z + camera.x = availW/2
  // => camera.x = availW/2 - (edMarginX + pw/2) * z
  edCamera.z = z;
  edCamera.x = availW/2  - (edMarginX() + pw/2) * z;
  edCamera.y = availH/2  - (edMarginY() + ph/2) * z;
}

/* ══════════════════════════════════════════
   REDRAW
   ══════════════════════════════════════════ */
/* ══════════════════════════════════════════
   MULTI-SELECCIÓN — helpers
   ══════════════════════════════════════════ */

// AABB axis-aligned que engloba todos los objetos de edMultiSel
function _msBBox(){
  if(!edMultiSel.length) return null;
  const pw=edPageW(), ph=edPageH();
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const i of edMultiSel){
    const la=edLayers[i]; if(!la) continue;
    const rot=(la.rotation||0)*Math.PI/180;
    const hw=la.width/2, hh=la.height/2;
    for(const [cx,cy] of [[-hw,-hh],[hw,-hh],[-hw,hh],[hw,hh]]){
      const wx=cx*pw, wy=cy*ph;
      const rx=(wx*Math.cos(rot)-wy*Math.sin(rot))/pw;
      const ry=(wx*Math.sin(rot)+wy*Math.cos(rot))/ph;
      x0=Math.min(x0,la.x+rx); y0=Math.min(y0,la.y+ry);
      x1=Math.max(x1,la.x+rx); y1=Math.max(y1,la.y+ry);
    }
  }
  return {cx:(x0+x1)/2, cy:(y0+y1)/2, w:x1-x0, h:y1-y0, x0,y0,x1,y1};
}

// 8 handles de escala del bbox colectivo (coords norm)
function _msHandles(bb){
  const {cx,cy,w,h}=bb;
  return[
    {x:cx-w/2,y:cy-h/2,c:'tl'},{x:cx+w/2,y:cy-h/2,c:'tr'},
    {x:cx-w/2,y:cy+h/2,c:'bl'},{x:cx+w/2,y:cy+h/2,c:'br'},
    {x:cx,    y:cy-h/2,c:'mt'},{x:cx,    y:cy+h/2,c:'mb'},
    {x:cx-w/2,y:cy,    c:'ml'},{x:cx+w/2,y:cy,    c:'mr'},
  ];
}

// Dibuja bbox + handles de escala + handle de rotación idéntico al individual
function edDrawMultiSel(){
  if(!edMultiSel.length || !edMultiBbox) return;
  const pw=edPageW(),ph=edPageH(),z=edCamera.z;
  const lw=1/z, hr=6/z, hrRot=8/z;
  // Siempre usar edMultiBbox (estado persistente mantenido por _msRecalcBbox).
  // Durante resize activo: escalar dimensiones por los factores del gesto.
  const bb = {
    cx: edMultiBbox.cx,
    cy: edMultiBbox.cy,
    w: edMultiResizing && edMultiTransform
      ? edMultiBbox.w * (edMultiTransform._curSx ?? 1)
      : edMultiBbox.w,
    h: edMultiResizing && edMultiTransform
      ? edMultiBbox.h * (edMultiTransform._curSy ?? 1)
      : edMultiBbox.h,
  };

  edCtx.save();
  // Contornos individuales suaves
  for(const i of edMultiSel){
    const la=edLayers[i]; if(!la) continue;
    const rot=(la.rotation||0)*Math.PI/180;
    const cx=edMarginX()+la.x*pw, cy=edMarginY()+la.y*ph;
    const w=la.width*pw, h=la.height*ph;
    edCtx.save();
    edCtx.translate(cx,cy); edCtx.rotate(rot);
    edCtx.strokeStyle='rgba(26,140,255,0.4)';
    edCtx.lineWidth=lw; edCtx.setLineDash([4/z,3/z]);
    edCtx.strokeRect(-w/2,-h/2,w,h);
    edCtx.setLineDash([]);
    edCtx.restore();
  }
  // Bbox colectivo — dibujado en espacio local (translate+rotate) igual que el individual
  const grRad = edMultiGroupRot * Math.PI / 180;
  const gcx = edMarginX()+bb.cx*pw, gcy = edMarginY()+bb.cy*ph;
  const bw=bb.w*pw, bh=bb.h*ph;

  edCtx.save();
  edCtx.translate(gcx, gcy);
  edCtx.rotate(grRad);

  // Marco del bbox
  edCtx.strokeStyle='#1a8cff'; edCtx.lineWidth=1.5/z;
  edCtx.setLineDash([6/z,3/z]);
  edCtx.strokeRect(-bw/2, -bh/2, bw, bh);
  edCtx.setLineDash([]);

  // En táctil: handles invisibles — la interacción es solo por gestos (pinch)
  const _drawHandles = !edLastPointerIsTouch;
  if(!edLastPointerIsTouch){
    // Handles de escala (en espacio local)
    const corners=[
      [-bw/2,-bh/2],[bw/2,-bh/2],[-bw/2,bh/2],[bw/2,bh/2],
      [0,-bh/2],[0,bh/2],[-bw/2,0],[bw/2,0],
    ];
    for(const [hx,hy] of corners){
      edCtx.beginPath(); edCtx.arc(hx,hy,hr,0,Math.PI*2);
      edCtx.fillStyle='#fff'; edCtx.fill();
      edCtx.strokeStyle='#1a8cff'; edCtx.lineWidth=lw*1.5; edCtx.stroke();
    }
    // Handle de rotación — línea + círculo + flecha
    const rotY = -bh/2 - 28/z;
    edCtx.beginPath(); edCtx.moveTo(0,-bh/2); edCtx.lineTo(0,rotY+hrRot);
    edCtx.strokeStyle='#1a8cff'; edCtx.lineWidth=lw; edCtx.stroke();
    edCtx.beginPath(); edCtx.arc(0,rotY,hrRot,0,Math.PI*2);
    edCtx.fillStyle='#1a8cff'; edCtx.fill();
    edCtx.strokeStyle='#fff'; edCtx.lineWidth=lw*1.5; edCtx.stroke();
    edCtx.strokeStyle='#fff'; edCtx.lineWidth=lw*1.5;
    const ar=hrRot*0.55;
    edCtx.beginPath(); edCtx.arc(0,rotY,ar,-Math.PI*0.9,Math.PI*0.5); edCtx.stroke();
    const ax=ar*Math.cos(Math.PI*0.5), ay=rotY+ar*Math.sin(Math.PI*0.5);
    edCtx.beginPath();
    edCtx.moveTo(ax,ay); edCtx.lineTo(ax-3/z,ay-5/z);
    edCtx.moveTo(ax,ay); edCtx.lineTo(ax+4/z,ay-3/z);
    edCtx.stroke();
  }

  edCtx.restore();

  // Marquesina de selección activa
  if(edRubberBand){
    const rx=edMarginX()+Math.min(edRubberBand.x0,edRubberBand.x1)*pw;
    const ry=edMarginY()+Math.min(edRubberBand.y0,edRubberBand.y1)*ph;
    const rw=Math.abs(edRubberBand.x1-edRubberBand.x0)*pw;
    const rh=Math.abs(edRubberBand.y1-edRubberBand.y0)*ph;
    edCtx.strokeStyle='#1a8cff'; edCtx.lineWidth=1.5/z;
    edCtx.setLineDash([5/z,3/z]);
    edCtx.fillStyle='rgba(26,140,255,0.06)';
    edCtx.fillRect(rx,ry,rw,rh); edCtx.strokeRect(rx,ry,rw,rh);
    edCtx.setLineDash([]);
  }
  edCtx.restore();
}

// Dibuja solo la marquesina (cuando aún no hay selección)
function edDrawRubberBand(){
  if(!edRubberBand) return;
  const pw=edPageW(),ph=edPageH(),z=edCamera.z;
  const rx=edMarginX()+Math.min(edRubberBand.x0,edRubberBand.x1)*pw;
  const ry=edMarginY()+Math.min(edRubberBand.y0,edRubberBand.y1)*ph;
  const rw=Math.abs(edRubberBand.x1-edRubberBand.x0)*pw;
  const rh=Math.abs(edRubberBand.y1-edRubberBand.y0)*ph;
  edCtx.save();
  edCtx.strokeStyle='#1a8cff'; edCtx.lineWidth=1.5/z;
  edCtx.setLineDash([5/z,3/z]);
  edCtx.fillStyle='rgba(26,140,255,0.06)';
  edCtx.fillRect(rx,ry,rw,rh); edCtx.strokeRect(rx,ry,rw,rh);
  edCtx.setLineDash([]);
  edCtx.restore();
}

function _msClear(){
  edMultiSel=[]; edMultiDragging=false; edMultiResizing=false; edMultiRotating=false;
  edRubberBand=null; edMultiDragOffs=[]; edMultiTransform=null; edMultiGroupRot=0;
  edMultiBbox=null; edMultiSelAnchor=-1;
  // Limpiar siempre el botón y el dropdown para que no queden activos en PC
  $('edMultiSelBtn')?.classList.remove('active');
  $('_edMultiSelDd')?.classList.remove('open');
}

function _edDeactivateMultiSel(){
  const prev=edMultiSel.length===1?edMultiSel[0]:-1;
  _msClear();
  edActiveTool='select';
  if(edCanvas) edCanvas.className='';
  const btn = document.getElementById('edMultiSelBtn');
  if(btn) btn.classList.remove('active');
  const _mdd=$('_edMultiSelDd'); if(_mdd) _mdd.classList.remove('open');
  if(prev>=0&&prev<edLayers.length) edSelectedIdx=prev;
  edRedraw();
}

function _edUpdateMultiSelPanel(){
  const panel=$('edOptionsPanel');
  if(panel && panel.dataset.mode==='multiselect'){ panel.classList.remove('open'); panel.innerHTML=''; delete panel.dataset.mode; }
  let dd = $('_edMultiSelDd');
  if(!dd){
    dd = document.createElement('div');
    dd.id = '_edMultiSelDd';
    dd.className = 'ed-dropdown';
    document.addEventListener('pointerdown', e=>{
      if(!dd.contains(e.target) && e.target.id!=='edMultiSelBtn') dd.classList.remove('open');
    }, {passive:true});
    document.body.appendChild(dd);
  }
  if(edActiveTool!=='multiselect' || edMultiSel.length < 2){
    dd.classList.remove('open'); return;
  }
  const _hasGroup = edMultiSel.some(i => edLayers[i]?.groupId);
  const _mergeTypes = _edMergeableTypes();
  dd.innerHTML = `
    <button class="ed-dropdown-item" id="_ms-group">⊞ Agrupar</button>
    ${_hasGroup ? `<button class="ed-dropdown-item" id="_ms-ungroup">⊟ Desagrupar</button>` : ''}
    ${_mergeTypes ? `<button class="ed-dropdown-item" id="_ms-merge">⊕ Unir</button>` : ''}`;
  $('_ms-group')?.addEventListener('click', ()=>{ dd.classList.remove('open'); edGroupSelected(); });
  $('_ms-ungroup')?.addEventListener('click', ()=>{
    dd.classList.remove('open');
    edUngroupSelected();
  });
  $('_ms-merge')?.addEventListener('click', ()=>{ dd.classList.remove('open'); edMergeSelected(); });
  const btn = $('edMultiSelBtn');
  if(btn){
    const r = btn.getBoundingClientRect();
    dd.style.top  = r.bottom + 'px';
    dd.style.right = (window.innerWidth - r.right) + 'px';
    dd.style.left  = 'auto';
  }
  dd.classList.add('open');
}

// Recalcula edMultiBbox en espacio LOCAL del grupo (desrotado por edMultiGroupRot).
// Es el ÚNICO sitio que escribe en edMultiBbox.
// Llamar: al confirmar rubber band, al soltar rotate, al soltar resize, al soltar drag.
function _msRecalcBbox(){
  if(!edMultiSel.length){ edMultiBbox=null; return; }
  const pw=edPageW(), ph=edPageH();
  const gr = edMultiGroupRot * Math.PI / 180;
  const cg = Math.cos(-gr), sg = Math.sin(-gr);
  // Centroide de los centros de los objetos (excluir DrawLayer — siempre x=0.5,y=0.5)
  let pivX=0, pivY=0, n=0;
  for(const i of edMultiSel){
    const la=edLayers[i]; if(!la || la.type==='draw') continue;
    pivX+=la.x; pivY+=la.y; n++;
  }
  if(!n){ edMultiBbox=null; return; }
  pivX/=n; pivY/=n;
  // AABB de todos los vértices desrotados al espacio local del grupo
  // DrawLayer ocupa siempre toda la página (width=1, height=1) — excluirlo del bbox
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const i of edMultiSel){
    const la=edLayers[i]; if(!la || la.type==='draw') continue;
    const rot=(la.rotation||0)*Math.PI/180;
    const hw=la.width/2, hh=la.height/2;
    for(const [lcx,lcy] of [[-hw,-hh],[hw,-hh],[-hw,hh],[hw,hh]]){
      const wx=lcx*pw, wy=lcy*ph;
      const vx = la.x + (wx*Math.cos(rot)-wy*Math.sin(rot))/pw;
      const vy = la.y + (wx*Math.sin(rot)+wy*Math.cos(rot))/ph;
      const dx=(vx-pivX)*pw, dy=(vy-pivY)*ph;
      const lx = pivX + (dx*cg - dy*sg)/pw;
      const ly = pivY + (dx*sg + dy*cg)/ph;
      x0=Math.min(x0,lx); y0=Math.min(y0,ly);
      x1=Math.max(x1,lx); y1=Math.max(y1,ly);
    }
  }
  // Centro del bbox local → rotar al espacio global
  const lcxC=(x0+x1)/2, lcyC=(y0+y1)/2;
  const dcx=(lcxC-pivX)*pw, dcy=(lcyC-pivY)*ph;
  const cr=Math.cos(gr), sr=Math.sin(gr);
  const gcx = pivX + (dcx*cr - dcy*sr)/pw;
  const gcy = pivY + (dcx*sr + dcy*cr)/ph;
  edMultiBbox = {
    w:  x1-x0,
    h:  y1-y0,
    cx: gcx,
    cy: gcy,
    // offset centro→centroide en espacio LOCAL rotado (fracción de página)
    // se aplica durante drag para mover el marco sin recalcular todo
    offX: (lcxC - pivX),
    offY: (lcyC - pivY),
  };
}


/* ══════════════════════════════════════════
   T1: Render de grupo de fusión con evenodd en tiempo real
   Combina todos los objetos del grupo en un único Path2D con evenodd
   ══════════════════════════════════════════ */
function _edRenderFusionGroup(ctx, members, alpha) {
  if (!members || members.length === 0) return;
  const pw = edPageW(), ph = edPageH();
  const mx = edMarginX(), my = edMarginY();

  // Usar propiedades visuales del primer miembro
  const _ref = members[0];
  const col      = _ref.color     || '#000000';
  const fillCol  = _ref.fillColor || 'none';
  const lw       = _ref.lineWidth ?? 3;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Construir Path2D combinado con todos los contornos
  const combined = new Path2D();

  members.forEach(m => {
    if (m.type === 'line') {
      // LineLayer: obtener puntos absolutos y construir contornos
      const rot = (m.rotation || 0) * Math.PI / 180;
      const cos = Math.cos(rot), sin = Math.sin(rot);
      const cx = mx + m.x * pw, cy = my + m.y * ph;

      // Separar en contornos (null = separador)
      const contours = [];
      let cur = [];
      for (const p of m.points) {
        if (p === null) { if (cur.length >= 2) contours.push(cur); cur = []; }
        else cur.push(p);
      }
      if (cur.length >= 2) contours.push(cur);

      contours.forEach(c => {
        if (c.length < 2) return;
        combined.moveTo(cx + (c[0].x*pw*cos - c[0].y*ph*sin), cy + (c[0].x*pw*sin + c[0].y*ph*cos));
        for (let i = 1; i < c.length; i++) {
          combined.lineTo(cx + (c[i].x*pw*cos - c[i].y*ph*sin), cy + (c[i].x*pw*sin + c[i].y*ph*cos));
        }
        combined.closePath();
      });
    } else if (m.type === 'shape' && m.shape === 'rect') {
      // ShapeLayer rect: añadir rectángulo
      const rot = (m.rotation || 0) * Math.PI / 180;
      const cx = mx + m.x * pw, cy = my + m.y * ph;
      const hw = m.width * pw / 2, hh = m.height * ph / 2;
      const cos = Math.cos(rot), sin = Math.sin(rot);
      const corners = [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]];
      combined.moveTo(cx + corners[0][0]*cos - corners[0][1]*sin, cy + corners[0][0]*sin + corners[0][1]*cos);
      for (let i = 1; i < 4; i++) {
        combined.lineTo(cx + corners[i][0]*cos - corners[i][1]*sin, cy + corners[i][0]*sin + corners[i][1]*cos);
      }
      combined.closePath();
    } else if (m.type === 'shape' && m.shape === 'ellipse') {
      // ShapeLayer ellipse (por si acaso queda alguno)
      const rot = (m.rotation || 0) * Math.PI / 180;
      const cx = mx + m.x * pw, cy = my + m.y * ph;
      const N = 32;
      const hw = m.width * pw / 2, hh = m.height * ph / 2;
      const cos = Math.cos(rot), sin = Math.sin(rot);
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        const lx = Math.cos(a) * hw, ly = Math.sin(a) * hh;
        const wx = cx + lx*cos - ly*sin, wy = cy + lx*sin + ly*cos;
        if (i === 0) combined.moveTo(wx, wy); else combined.lineTo(wx, wy);
      }
      combined.closePath();
    }
  });

  // Rellenar con evenodd
  if (fillCol && fillCol !== 'none') {
    ctx.fillStyle = fillCol;
    ctx.fill(combined, 'evenodd');
  }
  // Trazar borde
  if (lw > 0) {
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';
    ctx.stroke(combined);
  }

  ctx.restore();
}


/* T1: Fusión inmediata — incorporar nuevo LineLayer al objeto principal de _fusionId */
function _edFuseIntoMain(newLL) {
  if (!_edLineFusionId || !newLL) return newLL;
  // Buscar objeto principal (el primero en edLayers con _fusionId, distinto del nuevo)
  const _primary = edLayers.find(l => l !== newLL && l._fusionId === _edLineFusionId && l.type === 'line');
  if (!_primary) {
    // Primer objeto — es el principal
    newLL._fusionId = _edLineFusionId;
    return newLL;
  }
  // Fusionar: convertir puntos del nuevo al espacio local del principal
  const _rot = -(_primary.rotation || 0) * Math.PI / 180;
  const _cos = Math.cos(_rot), _sin = Math.sin(_rot);
  const _newAbs = newLL.absPoints();
  const _newLocal = _newAbs.map(p => {
    if (!p) return null;
    const dx = p.x - _primary.x, dy = p.y - _primary.y;
    return { x: dx * _cos - dy * _sin, y: dx * _sin + dy * _cos };
  });
  // Concatenar con null separador
  _primary.points.push(null);
  _primary.points.push(..._newLocal);
  _primary._updateBbox();
  // Eliminar el nuevo de edLayers
  const _ni = edLayers.indexOf(newLL);
  if (_ni >= 0) edLayers.splice(_ni, 1);
  return _primary;
}

function edRedraw(){
  // Si hay un contexto GIF activo en curso, redirigir a _gcpRedraw
  if(window._edRedrawOverride && window._gcpActive){ _gcpRedraw(); return; }
  if(!edCtx || !edCanvas)return;
  const cw=edCanvas.width, ch=edCanvas.height;

  // Reset transform → limpiar todo el viewport
  edCtx.setTransform(1,0,0,1,0,0);
  edCtx.clearRect(0,0,cw,ch);
  // Fondo workspace (toda la pantalla)
  edCtx.fillStyle='#b0b0b0';
  edCtx.fillRect(0,0,cw,ch);

  // Aplicar cámara: escala + traslación
  edCtx.setTransform(edCamera.z, 0, 0, edCamera.z, edCamera.x, edCamera.y);

  const page=edPages[edCurrentPage];if(!page)return;

  // Lienzo blanco con sombra y esquinas redondeadas (solo fondo, sin clip)
  // Radio fijo en coordenadas workspace → proporcional al zoom automáticamente
  const _lr = 20; // ~20px en workspace = radio de esquina físicamente constante
  edCtx.shadowColor='rgba(0,0,0,0.35)';edCtx.shadowBlur=20/edCamera.z;
  edCtx.fillStyle='#ffffff';
  edCtx.beginPath();
  if(edCtx.roundRect){
    edCtx.roundRect(edMarginX(),edMarginY(),edPageW(),edPageH(),_lr);
  } else {
    const _x=edMarginX(),_y=edMarginY(),_w=edPageW(),_h=edPageH(),_r=_lr;
    edCtx.moveTo(_x+_r,_y);edCtx.lineTo(_x+_w-_r,_y);edCtx.arcTo(_x+_w,_y,_x+_w,_y+_r,_r);
    edCtx.lineTo(_x+_w,_y+_h-_r);edCtx.arcTo(_x+_w,_y+_h,_x+_w-_r,_y+_h,_r);
    edCtx.lineTo(_x+_r,_y+_h);edCtx.arcTo(_x,_y+_h,_x,_y+_h-_r,_r);
    edCtx.lineTo(_x,_y+_r);edCtx.arcTo(_x,_y,_x+_r,_y,_r);edCtx.closePath();
  }
  edCtx.fill();
  edCtx.shadowColor='transparent';edCtx.shadowBlur=0;
  // Sin clip: los objetos pueden sobresalir del lienzo (workspace visible)
  // Imágenes primero, luego texto/bocadillos encima
  // Render: imágenes en su orden, luego la capa agrupada de textos/bocadillos siempre encima
  const _imgLayers    = edLayers.filter(l=>l.type==='image');
  const _strokeLayers = edLayers.filter(l=>l.type==='stroke');
  const _textLayers   = edLayers.filter(l=>l.type==='text'||l.type==='bubble');
  // Opacidad global de la capa de textos (máximo de todos sus objetos individuales,
  // o bien edPage.textLayerOpacity si se definió desde el panel de capas)
  const _textGroupAlpha = page.textLayerOpacity ?? 1;

  // ── DIMMING GENERAL ──────────────────────────────────────────────────────────
  // Regla única: si hay cualquier modo de edición activo, todo se dimea al 50%
  // excepto el objeto que se está editando activamente.
  const _panel = $('edOptionsPanel');
  const _panelOpen = _panel?.classList.contains('open');
  const _panelMode = _panel?.dataset.mode || '';

  const _editingDraw  = ['draw','eraser','fill'].includes(edActiveTool) &&
    (_panelOpen || $('edDrawBar')?.classList.contains('visible'));
  const _editingShape = (_panelOpen && (_panelMode==='shape' || _panelMode==='line'))
    || !!_edShapePreview || !!_edLineLayer
    || $('edShapeBar')?.classList.contains('visible');
  const _editingProps = _panelOpen && _panelMode === 'props' && edSelectedIdx >= 0;
  // También hay edición activa cuando se está manipulando un objeto (drag/resize/rotate/tail)
  // aunque el panel no esté abierto — garantiza el dimming durante el desplazamiento
  const _manipulating = edSelectedIdx >= 0 &&
    (edIsDragging || edIsResizing || edIsRotating || edIsTailDragging);
  // Cuentagotas activo: todo al 100% para ver bien los colores
  const _anyEditing = !window._edEyedropActive &&
    (_editingDraw || _editingShape || _editingProps || _manipulating);

  // Función que decide si una capa concreta debe dimearse
  // Objeto activo del panel line (puede ser distinto de edSelectedIdx durante construcción)
  const _activePanelLine = (_editingShape && _panelMode==='line')
    ? (edSelectedIdx>=0 ? edLayers[edSelectedIdx] : edLayers.find(l=>l.type==='line'&&l._fusionId===_edLineFusionId))
    : null;

  const _isDimmed = (l, i) => {
    if (!_anyEditing) return false;
    if (_editingDraw) {
      return l.type !== 'draw';
    }
    if (i === edSelectedIdx) return false;
    if (l === _edShapePreview || l === _edLineLayer) return false;
    // T1: no dimear LineLayer que pertenecen a la sesión de edición activa
    if (_edLineFusionId && l._fusionId === _edLineFusionId) return false; // miembro de fusión activa
    if (l === _activePanelLine) return false;
    // No dimear objetos vectoriales de la sesión actual (fusionables entre sí)
    if (_editingShape && (l.type === 'line' || l.type === 'shape') &&
        _vsHistory.length > 0 && !_vsPreSessionLayers.has(l)) return false;
    return true;
  };

  // Renderizar en orden del array: imagen, stroke y draw en su posición relativa.
  // Textos/bocadillos siempre al final (encima de todo).
  edLayers.forEach((l,i)=>{
    if(l.type==='text'||l.type==='bubble') return; // los textos se dibujan después
    if(_editingDraw && l.type==='draw') return; // en modo draw, el draw va al final
    const dimFactor = _isDimmed(l, i) ? 0.5 : 1;
    if(l.type==='image'){
      const _orig = l.opacity; l.opacity = (l.opacity ?? 1) * dimFactor;
      l.draw(edCtx, edCanvas);
      l.opacity = _orig;
    } else if(l.type==='draw'){
      edCtx.globalAlpha = (l.opacity ?? 1) * dimFactor;
      l.draw(edCtx);
      edCtx.globalAlpha = 1;
    } else if(l.type==='stroke'){
      edCtx.globalAlpha = (l.opacity ?? 1) * dimFactor;
      l.draw(edCtx);
      edCtx.globalAlpha = 1;
    } else if(l.type==='shape' || l.type==='line'){
      edCtx.globalAlpha = (l.opacity ?? 1) * dimFactor;
      l.draw(edCtx);
      edCtx.globalAlpha = 1;
    } else if(l.type==='gif'){
      const _og=l.opacity; l.opacity=(l.opacity??1)*dimFactor;
      l.draw(edCtx); l.opacity=_og;
    }
  });
  // Textos/bocadillos: aplicar dimming individual por capa
  _textLayers.forEach(l=>{
    const i = edLayers.indexOf(l);
    const dimFactor = _isDimmed(l, i) ? 0.5 : 1;
    edCtx.globalAlpha = _textGroupAlpha * dimFactor;
    l.draw(edCtx, edCanvas);
  });
  edCtx.globalAlpha = 1;
  // En modo draw: DrawLayer al final, encima de shapes/textos dimeados
  if(_editingDraw){
    const _dl = edLayers.find(l => l.type==='draw');
    if(_dl) _dl.draw(edCtx);
  }
  edDrawSel();
  // ── Indicador parpadeante del primer punto de una línea en construcción ──
  if(_edLineLayer && _edLineLayer.points.length === 1){
    const pw=edPageW(), ph=edPageH();
    const absP=_edLineLayer.absPoints()[0];
    const px=edMarginX()+absP.x*pw, py=edMarginY()+absP.y*ph;
    const blink = Math.sin(Date.now()/200)*0.5+0.5; // 0..1 parpadeante
    edCtx.save();
    edCtx.globalAlpha = 0.4+blink*0.6;
    edCtx.beginPath();
    edCtx.arc(px, py, 8/edCamera.z, 0, Math.PI*2);
    edCtx.fillStyle='#1a8cff';
    edCtx.fill();
    edCtx.globalAlpha = 1;
    edCtx.beginPath();
    edCtx.arc(px, py, 4/edCamera.z, 0, Math.PI*2);
    edCtx.fillStyle='#ffffff';
    edCtx.fill();
    edCtx.restore();
    // Solicitar siguiente frame para animar el parpadeo
    requestAnimationFrame(()=>{ if(_edLineLayer?.points.length===1) edRedraw(); });
  }
  // Multi-selección: bbox colectivo encima de todo, o marquesina si está arrastrando
  if(edActiveTool==='multiselect'){
    if(edMultiSel.length) edDrawMultiSel();
    else edDrawRubberBand();
  }
  // Rubber band en modo select (PC, sin pulsar botón multiselect)
  if(edActiveTool==='select' && edRubberBand) edDrawRubberBand();
  // ── Reglas (T29): solo visibles en el editor, encima de todo ──
  _edRulesDraw(edCtx);
  // ── Borde azul del lienzo: siempre encima, 1px en coords workspace ──
  edCtx.save();
  edCtx.strokeStyle = '#1a8cff';
  edCtx.lineWidth   = 1 / edCamera.z;   // 1px físico independiente del zoom
  edCtx.strokeRect(edMarginX(), edMarginY(), edPageW(), edPageH());
  edCtx.restore();
  // Overlay de recorte: contorno del polígono + zona exterior oscurecida
  if (_edCropMode && _edCropLayer) _edCropDrawOverlay();
  // Restaurar transform para UI sobre el canvas (scrollbars)
  edCtx.setTransform(1,0,0,1,0,0);
  _edScrollbarsDraw();
}


/* ══════════════════════════════════════════
   ICONOS FLOTANTES SOBRE OBJETO SELECCIONADO
   ══════════════════════════════════════════ */

function edIsTouchDevice(){
  return navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
}
function edDrawSel(){
  if(edSelectedIdx<0||edSelectedIdx>=edLayers.length)return;
  const la=edLayers[edSelectedIdx];
  const pw=edPageW(), ph=edPageH();
  const z=edCamera.z;
  const lw=1/z;
  const hr=6/z;
  const hrRot=8/z;

  // StrokeLayer congelado: mostrar pequeño marcador en esquina superior derecha
  if(la.type==='stroke' && la._frozenLine){
    const _scx=edMarginX()+la.x*pw, _scy=edMarginY()+la.y*ph;
    const _sw=la.width*pw, _sh=la.height*ph;
    const _srot=(la.rotation||0)*Math.PI/180;
    edCtx.save();
    edCtx.translate(_scx,_scy); edCtx.rotate(_srot);
    // Icono ✦ en esquina superior derecha
    edCtx.font=`bold ${Math.round(14/z)}px sans-serif`;
    edCtx.fillStyle='rgba(255,200,0,0.9)';
    edCtx.textAlign='center'; edCtx.textBaseline='middle';
    edCtx.fillText('✦', _sw/2-8/z, -_sh/2+8/z);
    edCtx.restore();
  }

  // LineLayer: guía de selección discontinua azul (solo si no hay radios y no es ellipse)
  if(la.type==='line' && !la._fromEllipse){
    const _cr=la.cornerRadii||{};
    const _hasR=Object.keys(_cr).some(k=>(_cr[k]||0)>0);
    if(!_hasR){
      const mx=edMarginX(), my=edMarginY();
      const cx=mx+la.x*pw, cy=my+la.y*ph;
      const rot=(la.rotation||0)*Math.PI/180;
      const _realPts = la.points.filter(Boolean);
      if(_realPts.length>=2){
        edCtx.save();
        edCtx.translate(cx,cy); edCtx.rotate(rot);
        edCtx.strokeStyle='rgba(26,140,255,0.5)'; edCtx.lineWidth=lw;
        edCtx.setLineDash([4/z,3/z]);
        edCtx.beginPath();
        let _firstInContour = true;
        for(let i=0;i<la.points.length;i++){
          const p=la.points[i];
          if(!p){ _firstInContour=true; continue; }
          if(_firstInContour){ edCtx.moveTo(p.x*pw, p.y*ph); _firstInContour=false; }
          else { edCtx.lineTo(p.x*pw, p.y*ph); }
        }
        if(la.closed) edCtx.closePath();
        edCtx.stroke();
        edCtx.setLineDash([]);
        edCtx.restore();
      }
    }
  }

  const cx=edMarginX()+la.x*pw, cy=edMarginY()+la.y*ph;
  const w=la.width*pw;
  const h=la.height*ph;
  const rot=(la.rotation||0)*Math.PI/180;
  edCtx.save();
  edCtx.translate(cx,cy);
  edCtx.rotate(rot);
  // En modo V⟺C: solo mostrar marco tenue, ocultar handles de resize/rotate
  const _curveMode=_edCurveModeActive&&_edCurveModeActive();
  edCtx.strokeStyle='#1a8cff';
  edCtx.lineWidth=lw;
  // En táctil, ocultar el rectángulo guía del bbox para objetos vectoriales (solo ruido visual)
  const _isVectorial = la.type==='line' || la.type==='shape';
  if(!edLastPointerIsTouch || !_isVectorial){
    edCtx.setLineDash([5/z,3/z]);
    edCtx.strokeRect(-w/2,-h/2,w,h);
    edCtx.setLineDash([]);
  }
  // Handles de escala y rotación — solo en PC (no táctil)
  if(la.type!=='bubble' && !edLastPointerIsTouch){
    if(!_curveMode){
    // Para rect (LineLayer 4-nodos cerrado): solo handles en centros de segmentos
    // (las esquinas son nodos de edición, no handles de resize)
    const _isLineRect = la.type==='line' && la.closed && !la._fromEllipse
      && la.points && la.points.filter(Boolean).length === 4;
    const corners = _isLineRect
      ? [[0,-h/2],[0,h/2],[-w/2,0],[w/2,0]]  // solo centros de segmento
      : [[-w/2,-h/2],[w/2,-h/2],[-w/2,h/2],[w/2,h/2],[0,-h/2],[0,h/2],[-w/2,0],[w/2,0]];
    corners.forEach(([hx,hy])=>{
      edCtx.beginPath();edCtx.arc(hx,hy,hr,0,Math.PI*2);
      edCtx.fillStyle='#fff';edCtx.fill();
      edCtx.strokeStyle='#1a8cff';edCtx.lineWidth=lw*1.5;edCtx.stroke();
    });
    // Handle de rotación: solo en PC (en táctil se usa gesto pinch)
    if(!edLastPointerIsTouch){
      const rotY=-h/2-28/z;
      edCtx.beginPath();edCtx.moveTo(0,-h/2);edCtx.lineTo(0,rotY+hrRot);
      edCtx.strokeStyle='#1a8cff';edCtx.lineWidth=lw;edCtx.stroke();
      edCtx.beginPath();edCtx.arc(0,rotY,hrRot,0,Math.PI*2);
      edCtx.fillStyle='#1a8cff';edCtx.fill();
      edCtx.strokeStyle='#fff';edCtx.lineWidth=lw*1.5;edCtx.stroke();
      edCtx.strokeStyle='#fff';edCtx.lineWidth=lw*1.5;
      const ar=hrRot*0.55;
      edCtx.beginPath();edCtx.arc(0,rotY,ar,-Math.PI*0.9,Math.PI*0.5);
      edCtx.stroke();
      const ax=ar*Math.cos(Math.PI*0.5), ay=rotY+ar*Math.sin(Math.PI*0.5);
      edCtx.beginPath();
      edCtx.moveTo(ax,ay);edCtx.lineTo(ax-3/z,ay-5/z);
      edCtx.moveTo(ax,ay);edCtx.lineTo(ax+4/z,ay-3/z);
      edCtx.stroke();
    }
  } // cierra if(!_curveMode)
  } // cierra if(la.type!=='bubble' && !edLastPointerIsTouch)
  // Cerrar el bloque rotado antes de dibujar los handles de cola
  edCtx.restore();
  // Handles cola bocadillo — en coordenadas de workspace absolutas (sin rotación)
  if(la.type==='bubble'){
    const tcp=la.getTailControlPoints();
    const byVoice={};
    tcp.forEach(p=>{ if(!byVoice[p.voice])byVoice[p.voice]={}; byVoice[p.voice][p.type]=p; });
    // Handles cola (no para thought — usa sus propios handles)
    if(la.style!=='thought'){
      Object.values(byVoice).forEach(v=>{
        if(!v.start||!v.end)return;
        const sx=edMarginX()+v.start.x*pw, sy=edMarginY()+v.start.y*ph;
        const ex=edMarginX()+v.end.x*pw,   ey=edMarginY()+v.end.y*ph;
        edCtx.beginPath();edCtx.moveTo(sx,sy);edCtx.lineTo(ex,ey);
        edCtx.strokeStyle='rgba(26,140,255,0.5)';edCtx.lineWidth=1.5/z;
        edCtx.setLineDash([5/z,3/z]);edCtx.stroke();edCtx.setLineDash([]);
      });
      const HR=6/z;
      tcp.forEach(p=>{
        const cpx=edMarginX()+p.x*pw, cpy=edMarginY()+p.y*ph;
        const isEnd=p.type==='end';
        edCtx.beginPath();edCtx.arc(cpx,cpy,HR,0,Math.PI*2);
        edCtx.fillStyle=isEnd?'#ff6600':'#1a8cff';edCtx.fill();
        edCtx.strokeStyle='#fff';edCtx.lineWidth=lw*1.5;edCtx.stroke();
      });
    }
    // Handles cola pensamiento (punto rojo=pequeña, azul=grande)
  if(la.type==='bubble' && la.style==='thought' && la.tail){
    const HR2=6/z;
    const bx=edMarginX()+(la.x+la.thoughtBig.x*la.width)*pw;
    const by=edMarginY()+(la.y+la.thoughtBig.y*la.height)*ph;
    const sx=edMarginX()+(la.x+la.thoughtSmall.x*la.width)*pw;
    const sy=edMarginY()+(la.y+la.thoughtSmall.y*la.height)*ph;
    // Azul = elipse grande
    edCtx.beginPath();edCtx.arc(bx,by,HR2,0,Math.PI*2);
    edCtx.fillStyle='#1a8cff';edCtx.fill();
    edCtx.strokeStyle='#fff';edCtx.lineWidth=lw*1.5;edCtx.stroke();
    // Rojo = elipse pequeña
    edCtx.beginPath();edCtx.arc(sx,sy,HR2,0,Math.PI*2);
    edCtx.fillStyle='#e63030';edCtx.fill();
    edCtx.strokeStyle='#fff';edCtx.lineWidth=lw*1.5;edCtx.stroke();
  }
  // Handles 4 vértices del rect cuando modo curva activo
  if(la.type==='shape' && la.shape==='rect' && $('edOptionsPanel')?.dataset.mode==='shape'){
    if(_edCurveModeActive()){
      const corners=[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]];
      const rot2=(la.rotation||0)*Math.PI/180;
      const cos2=Math.cos(rot2),sin2=Math.sin(rot2);
      const cxs=edMarginX()+la.x*pw, cys=edMarginY()+la.y*ph;
      corners.forEach(([cx3,cy3],ci3)=>{
        const rx=cx3*cos2-cy3*sin2, ry=cx3*sin2+cy3*cos2;
        const cpx=cxs+rx, cpy=cys+ry;
        const isAct3=window._edCurveVertIdx===ci3;
        const _blink4=isAct3?(Math.sin(Date.now()/200)*0.25+0.25):1;
        edCtx.globalAlpha=_blink4;
        edCtx.beginPath();edCtx.arc(cpx,cpy,hr,0,Math.PI*2);
        edCtx.fillStyle=isAct3?'#e67e22':'#2ecc71';edCtx.fill();
        edCtx.strokeStyle='#fff';edCtx.lineWidth=lw*1.5;edCtx.stroke();
        edCtx.globalAlpha=1;
      });
      if(window._edCurveVertIdx>=0) requestAnimationFrame(()=>{ if(window._edCurveVertIdx>=0) edRedraw(); });
    }
  }
  }
  // Handles vértices explosión: solo visibles editando (panel abierto)
  if(la.type==='bubble' && la.style==='explosion' &&
     ($('edOptionsPanel')?.dataset.mode==='bubble' || $('edOptionsPanel')?.dataset.mode==='props')){
    const _HR=6/z;
    la._initExplosionRadii();
    const _pw=edPageW(),_ph=edPageH();
    const _w=la.width*_pw, _h=la.height*_ph;
    la.explosionRadii.forEach((v,i)=>{
      const cpx=edMarginX()+(la.x+v.ox*_w/2/_pw)*_pw;
      const cpy=edMarginY()+(la.y+v.oy*_h/2/_ph)*_ph;
      const isPeak = i%2===0;
      edCtx.beginPath();edCtx.arc(cpx,cpy,_HR,0,Math.PI*2);
      edCtx.fillStyle=isPeak?'#ff6600':'#1a8cff';edCtx.fill();
      edCtx.strokeStyle='#fff';edCtx.lineWidth=lw*1.5;edCtx.stroke();
    });
  }
  // Handles 4 vértices del rect en modo curva
  if(la.type==='shape' && la.shape==='rect'){
    if(_edCurveModeActive()){
      const rot2=(la.rotation||0)*Math.PI/180;
      const cos2=Math.cos(rot2),sin2=Math.sin(rot2);
      const hw=la.width*pw/2, hh=la.height*ph/2;
      // TL=0, TR=1, BR=2, BL=3 en coordenadas locales
      const corners=[[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]];
      const crs2=la.cornerRadii||[0,0,0,0];
      corners.forEach(([lx,ly],ci2)=>{
        const ax2=(la.x*pw+lx*cos2-ly*sin2)/pw;
        const ay2=(la.y*ph+lx*sin2+ly*cos2)/ph;
        const cpx2=edMarginX()+ax2*pw, cpy2=edMarginY()+ay2*ph;
        const isAct=window._edCurveVertIdx===ci2;
        const _blink2=isAct?(Math.sin(Date.now()/200)*0.25+0.25):1; // parpadeo 0..0.5
        edCtx.globalAlpha=_blink2;
        edCtx.beginPath();edCtx.arc(cpx2,cpy2,hr,0,Math.PI*2);
        edCtx.fillStyle=isAct?'#e67e22':'#2ecc71';edCtx.fill();
        edCtx.strokeStyle='#fff';edCtx.lineWidth=lw*1.5;edCtx.stroke();
        edCtx.globalAlpha=1;
      });
      // Animar parpadeo del nodo activo
      if(window._edCurveVertIdx >= 0) requestAnimationFrame(()=>{ if(window._edCurveVertIdx>=0) edRedraw(); });
    }
  }
  // Handles vértices de ShapeLayer rect en sesión de fusión (panel line abierto)
  if(la.type==='shape' && la.shape==='rect' && la._fusionId && $('edOptionsPanel')?.dataset.mode==='line'){
    const rot2=(la.rotation||0)*Math.PI/180;
    const cos2=Math.cos(rot2), sin2=Math.sin(rot2);
    const hw=la.width*pw/2, hh=la.height*ph/2;
    const cxR=edMarginX()+la.x*pw, cyR=edMarginY()+la.y*ph;
    [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]].forEach(([lx,ly])=>{
      const cpx=cxR+lx*cos2-ly*sin2, cpy=cyR+lx*sin2+ly*cos2;
      edCtx.globalAlpha=1;
      edCtx.beginPath(); edCtx.arc(cpx,cpy,hr,0,Math.PI*2);
      edCtx.fillStyle='#e63030'; edCtx.fill();
      edCtx.strokeStyle='#fff'; edCtx.lineWidth=lw*1.5; edCtx.stroke();
    });
  }
  // Handles vértices de LineLayer seleccionado (panel abierto, solo si no es ellipse)
  if(la.type==='line' && la.points.length>=1 && !la._fromEllipse && ($('edOptionsPanel')?.dataset.mode==='line' || $('edShapeBar')?.classList.contains('visible'))){
    const rot=(la.rotation||0)*Math.PI/180;
    const cos=Math.cos(rot),sin=Math.sin(rot);
    const cx=edMarginX()+la.x*pw, cy=edMarginY()+la.y*ph;
    const n2=la.points.length;
    const cr2=la.cornerRadii||{};
    const _cvm=_edCurveModeActive();
    // Helper: radio efectivo en espacio local (px), con escala aplicada
    const _er2 = i => {
      const r=cr2[i]||0; if(!r) return 0;
      const prev=la.points[(i-1+n2)%n2], cur=la.points[i], next=la.points[(i+1)%n2];
      if(!prev||!cur||!next) return 0; // no cruzar contornos
      const d1=Math.hypot((cur.x-prev.x)*pw,(cur.y-prev.y)*ph);
      const d2=Math.hypot((next.x-cur.x)*pw,(next.y-cur.y)*ph);
      return Math.max(0,Math.min(r,Math.min(d1,d2)-2));
    };
    la.points.forEach((p,i)=>{
      if(!p) return; // separador de contorno
      const r=_er2(i);
      let lpx=p.x*pw, lpy=p.y*ph;
      if(r>0){
        const prev=la.points[(i-1+n2)%n2], cur=la.points[i], next=la.points[(i+1)%n2];
        if(!prev||!cur||!next){ /* no cruzar contornos */ } else {
        const d1=Math.hypot((cur.x-prev.x)*pw,(cur.y-prev.y)*ph);
        const d2=Math.hypot((next.x-cur.x)*pw,(next.y-cur.y)*ph);
        const rr=Math.max(0,Math.min(r,Math.min(d1/2,d2/2)));
        const v1x=d1>0?(cur.x-prev.x)*pw/d1:0, v1y=d1>0?(cur.y-prev.y)*ph/d1:0;
        const v2x=d2>0?(next.x-cur.x)*pw/d2:0, v2y=d2>0?(next.y-cur.y)*ph/d2:0;
        const p1x=cur.x*pw-v1x*rr, p1y=cur.y*ph-v1y*rr;
        const p2x=cur.x*pw+v2x*rr, p2y=cur.y*ph+v2y*rr;
        lpx=(p1x+2*cur.x*pw+p2x)/4;
        lpy=(p1y+2*cur.y*ph+p2y)/4;
        } // end no-null guard
      }
      const cpx=cx + lpx*cos - lpy*sin;
      const cpy=cy + lpx*sin + lpy*cos;
      const isActive=window._edCurveVertIdx===i;
      const _blink3=isActive?(Math.sin(Date.now()/200)*0.25+0.25):1; // parpadeo 0..0.5
      edCtx.globalAlpha=_blink3;
      edCtx.beginPath();edCtx.arc(cpx,cpy,hr,0,Math.PI*2);
      edCtx.fillStyle=isActive?'#e67e22':(_cvm?'#2ecc71':'#e63030');edCtx.fill();
      edCtx.strokeStyle='#fff';edCtx.lineWidth=lw*1.5;edCtx.stroke();
      edCtx.globalAlpha=1;
    });
    // Si hay un nodo activo, continuar animando el parpadeo
    if(window._edCurveVertIdx >= 0) requestAnimationFrame(()=>{ if(window._edCurveVertIdx>=0) edRedraw(); });
  }
}

/* ══════════════════════════════════════════
   PÁGINAS
   ══════════════════════════════════════════ */
function edAddPage(){
  edPages.push({layers:[],drawData:null,textLayerOpacity:1,textMode:'sequential',orientation:edOrientation});
  edLoadPage(edPages.length-1);
  edToast('Página añadida');
}

/* ── Icono candado al tocar objeto bloqueado ── */
function _edShowLockIcon(la) {
  if(!la || !edCanvas) return;
  const pw = edPageW(), ph = edPageH();
  const wsCx = edMarginX() + la.x * pw;
  const wsCy = edMarginY() + la.y * ph;
  const scrCx = wsCx * edCamera.z + edCamera.x;
  const scrCy = wsCy * edCamera.z + edCamera.y;
  const canvasRect = edCanvas.getBoundingClientRect();
  const px = canvasRect.left + scrCx;
  const py = canvasRect.top  + scrCy;
  let el = $('_edLockIcon');
  if(!el){
    el = document.createElement('div');
    el.id = '_edLockIcon';
    el.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;font-size:2rem;transform:translate(-50%,-50%);transition:opacity .3s;text-shadow:0 2px 8px rgba(0,0,0,.5)';
    document.body.appendChild(el);
  }
  el.textContent = '🔒';
  el.style.left = px + 'px';
  el.style.top  = py + 'px';
  el.style.opacity = '1';
  el.style.display = '';
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(()=>{ el.style.opacity='0'; setTimeout(()=>{ el.style.display='none'; }, 300); }, 2000);
}
function _edShowLockIconDraw(dl) {
  if(!dl || !edCanvas) return;
  const pw = edPageW(), ph = edPageH();
  const idata = dl._ctx.getImageData(0, 0, ED_CANVAS_W, ED_CANVAS_H);
  const d = idata.data;
  let minX=ED_CANVAS_W, maxX=0, minY=ED_CANVAS_H, maxY=0, found=false;
  const step=8;
  for(let y=0;y<ED_CANVAS_H;y+=step) for(let x=0;x<ED_CANVAS_W;x+=step){
    if(d[(y*ED_CANVAS_W+x)*4+3]>8){ if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; found=true; }
  }
  const cx = found ? ((minX+maxX)/2 - edMarginX()) / pw : 0.5;
  const cy = found ? ((minY+maxY)/2 - edMarginY()) / ph : 0.5;
  _edShowLockIcon({x:cx, y:cy, width:0.1, height:0.1});
}

/* ── Centra la cámara en el objeto al abrir panel, dejándolo en el área libre ── */
function _edFocusOnLayer(la) {
  if (!la || !edCanvas) return;
  if (_edFocusDone) return;
  _edFocusDone = true;
  const pw = edPageW(), ph = edPageH();
  const canvasRect = edCanvas.getBoundingClientRect();
  const panel = $('edOptionsPanel');
  const panelBottom = (panel && panel.classList.contains('open'))
    ? panel.getBoundingClientRect().bottom : canvasRect.top;
  let floatBottom = 0;
  ['edDrawBar','edShapeBar'].forEach(id => {
    const bar = $(id);
    if (!bar || !bar.classList.contains('visible')) return;
    const r = bar.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) floatBottom = Math.max(floatBottom, r.bottom);
  });
  const freeTop    = Math.max(panelBottom, floatBottom);
  const freeBottom = canvasRect.bottom;
  const freeLeft   = canvasRect.left;
  const freeRight  = canvasRect.right;
  const freeW = Math.max(freeRight - freeLeft, 80);
  const freeH = Math.max(freeBottom - freeTop, 80);
  const objCx = edMarginX() + la.x * pw;
  const objCy = edMarginY() + la.y * ph;
  const objW  = (la.width  || 0.1) * pw;
  const objH  = (la.height || 0.1) * ph;
  const MARGIN = 0.75;
  const zForW  = (freeW * MARGIN) / Math.max(objW, 1);
  const zForH  = (freeH * MARGIN) / Math.max(objH, 1);
  const targetZ = Math.min(Math.min(zForW, zForH), 8);
  const currentlyFitsW = objW * edCamera.z <= freeW * MARGIN;
  const currentlyFitsH = objH * edCamera.z <= freeH * MARGIN;
  const newZ = (currentlyFitsW && currentlyFitsH) ? edCamera.z : Math.max(targetZ, 0.1);
  const freeCx = freeLeft + freeW / 2;
  const freeCy = freeTop  + freeH / 2;
  const camOffX = freeCx - canvasRect.left;
  const camOffY = freeCy - canvasRect.top;
  const newCamX = camOffX - objCx * newZ;
  const newCamY = camOffY - objCy * newZ;
  const startX = edCamera.x, startY = edCamera.y, startZ = edCamera.z;
  const t0 = performance.now();
  const DURATION = 220;
  function _animate(t) {
    const p = Math.min((t - t0) / DURATION, 1);
    const ease = p < 0.5 ? 2*p*p : -1+(4-2*p)*p;
    edCamera.x = startX + (newCamX - startX) * ease;
    edCamera.y = startY + (newCamY - startY) * ease;
    edCamera.z = startZ + (newZ    - startZ) * ease;
    edRedraw();
    if (p < 1) requestAnimationFrame(_animate);
  }
  requestAnimationFrame(_animate);
}


/* ══════════════════════════════════════════
   SISTEMA DE RECORTE POLIGONAL (_edCrop*)
   ══════════════════════════════════════════ */

function _edStartCrop(la) {
  if (!la || !['image','stroke','draw'].includes(la.type)) return;
  edPushHistory(true); // force: el punto "antes de recortar" siempre se guarda
  _edCropMode        = true;
  _edCropLayer       = la;
  _edCropPts         = [];
  _edCropDragIdx     = -1;
  _edCropDragging    = false;
  _edCropLastTapSeg  = -1;
  _edCropLastTapTime = 0;
  _edCropHistory     = [];
  _edCropHistIdx     = -1;
  // draw ya tiene su propia UI bloqueada; para imagen/stroke hay que bloquearlo
  if (la.type !== 'draw') _edDrawLockUI();
  _edCropPushHistory(); // estado inicial vacío para poder deshacer hasta el principio
  _edCropRenderPanel();
  edRedraw();
}

// Guarda snapshot del estado actual del polígono en el historial interno del recorte.
// Se llama después de cada acción: añadir vértice, drag, inserción en segmento.
function _edCropPushHistory() {
  _edCropHistory = _edCropHistory.slice(0, _edCropHistIdx + 1);
  _edCropHistory.push(_edCropPts.map(p => ({x: p.x, y: p.y})));
  if (_edCropHistory.length > 30) _edCropHistory.shift();
  _edCropHistIdx = _edCropHistory.length - 1;
}

function _edCropUndoHistory() {
  if (_edCropHistIdx <= 0) return; // en el estado inicial (vacío) — no deshacer más
  _edCropHistIdx--;
  _edCropPts = _edCropHistory[_edCropHistIdx].map(p => ({x: p.x, y: p.y}));
  // Resetear estado de drag para que el usuario pueda volver a interactuar
  _edCropDragIdx = -1;
  _edCropDragging = false;
  _edCropLastTapSeg = -1;
  _edCropLastTapTime = 0;
  _edCropRenderPanel();
  edRedraw();
}

function _edCropRedoHistory() {
  if (_edCropHistIdx >= _edCropHistory.length - 1) return;
  _edCropHistIdx++;
  _edCropPts = _edCropHistory[_edCropHistIdx].map(p => ({x: p.x, y: p.y}));
  _edCropRenderPanel();
  edRedraw();
}

function _edCropRenderPanel() {
  const panel = $('edOptionsPanel');
  if (!panel) return;
  const n = _edCropPts.length;
  const canUndo = _edCropHistIdx > 0;
  const canRedo = _edCropHistIdx < _edCropHistory.length - 1;
  panel.innerHTML = `
<div style="display:flex;flex-direction:column;width:100%;gap:0">
  <div style="display:flex;flex-direction:row;align-items:center;gap:4px;padding:6px 0;min-height:32px">
    <span style="font-size:.8rem;font-weight:700;color:var(--gray-600);flex:1">
      ✂ ${n < 3 ? 'Toca para añadir vértices (mín. 3)' : n + ' vértices · arrastra · doble tap en segmento añade nodo'}
    </span>
  </div>
  <div style="height:1px;background:var(--gray-300);width:100%"></div>
  <div style="display:flex;flex-direction:row;align-items:center;gap:4px;padding:4px 0">
    <button id="crop-undo" style="flex:1;border:1px solid var(--gray-300);border-radius:6px;padding:4px 8px;font-weight:900;font-size:.82rem;background:var(--gray-100);cursor:pointer" ${!canUndo?'disabled':''}>↩</button>
    <button id="crop-redo" style="flex:1;border:1px solid var(--gray-300);border-radius:6px;padding:4px 8px;font-weight:900;font-size:.82rem;background:var(--gray-100);cursor:pointer" ${!canRedo?'disabled':''}>↪</button>
    <button id="crop-cancel" style="flex:1;border:1px solid var(--gray-300);border-radius:6px;padding:4px 8px;font-weight:900;font-size:.82rem;background:var(--gray-100);cursor:pointer;color:#c00">✕</button>
    <button id="crop-apply" style="flex:2;background:${n>=3?'var(--black)':'var(--gray-400)'};color:var(--white);border:none;border-radius:6px;padding:4px 10px;font-weight:900;font-size:.82rem;cursor:pointer" ${n<3?'disabled':''}>✓ Aplicar</button>
  </div>
</div>`;
  panel.classList.add('open');
  panel.dataset.mode = 'crop';
  edFitCanvas(); // actualizar _edCanvasTop
  $('crop-undo')?.addEventListener('click', _edCropUndoHistory);
  $('crop-redo')?.addEventListener('click', _edCropRedoHistory);
  $('crop-cancel')?.addEventListener('click', _edCancelCrop);
  $('crop-apply')?.addEventListener('click', () => {
    if (_edCropPts.length >= 3) _edApplyCrop();
  });
}

function _edCancelCrop() {
  const _wasDrawLayer = _edCropLayer && _edCropLayer.type === 'draw';
  const _cancelSelIdx = edSelectedIdx; // conservar índice seleccionado
  _edCropMode         = false;
  _edCropLayer        = null;
  _edCropPts          = [];
  _edCropDragIdx      = -1;
  _edCropDragging     = false;
  _edCropLastTapSeg   = -1;
  _edCropLastTapTime  = 0;
  _edCropHistory      = [];
  _edCropHistIdx      = -1;
  // Limpiar punteros fantasma
  if (window._edActivePointers) window._edActivePointers.clear();
  edPinching = false; edPinchScale0 = null;
  clearTimeout(window._edCropTouchTimer); window._edCropTouchTimer = null;
  if (_wasDrawLayer) {
    // Draw: ya tenía UI bloqueada por el dibujo — restaurar panel draw
    edRenderOptionsPanel('draw');
  } else {
    // Imagen/Stroke: restaurar selección y panel props con overlay
    _edDrawUnlockUI();
    _edPropsOverlayHide();
    edSelectedIdx = _cancelSelIdx; // asegurar que sigue seleccionado
    if (edSelectedIdx >= 0 && edSelectedIdx < edLayers.length) {
      _edDrawLockUI();
      _edPropsOverlayShow();
      edRenderOptionsPanel('props');
    }
  }
  edRedraw();
}

function _edCropDrawOverlay() {
  // Overlay de recorte: la imagen es completamente visible.
  // Solo se dibuja el polígono con relleno semitransparente azul (preview del área a conservar)
  // y el contorno amarillo con nodos.
  const pw = edPageW(), ph = edPageH();
  const z  = edCamera.z;
  const ctx = edCtx;

  if (_edCropPts.length === 0) return;

  // Convertir puntos a coordenadas workspace (cámara ya aplicada)
  const toWS = p => ({
    x: edMarginX() + p.x * pw,
    y: edMarginY() + p.y * ph
  });
  const wsPts = _edCropPts.map(toWS);

  ctx.save();

  if (wsPts.length >= 3) {
    // Relleno semitransparente azul sobre el área de recorte
    ctx.beginPath();
    ctx.moveTo(wsPts[0].x, wsPts[0].y);
    for (let i = 1; i < wsPts.length; i++) ctx.lineTo(wsPts[i].x, wsPts[i].y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(59,130,246,0.25)';
    ctx.fill();
  }

  // Contorno del polígono
  ctx.beginPath();
  ctx.moveTo(wsPts[0].x, wsPts[0].y);
  for (let i = 1; i < wsPts.length; i++) ctx.lineTo(wsPts[i].x, wsPts[i].y);
  if (_edCropPts.length >= 3) ctx.closePath();
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 2.5 / z;
  ctx.stroke();
  // Borde interior blanco
  ctx.beginPath();
  ctx.moveTo(wsPts[0].x, wsPts[0].y);
  for (let i = 1; i < wsPts.length; i++) ctx.lineTo(wsPts[i].x, wsPts[i].y);
  if (_edCropPts.length >= 3) ctx.closePath();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.2 / z;
  ctx.stroke();

  // Nodos
  const hr = 7 / z;
  wsPts.forEach((p, i) => {
    const isActive = i === _edCropDragIdx;
    const r = isActive ? hr * 1.5 : hr;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = isActive ? '#f97316' : '#3b82f6';
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = (isActive ? 2.5 : 1.5) / z; ctx.stroke();
  });

  ctx.restore();
}

// Hit-test unificado para el polígono de recorte.
// Mismo patrón que _edLineHitTest: nodos primero, segmentos después.
// Devuelve {type:'node', idx} | {type:'seg', segIdx, ix, iy} | null
function _edCropHitTest(nx, ny) {
  const pw = edPageW(), ph = edPageH();
  const z  = edCamera.z;
  const n  = _edCropPts.length;
  if (n === 0) return null;
  const HIT_NODE = 22; // px de pantalla
  const HIT_SEG  = 18;

  // 1. Nodos — el más cercano dentro del radio
  let bestDist = HIT_NODE, bestIdx = -1;
  for (let i = 0; i < n; i++) {
    const p = _edCropPts[i];
    const d = Math.hypot((nx - p.x) * pw, (ny - p.y) * ph) * z;
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  if (bestIdx >= 0) return { type: 'node', idx: bestIdx };

  // 2. Segmentos — proyección perpendicular (igual que _edLineHitTest)
  if (n < 2) return null;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (j === 0 && n < 3) continue; // no cerrar si < 3 puntos
    const ax = _edCropPts[i].x, ay = _edCropPts[i].y;
    const bx = _edCropPts[j].x, by = _edCropPts[j].y;
    const abxPx = (bx - ax) * pw, abyPx = (by - ay) * ph;
    const apxPx = (nx - ax) * pw, apyPx = (ny - ay) * ph;
    const abLen2 = abxPx * abxPx + abyPx * abyPx;
    if (abLen2 < 0.0001) continue;
    const t = Math.max(0, Math.min(1, (apxPx * abxPx + apyPx * abyPx) / abLen2));
    const dist = Math.hypot(apxPx - t * abxPx, apyPx - t * abyPx) * z;
    if (dist < HIT_SEG) {
      return { type: 'seg', segIdx: i, ix: ax + t * (bx - ax), iy: ay + t * (by - ay) };
    }
  }
  return null;
}

function _edCropHandleCanvasTap(nx, ny) {
  if (!_edCropMode) return false;
  // Si estábamos arrastrando, absorber el tap-end sin añadir vértice
  if (_edCropDragging) { _edCropLastTapSeg = -1; _edCropLastTapTime = 0; return true; }
  const hit = _edCropHitTest(nx, ny);
  if (hit && hit.type === 'node') {
    // Tap sobre nodo → el drag lo gestiona Start; aquí solo absorber
    _edCropLastTapSeg = -1; _edCropLastTapTime = 0;
    return true;
  }
  if (hit && hit.type === 'seg') {
    // Doble tap sobre segmento → insertar nodo en posición exacta del toque
    const _now = Date.now();
    const _same = _edCropLastTapSeg === hit.segIdx && (_now - _edCropLastTapTime) < 400;
    if (_same) {
      _edCropLastTapSeg = -1; _edCropLastTapTime = 0;
      _edCropPts.splice(hit.segIdx + 1, 0, { x: hit.ix, y: hit.iy });
      _edCropPushHistory();
      _edCropRenderPanel();
      edRedraw();
    } else {
      _edCropLastTapSeg = hit.segIdx;
      _edCropLastTapTime = _now;
    }
    return true;
  }
  // Tap en vacío → añadir nuevo vértice al final
  _edCropLastTapSeg = -1; _edCropLastTapTime = 0;
  _edCropPts.push({ x: nx, y: ny });
  _edCropPushHistory();
  _edCropRenderPanel();
  edRedraw();
  return true;
}

// Llamado desde edOnStart cuando _edCropMode está activo
function _edCropHandleCanvasStart(nx, ny) {
  if (!_edCropMode) return false;
  const hit = _edCropHitTest(nx, ny);
  if (hit && hit.type === 'node') {
    // Nodo → iniciar drag
    _edCropDragIdx = hit.idx;
    _edCropDragging = false;
    return true;
  }
  return false; // segmento o vacío → Tap lo gestiona
}

// Llamado desde edOnMove cuando _edCropMode está activo
function _edCropHandleCanvasMove(nx, ny) {
  if (!_edCropMode || _edCropDragIdx < 0) return false;
  _edCropDragging = true;
  _edCropPts[_edCropDragIdx] = { x: nx, y: ny };
  edRedraw();
  return true;
}

// Llamado desde edOnEnd cuando _edCropMode está activo
function _edCropHandleCanvasEnd() {
  if (!_edCropMode) return false;
  if (_edCropDragIdx >= 0) {
    const _wasDragging = _edCropDragging;
    _edCropDragIdx  = -1;
    _edCropDragging = false;
    if (_wasDragging) _edCropPushHistory(); // solo si hubo movimiento real
    edRedraw();
    return true;
  }
  return false;
}

function _edApplyCrop() {
  const la  = _edCropLayer;
  const pw  = edPageW(), ph = edPageH();
  const pts = _edCropPts;
  if (!la || pts.length < 3) return;

  // Función de finalización — se llama cuando todas las imágenes han cargado
  const _wasDrawLayer = la && la.type === 'draw';
  const _finish = (newLayer) => {
    if (newLayer) {
      // Para DrawLayer: _edApplyCropDraw ya sustituyó el original por dlOutside,
      // insertamos dlInside (newLayer) justo después del dlOutside (que está en origIdx)
      const origIdx = edLayers.indexOf(_edCropLayer !== null ? _edCropLayer : la);
      const insertAt = origIdx >= 0 ? origIdx + 1 : edLayers.length;
      edLayers.splice(insertAt, 0, newLayer);
      edPages[edCurrentPage].layers = edLayers;
      edSelectedIdx = insertAt;
    }
    _edCropMode         = false;
    _edCropLayer        = null;
    _edCropPts          = [];
    _edCropDragIdx      = -1;
    _edCropDragging     = false;
    _edCropLastTapSeg   = -1;
    _edCropLastTapTime  = 0;
    _edCropHistory      = [];
    _edCropHistIdx      = -1;
    // Limpiar mapa de punteros: el toque en el botón "Aplicar" (fuera del canvas)
    // no genera pointerup en el canvas, dejando punteros fantasma que rompen los gestos
    if(window._edActivePointers) window._edActivePointers.clear();
    edPinching    = false;
    edPinchScale0 = null;
    clearTimeout(window._edCropTouchTimer); window._edCropTouchTimer = null;
    if (_wasDrawLayer) {
      // Congelar TODOS los DrawLayers resultantes del recorte → StrokeLayers.
      // Así no quedan DrawLayers huérfanos ni bloqueos de UI.
      _edFreezeAllDrawLayers();
      edActiveTool = 'select';
      edCanvas.className = '';
      const _bc = $('edBrushCursor'); if(_bc) _bc.style.display = 'none';
      edDrawBarHide();
      _cofSetOn(false); _edOffsetHide();
      _edDrawUnlockUI();
      _edPropsOverlayHide();
      edRenderOptionsPanel('props');
    } else {
      _edDrawUnlockUI();
      _edPropsOverlayHide();
      edPushHistory(); // snapshot DESPUÉS
      edRenderOptionsPanel('props');
    }
    _edResetCameraToFit();
    edRedraw();
    edToast('Recorte creado ✓');
  };

  if (la.type === 'image') {
    _edApplyCropImage(la, pts, pw, ph, _finish);
  } else if (la.type === 'stroke') {
    const newLayer = _edApplyCropStroke(la, pts, pw, ph);
    _finish(newLayer); // stroke es síncrono, llamar directamente
  } else if (la.type === 'draw') {
    _edApplyCropDraw(la, pts, pw, ph, _finish);
  } else {
    _finish(null);
  }
}

function _edApplyCropImage(la, pts, pw, ph, _onDone) {
  const img = la.img;
  if (!img || !img.naturalWidth) return null;
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const rot = (la.rotation || 0) * Math.PI / 180;
  const lw = la.width * pw, lh = la.height * ph;
  const cos = Math.cos(-rot), sin = Math.sin(-rot);

  // Puntos de recorte → píxeles de la imagen original
  const localPts = pts.map(p => {
    const dx = (p.x - la.x) * pw, dy = (p.y - la.y) * ph;
    const lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
    return { x: ((lx / lw) + 0.5) * iw, y: ((ly / lh) + 0.5) * ih };
  });

  const _drawPoly = (ctx) => {
    ctx.beginPath();
    ctx.moveTo(localPts[0].x, localPts[0].y);
    for (let i = 1; i < localPts.length; i++) ctx.lineTo(localPts[i].x, localPts[i].y);
    ctx.closePath();
  };

  // ── 1. Nuevo layer: solo el área del polígono ──
  const offNew = document.createElement('canvas');
  offNew.width = iw; offNew.height = ih;
  const ctxNew = offNew.getContext('2d');
  ctxNew.save(); _drawPoly(ctxNew); ctxNew.clip();
  ctxNew.drawImage(img, 0, 0, iw, ih);
  ctxNew.restore();

  const idNew = ctxNew.getImageData(0, 0, iw, ih).data;
  let minX=iw, minY=ih, maxX=0, maxY=0, found=false;
  for (let y=0; y<ih; y++) for (let x=0; x<iw; x++) {
    if (idNew[(y*iw+x)*4+3] > 4) {
      if(x<minX)minX=x; if(x>maxX)maxX=x;
      if(y<minY)minY=y; if(y>maxY)maxY=y; found=true;
    }
  }
  if (!found) return null;

  const cw = maxX-minX+1, ch = maxY-minY+1;
  const croppedNew = document.createElement('canvas');
  croppedNew.width = cw; croppedNew.height = ch;
  croppedNew.getContext('2d').drawImage(offNew, minX, minY, cw, ch, 0, 0, cw, ch);

  const newLayer = new ImageLayer(null, la.x, la.y, la.width);
  newLayer.rotation = la.rotation || 0;
  newLayer.opacity  = la.opacity  ?? 1;
  const bcx = (minX + cw/2) / iw, bcy = (minY + ch/2) / ih;
  const dxL = (bcx - 0.5) * lw, dyL = (bcy - 0.5) * lh;
  newLayer.x = la.x + (dxL * Math.cos(rot) - dyL * Math.sin(rot)) / pw;
  newLayer.y = la.y + (dxL * Math.sin(rot) + dyL * Math.cos(rot)) / ph;
  newLayer.width  = (cw / iw) * la.width;
  newLayer.height = (ch / ih) * la.height;
  // ── 2. Original: restar el polígono (destination-out) ──
  const offOrig = document.createElement('canvas');
  offOrig.width = iw; offOrig.height = ih;
  const ctxOrig = offOrig.getContext('2d');
  ctxOrig.drawImage(img, 0, 0, iw, ih);
  ctxOrig.globalCompositeOperation = 'destination-out';
  _drawPoly(ctxOrig);
  ctxOrig.fill();
  ctxOrig.globalCompositeOperation = 'source-over';

  // Esperar a que ambas imágenes carguen antes de llamar _onDone
  // (el snapshot del historial debe capturar el estado FINAL, no el intermedio)
  let _pending = 2;
  const _checkDone = () => { if (--_pending === 0) { edRedraw(); if (_onDone) _onDone(newLayer); } };

  const newImg = new Image();
  newImg.onload = () => { newLayer.img = newImg; newLayer.src = newImg.src; _checkDone(); };
  newImg.src = croppedNew.toDataURL('image/png');

  const newOrigImg = new Image();
  newOrigImg.onload = () => { la.img = newOrigImg; la.src = newOrigImg.src; _checkDone(); };
  newOrigImg.src = offOrig.toDataURL('image/png');

  // Devolver newLayer ahora (sin imagen aún) — se completará en el callback
  return newLayer;
}

function _edApplyCropStroke(la, pts, pw, ph) {
  const sc = la._canvas;
  if (!sc) return null;
  const sw = sc.width, sh = sc.height;
  const rot = (la.rotation || 0) * Math.PI / 180;
  const lw = la.width * pw, lh = la.height * ph;
  const cos = Math.cos(-rot), sin = Math.sin(-rot);

  const localPts = pts.map(p => {
    const dx = (p.x - la.x) * pw, dy = (p.y - la.y) * ph;
    const lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
    return { x: ((lx / lw) + 0.5) * sw, y: ((ly / lh) + 0.5) * sh };
  });

  const _drawPoly = (ctx) => {
    ctx.beginPath();
    ctx.moveTo(localPts[0].x, localPts[0].y);
    for (let i = 1; i < localPts.length; i++) ctx.lineTo(localPts[i].x, localPts[i].y);
    ctx.closePath();
  };

  // ── 1. Nuevo layer: solo el área del polígono ──
  const offNew = document.createElement('canvas');
  offNew.width = sw; offNew.height = sh;
  const ctxNew = offNew.getContext('2d');
  ctxNew.save(); _drawPoly(ctxNew); ctxNew.clip();
  ctxNew.drawImage(sc, 0, 0);
  ctxNew.restore();

  const idNew = ctxNew.getImageData(0, 0, sw, sh).data;
  let minX=sw, minY=sh, maxX=0, maxY=0, found=false;
  for (let y=0; y<sh; y++) for (let x=0; x<sw; x++) {
    if (idNew[(y*sw+x)*4+3] > 4) {
      if(x<minX)minX=x; if(x>maxX)maxX=x;
      if(y<minY)minY=y; if(y>maxY)maxY=y; found=true;
    }
  }
  if (!found) return null;

  const cw2 = maxX-minX+1, ch2 = maxY-minY+1;
  const cropped2 = document.createElement('canvas');
  cropped2.width = cw2; cropped2.height = ch2;
  cropped2.getContext('2d').drawImage(offNew, minX, minY, cw2, ch2, 0, 0, cw2, ch2);

  const newLayer = new StrokeLayer(document.createElement('canvas'));
  newLayer.rotation = la.rotation || 0;
  newLayer.opacity  = la.opacity  ?? 1;
  const bcx2 = (minX + cw2/2) / sw, bcy2 = (minY + ch2/2) / sh;
  const dxL2 = (bcx2 - 0.5) * lw, dyL2 = (bcy2 - 0.5) * lh;
  newLayer.x = la.x + (dxL2 * Math.cos(rot) - dyL2 * Math.sin(rot)) / pw;
  newLayer.y = la.y + (dxL2 * Math.sin(rot) + dyL2 * Math.cos(rot)) / ph;
  newLayer.width  = (cw2 / sw) * la.width;
  newLayer.height = (ch2 / sh) * la.height;
  newLayer._canvas = cropped2;
  newLayer._ctx    = cropped2.getContext('2d');

  // ── 2. Original: restar el polígono (destination-out) ──
  const ctxOrig = la._canvas.getContext('2d');
  ctxOrig.globalCompositeOperation = 'destination-out';
  _drawPoly(ctxOrig);
  ctxOrig.fill();
  ctxOrig.globalCompositeOperation = 'source-over';

  return newLayer;
}

function _edApplyCropDraw(dl, pts, pw, ph, _onDone) {
  // El DrawLayer trabaja en coordenadas ABSOLUTAS del workspace (ED_CANVAS_W × ED_CANVAS_H).
  // Convertimos los puntos fraccionarios de página a coordenadas de workspace.
  const mxWS = edMarginX(), myWS = edMarginY();

  const wsPts = pts.map(p => ({
    x: mxWS + p.x * pw,
    y: myWS + p.y * ph
  }));

  const W = ED_CANVAS_W, H = ED_CANVAS_H;
  const srcCanvas = dl._canvas;

  const _drawPoly = (ctx) => {
    ctx.beginPath();
    ctx.moveTo(wsPts[0].x, wsPts[0].y);
    for (let i = 1; i < wsPts.length; i++) ctx.lineTo(wsPts[i].x, wsPts[i].y);
    ctx.closePath();
  };

  // ── 1. DrawLayer "dentro": área interior del polígono ──
  const offInside = document.createElement('canvas');
  offInside.width = W; offInside.height = H;
  const ctxInside = offInside.getContext('2d');
  ctxInside.save();
  _drawPoly(ctxInside);
  ctxInside.clip();
  ctxInside.drawImage(srcCanvas, 0, 0);
  ctxInside.restore();

  // ── 2. DrawLayer "fuera": área exterior del polígono ──
  const offOutside = document.createElement('canvas');
  offOutside.width = W; offOutside.height = H;
  const ctxOutside = offOutside.getContext('2d');
  ctxOutside.drawImage(srcCanvas, 0, 0);
  ctxOutside.globalCompositeOperation = 'destination-out';
  _drawPoly(ctxOutside);
  ctxOutside.fill();
  ctxOutside.globalCompositeOperation = 'source-over';

  // ── 3. Verificar que haya contenido en la zona interior ──
  const idCheck = ctxInside.getImageData(0, 0, W, H).data;
  let hasContent = false;
  for (let i = 3; i < idCheck.length; i += 4) { if (idCheck[i] > 4) { hasContent = true; break; } }
  if (!hasContent) {
    // Nada dentro del polígono — cancelar silenciosamente
    if (_onDone) _onDone(null);
    return;
  }

  // ── 4. Crear nuevo DrawLayer con el contenido DENTRO del polígono ──
  const dlInside = new DrawLayer();
  dlInside._ctx.drawImage(offInside, 0, 0);
  dlInside.opacity = dl.opacity ?? 1;
  dlInside.locked  = false;

  // ── 5. Reemplazar el canvas del DrawLayer original con el contenido FUERA ──
  // (crear nuevo DrawLayer para "fuera" y sustituir el original en edLayers)
  const dlOutside = new DrawLayer();
  dlOutside._ctx.drawImage(offOutside, 0, 0);
  dlOutside.opacity = dl.opacity ?? 1;
  dlOutside.locked  = dl.locked || false;

  // Sustituir el original (dl) por dlOutside en el array de layers
  const page = edPages[edCurrentPage];
  const origIdx = page ? page.layers.indexOf(dl) : -1;
  if (origIdx >= 0) {
    page.layers.splice(origIdx, 1, dlOutside);
    edLayers = page.layers;
    // Asegurarse de que la referencia en _edCropLayer apunta al nuevo
    _edCropLayer = dlOutside;
  }

  // El _finish de _edApplyCrop insertará dlInside justo después de dlOutside
  if (_onDone) _onDone(dlInside);
}

function edDeletePage(){
  if(edPages.length<=1){edToast('Necesitas al menos una página');return;}
  edConfirm('¿Eliminar esta hoja?', ()=>{
    edPages.splice(edCurrentPage,1);
    edLoadPage(Math.min(edCurrentPage,edPages.length-1));
  });
}
function edLoadPage(idx){
  // Limpiar sesión vectorial al cambiar de página
  if(typeof _vsClear==='function') _vsClear();
  edCurrentPage=idx;edLayers=edPages[idx].layers;edSelectedIdx=-1;
  const _po = edPages[idx]?.orientation || 'vertical';
  if(_po !== edOrientation){
    edOrientation = _po;
    if(edViewerCanvas){ edViewerCanvas.width=edPageW(); edViewerCanvas.height=edPageH(); }
    // Recalcular height de imagenes para la nueva orientacion
    const _isV = _po === 'vertical';
    const _pw = _isV ? ED_PAGE_W : ED_PAGE_H;
    const _ph = _isV ? ED_PAGE_H : ED_PAGE_W;
    edLayers.forEach(l => {
      if(l.type === 'image' && l.img && l.img.naturalWidth > 0){
        l.height = l.width * (l.img.naturalHeight / l.img.naturalWidth) * (_pw / _ph);
      }
    });
  }
  edRedraw();edUpdateNavPages();edRenderOptionsPanel();
}
function edUpdateNavPages(){
  // Actualizar número de página en topbar
  const pnum=$('edPageNum');
  if(pnum) pnum.textContent = edCurrentPage+1;
  // Habilitar/deshabilitar flechas en topbar
  const pprev=$('edPagePrev'), pnext=$('edPageNext');
  if(pprev) pprev.disabled = edCurrentPage <= 0;
  if(pnext) pnext.disabled = edCurrentPage >= edPages.length-1;

  const wrap=$('ddNavPages');if(!wrap)return;
  wrap.innerHTML='';
  edPages.forEach((p,i)=>{
    const btn=document.createElement('button');
    btn.className='op-btn ed-nav-page-btn'+(i===edCurrentPage?' active':'');
    btn.title='Hoja '+(i+1);
    btn.style.cssText='padding:3px;min-width:48px;flex-direction:column;align-items:center;gap:2px;justify-content:center';

    // Canvas miniatura
    const thumb=document.createElement('canvas');
    const isV=(p.orientation||edOrientation)==='vertical';
    thumb.width=44; thumb.height=isV?60:44;
    thumb.style.cssText='display:block;border:1px solid #ccc;border-radius:3px;background:#fff;max-width:44px';
    _edRenderPageThumb(thumb, p, i);
    btn.appendChild(thumb);

    // Número de página
    const lbl=document.createElement('span');
    lbl.textContent=i+1;
    lbl.style.cssText='font-size:10px;font-weight:700;line-height:1';
    btn.appendChild(lbl);

    btn.addEventListener('click',()=>{edLoadPage(i);edCloseMenus();});
    wrap.appendChild(btn);
  });
  // Marcar orientación activa
  $('dd-orientv')?.classList.toggle('active',edOrientation==='vertical');
  $('dd-orienth')?.classList.toggle('active',edOrientation==='horizontal');
}

// Regenera solo el thumb de la hoja actual en el nav (sin reconstruir todo el nav)
function _edRefreshCurrentPageThumb(){
  const wrap=$('ddNavPages'); if(!wrap) return;
  const btns=wrap.querySelectorAll('.ed-nav-page-btn');
  const btn=btns[edCurrentPage]; if(!btn) return;
  const thumb=btn.querySelector('canvas'); if(!thumb) return;
  const page=edPages[edCurrentPage]; if(!page) return;
  _edRenderPageThumb(thumb, page, edCurrentPage);
}

function _edRenderPageThumb(canvas, page, pageIdx){
  const ctx=canvas.getContext('2d');
  const tw=canvas.width, th=canvas.height;
  ctx.fillStyle='#ffffff';
  ctx.fillRect(0,0,tw,th);
  if(!page||!page.layers) return;
  // Mismo sistema que edExportPagePNG: canvas del tamano exacto de la pagina
  // con setTransform para que draw() de cada capa coloque en coords correctas
  const _savedOrient=edOrientation;
  const _savedPage=edCurrentPage;
  const _po=page.orientation||edOrientation;
  edOrientation=_po;
  const _pi=edPages.indexOf(page); if(_pi>=0) edCurrentPage=_pi;
  const pw=edPageW(), ph=edPageH();
  const mx=edMarginX(), my=edMarginY();
  const off=document.createElement('canvas');
  off.width=pw; off.height=ph;
  const offCtx=off.getContext('2d');
  offCtx.fillStyle='#ffffff'; offCtx.fillRect(0,0,pw,ph);
  // Mismo transform que edExportPagePNG: traslada origen al borde de la pagina
  offCtx.setTransform(1,0,0,1,-mx,-my);
  const _textLayers=page.layers.filter(l=>l.type==='text'||l.type==='bubble');
  const _textAlpha=page.textLayerOpacity??1;
  page.layers.forEach(l=>{
    if(!l||l.type==='text'||l.type==='bubble') return;
    if(l.type==='gif'){
      if(l._oc && l._ready && l._oc.width > 0){
        // Canvas limpio sin transform para evitar problemas de coordenadas
        const _gc = document.createElement('canvas');
        _gc.width = pw; _gc.height = ph;
        const _gx2 = l.x * pw - (l.width  * pw) / 2;
        const _gy2 = l.y * ph - (l.height * ph) / 2;
        _gc.getContext('2d').drawImage(l._oc, _gx2, _gy2, l.width*pw, l.height*ph);
        // Resetear transform para compositar el canvas limpio sobre off
        offCtx.save();
        offCtx.setTransform(1,0,0,1,0,0);
        offCtx.globalAlpha = l.opacity ?? 1;
        offCtx.drawImage(_gc, 0, 0);
        offCtx.restore();
        offCtx.setTransform(1,0,0,1,-mx,-my);
      }
    } else if(l.type==='image')  l.draw(offCtx,off);
    else if(l.type==='draw')   l.draw(offCtx);
    else if(l.type==='stroke'){ offCtx.globalAlpha=l.opacity??1; l.draw(offCtx); offCtx.globalAlpha=1; }
    else if(l.type==='shape'||l.type==='line'){ offCtx.globalAlpha=l.opacity??1; l.draw(offCtx); offCtx.globalAlpha=1; }
  });
  offCtx.globalAlpha=_textAlpha;
  _textLayers.forEach(l=>l.draw(offCtx,off));
  offCtx.globalAlpha=1;
  edOrientation=_savedOrient;
  edCurrentPage=_savedPage;
  // Escalar la pagina completa al tamano de la miniatura
  ctx.drawImage(off,0,0,pw,ph,0,0,tw,th);
}

/* ══════════════════════════════════════════
   CAPAS
   ══════════════════════════════════════════ */
function _edTryLoadApng(dataUrl, la, cb) {
  if (typeof UPNG === 'undefined') { cb(false); return; }
  if (typeof ApngDecoder === 'undefined' && !window.ApngDecoder) { cb(false); return; }
  try {
    var b64=dataUrl.split(',')[1],bin=atob(b64),u8=new Uint8Array(bin.length);
    for(var i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
    var decoded=UPNG.decode(u8.buffer);
    if(!decoded.frames||decoded.frames.length<=1){cb(false);return;}
    // Guardar el dataUrl del APNG completo como array de 1 elemento especial.
    // loadAnim lo detecta como string único y usa decodeApng (UPNG).
    // _pngFrames necesita length > 1 para que _edGifSetPlaying lo reconozca como animado.
    // Solución: extraer los frames como dataUrls individuales para _pngFrames,
    // pero pasar el APNG completo a loadAnim para decodificación correcta.
    var rgba8 = UPNG.toRGBA8(decoded);
    var W = decoded.width, H = decoded.height;
    var oc = document.createElement('canvas'); oc.width=W; oc.height=H;
    var ox = oc.getContext('2d');
    // Construir array de dataUrls por frame — sirve como _pngFrames
    var frameUrls = rgba8.map(function(buf) {
      var imgd = new ImageData(new Uint8ClampedArray(buf), W, H);
      ox.clearRect(0,0,W,H); ox.putImageData(imgd,0,0);
      return oc.toDataURL('image/png');
    });
    la._pngFrames = frameUrls; // array length > 1 → reconocido por _edGifSetPlaying
    la._animReady = false;
    la._apngSrc = dataUrl; // APNG completo en memoria para _edGifSetPlaying y upload
    // Generar animKey — guardar el APNG completo en IDB (patrón GIF)
    var _ak = 'anim_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
    la.animKey = _ak;
    var _doLoadApng = function() {
      la.loadAnim(frameUrls, function() { cb(true); });
    };
    if (window._sbAnimIdbSave) {
      // Guardar el dataUrl APNG completo en IDB — cb solo después de que IDB complete
      window._sbAnimIdbSave(_ak, dataUrl).then(_doLoadApng).catch(function(e) {
        console.warn('animIdbSave:', e); _doLoadApng();
      });
    } else { _doLoadApng(); }
  } catch(e){ console.warn('_edTryLoadApng error:', e); cb(false); }
}
function edAddImage(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    const img=new Image();
    img.onload=()=>{
      const pw=edPageW()||ED_PAGE_W, ph=edPageH()||ED_PAGE_H;
      const natW=img.naturalWidth||1, natH=img.naturalHeight||1;
      const w=0.7;
      // height calculado por el constructor como fraccion de pw (h = w*(natH/natW))
      const layer=new ImageLayer(img,0.5,0.5,w);
      // Limitar: no superar 0.85*ph en pixeles → 0.85*(ph/pw) como fraccion de pw
      const maxH = 0.85;  // fraccion de ph
      if(layer.height > maxH){
        const scale = maxH/layer.height;
        layer.height = maxH;
        layer.width  = layer.width * scale;
      }
      // Insertar imagen antes del primer texto/bocadillo (textos siempre encima)
      const firstTextIdx = edLayers.findIndex(l => l.type==='text'||l.type==='bubble');
      if(firstTextIdx >= 0){
        edLayers.splice(firstTextIdx, 0, layer);
        edSelectedIdx = firstTextIdx;
      } else {
        edLayers.push(layer);
        edSelectedIdx = edLayers.length - 1;
      }
      // Intentar detectar si es APNG (solo para archivos PNG)
      if (file.type === 'image/png' || file.name?.toLowerCase().endsWith('.png')) {
        _edTryLoadApng(ev.target.result, layer, function(isApng) {
          if (!isApng) {
            // PNG estático — flujo normal
            edPushHistory(); edRedraw(); edRenderOptionsPanel('props'); edToast('Imagen añadida ✓');
          } else {
            // APNG animado — _edTryLoadApng ya lo configuró
            edPushHistory(); edRedraw(); edRenderOptionsPanel('props'); edToast('PNG animado añadido ✓');
          }
        });
      } else {
        edPushHistory();edRedraw();edRenderOptionsPanel('props');edToast('Imagen añadida ✓');
      }
    };
    img.src=ev.target.result;
  };
  reader.readAsDataURL(file);
}
/* ── Insertar GIF animado ── */
function edAddGif(file, onLayerReady) {
  if (!file) return;
  if (!window.GifDecoder) { edToast('GIF no soportado en este navegador'); return; }
  const gifKey = 'gif_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
  const reader = new FileReader();
  reader.onload = ev => {
    const gifSrc = ev.target.result;
    edToast('Procesando GIF…');
    const layer = new GifLayer(gifKey, 0.5, 0.5, 0.7);
    layer.load(gifSrc, () => {
      if (layer._oc) {
        const pw = edPageW() || ED_PAGE_W, ph = edPageH() || ED_PAGE_H;
        const natW = layer._oc.width || 1, natH = layer._oc.height || 1;
        layer.width  = 0.7;
        layer.height = 0.7 * (natH / natW) * (pw / ph);
        if (layer.height > 0.85) {
          const s = 0.85 / layer.height;
          layer.height = 0.85; layer.width = 0.7 * s;
        }
      }
      const firstTextIdx = edLayers.findIndex(l => l.type==='text'||l.type==='bubble');
      if (firstTextIdx >= 0) { edLayers.splice(firstTextIdx, 0, layer); edSelectedIdx = firstTextIdx; }
      else { edLayers.push(layer); edSelectedIdx = edLayers.length - 1; }
      // Guardar dataUrl en IndexedDB (no en localStorage — puede ser varios MB)
      _gifIdbSave(gifKey, gifSrc).catch(e => console.warn('GIF IDB:', e));
      if (typeof onLayerReady === 'function') onLayerReady(layer);
      edPushHistory(); edRedraw(); edRenderOptionsPanel('props');
      requestAnimationFrame(() => edRedraw()); // asegurar primer frame visible
      edToast('GIF añadido ✓ (' + (layer._frames.length) + ' frames)');
    });
  };
  reader.readAsDataURL(file);
}

/* ── IndexedDB para GIFs (dataUrls grandes, no caben en localStorage) ── */
const _GIF_DB = 'cxGifs'; let _gifDb = null;
function _gifIdbOpen() {
  if (_gifDb) return Promise.resolve(_gifDb);
  return new Promise((res, rej) => {
    const r = indexedDB.open(_GIF_DB, 1);
    r.onupgradeneeded = e => e.target.result.createObjectStore('gifs');
    r.onsuccess = e => { _gifDb = e.target.result; res(_gifDb); };
    r.onerror   = e => rej(e.target.error);
  });
}
function _gifIdbSave(key, dataUrl) {
  return _gifIdbOpen().then(db => new Promise((res, rej) => {
    const tx = db.transaction('gifs','readwrite');
    tx.objectStore('gifs').put(dataUrl, key);
    tx.oncomplete = () => res(); tx.onerror = e => rej(e.target.error);
  }));
}
function _gifIdbLoad(key) {
  return _gifIdbOpen().then(db => new Promise((res, rej) => {
    const r = db.transaction('gifs').objectStore('gifs').get(key);
    r.onsuccess = e => res(e.target.result || null);
    r.onerror   = e => rej(e.target.error);
  }));
}
// Exponer como globals para supabase-client.js
window._gifIdbSave = _gifIdbSave;
window._gifIdbLoad = _gifIdbLoad;

/* Insertar capa en la posición más alta, justo debajo de textos/bocadillos */
function _edInsertLayerAbove(layer) {
  // Insertar justo antes del DrawLayer activo (si existe) o antes del primer texto
  // Así el draw siempre queda en la capa más alta entre los no-textos
  const drawIdx = edLayers.findIndex(l => l.type==='draw');
  const firstTextIdx = edLayers.findIndex(l => l.type==='text' || l.type==='bubble');
  let insertAt;
  if(drawIdx >= 0) insertAt = drawIdx;           // justo debajo del draw
  else if(firstTextIdx >= 0) insertAt = firstTextIdx; // justo debajo de los textos
  else insertAt = -1;                             // al final
  if(insertAt >= 0){
    edLayers.splice(insertAt, 0, layer);
    edSelectedIdx = insertAt;
  } else {
    edLayers.push(layer);
    edSelectedIdx = edLayers.length - 1;
  }
}

function edAddText(){
  const l=new TextLayer('Escribe aquí');l.resizeToFitText(edCanvas);
  edLayers.push(l); edSelectedIdx=edLayers.length-1;
  _edDrawLockUI(); _edPropsOverlayShow();
  edPushHistory();edRedraw();edRenderOptionsPanel('props');
}
function edAddBubble(){
  const l=new BubbleLayer('Escribe aquí');l.resizeToFitText(edCanvas);
  edLayers.push(l);edSelectedIdx=edLayers.length-1;
  _edDrawLockUI(); _edPropsOverlayShow();
  edPushHistory();edRedraw();edRenderOptionsPanel('props');
}
function edDuplicateSelected(){
  if(edSelectedIdx < 0 || edSelectedIdx >= edLayers.length) return;
  const la = edLayers[edSelectedIdx];
  let copy;
  if(la.type === 'stroke'){
    // Clonar el canvas del stroke
    const c = document.createElement('canvas');
    c.width = la._canvas.width; c.height = la._canvas.height;
    c.getContext('2d').drawImage(la._canvas, 0, 0);
    copy = new StrokeLayer(document.createElement('canvas'));
    copy._canvas = c;
    copy.x = la.x + 0.02; copy.y = la.y + 0.02;
    copy.width = la.width; copy.height = la.height;
    copy.rotation = la.rotation || 0;
    copy.opacity = la.opacity;
  } else if(la.type === 'image'){
    copy = new ImageLayer(la.img, la.x + 0.02, la.y + 0.02, la.width);
    copy.height = la.height; copy.rotation = la.rotation || 0;
    copy.src = la.src; copy.opacity = la.opacity;
  } else if(la.type === 'text'){
    copy = new TextLayer(la.text, la.x + 0.02, la.y + 0.02);
    Object.assign(copy, la); copy.x = la.x + 0.02; copy.y = la.y + 0.02;
  } else if(la.type === 'bubble'){
    copy = new BubbleLayer(la.text, la.x + 0.02, la.y + 0.02);
    Object.assign(copy, la); copy.x = la.x + 0.02; copy.y = la.y + 0.02;
    if(la.tailStart) copy.tailStart = {...la.tailStart};
    if(la.tailEnd)   copy.tailEnd   = {...la.tailEnd};
    if(la.tailStarts) copy.tailStarts = la.tailStarts.map(s=>({...s}));
    if(la.tailEnds)   copy.tailEnds   = la.tailEnds.map(e=>({...e}));
  } else if(la.type === 'shape'){
    copy = new ShapeLayer(la.shape, la.x + 0.02, la.y + 0.02, la.width, la.height);
    copy.color = la.color; copy.fillColor = la.fillColor;
    copy.lineWidth = la.lineWidth; copy.opacity = la.opacity ?? 1;
    copy.rotation = la.rotation || 0;
    if(la.cornerRadius)  copy.cornerRadius  = la.cornerRadius;
    if(la.cornerRadii)   copy.cornerRadii   = Array.isArray(la.cornerRadii) ? [...la.cornerRadii] : {...la.cornerRadii};
  } else if(la.type === 'line'){
    copy = new LineLayer();
    copy.points   = la.points.map(p => ({...p, x: p.x + 0.02, y: p.y + 0.02}));
    copy.color    = la.color; copy.fillColor = la.fillColor || 'none';
    copy.lineWidth = la.lineWidth; copy.closed = la.closed;
    copy.opacity  = la.opacity ?? 1; copy.rotation = la.rotation || 0;
    if(la.cornerRadii) copy.cornerRadii = Array.isArray(la.cornerRadii) ? [...la.cornerRadii] : {...la.cornerRadii};
    copy._updateBbox();
  } else return;
  // El duplicado hereda el estado de bloqueo del original
  if(edLayers[edSelectedIdx]?.locked) copy.locked = true;
  // Insertar justo encima del original
  edLayers.splice(edSelectedIdx + 1, 0, copy);
  edSelectedIdx = edSelectedIdx + 1;
  edPushHistory(); edRedraw();
  edToast('Objeto duplicado');
}
/* ── T14: Simetría horizontal (flip respecto al eje vertical del objeto) ── */
function edMirrorSelected(){
  // En modo draw sin selección: reflejar el DrawLayer activo de la hoja
  if(edSelectedIdx < 0){
    if(['draw','eraser','fill'].includes(edActiveTool)){
      const page = edPages[edCurrentPage]; if(!page) return;
      const la = page.layers.find(l => l.type==='draw'); if(!la) return;
      _edDrawPushHistory(); // para que ↩ del panel draw funcione
      edPushHistory();      // para que ↩ global también funcione
      // Calcular eje X en el centro del bbox del contenido pintado
      const bb = StrokeLayer._boundingBox(la._canvas);
      const axisPx = bb ? (bb.x + bb.w / 2) : (edMarginX() + edPageW() / 2);
      const tmp = document.createElement('canvas');
      tmp.width  = ED_CANVAS_W;
      tmp.height = ED_CANVAS_H;
      const tctx = tmp.getContext('2d');
      tctx.translate(axisPx * 2, 0);
      tctx.scale(-1, 1);
      tctx.drawImage(la._canvas, 0, 0);
      la._ctx.clearRect(0, 0, ED_CANVAS_W, ED_CANVAS_H);
      la._ctx.drawImage(tmp, 0, 0);
      edRedraw();
      edToast('Dibujo reflejado');
    }
    return;
  }
  if(edSelectedIdx >= edLayers.length) return;
  const la = edLayers[edSelectedIdx];
  edPushHistory();

  if(la.type === 'image'){
    // Crear canvas offscreen con el bitmap reflejado
    const img = la.img;
    const tmp = document.createElement('canvas');
    tmp.width  = img.naturalWidth  || img.width;
    tmp.height = img.naturalHeight || img.height;
    const tctx = tmp.getContext('2d');
    tctx.translate(tmp.width, 0);
    tctx.scale(-1, 1);
    tctx.drawImage(img, 0, 0);
    const mirroredImg = new Image();
    mirroredImg.onload = () => {
      la.img = mirroredImg;
      // Invertir rotación respecto a eje vertical: rotation → -rotation
      la.rotation = -(la.rotation || 0);
      edRedraw();
    };
    mirroredImg.src = tmp.toDataURL();
    return; // el resto se hace en onload
  }

  if(la.type === 'stroke'){
    // El _canvas del stroke cubre solo el bbox del trazo
    const c = document.createElement('canvas');
    c.width  = la._canvas.width;
    c.height = la._canvas.height;
    const cctx = c.getContext('2d');
    cctx.translate(c.width, 0);
    cctx.scale(-1, 1);
    cctx.drawImage(la._canvas, 0, 0);
    la._canvas = c;
    la._ctx    = c.getContext('2d');
    la.rotation = -(la.rotation || 0);
  }

  else if(la.type === 'draw'){
    // Reflejar respecto al eje vertical del centro del contenido pintado
    const bb2 = StrokeLayer._boundingBox(la._canvas);
    const axisPx = bb2 ? (bb2.x + bb2.w / 2) : (edMarginX() + edPageW() / 2);
    const tmp = document.createElement('canvas');
    tmp.width  = ED_CANVAS_W;
    tmp.height = ED_CANVAS_H;
    const tctx = tmp.getContext('2d');
    tctx.translate(axisPx * 2, 0);
    tctx.scale(-1, 1);
    tctx.drawImage(la._canvas, 0, 0);
    la._ctx.clearRect(0, 0, ED_CANVAS_W, ED_CANVAS_H);
    la._ctx.drawImage(tmp, 0, 0);
  }

  else if(la.type === 'shape'){
    // Invertir rotación; si tiene cornerRadii por vértice, intercambiar TL↔TR y BL↔BR
    la.rotation = -(la.rotation || 0);
    if(la.cornerRadii && la.cornerRadii.length === 4){
      // [TL, TR, BR, BL] → [TR, TL, BL, BR]
      const [tl,tr,br,bl] = la.cornerRadii;
      la.cornerRadii = [tr, tl, bl, br];
    }
  }

  else if(la.type === 'line'){
    // Puntos en espacio local centrado en (0,0) — invertir x
    la.points = la.points.map(p => p ? ({ ...p, x: -p.x,
      cx1: p.cx1 !== undefined ? -p.cx1 : undefined,
      cy1: p.cy1,
      cx2: p.cx2 !== undefined ? -p.cx2 : undefined,
      cy2: p.cy2
    }) : null);
    la.rotation = -(la.rotation || 0);
    if(typeof la._updateBbox === 'function') la._updateBbox();
  }

  else if(la.type === 'text' || la.type === 'bubble'){
    // Invertir rotación; para bocadillos también espejar la cola
    la.rotation = -(la.rotation || 0);
    if(la.type === 'bubble'){
      if(la.tailStart) la.tailStart = { x: 1 - la.tailStart.x, y: la.tailStart.y };
      if(la.tailEnd)   la.tailEnd   = { x: 1 - la.tailEnd.x,   y: la.tailEnd.y   };
      if(la.tailStarts) la.tailStarts = la.tailStarts.map(s=>({ x: 1-s.x, y: s.y }));
      if(la.tailEnds)   la.tailEnds   = la.tailEnds.map(e=>({ x: 1-e.x, y: e.y }));
    }
  }

  edRedraw();
  edToast('Objeto reflejado');
}

function edDeleteSelected(){
  if(edSelectedIdx<0){edToast('Selecciona un objeto');return;}
  if(edLayers[edSelectedIdx]?.locked){ _edShowLockIcon(edLayers[edSelectedIdx]); return; }
  // Si el modo recorte está activo, cancelarlo antes de eliminar
  if(_edCropMode){ _edCropMode=false; _edCropLayer=null; _edCropPts=[]; _edCropDragIdx=-1; _edCropDragging=false; _edCropLastTapSeg=-1; _edCropLastTapTime=0; _edCropHistory=[]; _edCropHistIdx=-1; _edDrawUnlockUI(); _edPropsOverlayHide(); }
  const _delType=edLayers[edSelectedIdx]?.type;
  edLayers.splice(edSelectedIdx,1);edSelectedIdx=-1;
  // Si era shape/line con barra flotante activa, limpiar y desbloquear
  if(_delType==='shape'||_delType==='line'){
    edShapeBarHide();
    if(typeof _edShapeClearHistory==='function') _edShapeClearHistory();
    if(typeof _vsClear==='function') _vsClear();
    _edDrawUnlockUI();
    edActiveTool='select'; edCanvas.className='';
  }
  edPushHistory();edRedraw();edRenderOptionsPanel();
}

/* ══════════════════════════════════════════
   EVENTOS CANVAS
   ══════════════════════════════════════════ */
function edCoords(e){
  const src = e.touches ? e.touches[0] : e;
  // sx: canvas siempre tiene left=0 en el shell, clientX no necesita ajuste.
  // sy: usar _edCanvasTop cacheado síncronamente en edFitCanvas.
  //     Más fiable que style.top (puede quedar desactualizado entre layout
  //     y el siguiente evento) y que getBoundingClientRect (puede incluir
  //     scroll del contenedor en algunos navegadores Android).
  const sx = src.clientX;
  const sy = src.clientY - _edCanvasTop;
  // Convertir pantalla → workspace
  const w = edScreenToWorld(sx, sy);
  // Convertir workspace → coordenadas de página (0-1)
  const pw = edPageW(), ph = edPageH();
  const nx = (w.x - edMarginX()) / pw;
  const ny = (w.y - edMarginY()) / ph;
  return { px: w.x, py: w.y, nx, ny };
}


/* ══════════════════════════════════════════
   PINCH-TO-ZOOM (2 dedos)
   ══════════════════════════════════════════ */
// Distancia entre 2 pointers del mapa _edActivePointers
function _pinchDist(pMap) {
  const pts = [...pMap.values()];
  const dx = pts[0].x - pts[1].x;
  const dy = pts[0].y - pts[1].y;
  return Math.hypot(dx, dy);
}
function _pinchAngle(pMap){
  const pts=[...pMap.values()];
  return Math.atan2(pts[1].y-pts[0].y, pts[1].x-pts[0].x);
}
function _pinchCenter(pMap){
  const pts = [...pMap.values()];
  return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
}
function edPinchStart(e) {
  if (!window._edActivePointers || window._edActivePointers.size !== 2) return false;
  edPinching = true;
  _edPinchHappened = true; // marcar que hubo pinch — cancelar drag al soltar
  // Cancelar timer de recorte pendiente — es un pinch, no un tap
  if(window._edCropTouchTimer){ clearTimeout(window._edCropTouchTimer); window._edCropTouchTimer = null; }
  edPinchDist0  = _pinchDist(window._edActivePointers);
  edPinchAngle0 = _pinchAngle(window._edActivePointers);
  // Centro del pinch en coordenadas de pantalla
  const ctr = _pinchCenter(window._edActivePointers);
  edPinchCenter0 = { x: ctr.x, y: ctr.y };
  // Snapshot de cámara para pan/zoom de canvas
  edPinchCamera0 = { x: edCamera.x, y: edCamera.y, z: edCamera.z };
  // Snapshot de objeto para resize (solo si hay objeto y NO estamos pintando)
  const isDrawTool = ['draw','eraser'].includes(edActiveTool);
  // Durante recorte: forzar modo cámara (no escalar el objeto que se recorta)
  const la = (_edCropMode || !isDrawTool && edSelectedIdx >= 0 && edLayers[edSelectedIdx]?.locked) ? null
    : (!isDrawTool && edSelectedIdx >= 0) ? edLayers[edSelectedIdx] : null;
  // T1: si hay LineLayer en construcción, usarla como objeto pincheable
  const _laForPinch = la || (_edLineLayer && edActiveTool==='line' ? _edLineLayer : null);
  edPinchScale0 = _laForPinch ? { w: _laForPinch.width, h: _laForPinch.height, rot: _laForPinch.rotation||0,
    x: _laForPinch.x, y: _laForPinch.y,
    _isLineLayer: _laForPinch === _edLineLayer && !la, // es la LineLayer en construcción
    _linePoints: _laForPinch.type==='line' ? _laForPinch.points.map(p=>p?({...p}):null) : null,
    _subPaths: _laForPinch.type==='line' && _laForPinch.subPaths && _laForPinch.subPaths.length ? _laForPinch.subPaths.map(sp=>{const _s=sp.map(p=>({...p})); if(sp.cornerRadii)_s.cornerRadii={...sp.cornerRadii}; return _s;}) : null,
    // Snapshot de posiciones de todos los objetos de la sesión de fusión
    _fusionSnaps: (_laForPinch === _edLineLayer && !la && _edLineFusionId) ? (() => {
      const m = new Map();
      edLayers.forEach(l=>{ if(l.type==='line'&&l._fusionId===_edLineFusionId) m.set(l,{x:l.x,y:l.y}); });
      return m;
    })() : null
  } : null;
  // En modo draw, el pinch mueve la cámara (no el dibujo)
  _edDrawPinch = null;
  // Snapshot multiselección (tiene prioridad sobre objeto individual)
  if(edActiveTool === 'multiselect' && edMultiSel.length && edMultiBbox){
    edPinchScale0 = null; // no usar modo objeto individual
    window._edPinchMulti = {
      items: edMultiSel.map(i=>({
        i,
        rot:  edLayers[i].rotation||0,
        x:    edLayers[i].x,
        y:    edLayers[i].y,
        w:    edLayers[i].width,
        h:    edLayers[i].height,
        _linePoints: edLayers[i].type==='line' ? edLayers[i].points.map(p=>p?({...p}):null) : null,
        _subPaths: edLayers[i].type==='line' && edLayers[i].subPaths && edLayers[i].subPaths.length ? edLayers[i].subPaths.map(sp=>{const _s=sp.map(p=>({...p})); if(sp.cornerRadii)_s.cornerRadii={...sp.cornerRadii}; return _s;}) : null,
      })),
      groupRot: edMultiGroupRot,
      bbox: { ...edMultiBbox },
    };
  } else {
    window._edPinchMulti = null;
  }
  return true;
}
function edPinchMove(e) {
  if (!edPinching || !window._edActivePointers || window._edActivePointers.size < 2) return;
  const dist   = _pinchDist(window._edActivePointers);
  const angle  = _pinchAngle(window._edActivePointers);
  const ctr    = _pinchCenter(window._edActivePointers);
  const ratio  = dist / Math.max(edPinchDist0, 1);
  const dAngle = (angle - edPinchAngle0) * 180 / Math.PI;

  if (window._edPinchMulti) {
    // ── Modo multi-selección: escalar y rotar el grupo ──
    const pm = window._edPinchMulti;
    const pw = edPageW(), ph = edPageH();
    // Centro del bbox como pivote (en fracciones de página)
    const pivX = pm.bbox.cx, pivY = pm.bbox.cy;
    const dRad = dAngle * Math.PI / 180;
    for(const snap of pm.items){
      const la = edLayers[snap.i]; if(!la) continue;
      // Escalar tamaño
      la.width  = Math.min(Math.max(snap.w * ratio, 0.04), 2.0);
      la.height = Math.min(Math.max(snap.h * ratio, 0.04), 2.0);
      // LineLayer: escalar también los puntos internos
      if(la.type === 'line' && snap._linePoints){
        const sw = la.width  / snap.w;
        const sh = la.height / snap.h;
        la.points = snap._linePoints.map(p => p ? ({x: p.x * sw, y: p.y * sh}) : null);
      }
      // Escalar Y rotar posición alrededor del pivote (en px para no distorsionar)
      const dxPx = (snap.x - pivX) * pw;
      const dyPx = (snap.y - pivY) * ph;
      const cos = Math.cos(dRad), sin = Math.sin(dRad);
      // Primero escalar, luego rotar
      la.x = pivX + (dxPx * ratio * cos - dyPx * ratio * sin) / pw;
      la.y = pivY + (dxPx * ratio * sin + dyPx * ratio * cos) / ph;
      // Rotar orientación del objeto
      la.rotation = snap.rot + dAngle;
    }
    // Actualizar rotación del grupo y bbox
    edMultiGroupRot = pm.groupRot + dAngle;
    // Actualizar edMultiBbox dimensiones escaladas
    edMultiBbox.w  = pm.bbox.w * ratio;
    edMultiBbox.h  = pm.bbox.h * ratio;
    edRedraw();
  } else if (edPinchScale0) {
    // ── Modo objeto individual: escalar y rotar el layer seleccionado ──
    // T1: puede ser _edLineLayer (en construcción) o un objeto seleccionado
    const la = edPinchScale0._isLineLayer ? _edLineLayer : (edSelectedIdx >= 0 ? edLayers[edSelectedIdx] : null);
    if (la) {
      const newW = Math.min(Math.max(edPinchScale0.w * ratio, 0.04), 2.0);
      const newH = newW * (edPinchScale0.h / Math.max(edPinchScale0.w, 0.01));
      la.width  = newW;
      la.height = newH;
      la.rotation = edPinchScale0.rot + dAngle;
      // Pan: mover el objeto con el centro del pinch
      if(edPinchScale0._isLineLayer){
        // Convertir desplazamiento de pantalla a coordenadas normalizadas de página
        // usando el mismo método que edCoords (resta el top del canvas)
        const pw=edPageW(), ph=edPageH();
        const z=edPinchCamera0.z;
        const canvasTop = _edCanvasTop;
        const dxScreen = ctr.x - edPinchCenter0.x;
        const dyScreen = (ctr.y - canvasTop) - (edPinchCenter0.y - canvasTop);
        const dxNorm = dxScreen / (pw * z);
        const dyNorm = dyScreen / (ph * z);
        la.x = edPinchScale0.x + dxNorm;
        la.y = edPinchScale0.y + dyNorm;
        // Mover también todos los objetos de la misma sesión de fusión
        if(_edLineFusionId){
          edLayers.forEach(l=>{
            if(l!==la && l.type==='line' && l._fusionId===_edLineFusionId){
              const snap=edPinchScale0._fusionSnaps&&edPinchScale0._fusionSnaps.get(l);
              if(snap){ l.x=snap.x+dxNorm; l.y=snap.y+dyNorm; }
            }
          });
        }
      }
      // LineLayer: escalar también los puntos internos
      if (la.type === 'line' && edPinchScale0._linePoints) {
        const sw = newW / edPinchScale0.w;
        const sh = newH / edPinchScale0.h;
        la.points = edPinchScale0._linePoints.map(p => p ? ({x: p.x * sw, y: p.y * sh}) : null);
        // Escalar subPaths (T1)
        if(edPinchScale0._subPaths) la.subPaths = edPinchScale0._subPaths.map(sp=>sp.map(p=>({x:p.x*sw, y:p.y*sh})));
      }
      edRedraw();
    }
  } else {
    // ── Modo cámara: pan + zoom ──
    // En modo recorte el pinch siempre mueve la cámara (el layer está seleccionado pero no debe escalar)
    const _haySeleccion = !_edCropMode && ((edActiveTool==='multiselect' && edMultiSel.length) || edSelectedIdx >= 0 || !!_edLineLayer);
    if(_haySeleccion) return; // con selección activa, el pinch no mueve la cámara
    const newZ = Math.min(Math.max(edPinchCamera0.z * ratio, 0.05), 8);
    edCamera.x = ctr.x - (edPinchCenter0.x - edPinchCamera0.x) / edPinchCamera0.z * newZ;
    edCamera.y = ctr.y - (edPinchCenter0.y - edPinchCamera0.y) / edPinchCamera0.z * newZ;
    edCamera.z = newZ;
    edRedraw();
  }
}
function edPinchEnd() {
  if(window._edPinchMulti && edMultiSel.length){
    // Recalcular bbox tras el gesto de grupo
    _msRecalcBbox();
    if(window._edMoved) edPushHistory();
    window._edPinchMulti = null;
  }
  // _edDrawPinch ya no se usa (pinch en modo draw mueve la cámara)
  _edDrawPinch = null;
  edPinching    = false;
  edPinchDist0  = 0;
  edPinchScale0 = null;
  edPinchCenter0 = null;
  edPinchCamera0 = null;
  // Al soltar los dedos en modo draw, reactivar la herramienta de dibujo
  if(['draw','eraser'].includes(edActiveTool)){
    edPainting = false;
  }
}

function _edDrawApplyPinchTransform(dl, dp){
  // Aplica la transformación (translate + scale desde el centro del pinch) al _canvas del DrawLayer.
  // Patrón estándar: copiar snapshot transformado sobre un canvas limpio.
  const tmp = document.createElement('canvas');
  tmp.width  = ED_CANVAS_W;
  tmp.height = ED_CANVAS_H;
  const ctx = tmp.getContext('2d');
  // Punto de pivote = centro del pinch en workspace
  const px = dp.wsCenterX, py = dp.wsCenterY;
  ctx.save();
  ctx.translate(px + dp.tx, py + dp.ty);
  ctx.scale(dp.scale, dp.scale);
  ctx.translate(-px, -py);
  ctx.drawImage(dp.snap, 0, 0);
  ctx.restore();
  // Reemplazar el contenido del DrawLayer
  dl.clear();
  dl._ctx.drawImage(tmp, 0, 0);
  // Guardar en historial de dibujo
  edSaveDrawData();
  edRedraw();
}


/* ══════════════════════════════════════════
   ICONO ⚙ SOBRE OBJETO SELECCIONADO
   Permanente mientras el objeto está seleccionado.
   Centro del círculo = centro de la línea superior del marco.
   Se mueve con el objeto en tiempo real.
   ══════════════════════════════════════════ */

function _edGearPos(la){
  // Workspace coords del centro-superior del objeto
  const pw=edPageW(), ph=edPageH();
  const wx = edMarginX() + la.x * pw;
  const wy = edMarginY() + (la.y - la.height/2) * ph;
  // Convertir workspace → screen con la cámara
  const s = edWorldToScreen(wx, wy);
  return { cx: s.x, ty: s.y + _edCanvasTop };
}

// Gear icon eliminado — se usa doble toque / long press

function edHideGearIcon(){ const b=document.getElementById('edGearIcon');if(b)b.remove(); }
function edHideContextMenu(){}


/* ══════════════════════════════════════════
   SCROLLBARS VIRTUALES
   Dibujadas sobre el canvas en coordenadas de pantalla.
   Solo aparecen cuando el lienzo no cabe entero en el viewport.
   ══════════════════════════════════════════ */
const _edSB = { needH: false, needV: false };

function _edScrollbarsUpdate(){
  if(!edCanvas) return;
  const { h, v } = edNeedsScroll();
  _edSB.needH = h;
  _edSB.needV = v;
  _edScrollbarsDraw();
}

function _edScrollbarsDraw(){
  // Barras de navegación HTML — solo PC (no táctil)
  if(window._edIsTouch){ _edHideHTMLScrollbars(); return; }
  if(!edCanvas) return;
  const W = edCanvas.width, H = edCanvas.height;

  const hBar   = document.getElementById('ed-hscroll');
  const hThumb = document.getElementById('ed-hscroll-thumb');
  const vBar   = document.getElementById('ed-vscroll');
  const vThumb = document.getElementById('ed-vscroll-thumb');
  if(!hBar || !vBar) return;

  // Siempre visibles en PC
  hBar.style.display = 'block';
  vBar.style.display = 'block';

  // Espacio navegable: workspace escalado + margen = 40% del canvas en cada lado
  // Esto permite hacer pan más allá de los bordes del workspace a cualquier zoom.
  const MARGIN_RATIO = 0.4;
  const wsW = ED_CANVAS_W * edCamera.z;
  const wsH = ED_CANVAS_H * edCamera.z;
  const marginX = W * MARGIN_RATIO;
  const marginY = H * MARGIN_RATIO;
  // Espacio total navegable en px de pantalla
  const totalNavW = wsW + marginX * 2;
  const totalNavH = wsH + marginY * 2;
  // Posición actual del borde izquierdo/superior del canvas en el espacio navegable
  // camera.x = desplazamiento del workspace respecto al canvas → workspace empieza en camera.x
  // En el espacio navegable, el origen del workspace está en marginX
  // posNav = marginX - camera.x  (cuánto del espacio navegable está a la izquierda del viewport)
  const posNavX = marginX - edCamera.x;
  const posNavY = marginY - edCamera.y;

  const trackW = W - 12; // 12px para la barra vertical
  const trackH = H - 12; // 12px para la barra horizontal

  if(hThumb && totalNavW > 0){
    const ratio  = Math.min(1, W / totalNavW);
    const thumbW = Math.max(20, trackW * ratio);
    const maxPos = Math.max(0, totalNavW - W);
    const frac   = maxPos > 0 ? Math.max(0, Math.min(1, posNavX / maxPos)) : 0;
    hThumb.style.left  = (frac * (trackW - thumbW)) + 'px';
    hThumb.style.width = thumbW + 'px';
  }

  if(vThumb && totalNavH > 0){
    const ratio  = Math.min(1, H / totalNavH);
    const thumbH = Math.max(20, trackH * ratio);
    const maxPos = Math.max(0, totalNavH - H);
    const frac   = maxPos > 0 ? Math.max(0, Math.min(1, posNavY / maxPos)) : 0;
    vThumb.style.top    = (frac * (trackH - thumbH)) + 'px';
    vThumb.style.height = thumbH + 'px';
  }
}

function _edHideHTMLScrollbars(){
  const h = document.getElementById('ed-hscroll');
  const v = document.getElementById('ed-vscroll');
  if(h) h.style.display = 'none';
  if(v) v.style.display = 'none';
}

function _edInitHTMLScrollbars(){
  if(window._edIsTouch) return;
  let _sbAxis = null, _sbDragStart = 0, _sbCamStart = 0;

  const MARGIN_RATIO_SB = 0.4;
  function getMetrics(axis){
    if(!edCanvas) return null;
    const W = edCanvas.width, H = edCanvas.height;
    const wsW = ED_CANVAS_W * edCamera.z;
    const wsH = ED_CANVAS_H * edCamera.z;
    if(axis === 'h'){
      const marginX   = W * MARGIN_RATIO_SB;
      const totalNavW = wsW + marginX * 2;
      const trackW    = W - 12;
      const thumbW    = Math.max(20, trackW * Math.min(1, W / totalNavW));
      const maxPos    = Math.max(0, totalNavW - W);
      // camVal: posición actual en el espacio navegable (cuánto scroll hay aplicado)
      const camVal    = marginX - edCamera.x;
      return { trackLen: trackW, thumbLen: thumbW, maxScroll: maxPos, camVal, marginX };
    } else {
      const marginY   = H * MARGIN_RATIO_SB;
      const totalNavH = wsH + marginY * 2;
      const trackH    = H - 12;
      const thumbH    = Math.max(20, trackH * Math.min(1, H / totalNavH));
      const maxPos    = Math.max(0, totalNavH - H);
      const camVal    = marginY - edCamera.y;
      return { trackLen: trackH, thumbLen: thumbH, maxScroll: maxPos, camVal, marginY };
    }
  }

  function applyScroll(axis, val){
    const m = getMetrics(axis);
    if(!m) return;
    const clamped = Math.max(0, Math.min(m.maxScroll, val));
    // Convertir posición navegable → camera
    if(axis === 'h') edCamera.x = (m.marginX !== undefined ? m.marginX : 0) - clamped;
    else             edCamera.y = (m.marginY !== undefined ? m.marginY : 0) - clamped;
    edRedraw();
  }

  ['h','v'].forEach(axis => {
    const bar   = document.getElementById('ed-' + axis + 'scroll');
    const thumb = document.getElementById('ed-' + axis + 'scroll-thumb');
    if(!bar || !thumb) return;

    // Drag del thumb
    thumb.addEventListener('pointerdown', e => {
      e.stopPropagation();
      _sbAxis = axis;
      _sbDragStart = axis === 'h' ? e.clientX : e.clientY;
      const m = getMetrics(axis);
      _sbCamStart = m ? m.camVal : 0;
      thumb.setPointerCapture(e.pointerId);
      thumb.style.cursor = 'grabbing';
      e.preventDefault();
    });
    thumb.addEventListener('pointermove', e => {
      if(_sbAxis !== axis) return;
      const delta = (axis === 'h' ? e.clientX : e.clientY) - _sbDragStart;
      const m = getMetrics(axis);
      if(!m || m.trackLen <= m.thumbLen) return;
      applyScroll(axis, _sbCamStart + delta * (m.maxScroll / (m.trackLen - m.thumbLen)));
    });
    thumb.addEventListener('pointerup', () => { _sbAxis = null; thumb.style.cursor = 'grab'; });
    thumb.addEventListener('pointercancel', () => { _sbAxis = null; thumb.style.cursor = 'grab'; });

    // Clic en la pista → saltar a esa posición
    bar.addEventListener('pointerdown', e => {
      if(e.target === thumb) return;
      e.stopPropagation();
      const rect = bar.getBoundingClientRect();
      const clickPos = axis === 'h' ? e.clientX - rect.left : e.clientY - rect.top;
      const m = getMetrics(axis);
      if(!m) return;
      const frac = Math.max(0, Math.min(1, (clickPos - m.thumbLen / 2) / (m.trackLen - m.thumbLen)));
      applyScroll(axis, frac * m.maxScroll);
    });
  });
}

function _edRoundRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y); ctx.arcTo(x+w, y, x+w, y+r, r);
  ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
  ctx.lineTo(x+r, y+h); ctx.arcTo(x, y+h, x, y+h-r, r);
  ctx.lineTo(x, y+r); ctx.arcTo(x, y, x+r, y, r);
  ctx.closePath();
}

function _edHandleDoubleTap(idx){
  const la = edLayers[idx];
  if(la && la.type === 'draw'){
    // DrawLayer bloqueado: abrir panel draw para que el botón lock sea accesible
    edSelectedIdx = idx;
    edActiveTool = 'draw';
    edCanvas.className = 'tool-draw';
    const cur=$('edBrushCursor');if(cur)cur.style.display='block';
    _edDrawInitHistory();
    _edDrawLockUI();
    edRenderOptionsPanel('draw');
    edRedraw();
    return;
  }
  if(la && la.type === 'stroke'){
    const page=edPages[edCurrentPage]; if(!page) return;
    // Guardar estado global con el StrokeLayer antes de convertirlo a DrawLayer.
    // Así al deshacer desde el historial global se recupera el StrokeLayer.
    edPushHistory();
    const dl=la.toDrawLayer();
    if(la.locked) dl.locked = true; // propagar bloqueo al convertir
    // T9: Quitar stroke e insertar DrawLayer en la MISMA posición (preservar orden de capas)
    page.layers.splice(idx, 1, dl);  // reemplaza en sitio
    edLayers=page.layers;
    edSelectedIdx=-1;
    edActiveTool='draw';
    edCanvas.className='tool-draw';
    const cur=$('edBrushCursor');if(cur)cur.style.display='block';
    _edDrawInitHistory();
    _edDrawLockUI();
    edRenderOptionsPanel('draw');
    edRedraw();
  } else if(la && la.type === 'shape' && la._fusionId) {
    // Shape con _fusionId (rect en sesión de fusión) → panel line
    edSelectedIdx = idx;
    edActiveTool='select'; edCanvas.className='';
    _edLineType = 'select';
    edDrawColor = la.color || '#000000';
    edDrawSize  = la.lineWidth || 3;
    _edActivateLineTool(true);
  } else if(la && la.type === 'shape') {
    edSelectedIdx = idx;
    edActiveTool='select'; edCanvas.className='';
    _edShapeType = 'select';
    edDrawColor  = la.color || '#000000';
    edDrawSize   = la.lineWidth || 3;
    _edActivateShapeTool(true);
  } else if(la && la.type === 'line') {
    edSelectedIdx = idx;
    edActiveTool='select'; edCanvas.className='';
    _edLineType = 'select';
    edDrawColor = la.color || '#000000';
    edDrawSize  = la.lineWidth || 3;
    _edActivateLineTool(false); // re-editar objeto existente: isNew=false para no borrar historial
  } else if (la && la.type === 'gif') {
    // GifLayer importado: abrir editor GIF
    edSelectedIdx = idx;
    edRedraw();
    gcpOpen(idx);
  } else if (la && la.type === 'image' && (la._isGcpImage || la._gcpLayersData || la._pngFrames)) {
    // ImageLayer de animación: abrir editor GIF para re-editar
    edSelectedIdx = idx;
    edRedraw();
    gcpOpen(idx);
  } else {
    // image, text, bubble y cualquier otro tipo
    edSelectedIdx = idx;
    _edDrawLockUI(); _edPropsOverlayShow();
    edRenderOptionsPanel('props');
  }
}

/* Comprobar que los 4 vértices del objeto están dentro del rectángulo de rubber band */
function _edAllCornersInside(la, rx0, ry0, rx1, ry1){
  const hw = la.width/2, hh = la.height/2;
  const rot = (la.rotation||0)*Math.PI/180;
  const pw = edPageW(), ph = edPageH();
  const corners = [[-hw,-hh],[hw,-hh],[-hw,hh],[hw,hh]];
  return corners.every(([dx,dy])=>{
    const rx=dx*pw, ry=dy*ph;
    const wx = la.x + (rx*Math.cos(rot)-ry*Math.sin(rot))/pw;
    const wy = la.y + (rx*Math.sin(rot)+ry*Math.cos(rot))/ph;
    return wx>=rx0 && wx<=rx1 && wy>=ry0 && wy<=ry1;
  });
}

// ── Hit test para doble tap en líneas vectoriales ──
// Devuelve {type:'node', idx} si el punto (nx,ny) cae sobre el nodo idx
// Devuelve {type:'seg',  idx} si cae sobre el segmento idx→idx+1
// Devuelve null si no hay hit
// nx, ny: coordenadas normalizadas de página (fracción 0..1)
function _edLineHitTest(la, nx, ny, isTouch, hitSegOverride){
  if(!la || la.type!=='line' || la.points.length < 2) return null;
  const pw=edPageW(), ph=edPageH(), z=edCamera.z;
  const rot=(la.rotation||0)*Math.PI/180;
  const cos=Math.cos(rot), sin=Math.sin(rot);
  const n=la.points.length;
  const cr=la.cornerRadii||{};
  const hitNode = isTouch ? 28 : 18;   // radio hit nodo en píxeles de pantalla
  const hitSeg  = hitSegOverride !== undefined ? hitSegOverride
                : (isTouch ? 18 : 10); // distancia hit segmento en píxeles de pantalla

  // ── Posición visual de cada nodo (igual que _handlePos en edOnStart) ──
  const nodePos=(i)=>{
    const p=la.points[i]; if(!p) return {ax:Infinity,ay:Infinity};
    const r=cr[i]||0;
    let lpx=p.x*pw, lpy=p.y*ph;
    if(r>0){
      const prev=la.points[(i-1+n)%n], cur=la.points[i], next=la.points[(i+1)%n];
      const d1=Math.hypot((cur.x-prev.x)*pw,(cur.y-prev.y)*ph);
      const d2=Math.hypot((next.x-cur.x)*pw,(next.y-cur.y)*ph);
      const rr=Math.max(0,Math.min(r,Math.min(d1/2,d2/2)));
      const v1x=d1>0?(cur.x-prev.x)*pw/d1:0, v1y=d1>0?(cur.y-prev.y)*ph/d1:0;
      const v2x=d2>0?(next.x-cur.x)*pw/d2:0, v2y=d2>0?(next.y-cur.y)*ph/d2:0;
      const p1x=cur.x*pw-v1x*rr, p1y=cur.y*ph-v1y*rr;
      const p2x=cur.x*pw+v2x*rr, p2y=cur.y*ph+v2y*rr;
      lpx=(p1x+2*cur.x*pw+p2x)/4;
      lpy=(p1y+2*cur.y*ph+p2y)/4;
    }
    return {
      ax: la.x+(lpx*cos-lpy*sin)/pw,
      ay: la.y+(lpx*sin+lpy*cos)/ph
    };
  };

  // 1. Comprobar nodos — devolver el MÁS CERCANO dentro del radio
  let _bestNodeDist = hitNode, _bestNodeIdx = -1;
  for(let i=0;i<n;i++){
    if(!la.points[i]) continue;
    const {ax,ay}=nodePos(i);
    const _d=Math.hypot((nx-ax)*pw,(ny-ay)*ph)*z;
    if(_d < _bestNodeDist){ _bestNodeDist=_d; _bestNodeIdx=i; }
  }
  if(_bestNodeIdx >= 0) return {type:'node', idx:_bestNodeIdx};

  // 2. Comprobar segmentos — saltar null y no cruzar fronteras de contorno
  const absP=la.absPoints();
  const segCount = la.closed ? n : n-1;
  for(let i=0;i<segCount;i++){
    const j=(i+1)%n;
    // No conectar a través de separadores null
    if(!la.points[i] || !la.points[j]) continue;
    const ax=absP[i].x, ay=absP[i].y;
    const bx=absP[j].x, by=absP[j].y;
    // Vectores en píxeles de página (sin cámara, para la distancia)
    const abxPx=(bx-ax)*pw, abyPx=(by-ay)*ph;
    const apxPx=(nx-ax)*pw, apyPx=(ny-ay)*ph;
    const abLen2=abxPx*abxPx+abyPx*abyPx;
    if(abLen2 < 0.001) continue; // segmento degenerado
    // Parámetro t de la proyección del punto sobre el segmento [0,1]
    const t=Math.max(0,Math.min(1,(apxPx*abxPx+apyPx*abyPx)/abLen2));
    // Punto más cercano del segmento al toque
    const closestX=apxPx-t*abxPx;
    const closestY=apyPx-t*abyPx;
    const dist=Math.hypot(closestX,closestY)*z;
    if(dist < hitSeg){
      return {type:'seg', idx:i};
    }
  }

  // 3. Comprobar subPaths (T1): nodos y segmentos en coordenadas locales del objeto
  if(la.subPaths && la.subPaths.length){
    // Helper: pasar punto local (normalizado) a abs
    const localToAbs = (lx, ly) => {
      const lpx=lx*pw, lpy=ly*ph;
      return { x: la.x+(lpx*cos-lpy*sin)/pw, y: la.y+(lpx*sin+lpy*cos)/ph };
    };
    for(let si=0; si<la.subPaths.length; si++){
      const sp=la.subPaths[si];
      if(!sp||sp.length<2) continue;
      const ns=sp.length;
      // Nodos del subPath
      for(let i=0;i<ns;i++){
        const {x:ax,y:ay}=localToAbs(sp[i].x, sp[i].y);
        if(Math.hypot((nx-ax)*pw,(ny-ay)*ph)*z < hitNode){
          return {type:'node', subPath:si, idx:i};
        }
      }
      // Segmentos del subPath (siempre cerrado)
      for(let i=0;i<ns;i++){
        const j=(i+1)%ns;
        const {x:ax,y:ay}=localToAbs(sp[i].x,sp[i].y);
        const {x:bx,y:by}=localToAbs(sp[j].x,sp[j].y);
        const abxPx=(bx-ax)*pw, abyPx=(by-ay)*ph;
        const apxPx=(nx-ax)*pw, apyPx=(ny-ay)*ph;
        const abLen2=abxPx*abxPx+abyPx*abyPx;
        if(abLen2<0.001) continue;
        const t=Math.max(0,Math.min(1,(apxPx*abxPx+apyPx*abyPx)/abLen2));
        const dist=Math.hypot(apxPx-t*abxPx, apyPx-t*abyPx)*z;
        if(dist<hitSeg){
          return {type:'seg', subPath:si, idx:i};
        }
      }
    }
  }

  return null;
}

function edOnStart(e){
  // Ignorar toque inmediatamente tras cerrar panel vectorial por undo
  if(window._edIgnoreNextTap){ window._edIgnoreNextTap=false; return; }
  // ── REGLAS: prioridad máxima — siempre antes de cualquier bloqueo de UI ──
  // (Las guías deben funcionar aunque draw-active esté activo o el panel props
  //  esté abierto. Igual que el borde del lienzo: siempre por encima de todo.)
  // ── REGLAS: si hay modo mover activo desde el panel, absorber el primer toque ──
  if(_edRuleDrag && _edRuleDrag.part === 'line' && _edRuleDrag.offX === undefined) {
    // El movimiento real empieza en edOnMove; aquí solo bloqueamos selección de objetos
    return;
  }

  // ── REGLAS: hit-test sobre arrastradores y líneas ──
  if(edRules.length || window._edRuleMoveReady) {
    const _rc = edCoords(e);
    // Modo "mover regla" activo tras pulsar "Mover" en el panel
    if(window._edRuleMoveReady) {
      const rid = window._edRuleMoveReady;
      const _rmv = edRules.find(r => r.id === rid);
      if(_rmv) {
        window._edRuleMoveReady = null;
        _edRuleDrag = {
          ruleId: rid, part: 'line',
          offX: _rc.px - _rmv.x1, offY: _rc.py - _rmv.y1,
          dx: _rmv.x2 - _rmv.x1,  dy:  _rmv.y2 - _rmv.y1
        };
        edRedraw(); return;
      }
      window._edRuleMoveReady = null;
    }
    const _rHit = _edRulesHit(_rc.px, _rc.py, e.pointerType === 'touch');
    if(_rHit) {
      e.stopPropagation();
      // ── Hit sobre nodo compartido ──
      if(_rHit.nodeId !== undefined) {
        const _n = edRuleNodes.find(n => n.id === _rHit.nodeId); if(!_n) return;
        const _now2 = Date.now();
        const _isDouble2 = (e.detail >= 2) ||
          (window._edNodeLastTap && (_now2 - window._edNodeLastTap < 350) &&
           window._edNodeLastTapId === _rHit.nodeId);
        if(_isDouble2) {
          window._edNodeLastTap = 0; clearTimeout(window._edNodeTapTimer);
          _edRulesNodePanel(_n); return;
        }
        window._edNodeLastTap = _now2; window._edNodeLastTapId = _rHit.nodeId;
        clearTimeout(window._edNodeTapTimer);
        window._edNodeTapTimer = setTimeout(() => {
          window._edNodeLastTap = 0; window._edNodeTapTimer = null;
          if(_n.locked) return; // nodo bloqueado: no iniciar drag
          _edRuleDrag = { nodeId: _n.id, offX: _rc.px - _n.x, offY: _rc.py - _n.y };
          edRedraw();
        }, 300);
        return;
      }
      const _r = edRules.find(r => r.id === _rHit.ruleId);
      if(!_r) return;

      const _isHandleHit = _rHit.part === 'a' || _rHit.part === 'b';

      if(_isHandleHit) {
        const _now = Date.now();
        const _isDouble = (e.detail >= 2) ||
          (window._edRuleLastTap && (_now - window._edRuleLastTap < 350) &&
           window._edRuleLastTapId === _rHit.ruleId);

        if(_isDouble) {
          // Doble tap/clic confirmado → cancelar drag pendiente y abrir popover
          window._edRuleLastTap = 0;
          clearTimeout(window._edRuleTapTimer);
          window._edRuleTapTimer = null;
          _edRuleDrag = null;
          const _hitWx = _rHit.part === 'a' ? _r.x1 : _r.x2;
          const _hitWy = _rHit.part === 'a' ? _r.y1 : _r.y2;
          _edRulesOpenPanel(_rHit.ruleId, _rHit.part, _hitWx, _hitWy);
          return;
        }

        // Regla bloqueada: no iniciar drag (solo doble tap abre el panel)
        if(_r.locked) {
          window._edRuleLastTap = _now;
          window._edRuleLastTapId = _rHit.ruleId;
          return;
        }

        // Primer tap/clic: guardar timestamp y esperar 300ms antes de iniciar drag
        window._edRuleLastTap = _now;
        window._edRuleLastTapId = _rHit.ruleId;
        const _snapId = _rHit.ruleId, _snapPart = _rHit.part;
        const _snapOffX = _rc.px - _r.x1, _snapOffY = _rc.py - _r.y1;
        const _snapDx = _r.x2 - _r.x1, _snapDy = _r.y2 - _r.y1;
        clearTimeout(window._edRuleTapTimer);
        window._edRuleTapTimer = setTimeout(() => {
          window._edRuleLastTap = 0;
          window._edRuleTapTimer = null;
          _edRuleDrag = { ruleId: _snapId, part: _snapPart,
            offX: _snapOffX, offY: _snapOffY, dx: _snapDx, dy: _snapDy };
          edRedraw();
        }, 300);
        return;
      }

      // Línea: iniciar drag inmediatamente — solo si no está bloqueada
      if(_r.locked) return;
      _edRuleDrag = {
        ruleId: _rHit.ruleId, part: _rHit.part,
        offX: _rc.px - _r.x1, offY: _rc.py - _r.y1,
        dx: _r.x2 - _r.x1, dy: _r.y2 - _r.y1
      };
      edRedraw();
      return;
    }
  }

  

  // Ignorar clicks en elementos de UI (botones, menús, overlays, paneles)
  // Solo procesar si viene del canvas o de la zona de trabajo (editorShell)
  const tgt = e.target;
  // Ignorar si el click NO está dentro de editorShell (modales, header, etc.)
  if(!tgt.closest('#editorShell')) return;
  // Si la barra de menús está bloqueada (draw-active), ignorar clicks en su zona
  // aunque pointer-events:none haga que el target sea el elemento de debajo
  const _menuBar=$('edMenuBar');
  if(_menuBar && $('editorShell')?.classList.contains('draw-active')){
    const _mbr=_menuBar.getBoundingClientRect();
    if(e.clientX>=_mbr.left&&e.clientX<=_mbr.right&&e.clientY>=_mbr.top&&e.clientY<=_mbr.bottom) return;
  }
  // Ignorar elementos de UI dentro del editor
  const isUI = tgt.closest('#edMenuBar')      ||
               tgt.closest('#edTopbar')       ||
               tgt.closest('#edOptionsPanel') ||
               tgt.closest('.ed-fulloverlay') ||
               tgt.closest('.ed-dropdown')    ||
               tgt.closest('#edGearIcon')     ||
               tgt.closest('#edBrushCursor')  ||
               tgt.closest('.ed-float-btn')   ||
               tgt.closest('#edDrawBar')      ||
               tgt.closest('#edShapeBar')     ||
               tgt.closest('#edb-size-pop')   ||
               tgt.closest('#esb-slider-panel') ||
               tgt.closest('#edb-palette-pop') ||
               tgt.closest('#ed-hsl-picker')   ||
               tgt.closest('#editorViewer')   ||
               tgt.closest('#edProjectModal') ||
               tgt.closest('#edConfirmModal');
  if(isUI) return;

  // ── MODO RECORTE: interceptar todos los toques en el canvas ──
  if (_edCropMode) {
    if (e.pointerType === 'touch') {
      // Registrar el puntero ANTES de cualquier return para que el pinch funcione
      if(!window._edActivePointers) window._edActivePointers = new Map();
      window._edActivePointers.set(e.pointerId, {x: e.clientX, y: e.clientY});

      if (window._edActivePointers.size >= 2) {
        // Segundo dedo: cancelar timer de recorte y dejar pasar al pinch
        clearTimeout(window._edCropTouchTimer); window._edCropTouchTimer = null;
        // Caer al bloque de pinch más abajo — NO hacer return
      } else {
        // Primer dedo: esperar 120ms para detectar si llega segundo dedo
        const _eSavedCrop = e;
        window._edCropTouchMoved = false;
        clearTimeout(window._edCropTouchTimer);
        window._edCropTouchTimer = setTimeout(() => {
          window._edCropTouchTimer = null;
          if (!_edCropMode) return;
          if (window._edActivePointers && window._edActivePointers.size > 1) return;
          if (window._edCropTouchMoved) return;
          const _cc = edCoords(_eSavedCrop);
          const _nodeHit = _edCropHandleCanvasStart(_cc.nx, _cc.ny);
          if (_nodeHit) return;
          _edCropHandleCanvasTap(_cc.nx, _cc.ny);
        }, 120);
        return; // primer dedo espera — ya está registrado en _edActivePointers
      }
    } else {
      // PC/ratón: inmediato
      const _cc = edCoords(e);
      const _nodeHit = _edCropHandleCanvasStart(_cc.nx, _cc.ny);
      if (_nodeHit) return;
      if (_edCropHandleCanvasTap(_cc.nx, _cc.ny)) return;
    }
  }

  // ── MODO V⟺C: selección de vértice individual (barra flotante O submenú) ──
  if(_edCurveModeActive&&_edCurveModeActive()){
    const la=edSelectedIdx>=0?edLayers[edSelectedIdx]:null;
    if(la&&(la.type==='line'||la.type==='shape')){
      const c2=edCoords(e);
      const pw2=edPageW(),ph2=edPageH();
      const _vcTouch = e.pointerType==='touch';
      const _vcHitR = _vcTouch ? 28 : 18;
      // Intentar seleccionar vértice de línea
      if(la.type==='line'&&la.points.length>=2){
        const rot2=(la.rotation||0)*Math.PI/180;
        const cos2=Math.cos(rot2),sin2=Math.sin(rot2);
        for(let i=0;i<la.points.length;i++){
          const p=la.points[i]; if(!p) continue;
          const lpx=p.x*pw2,lpy=p.y*ph2;
          const ax2=la.x+(lpx*cos2-lpy*sin2)/pw2;
          const ay2=la.y+(lpx*sin2+lpy*cos2)/ph2;
          if(Math.hypot((c2.nx-ax2)*pw2,(c2.ny-ay2)*ph2)*edCamera.z<_vcHitR){
            window._edCurveVertIdx=i;
            if(!la.cornerRadii)la.cornerRadii={};
            const existing=la.cornerRadii[i]||0;
            window._edCurveRadius=existing;
            const _sl=$('esb-slider-input');
            if(_sl) _sl.value=existing;
            const _slP=$('op-line-curve-r'); if(_slP){_slP.value=existing;}
            const _slPn=$('op-line-curve-rnum'); if(_slPn){_slPn.value=existing;}
            edRedraw();
            edIsTailDragging=true; edTailPointType='linevertex'; edTailVoiceIdx=i;
            return;
          }
        }
      }
      // Intentar seleccionar vértice de rect (individual, igual que barra flotante)
      if(la.type==='shape'&&la.shape==='rect'){
        const rot2=(la.rotation||0)*Math.PI/180;
        const cos2=Math.cos(rot2),sin2=Math.sin(rot2);
        const hw=la.width*pw2/2,hh=la.height*ph2/2;
        const corners=[[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]];
        for(let ci2=0;ci2<4;ci2++){
          const[lx,ly]=corners[ci2];
          const ax2=(la.x*pw2+lx*cos2-ly*sin2)/pw2;
          const ay2=(la.y*ph2+lx*sin2+ly*cos2)/ph2;
          if(Math.hypot((c2.nx-ax2)*pw2,(c2.ny-ay2)*ph2)*edCamera.z<_vcHitR){
            window._edCurveVertIdx=ci2;
            if(!la.cornerRadii)la.cornerRadii=[0,0,0,0];
            const existing=la.cornerRadii[ci2]||0;
            window._edCurveRadius=existing;
            // Actualizar sliders (barra flotante Y submenú)
            const _sl2=$('esb-slider-input');
            if(_sl2) _sl2.value=existing;
            const _slP2=$('op-shape-curve-r'); if(_slP2){_slP2.value=existing;}
            const _slP2n=$('op-shape-curve-rnum'); if(_slP2n){_slP2n.value=existing;}
            edRedraw();return;
          }
        }
      }
    }
    // En modo curva: si no se tocó ningún vértice curvable, permitir drag normal
  }

  // No bloquear scroll en overlays (capas, hojas, etc.)
  if(e.cancelable && !e.target.closest('.ed-fulloverlay')){
    e.preventDefault();
  }
  _edTouchMoved = false; // resetear flag de movimiento
  edLastPointerIsTouch = (e.pointerType === 'touch'); // actualizar detección real de táctil
  // Rastrear pointers activos (para pinch con pointer events)
  // No registrar punteros que vienen de la UI de barras flotantes — evita falsos pinch
  if(!window._edActivePointers) window._edActivePointers = new Map();
  const _tgt = e.target;
  if(!_tgt.closest('#edDrawBar') && !_tgt.closest('#edShapeBar') &&
     !_tgt.closest('#edb-size-pop') && !_tgt.closest('#esb-slider-panel') &&
     !_tgt.closest('#edb-palette-pop') && !_tgt.closest('#ed-hsl-picker') &&
     !_tgt.closest('#edConfirmModal')){
    window._edActivePointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
  }
  // 2 dedos → iniciar pinch
  if(window._edActivePointers.size === 2){
    // Cancelar fill pendiente — era un pinch, no un toque simple
    if(window._edFillPending) window._edFillPending = null;
    // Cancelar timer de draw/eraser pendiente — era un pinch
    if(window._edDrawTouchTimer){ clearTimeout(window._edDrawTouchTimer); window._edDrawTouchTimer = null; }
    // Cancelar timer de recorte pendiente — era un pinch, no un tap
    if(window._edCropTouchTimer){ clearTimeout(window._edCropTouchTimer); window._edCropTouchTimer = null; }
    // Con multiselección activa: cancelar drag en curso y activar pinch de grupo
    if(edActiveTool==='multiselect' && edMultiSel.length){
      edMultiDragging=false; edMultiDragOffs=[];
      edMultiResizing=false; edMultiRotating=false;
    }
    // Si estaba pintando, cancelar el trazo parcial sin guardarlo
    // IMPORTANTE: edPinchStart necesita capturar el estado actual (trazo en curso incluido)
    // antes de que _edDrawApplyHistory lo revierta. edPinchStart se llama justo después.
    if(edPainting){
      edPainting = false;
      // Resetear _lastX/_lastY del DrawLayer para que el siguiente trazo
      // arranque limpio (evita el bug del "solo un punto" post-pinch).
      const _dlReset = edPages[edCurrentPage]?.layers.find(l => l.type==='draw');
      if(_dlReset){ _dlReset._lastX = 0; _dlReset._lastY = 0; }
    }
    // Cancelar el timer de añadir nodo si el segundo dedo llega antes de que expire
    clearTimeout(window._edLineTouchTimer);
    // Cancelar timer de recorte si había uno pendiente
    if(window._edCropTouchTimer){ clearTimeout(window._edCropTouchTimer); window._edCropTouchTimer = null; }
    // Cancelar drag de nodo de recorte si estaba activo
    if(_edCropMode && _edCropDragIdx >= 0){ _edCropDragIdx = -1; _edCropDragging = false; }
    // Sistema de pan para LineLayer (en construcción o seleccionado)
    const _panTarget = _edLineLayer ||
      (edSelectedIdx>=0 && edLayers[edSelectedIdx]?.type==='line' ? edLayers[edSelectedIdx] : null);
    if(_panTarget){
      const _pts2 = [...window._edActivePointers.values()];
      const _fusId = _panTarget._fusionId || _edLineFusionId;
      window._edLinePan = {
        cx0: (_pts2[0].x+_pts2[1].x)/2,
        cy0: (_pts2[0].y+_pts2[1].y)/2,
        lx0: _panTarget.x,
        ly0: _panTarget.y,
        target: _panTarget,
        fsnaps: (() => {
          const m = new Map();
          if(_fusId) edLayers.forEach(l=>{ if(l!==_panTarget && l.type==='line'&&l._fusionId===_fusId) m.set(l,{x:l.x,y:l.y}); });
          return m;
        })()
      };
      // También iniciar pinch para que el resize funcione
      edPinchStart(e);
      return;
    }
    edPinchStart(e);
    return;
  }
  if(window._edActivePointers.size > 1) return;
  // Cerrar menús si están abiertos (clic en canvas o zona de trabajo)
  if(edMenuOpen){ edCloseMenus(); }
  edHideContextMenu();

  // ── MULTI-SELECCIÓN ──────────────────────────────────────
  if(edActiveTool==='multiselect'){
    if(tgt!==edCanvas){
      // Clic fuera del canvas (UI, panel…)
      if(window._edGroupSilentTool !== undefined){
        // Modo grupo silencioso: restaurar sin tocar botón
        edActiveTool = window._edGroupSilentTool;
        delete window._edGroupSilentTool;
        edMultiSel=[]; edMultiBbox=null; edMultiGroupRot=0;
        edRedraw();
      } else if(edMultiSel.length){
        _edDeactivateMultiSel();
      }
      return;
    }
    const c=edCoords(e);
    const pw=edPageW(), ph=edPageH();

    if(edMultiSel.length){
      const bb = edMultiBbox;
      if(bb){
        const grRad = edMultiGroupRot * Math.PI / 180;
        // ── Hit handle rotación ──
        const _offWs = bb.h*ph/2 + 28/edCamera.z;
        const rotHx = bb.cx + Math.sin(grRad)*_offWs/pw;
        const rotHy = bb.cy - Math.cos(grRad)*_offWs/ph;
        if(Math.hypot((c.nx-rotHx)*pw, (c.ny-rotHy)*ph) < 14){
          // LOCK: solo rotar si hay miembros desbloqueados
          if(edMultiSel.every(i=>edLayers[i]?.locked)){ edRedraw(); return; }
          edMultiRotating=true;
          edMultiTransform={
            items: edMultiSel.map(i=>({i, rot:edLayers[i].rotation||0, x:edLayers[i].x, y:edLayers[i].y})),
            cx: bb.cx, cy: bb.cy,
            startAngle: Math.atan2(c.ny-bb.cy, c.nx-bb.cx),
            startGroupRot: edMultiGroupRot,
          };
          return;
        }
        // ── Hit handle escala ──
        const cg=Math.cos(-grRad), sg=Math.sin(-grRad);
        const dcxPx=(c.nx-bb.cx)*pw, dcyPx=(c.ny-bb.cy)*ph;
        const lxCur = bb.cx + (dcxPx*cg - dcyPx*sg)/pw;
        const lyCur = bb.cy + (dcxPx*sg + dcyPx*cg)/ph;
        for(const p of _msHandles(bb)){
          if(Math.hypot((lxCur-p.x)*pw, (lyCur-p.y)*ph) < 12){
            // LOCK: solo redimensionar si hay miembros desbloqueados
            if(edMultiSel.every(i=>edLayers[i]?.locked)){ edRedraw(); return; }
            edMultiResizing=true;
            edMultiTransform={
              items: edMultiSel.map(i=>{
                const _l=edLayers[i];
                const _cr = _l.cornerRadii
                  ? (Array.isArray(_l.cornerRadii) ? [..._l.cornerRadii] : {..._l.cornerRadii})
                  : null;
                return {i, x:_l.x, y:_l.y, w:_l.width, h:_l.height,
                  _linePoints: _l.type==='line' ? _l.points.map(p=>p?({...p}):null) : null,
                  _cornerRadii: _cr};
              }),
              bb: {cx:bb.cx, cy:bb.cy, w:bb.w, h:bb.h},
              corner: p.c,
              sx: lxCur, sy: lyCur,
              groupRot: edMultiGroupRot,
              _curSx: 1, _curSy: 1,
            };
            return;
          }
        }
        // ── Hit dentro del bbox → drag o doble tap ──
        const lxD=(dcxPx*cg - dcyPx*sg)/pw;
        const lyD=(dcxPx*sg + dcyPx*cg)/ph;
        if(Math.abs(lxD)<=bb.w/2 && Math.abs(lyD)<=bb.h/2){
          // Doble tap dentro del bbox en modo grupo silencioso → panel del grupo
          if(window._edGroupSilentTool !== undefined){
            const _now2 = Date.now();
            const _isDbl = _now2 - _edLastTapTime < 350;
            _edLastTapTime = _now2; _edLastTapIdx = -999; // centinela grupo
            if(_isDbl){
              // Encontrar el miembro más cercano al toque
              const _hit = edMultiSel.find(i => edLayers[i]?.contains(c.nx, c.ny)) ?? edMultiSel[0];
              edSelectedIdx = _hit ?? -1;
              edMultiSel = []; edMultiBbox = null;
              edActiveTool = window._edGroupSilentTool;
              delete window._edGroupSilentTool;
              _edDrawLockUI(); _edPropsOverlayShow();
              edRenderOptionsPanel('props');
              edRedraw();
              return;
            }
          }
          // LOCK: solo iniciar si hay miembros desbloqueados
          if(edMultiSel.every(i=>edLayers[i]?.locked)){ edRedraw(); return; }
          edMultiDragging=true;
          edMultiDragOffs=edMultiSel.map(i=>({dx:c.nx-edLayers[i].x, dy:c.ny-edLayers[i].y}));
          return;
        }
      }
    }
    // Nada tocado fuera del bbox
    if(window._edGroupSilentTool !== undefined){
      // Modo grupo silencioso: tocar fuera → deseleccionar y restaurar herramienta
      edActiveTool = window._edGroupSilentTool;
      delete window._edGroupSilentTool;
      edMultiSel=[]; edMultiBbox=null; edMultiGroupRot=0;
      edSelectedIdx = -1;
      edRedraw();
    } else if(e.shiftKey && e.pointerType !== 'touch'){
      // Shift+clic fuera del bbox en multiselect: buscar objeto y hacer toggle
      const _sfound = edLayers.map((_,i)=>i).reverse().find(i=>{
        const _la=edLayers[i]; return _la && !_la.type?.startsWith('_') && _la.contains && _la.contains(c.nx,c.ny);
      });
      if(_sfound !== undefined){
        const _si = edMultiSel.indexOf(_sfound);
        if(_si >= 0) edMultiSel.splice(_si, 1);
        else         edMultiSel.push(_sfound);
        if(edMultiSel.length >= 2){
          _msRecalcBbox();
          _edUpdateMultiSelPanel();
        } else if(edMultiSel.length === 1){
          edSelectedIdx = edMultiSel[0];
          edMultiSel = []; edMultiBbox = null;
          edActiveTool = 'select'; edCanvas.className = '';
          $('edMultiSelBtn')?.classList.remove('active');
          _edDrawLockUI(); _edPropsOverlayShow();
          edRenderOptionsPanel('props');
        } else {
          _msClear(); edActiveTool='select'; edCanvas.className='';
          $('edMultiSelBtn')?.classList.remove('active');
        }
      }
      edRedraw();
    } else {
      // Tocar en vacío fuera del bbox
      if(e.pointerType === 'touch'){
        // Táctil: mantener herramienta multiselect y comenzar nueva rubber band
        _msClear();
        edRubberBand={x0:c.nx,y0:c.ny,x1:c.nx,y1:c.ny};
      } else {
        // PC: deseleccionar y volver a modo select
        _msClear();
        edActiveTool = 'select'; edCanvas.className = '';
        // Si hay un objeto bajo el clic, seleccionarlo inmediatamente
        const _hit = edLayers.map((_,i)=>i).reverse().find(i => edLayers[i]?.contains && edLayers[i].contains(c.nx,c.ny));
        if(_hit !== undefined){
          edSelectedIdx = _hit;
          _edDrawLockUI(); _edPropsOverlayShow();
          edRenderOptionsPanel('props');
        } else {
          // Vacío real → iniciar rubber band
          edRubberBand={x0:c.nx,y0:c.ny,x1:c.nx,y1:c.ny};
        }
      }
      edRedraw();
    }
    return;
  }
  // ─────────────────────────────────────────────────────────

  if(edActiveTool === 'fill'){
    if(tgt !== edCanvas) return;
    // Si hay una shape o line seleccionada (modo barra flotante), aplicar fillColor directo
    if($('edDrawBar')?.classList.contains('visible') && edSelectedIdx >= 0){
      const _la = edLayers[edSelectedIdx];
      if(_la && (_la.type==='shape' || _la.type==='line')){
        _la.fillColor = edDrawColor;
        edPushHistory(); edRedraw();
        return;
      }
    }
    // En touch/pen: guardar coordenadas y esperar a pointerup para confirmar
    // que fue toque simple y no inicio de pinch
    if(e.pointerType === 'touch'){
      window._edFillPending = { nx: edCoords(e).nx, ny: edCoords(e).ny, pid: e.pointerId };
      if(e.pointerId !== undefined){ try{ edCanvas.setPointerCapture(e.pointerId); }catch(_){} }
      return;
    }
    // Mouse/pen: ejecutar inmediatamente
    const c = edCoords(e);
    edFloodFill(c.nx, c.ny);
    return;
  }
  // Color Erase: un toque = borrar zona del color tocado
  if(window._edColorEraseReady && edActiveTool === 'eraser'){
    if(tgt !== edCanvas) return;
    window._edColorEraseReady = false;
    edCanvas.style.cursor = '';
    const btn=$('op-color-erase-btn');
    if(btn) btn.style.background='transparent';
    const c = edCoords(e);
    edColorErase(c.nx, c.ny);
    return;
  }
  if(['draw','eraser'].includes(edActiveTool)){
    if(tgt !== edCanvas) return;
    // Comprobar lock del DrawLayer aquí también (además de en edStartPaint)
    const _dlLock = edPages[edCurrentPage]?.layers.find(l=>l.type==='draw');
    const _dpOpen = $('edOptionsPanel')?.classList.contains('open') && $('edOptionsPanel')?.dataset.mode==='draw';
    if(_dlLock && _dlLock.locked && !_dpOpen){ _edShowLockIconDraw(_dlLock); return; }
    // En táctil: retardo para detectar si viene segundo dedo (pinch/zoom)
    if(e.pointerType === 'touch'){
      const _eSaved = e;
      clearTimeout(window._edDrawTouchTimer);
      // ── Nuevo sistema cursor: timer 120ms para detectar segundo dedo (pinch) ──
      if(_cof.on){
        const _cofIsRed = (_cof.state==='red_ready'||_cof.state==='red_cool');
        if(_cofIsRed){
          // Estado rojo: disparar inmediatamente sin esperar segundo dedo
          _cofHandleTouch(_eSaved);
        } else {
          window._edDrawTouchTimer = setTimeout(() => {
            if(!window._edActivePointers || window._edActivePointers.size > 1) return;
            if(!['draw','eraser'].includes(edActiveTool)) return;
            _cofHandleTouch(_eSaved);
          }, 120);
        }
        return;
      }
      // ── Modo dibujo normal (sin cursor offset) ──
      window._edDrawTouchTimer = setTimeout(() => {
        if(!window._edActivePointers || window._edActivePointers.size > 1) return;
        if(!['draw','eraser'].includes(edActiveTool)) return;
        edStartPaint(_eSaved);
      }, 120);
      return;
    }
    // PC/ratón: inmediato — verificar buttons===1 (perfect-freehand pattern)
    // Con tabletas Wacom, algunos eventos pointerdown llegan con buttons=0 (hover spurio)
    if(e.buttons === 0 && e.pointerType === 'pen') return; // ignorar hover sin contacto
    edStartPaint(e);return;
  }
  if(edActiveTool==='shape'){
    if(tgt !== edCanvas) return;
    // Deseleccionar cualquier shape existente antes de crear una nueva
    edSelectedIdx = -1;
    const c=edCoords(e);
    _edShapeStart = {x:c.nx, y:c.ny};
    _edShapePreview = new ShapeLayer(_edShapeType, c.nx, c.ny, 0.01, 0.01);
    _edShapePreview.color     = edDrawColor || '#000000';
    _edShapePreview.fillColor = 'none'; // sin relleno durante construcción
    _edShapePreview.lineWidth = edDrawSize || 3;
    _edInsertLayerAbove(_edShapePreview);
    edRedraw();
    return;
  }
  if(edActiveTool==='line'){
    if(tgt !== edCanvas) return;
    const c=edCoords(e);
    // En táctil: comprobar primero si hay un nodo existente para doble-tap
    // Si el toque cae sobre un nodo, no usar timer — procesar inmediatamente
    if(e.pointerType === 'touch' && _edLineLayer && edSelectedIdx>=0 && edLayers[edSelectedIdx]===_edLineLayer){
      const _isT2 = true;
      // Comprobación anticipada del primer nodo con radio ampliado (táctil, polígono abierto)
      if(!_edLineLayer.closed && _edLineLayer.points.length >= 3){
        const _absF = _edLineLayer.absPoints()[0];
        const _pw0=edPageW(), _ph0=edPageH(), _z0=edCamera.z;
        const _df=Math.hypot((c.nx-_absF.x)*_pw0,(c.ny-_absF.y)*_ph0)*_z0;
        if(_df < 44){
          // Toque cerca del primer nodo → pasar a _edLineAddPoint con isTouch=true
          clearTimeout(window._edLineTouchTimer);
          window._edLineTouchTimer = setTimeout(()=>{
            if(!window._edActivePointers || window._edActivePointers.size > 1) return;
            if(edActiveTool !== 'line') return;
            _edLineAddPoint(c.nx, c.ny, true);
          }, 120);
          return;
        }
      }
      const _hitNode = _edLineHitTest(_edLineLayer, c.nx, c.ny, _isT2);
      if(_hitNode && _hitNode.type==='node'){
        // Si es el primer nodo y hay 3+ puntos → dejar pasar para cerrar el polígono
        if(_hitNode.idx === 0 && _edLineLayer.points.length >= 3){
          // No interceptar — _edLineAddPoint lo cerrará
        } else {
          // Toque sobre nodo existente (no primero) — registrar para doble tap
          const _hitId2 = _hitNode.idx;
          const _now3 = Date.now();
          const _sameHit2 = _edLastNodeTapIdx !== -1 && _edLastNodeTapIdx === _hitId2
            && (_now3 - _edLastNodeTapTime) < 400;
          if(_sameHit2){
            _edLastNodeTapTime=0; _edLastNodeTapIdx=-1;
            if(_edLineLayer.points.length > 2){
              _edLineLayer.points.splice(_hitNode.idx, 1);
              if(_edLineLayer.points.length) _edLineLayer._updateBbox();
              _edShapePushHistory(); edRedraw();
            }
            return;
          }
          _edLastNodeTapTime=_now3; _edLastNodeTapIdx=_hitId2;
          edIsTailDragging=true; edTailPointType='linevertex'; edTailVoiceIdx=_hitNode.idx;
          return;
        }
      }
    }
    // En táctil: retardo breve para detectar si viene un segundo dedo (pinch/zoom)
    if(e.pointerType === 'touch'){
      const _pid = e.pointerId;
      const _cx = c.nx, _cy = c.ny;
      clearTimeout(window._edLineTouchTimer);
      window._edLineTouchTimer = setTimeout(()=>{
        if(!window._edActivePointers || window._edActivePointers.size > 1) return;
        if(edActiveTool !== 'line') return;
        _edLineAddPoint(_cx, _cy, true);
      }, 120);
      return;
    }
    // PC/ratón: inmediato
    _edLineAddPoint(c.nx, c.ny, false);
    return;
  }
  const c=edCoords(e);
  // Cola bocadillo — solo cuando el panel de propiedades del bocadillo está abierto
  const _bubblePanelOpen = $('edOptionsPanel')?.classList.contains('open') &&
                           $('edOptionsPanel')?.dataset.mode === 'props';
  if(edSelectedIdx>=0 && edLayers[edSelectedIdx]?.type==='bubble' && _bubblePanelOpen){
    const la=edLayers[edSelectedIdx];
    // Helper: distancia en píxeles de pantalla entre punto normalizado y toque
    // Usa el mismo sistema que los handles de control (hitScreen táctil=28, PC=18)
    const _isTouch = e.pointerType === 'touch';
    const _hitR = _isTouch ? 28 : 18;
    const _pw0=edPageW(), _ph0=edPageH(), _z0=edCamera.z;
    const _nodeDist = (nx, ny, px, py) =>
      Math.hypot((nx-px)*_pw0, (ny-py)*_ph0) * _z0;

    // Handles cola pensamiento
    if(la.style==='thought' && la.tail){
      const bx=la.x+la.thoughtBig.x*la.width,   by=la.y+la.thoughtBig.y*la.height;
      const sx=la.x+la.thoughtSmall.x*la.width,  sy=la.y+la.thoughtSmall.y*la.height;
      if(_nodeDist(c.nx,c.ny,bx,by)<_hitR){edIsTailDragging=true;edTailPointType='thoughtBig';  return;}
      if(_nodeDist(c.nx,c.ny,sx,sy)<_hitR){edIsTailDragging=true;edTailPointType='thoughtSmall';return;}
    }
    for(const p of la.getTailControlPoints()){
      if(_nodeDist(c.nx,c.ny,p.x,p.y)<_hitR){edIsTailDragging=true;edTailPointType=p.type;edTailVoiceIdx=p.voice||0;return;}
    }
    // Vértices de explosión
    if(la.style==='explosion'){
      for(const p of la.getExplosionControlPoints()){
        if(_nodeDist(c.nx,c.ny,p.nx,p.ny)<_hitR){
          edIsTailDragging=true;edTailPointType='explosion';edTailVoiceIdx=p.idx;return;
        }
      }
    }
  }

  // Vértices de línea seleccionada — detección independiente del bubble
  if(edSelectedIdx>=0 && edLayers[edSelectedIdx]?.type==='line'){
    const la=edLayers[edSelectedIdx];
    // Para LineLayer rect: los handles ml/mr/mt/mb tienen prioridad sobre los nodos
    // (los nodos están en las esquinas, los handles en los centros de segmento)
    // Comprobar estos handles ANTES del hit-test de nodos para evitar conflicto
    if(la.closed && !la._fromEllipse && la.points.filter(Boolean).length===4
       && e.pointerType!=='touch'
       && ($('edOptionsPanel')?.dataset.mode==='line' || $('edShapeBar')?.classList.contains('visible'))){
      const _laForH = la;
      const _isT2 = false; // PC only
      const _hitR2 = 18; // mismo que handles PC
      const _pw2=edPageW(), _ph2=edPageH(), _z2=edCamera.z;
      const _rot2=(_laForH.rotation||0)*Math.PI/180;
      for(const hp of _laForH.getControlPoints()){
        if(hp.corner==='rotate') continue; // rotate se gestiona por el bloque de handles
        const _dpx=(c.nx-hp.x)*_pw2, _dpy=(c.ny-hp.y)*_ph2;
        const _dist=Math.hypot(_dpx,_dpy)*_z2;
        if(_dist < _hitR2){
          // Hit en handle ml/mr/mt/mb: iniciar resize igual que el bloque de handles
          if(_laForH.locked) break;
          if(typeof _edShapePushHistory==='function'){
            const _pm=$('edOptionsPanel')?.dataset.mode;
            if(_pm==='line'||_pm==='shape'||$('edShapeBar')?.classList.contains('visible'))
              _edShapePushHistory();
          }
          edIsResizing=true; edResizeCorner=hp.corner;
          const _rot0=(_laForH.rotation||0)*Math.PI/180;
          const _hw0=_laForH.width/2, _hh0=_laForH.height/2;
          const _anchorLocal2 = (corner) => {
            const ax = corner==='ml'?_hw0 : corner==='mr'?-_hw0 : 0;
            const ay = corner==='mt'?_hh0 : corner==='mb'?-_hh0 : 0;
            const rx=ax*_pw2, ry=ay*_ph2;
            return { x: _laForH.x+(rx*Math.cos(_rot0)-ry*Math.sin(_rot0))/_pw2,
                     y: _laForH.y+(rx*Math.sin(_rot0)+ry*Math.cos(_rot0))/_ph2 };
          };
          const _anch2 = _anchorLocal2(hp.corner);
          edInitialSize={width:_laForH.width,height:_laForH.height,
                         cx:_laForH.x, cy:_laForH.y, asp:_laForH.height/_laForH.width,
                         rot:(_laForH.rotation||0), ox:_laForH.x, oy:_laForH.y,
                         anchorX:_anch2.x, anchorY:_anch2.y};
          edInitialSize._linePoints=_laForH.points.map(pp=>pp?({...pp}):null);
          edInitialSize._subPaths=null;
          edInitialSize._cornerRadii=_laForH.cornerRadii?{..._laForH.cornerRadii}:null;
          if(e.pointerId!==undefined){ try{ edCanvas.setPointerCapture(e.pointerId); }catch(_){} }
          return;
        }
      }
    }
    if(la.points.length>=2 && !la._fromEllipse && ($('edOptionsPanel')?.dataset.mode==='line' || $('edShapeBar')?.classList.contains('visible'))){
      const rot=(la.rotation||0)*Math.PI/180;
      const cos=Math.cos(rot),sin=Math.sin(rot);
      const pw=edPageW(),ph=edPageH();
      const _n=la.points.length;
      const _cr=la.cornerRadii||{};
      // Función que calcula la posición visual del handle (igual que en edDrawSel)
      const _handlePos=(i)=>{
        const p=la.points[i];
        const r=_cr[i]||0;
        let lpx=p.x*pw,lpy=p.y*ph;
        if(r>0){
          const prev=la.points[(i-1+_n)%_n],cur=la.points[i],next=la.points[(i+1)%_n];
          const d1=Math.hypot((cur.x-prev.x)*pw,(cur.y-prev.y)*ph);
          const d2=Math.hypot((next.x-cur.x)*pw,(next.y-cur.y)*ph);
          const rr=Math.max(0,Math.min(r,Math.min(d1/2,d2/2)));
          const v1x=d1>0?(cur.x-prev.x)*pw/d1:0,v1y=d1>0?(cur.y-prev.y)*ph/d1:0;
          const v2x=d2>0?(next.x-cur.x)*pw/d2:0,v2y=d2>0?(next.y-cur.y)*ph/d2:0;
          const p1x=cur.x*pw-v1x*rr,p1y=cur.y*ph-v1y*rr;
          const p2x=cur.x*pw+v2x*rr,p2y=cur.y*ph+v2y*rr;
          lpx=(p1x+2*cur.x*pw+p2x)/4;
          lpy=(p1y+2*cur.y*ph+p2y)/4;
        }
        return {lpx,lpy};
      };
      // ── Doble tap sobre nodo/segmento ──
      // Arquitectura: _edLineHitTest detecta qué se tocó.
      // Primer tap: guardar candidato. Segundo tap (<400ms, mismo hit): ejecutar acción.
      const _isTouch2 = e.pointerType==='touch' || edLastPointerIsTouch;
      // Radio normal para doble-tap; para drag se amplía después si no hay hit
      const _lineHit = _edLineHitTest(la, c.nx, c.ny, _isTouch2);
      const _now2 = Date.now();
      if(_lineHit){
        // ID único para el hit: negativo para subPaths, positivo para path principal
        const _hitId = _lineHit.type==='node'
          ? _lineHit.idx : 1000+_lineHit.idx;
        const _sameHit = _edLastNodeTapIdx !== -1
          && _edLastNodeTapIdx === _hitId
          && (_now2 - _edLastNodeTapTime) < 400;
        if(_sameHit){
          // ── Doble tap confirmado ──
          _edLastNodeTapTime=0; _edLastNodeTapIdx=-1;
          if(_lineHit.type==='node'){
            // Eliminar nodo (mínimo 2 puntos)
            if(_n > 2){
              la.points.splice(_lineHit.idx,1);
              if(la.cornerRadii && Object.keys(la.cornerRadii).length){
                const newCR = {};
                for(const k in la.cornerRadii){
                  const ki = parseInt(k);
                  if(ki < _lineHit.idx) newCR[ki] = la.cornerRadii[k];
                  else if(ki > _lineHit.idx) newCR[ki-1] = la.cornerRadii[k];
                }
                la.cornerRadii = newCR;
              }
              la._updateBbox(); _edShapePushHistory(); edRedraw();
            }
            return;
          } else {
            // Añadir nodo en el centro del segmento
            // Calcular punto medio directamente desde los puntos locales (ignora nulls)
            const _segI = _lineHit.idx;
            const _segJ = (_segI+1)%_n;
            const _pA = la.points[_segI], _pB = la.points[_segJ];
            if(_pA && _pB){
              const newLocal = {x:(_pA.x+_pB.x)/2, y:(_pA.y+_pB.y)/2};
              la.points.splice(_segJ,0,newLocal);
              if(la.cornerRadii && Object.keys(la.cornerRadii).length){
                const newCR = {};
                for(const k in la.cornerRadii){
                  const ki = parseInt(k);
                  if(ki < _segJ) newCR[ki] = la.cornerRadii[k];
                  else newCR[ki+1] = la.cornerRadii[k];
                }
                la.cornerRadii = newCR;
              }
              la._updateBbox(); _edShapePushHistory(); edRedraw();
            }
            return;
          }
        } else {
          // Primer tap: registrar candidato, iniciar drag si es nodo
          _edLastNodeTapTime=_now2;
          _edLastNodeTapIdx = _hitId;
          if(_lineHit.type==='node'){
            _edShapePushHistory(); // pre-snapshot antes del drag
            edIsTailDragging=true; edTailPointType='linevertex'; edTailVoiceIdx=_lineHit.idx;
            // Capturar pointer para recibir pointermove aunque el dedo salga del canvas
            if(e.pointerId !== undefined){ try{ edCanvas.setPointerCapture(e.pointerId); }catch(_){} }
          }
          // Para segmento: solo registrar candidato, no iniciar drag
          return;
        }
      }
      // Sin hit en nodo ni segmento: intentar radio ampliado para drag del objeto
      _edLastNodeTapTime=0; _edLastNodeTapIdx=-1;
      // Radio ampliado para drag PC (32px > 18px nodo)
      const _hitSegDragPC = 32;
      const _lineHitDrag = _edLineHitTest(la, c.nx, c.ny, _isTouch2, _hitSegDragPC);
      if(_lineHitDrag && _lineHitDrag.type === 'seg'){
        // Drag del objeto completo con radio ampliado
        edDragOffX = c.nx - la.x;
        edDragOffY = c.ny - la.y;
        edIsDragging = true;
        window._edMoved = false;
        if(e.pointerId!==undefined){try{edCanvas.setPointerCapture(e.pointerId);}catch(_){}}
        return;
      }
      // T1: drag del objeto durante edición (táctil y PC) — si toque dentro del bbox

    }
  }

  // Handles de control (resize + rotate): todos los tipos en PC; táctil usa pinch para resize
  const _la = edSelectedIdx>=0 ? edLayers[edSelectedIdx] : null;
  // En panel line con LineLayer seleccionado: los nodos tienen prioridad sobre los handles de bbox
  const _panelLineOpen = $('edOptionsPanel')?.dataset.mode === 'line';
  const _panelShapeOpen = $('edOptionsPanel')?.dataset.mode === 'shape';
  // Solo saltar handles en modo V⟺C (nodos tienen prioridad sobre handles)
  // Giro y resize siempre disponibles con el panel line abierto
  const _inCurveMode = _edCurveModeActive && _edCurveModeActive();
  const _skipHandles = _inCurveMode && (_la?.type === 'line' || _la?.type === 'shape');
  if(_la && _la.type!=='bubble' && !_skipHandles){
    const _isT = e.pointerType==='touch';
    const _pw=edPageW(), _ph=edPageH();
    const _z=edCamera.z;
    // Si es el segundo clic de un doble clic sobre este objeto, saltarse handles
    const _now = Date.now();
    const _isPotentialDbl = (_la === edLayers[_edLastTapIdx] || edSelectedIdx === _edLastTapIdx)
                            && (_now - _edLastTapTime < 350);
    const hitScreen = _isT ? 28 : 18;
    // LOCK: si el objeto está bloqueado no activar handles de resize/rotate
    if(!_la.locked)
    for(const p of _la.getControlPoints()){
      // dist en píxeles de página → multiplicar por z para obtener pantalla
      const _dpx=(c.nx-p.x)*_pw, _dpy=(c.ny-p.y)*_ph;
      const distScreen = Math.hypot(_dpx,_dpy) * _z;
      if(distScreen < hitScreen){
        // Si es el segundo clic de un doble clic, ignorar handles y dejar pasar al doble clic
        if(_isPotentialDbl) break;
        if(p.corner==='rotate'){
          if(_isT) continue;  // en táctil la rotación es por gesto pinch
          // Pre-snapshot para objetos vectoriales con panel abierto
          if(_la.type==='line'||_la.type==='shape'){
            const _pm=$('edOptionsPanel')?.dataset.mode;
            if(_pm==='line'||_pm==='shape'||$('edShapeBar')?.classList.contains('visible'))
              _edShapePushHistory();
          }
          edIsRotating = true;
          edRotateStartAngle = Math.atan2(c.ny-_la.y, c.nx-_la.x)-(_la.rotation||0)*Math.PI/180;
          return;
        }
        if(!_isT){
          // Pre-snapshot para objetos vectoriales con panel abierto
          if(_la.type==='line'||_la.type==='shape'){
            const _pm=$('edOptionsPanel')?.dataset.mode;
            if(_pm==='line'||_pm==='shape'||$('edShapeBar')?.classList.contains('visible'))
              _edShapePushHistory();
          }
          edIsResizing=true; edResizeCorner=p.corner;
          // Calcular ancla (punto opuesto en espacio local) para resize profesional
          const _rot0=(_la.rotation||0)*Math.PI/180;
          const _hw0=_la.width/2, _hh0=_la.height/2;
          const _pw0=edPageW(), _ph0=edPageH();
          // Posición del ancla en fracción de página (opuesto al corner arrastrado)
          const _anchorLocal = (corner) => {
            // ancla en espacio local (fracción de tamaño objeto)
            const ax = corner==='ml'?_hw0 : corner==='mr'?-_hw0 :
                        corner==='tl'||corner==='bl'?_hw0 :
                        corner==='tr'||corner==='br'?-_hw0 : 0;
            const ay = corner==='mt'?_hh0 : corner==='mb'?-_hh0 :
                        corner==='tl'||corner==='tr'?_hh0 :
                        corner==='bl'||corner==='br'?-_hh0 : 0;
            // Rotar al espacio mundo
            const rx=ax*_pw0, ry=ay*_ph0;
            return {
              x: _la.x+(rx*Math.cos(_rot0)-ry*Math.sin(_rot0))/_pw0,
              y: _la.y+(rx*Math.sin(_rot0)+ry*Math.cos(_rot0))/_ph0
            };
          };
          const _anch = _anchorLocal(p.corner);
          edInitialSize={width:_la.width,height:_la.height,
                         cx:_la.x, cy:_la.y, asp:_la.height/_la.width,
                         rot:(_la.rotation||0), ox:_la.x, oy:_la.y,
                         anchorX:_anch.x, anchorY:_anch.y};
          if(_la.type==='line'){
            edInitialSize._linePoints=_la.points.map(p=>p?({...p}):null);
            edInitialSize._subPaths=_la.subPaths&&_la.subPaths.length ? _la.subPaths.map(sp=>{const _s=sp.map(p=>({...p})); if(sp.cornerRadii)_s.cornerRadii={...sp.cornerRadii}; return _s;}) : null;
            // Si tiene radios, sincronizar la.width/height con el bbox de puntos puros
            // para que el resize y edInitialSize partan de la misma base.
            const _cr2=_la.cornerRadii||{};
            if(Object.keys(_cr2).some(k=>(_cr2[k]||0)>0)){
              const _xs=_la.points.map(p=>p.x), _ys=_la.points.map(p=>p.y);
              const _ptW=Math.max(Math.max(..._xs)-Math.min(..._xs), 0.01);
              const _ptH=Math.max(Math.max(..._ys)-Math.min(..._ys), 0.01);
              // Forzar la.width/height al bbox de puntos para que el resize
              // calcule sw/sh correctamente desde el primer movimiento
              _la.width=_ptW; _la.height=_ptH;
              edInitialSize.width=_ptW; edInitialSize.height=_ptH;
              // Recalcular ancla con el nuevo tamaño
              edInitialSize.asp=_ptH/_ptW;
            }
          }
          // Guardar radios de curva para escalarlos con el resize
          if(_la.cornerRadii){
            if(Array.isArray(_la.cornerRadii)) edInitialSize._cornerRadii=[..._la.cornerRadii];
            else edInitialSize._cornerRadii={..._la.cornerRadii};
          } else { edInitialSize._cornerRadii=null; }
          return;
        }
      }
    }
  }
  // Si se está editando un shape/line (panel O barra flotante), bloquear selección de otros objetos
  // pero permitir drag del objeto actualmente seleccionado
  const _activePanel = $('edOptionsPanel');
  const _activeMode  = _activePanel?.dataset.mode;
  const _shapeBarOpen = $('edShapeBar')?.classList.contains('visible');
  const _editingVectorial = (_activeMode === 'shape' || _activeMode === 'line') || _shapeBarOpen || !!_edLineLayer;
  // En modo selección del panel line/shape: permitir seleccionar objetos de la fusión y drag
  const _lineSelectMode = (_activeMode === 'line' || _activeMode === 'shape') && _edLineType === 'select' && !_edLineLayer;
  // Bug2-fix: en táctil con panel line abierto y edActiveTool='select', permitir drag de nodos
  if(_lineSelectMode && e.pointerType === 'touch' && edSelectedIdx >= 0){
    const _lsLa = edLayers[edSelectedIdx];
    if(_lsLa && _lsLa.type === 'line'){
      // Radio normal para detectar nodos y candidatos de doble-tap
      // Radio ampliado SOLO para iniciar drag del objeto (más fácil desplazar)
      const _hitSegDrag = 48; // táctil: radio drag > radio nodo (28px)
      const _lsHit = _edLineHitTest(_lsLa, c.nx, c.ny, true);
      const _hitId3 = _lsHit.type==='node' ? _lsHit.idx : 1000+_lsHit.idx;
      const _now4 = Date.now();
      const _sameHit3 = _edLastNodeTapIdx !== -1 && _edLastNodeTapIdx === _hitId3
        && (_now4 - _edLastNodeTapTime) < 400;
      if(_sameHit3){
        _edLastNodeTapTime=0; _edLastNodeTapIdx=-1;
        if(_lsHit.type==='node'){
          // Doble tap sobre nodo → eliminar
          const _nPts = _lsLa.points.filter(Boolean).length;
          if(_nPts > 2){
            _lsLa.points.splice(_lsHit.idx, 1);
            _lsLa._updateBbox(); _edShapePushHistory(); edRedraw();
          }
        } else {
          // Doble tap sobre segmento → añadir nodo
          const _sI = _lsHit.idx, _sJ = (_sI+1) % _lsLa.points.length;
          const _pA = _lsLa.points[_sI], _pB = _lsLa.points[_sJ];
          if(_pA && _pB){
            _lsLa.points.splice(_sJ, 0, {x:(_pA.x+_pB.x)/2, y:(_pA.y+_pB.y)/2});
            _lsLa._updateBbox(); _edShapePushHistory(); edRedraw();
          }
        }
        return;
      }
      // Primer tap: registrar candidato
      _edLastNodeTapTime=_now4; _edLastNodeTapIdx=_hitId3;
      if(_lsHit.type==='node'){
        // Iniciar drag de nodo
        _edShapePushHistory();
        edIsTailDragging=true; edTailPointType='linevertex'; edTailVoiceIdx=_lsHit.idx;
        if(e.pointerId !== undefined){ try{ edCanvas.setPointerCapture(e.pointerId); }catch(_){} }
        return;
      }
      // Segmento: registrar candidato para doble tap Y permitir drag del objeto completo
      edDragOffX = c.nx - _lsLa.x;
      edDragOffY = c.ny - _lsLa.y;
      edIsDragging = true;
      window._edMoved = false;
      return;
    }
    // Sin hit con radio normal: intentar con radio ampliado para drag del objeto
    // (hace más fácil desplazar sin necesidad de tocar exactamente la línea)
    const _lsHitDrag = _edLineHitTest(_lsLa, c.nx, c.ny, true, _hitSegDrag);
    if(_lsHitDrag && _lsHitDrag.type === 'seg'){
      edDragOffX = c.nx - _lsLa.x;
      edDragOffY = c.ny - _lsLa.y;
      edIsDragging = true;
      window._edMoved = false;
      return;
    }
    // Fuera del área ampliada: dejar caer al bloque de selección
  }
  // Con panel vectorial abierto o barra flotante:
  // - Objetos vectoriales de la sesión actual: seleccionables y arrastrables
  // - Objetos vectoriales previos (en _vsPreSessionLayers): bloqueados igual que imágenes/textos
  // - Objetos no-vectoriales (imágenes, textos, draw): siempre bloqueados
  if(_editingVectorial && edActiveTool !== 'shape' && edActiveTool !== 'line'){
    const _vecLayers = edLayers.filter(l =>
      (l.type === 'line' || l.type === 'shape') && !_vsPreSessionLayers.has(l)
    );
    let _hitVec = null;
    for(let i = _vecLayers.length - 1; i >= 0; i--){
      if(_vecLayers[i].contains(c.nx, c.ny)){ _hitVec = _vecLayers[i]; break; }
    }
    if(_hitVec){
      edSelectedIdx = edLayers.indexOf(_hitVec);
      edDragOffX = c.nx - _hitVec.x;
      edDragOffY = c.ny - _hitVec.y;
      edIsDragging = true;
      window._edMoved = false;
      edRedraw();
      return;
    }
    edRedraw(); return;
  }
  // Si se está creando una línea nueva (_edLineLayer sin objeto seleccionado aún), bloquear selección
  if(_edLineLayer){ edRedraw(); return; }

  // Seleccionar: de mayor a menor índice (mayor = encima visualmente).
  // contains() de cada clase hace el hit-test correcto:
  //   - ImageLayer: bbox + alpha real del píxel (ignora zonas transparentes)
  //   - TextLayer/BubbleLayer: bbox rotado
  //   - StrokeLayer/DrawLayer: bbox rotado
  // Textos/bocadillos se evalúan primero (siempre encima visualmente).
  const _isTouch = e.pointerType === 'touch';

  let found = -1;
  // Primero textos/bocadillos (siempre encima)
  for(let i = edLayers.length - 1; i >= 0; i--){
    const l = edLayers[i];
    if((l.type==='text'||l.type==='bubble') && l.contains(c.nx,c.ny)){
      found = i; break;
    }
  }
  // Pasada 1 (exacta): resto de layers de mayor a menor índice.
  // DrawLayer usa exactMode=true → radio=1px, no da positivo en huecos.
  // Esto permite que capas inferiores sean seleccionables a través de huecos de DrawLayer.
  if(found < 0){
    for(let i = edLayers.length - 1; i >= 0; i--){
      const l = edLayers[i];
      if(l.type==='text'||l.type==='bubble') continue;
      const _hit = l.type==='draw' ? l.contains(c.nx,c.ny,true) : l.contains(c.nx,c.ny);
      if(_hit){ found = i; break; }
    }
  }
  // Pasada 2 (expandida): solo si pasada 1 no encontró nada.
  // DrawLayer usa radio=10px para facilitar selección de trazos finos.
  if(found < 0){
    for(let i = edLayers.length - 1; i >= 0; i--){
      const l = edLayers[i];
      if(l.type==='text'||l.type==='bubble') continue;
      if(l.type!=='draw') continue; // solo DrawLayer tiene radio expandido; el resto ya se probó
      if(l.contains(c.nx,c.ny,false)){ found = i; break; }
    }
  }
  if(found>=0){
    const _fla = edLayers[found];
    // Con barra flotante de dibujo activa: ignorar selección — el toque debe ir al dibujo
    if($('edDrawBar')?.classList.contains('visible') && ['draw','eraser','fill'].includes(edActiveTool)){
      // Redirigir al sistema de dibujo táctil (igual que si hubiera caído en zona vacía)
      clearTimeout(window._edDrawTouchTimer);
      const _eSaved2 = e;
      if(e.pointerType === 'touch' && _cof.on){
        const _cofIsRed2 = (_cof.state==='red_ready'||_cof.state==='red_cool');
        if(_cofIsRed2){
          _cofHandleTouch(_eSaved2);
        } else {
          window._edDrawTouchTimer = setTimeout(() => {
            if(!window._edActivePointers || window._edActivePointers.size > 1) return;
            if(!['draw','eraser'].includes(edActiveTool)) return;
            _cofHandleTouch(_eSaved2);
          }, 120);
        }
      } else {
        window._edDrawTouchTimer = setTimeout(() => {
          if(!window._edActivePointers || window._edActivePointers.size > 1) return;
          if(!['draw','eraser'].includes(edActiveTool)) return;
          edStartPaint(_eSaved2);
        }, 120);
      }
      return;
    }
    // Panel de propiedades abierto en táctil: bloquear toda selección/interacción del canvas
    if(e.pointerType === 'touch'){
      const _ppMode = $('edOptionsPanel')?.dataset.mode;
      if(_ppMode === 'props'){
        edRedraw(); return; // absorber — solo OK cierra el panel
      }
    }
    // ── Objeto bloqueado: mostrar candado o abrir panel ──
    if(_fla && _fla.locked){
      const _panel = $('edOptionsPanel');
      const _inEdit = (edSelectedIdx === found) && (
        _panel?.classList.contains('open') ||
        $('edShapeBar')?.classList.contains('visible') ||
        $('edDrawBar')?.classList.contains('visible')
      );
      if(!_inEdit){
        const _nowL = Date.now();
        // ── Grupo bloqueado: tratar como unidad ──
        if(_fla.groupId){
          const _gidxsL = _edGroupMemberIdxs(_fla.groupId);
          const _gcx = _gidxsL.reduce((s,i)=>s+(edLayers[i]?.x||0),0) / _gidxsL.length;
          const _gcy = _gidxsL.reduce((s,i)=>s+(edLayers[i]?.y||0),0) / _gidxsL.length;
          if(found === _edLastTapIdx && _nowL - _edLastTapTime < 350){
            // Doble tap en grupo bloqueado → abrir panel de grupo
            _edLastTapTime = 0; _edLastTapIdx = -1;
            edSelectedIdx = found;
            edMultiSel = []; edMultiBbox = null;
            if(window._edGroupSilentTool !== undefined) delete window._edGroupSilentTool;
            edActiveTool = 'select';
            _edDrawLockUI(); _edPropsOverlayShow();
            edRenderOptionsPanel('props');
          } else {
            // Un tap: mostrar candado en el centro del grupo
            _edLastTapTime = _nowL; _edLastTapIdx = found;
            _edShowLockIcon({x:_gcx, y:_gcy, width:0.1, height:0.1});
            edRedraw();
          }
          return;
        }
        // ── Objeto individual bloqueado ──
        if(found === _edLastTapIdx && _nowL - _edLastTapTime < 350){
          _edLastTapTime = 0; _edLastTapIdx = -1;
          _edHandleDoubleTap(found);
        } else {
          _edLastTapTime = _nowL; _edLastTapIdx = found;
          _edShowLockIcon(_fla);
          edRedraw();
        }
        return;
      }
    }
    // Si el objeto pertenece a un grupo y la herramienta activa NO es multiselect,
    // activar multiselección completa internamente (con handles de escala/rotación)
    // pero sin cambiar el botón ni el cursor visible.
    if(_fla && _fla.groupId && edActiveTool !== 'multiselect'){
      const _gidxs = _edGroupMemberIdxs(_fla.groupId);
      if(_gidxs.length > 1){
        // Detectar doble tap/clic → abrir panel de propiedades del grupo
        const _now = Date.now();
        const _isDoubleTap = (found === _edLastTapIdx || _gidxs.includes(_edLastTapIdx)) &&
                             _now - _edLastTapTime < 350;
        if(_isDoubleTap){
          _edLastTapTime = 0; _edLastTapIdx = -1;
          // Abrir panel con el objeto tocado seleccionado
          // (el panel mostrará ⊟ Desagrupar porque tiene groupId)
          edSelectedIdx = found;
          edMultiSel = []; edMultiBbox = null;
          if(window._edGroupSilentTool !== undefined) delete window._edGroupSilentTool;
          edActiveTool = 'select';
          _edDrawLockUI(); _edPropsOverlayShow();
          edRenderOptionsPanel('props');
          edRedraw();
          return;
        }
        _edLastTapTime = _now; _edLastTapIdx = found;

        edMultiSel = _gidxs;
        edMultiGroupRot = 0;
        _msRecalcBbox();
        edSelectedIdx = -1;
        const _prevTool = edActiveTool;
        edActiveTool = 'multiselect';
        window._edGroupSilentTool = _prevTool;
        // Iniciar drag inmediatamente — igual que objetos normales, sin retardo
        // LOCK: solo iniciar si hay miembros desbloqueados
        if(_gidxs.every(i=>edLayers[i]?.locked)){ edRedraw(); return; }
        edMultiDragging = true;
        edMultiDragOffs = _gidxs.map(i=>({dx:c.nx-edLayers[i].x, dy:c.ny-edLayers[i].y}));
        window._edMoved = false;
        edRedraw();
        return;
      }
    }
    // ── Shift+clic (solo PC): añadir/quitar de la multiselección ──
    if(e.shiftKey && e.pointerType !== 'touch'){
      const _inSel = edMultiSel.indexOf(found);
      if(edActiveTool === 'multiselect' && edMultiSel.length){
        // Toggle del objeto en la selección existente
        if(_inSel >= 0) edMultiSel.splice(_inSel, 1);
        else            edMultiSel.push(found);
      } else {
        // Primera vez con Shift: combinar objeto previo + nuevo
        const _prev = edSelectedIdx >= 0 ? [edSelectedIdx] : [];
        edMultiSel = [...new Set([..._prev, found])];
      }
      edSelectedIdx = -1;
      if(edMultiSel.length >= 2){
        edActiveTool = 'multiselect';
        edCanvas.className = 'tool-multiselect';
        $('edMultiSelBtn')?.classList.add('active');
        _msRecalcBbox();
        _edUpdateMultiSelPanel();
      } else if(edMultiSel.length === 1){
        // Quedó uno solo → volver a selección normal
        edSelectedIdx = edMultiSel[0];
        edMultiSel = []; edMultiBbox = null;
        edActiveTool = 'select'; edCanvas.className = '';
        $('edMultiSelBtn')?.classList.remove('active');
        _edDrawLockUI(); _edPropsOverlayShow();
        edRenderOptionsPanel('props');
      } else {
        _msClear();
        edActiveTool = 'select'; edCanvas.className = '';
        $('edMultiSelBtn')?.classList.remove('active');
      }
      edRedraw(); return;
    }
    edSelectedIdx = found;
    edMultiSelAnchor = found; // ancla para Shift+flechas
    // Si es LineLayer con radios, actualizar bbox antes de interactuar
    const _fl=edLayers[found];
    if(_fl&&_fl.type==='line'){
      const _fcr=_fl.cornerRadii||{};
      if(Object.keys(_fcr).some(k=>(_fcr[k]||0)>0)) _fl._updateBbox();
    }
    // LOCK: objeto bloqueado — seleccionar pero no arrastrar
    if(_fl && _fl.locked){
      edRedraw(); return;
    }
    edDragOffX = c.nx - edLayers[found].x;
    edDragOffY = c.ny - edLayers[found].y;
    edIsDragging = true;
    window._edMoved = false;
    // Pre-snapshot para objetos vectoriales (permite deshacer el desplazamiento)
    if(edLayers[found]?.type==='line'||edLayers[found]?.type==='shape'){
      const _pm=$('edOptionsPanel')?.dataset.mode;
      if(_pm==='line'||_pm==='shape'||$('edShapeBar')?.classList.contains('visible')){
        _edShapePushHistory();
      }
    }
    edHideGearIcon();
    clearTimeout(window._edLongPress);
    if(_isTouch){
      // TÁCTIL: toque simple = solo seleccionar
      // Doble toque rápido (≤350ms) → abrir panel de propiedades
      const now = Date.now();
      if(found === _edLastTapIdx && now - _edLastTapTime < 350){
        edIsDragging = false;
        clearTimeout(window._edLongPress);
        _edHandleDoubleTap(found);
        _edLastTapTime = 0; _edLastTapIdx = -1;
        return; // no continuar procesando este evento
      } else {
        _edLastTapTime = now; _edLastTapIdx = found;
        // Sin long-press en táctil — solo doble toque abre el panel
      }
    } else {
      // PC/RATÓN: doble clic en el mismo objeto → abrir propiedades
      const now = Date.now();
      if(found === _edLastTapIdx && now - _edLastTapTime < 350){
        edIsDragging = false;
        clearTimeout(window._edLongPress);
        _edHandleDoubleTap(found);
        _edLastTapTime = 0; _edLastTapIdx = -1;
        return; // no continuar procesando este evento
      } else {
        _edLastTapTime = now; _edLastTapIdx = found;
        // Long-press 600ms en PC (ratón) → abrir propiedades (no para shape/line)
        window._edLongPress = setTimeout(() => {
          if(edSelectedIdx === found && !edIsResizing){
            const _la = edLayers[found];
            if(_la && (_la.type === 'shape' || _la.type === 'line')) return;
            edIsDragging = false;
            edRenderOptionsPanel('props');
          }
        }, 600);
      }
    }
  } else {
    const _wasType = edSelectedIdx >= 0 ? edLayers[edSelectedIdx]?.type : null;
    const _wasLayer = edSelectedIdx >= 0 ? edLayers[edSelectedIdx] : null;
    const _panel = $('edOptionsPanel');
    const _panelWasProps = _panel?.dataset.mode === 'props';
    edHideContextMenu();
    // Con barra flotante activa: solo deseleccionar, sin abrir submenús
    if($('edDrawBar')?.classList.contains('visible')){
      edSelectedIdx = -1; edRedraw(); return;
    }
    // Si el panel de propiedades está abierto: no cerrar al tocar fuera (ningún tipo)
    const _panelMode=$('edOptionsPanel')?.dataset.mode;
    if(_panelMode==='props'){
      edRedraw(); return; // mantener panel abierto — OK es la única salida
    }
    // Si el panel vectorial (line/shape) está abierto: mantener selección del objeto
    // Un toque en zona vacía NO debe perder edSelectedIdx — los nodos dejarían de ser accesibles
    if(_panelMode==='line' || _panelMode==='shape'){
      edRedraw(); return;
    }
    edSelectedIdx = -1;
    // Clic en vacío: cerrar panel si no es draw
    edRenderOptionsPanel();
  }
  // PC/ratón clic en vacío → marcar para posible rubber band en edOnMove
  // Condición: no táctil, dentro del editor, sin objeto seleccionado, herramienta select
  // tgt puede ser el canvas O la zona gris del workspace (editorCanvasWrap)
  if(e.pointerType !== 'touch' && tgt.closest('#editorShell') && !tgt.closest('#edMenuBar') && !tgt.closest('#edTopbar') && !tgt.closest('#edOptionsPanel') && edSelectedIdx < 0 && edActiveTool === 'select'){
    const c = edCoords(e);
    edRubberBand = {x0:c.nx, y0:c.ny, x1:c.nx, y1:c.ny};
    window._edRubberBandEndPos = null;
  }
  edRedraw();
}
function edOnMove(e){
  // Actualizar _edTouchMoved siempre (para cancelar long-press aunque gestureActive sea false)
  if(e.pointerType === 'touch'){
    _edTouchMoved = true;
    clearTimeout(window._edLongPress);
    window._edLongPressReady = false;
    // Flag local del recorte: solo marcar si no hay drag de nodo activo
    if(_edCropMode && window._edCropTouchTimer && _edCropDragIdx < 0){
      window._edCropTouchMoved = true;
    }
  }
  // ── DRAG DE NODO DE RECORTE ────────────────────────────────
  if (_edCropMode && _edCropDragIdx >= 0) {
    // Si hay 2+ dedos (pinch), cancelar el drag de nodo y ceder al pinch de cámara
    if (e.pointerType === 'touch' && window._edActivePointers && window._edActivePointers.size >= 2) {
      _edCropDragIdx = -1; _edCropDragging = false;
    } else {
      e.preventDefault();
      const _cmc = edCoords(e);
      _edCropHandleCanvasMove(_cmc.nx, _cmc.ny);
      return;
    }
  }
  // ── DRAG DE NODO COMPARTIDO ────────────────────────────────
  if(_edRuleDrag && _edRuleDrag.nodeId !== undefined) {
    e.preventDefault();
    const c = edCoords(e);
    const _n = edRuleNodes.find(n => n.id === _edRuleDrag.nodeId);
    if(_n) {
      _n.x = c.px - _edRuleDrag.offX;
      _n.y = c.py - _edRuleDrag.offY;
      for(const rid of _n.ruleIds) {
        const _rr = edRules.find(r => r.id === rid);
        if(!_rr) continue;
        if(_rr.nodeA === _n.id) { _rr.x1 = _n.x; _rr.y1 = _n.y; }
        if(_rr.nodeB === _n.id) { _rr.x2 = _n.x; _rr.y2 = _n.y; }
      }
      edRedraw();
    }
    return;
  }
  // ── DRAG DE REGLA ──────────────────────────────────────────
  if(_edRuleDrag && _edRuleDrag.part !== 'move-pending') {
    e.preventDefault();
    const c = edCoords(e);
    const r = edRules.find(r => r.id === _edRuleDrag.ruleId);
    if(r) {
      // Si el offset aún no está inicializado (modo mover activado desde panel), inicializar ahora
      if(_edRuleDrag.offX === undefined) {
        _edRuleDrag.offX = c.px - r.x1;
        _edRuleDrag.offY = c.py - r.y1;
        _edRuleDrag.dx   = r.x2 - r.x1;
        _edRuleDrag.dy   = r.y2 - r.y1;
      }
      if(_edRuleDrag.part === 'a') {
        r.x1 = c.px; r.y1 = c.py;
      } else if(_edRuleDrag.part === 'b') {
        r.x2 = c.px; r.y2 = c.py;
      } else { // 'line' — mover todo
        const _newX1 = c.px - _edRuleDrag.offX;
        const _newY1 = c.py - _edRuleDrag.offY;
        // Si la regla pertenece a un grupo, mover todo el grupo en bloque
        const _nodeIds = [];
        if(r.nodeA) _nodeIds.push(r.nodeA);
        if(r.nodeB) _nodeIds.push(r.nodeB);
        if(_nodeIds.length) {
          const _dx = _newX1 - r.x1, _dy = _newY1 - r.y1;
          // Recoger todas las reglas del grupo
          const _groupRuleIds = new Set([r.id]);
          for(const nid of _nodeIds) {
            const _n = edRuleNodes.find(n => n.id === nid);
            if(_n) _n.ruleIds.forEach(rid => _groupRuleIds.add(rid));
          }
          // Mover todas las reglas del grupo
          for(const rid of _groupRuleIds) {
            const _rr = edRules.find(rr => rr.id === rid);
            if(!_rr) continue;
            _rr.x1 += _dx; _rr.y1 += _dy;
            _rr.x2 += _dx; _rr.y2 += _dy;
          }
          // Mover todos los nodos del grupo
          const _allNodeIds = new Set(_nodeIds);
          for(const rid of _groupRuleIds) {
            const _rr = edRules.find(rr => rr.id === rid);
            if(!_rr) continue;
            if(_rr.nodeA) _allNodeIds.add(_rr.nodeA);
            if(_rr.nodeB) _allNodeIds.add(_rr.nodeB);
          }
          for(const nid of _allNodeIds) {
            const _n = edRuleNodes.find(n => n.id === nid);
            if(_n) { _n.x += _dx; _n.y += _dy; }
          }
        } else {
          r.x1 = _newX1;
          r.y1 = _newY1;
          r.x2 = r.x1 + _edRuleDrag.dx;
          r.y2 = r.y1 + _edRuleDrag.dy;
        }
      }
      edRedraw();
    }
    return;
  }
  // ── RUBBER BAND en modo select (PC) ────────────────────────
  if(edActiveTool==='select' && edRubberBand){
    e.preventDefault();
    const c=edCoords(e);
    edRubberBand.x1=c.nx; edRubberBand.y1=c.ny;
    window._edRubberBandEndPos = {clientX: e.clientX, clientY: e.clientY};
    edRedraw(); return;
  }
  // ── MULTI-SELECCIÓN ────────────────────────────────────────
  if(edActiveTool==='multiselect'){
    if(window._edActivePointers && window._edActivePointers.size >= 2){
      if(e.pointerId !== undefined) window._edActivePointers.set(e.pointerId, {x:e.clientX,y:e.clientY});
      e.preventDefault();
      if(window._edPinchMulti) edPinchMove(e);
      return;
    }
    const c=edCoords(e);
    if(edRubberBand){
      e.preventDefault();
      edRubberBand.x1=c.nx; edRubberBand.y1=c.ny;
      window._edRubberBandEndPos = {clientX: e.clientX, clientY: e.clientY};
      edRedraw(); return;
    }
    if(edMultiDragging && edMultiDragOffs.length){
      e.preventDefault();
      edMultiSel.forEach((idx,i)=>{
        const o=edMultiDragOffs[i]; if(!o) return;
        if(edLayers[idx]?.locked) return; // LOCK: no mover objetos bloqueados
        edLayers[idx].x=c.nx-o.dx; edLayers[idx].y=c.ny-o.dy;
      });
      // Actualizar edMultiBbox.cx/cy siguiendo al centroide
      // Las dimensiones w/h no cambian al trasladar
      if(edMultiBbox){
        const _n=edMultiSel.length; let _px=0,_py=0;
        edMultiSel.forEach(i=>{_px+=edLayers[i].x;_py+=edLayers[i].y;});
        const pivX=_px/_n, pivY=_py/_n;
        const gr=edMultiGroupRot*Math.PI/180;
        const cr=Math.cos(gr), sr=Math.sin(gr);
        const pw=edPageW(), ph=edPageH();
        const ox=edMultiBbox.offX*pw, oy=edMultiBbox.offY*ph;
        edMultiBbox.cx = pivX + (ox*cr - oy*sr)/pw;
        edMultiBbox.cy = pivY + (ox*sr + oy*cr)/ph;
      }
      window._edMoved=true; edRedraw(); return;
    }
    if(edMultiResizing && edMultiTransform){
      e.preventDefault();
      const {items,bb,corner,sx,sy,groupRot}=edMultiTransform;
      const pw=edPageW(),ph=edPageH();
      // Desrotar el cursor actual al espacio local del bbox (igual que en el hit-test)
      const _gr2 = (groupRot||0) * Math.PI / 180;
      const _c2 = Math.cos(-_gr2), _s2 = Math.sin(-_gr2);
      const _dcx2 = (c.nx - bb.cx)*pw, _dcy2 = (c.ny - bb.cy)*ph;
      const _lx2 = bb.cx + (_dcx2*_c2 - _dcy2*_s2)/pw;
      const _ly2 = bb.cy + (_dcx2*_s2 + _dcy2*_c2)/ph;
      const dx=_lx2-sx, dy=_ly2-sy;
      let sx2=1,sy2=1;
      if(corner==='tl'){sx2=1-dx/bb.w; sy2=1-dy/bb.h;}
      else if(corner==='tr'){sx2=1+dx/bb.w; sy2=1-dy/bb.h;}
      else if(corner==='bl'){sx2=1-dx/bb.w; sy2=1+dy/bb.h;}
      else if(corner==='br'){sx2=1+dx/bb.w; sy2=1+dy/bb.h;}
      else if(corner==='ml'){sx2=1-dx/bb.w;}
      else if(corner==='mr'){sx2=1+dx/bb.w;}
      else if(corner==='mt'){sy2=1-dy/bb.h;}
      else if(corner==='mb'){sy2=1+dy/bb.h;}
      // Esquinas: escala proporcional
      if(['tl','tr','bl','br'].includes(corner)){
        const s=(Math.abs(sx2)+Math.abs(sy2))/2;
        sx2=sy2=s;
      }
      sx2=Math.max(sx2,0.05); sy2=Math.max(sy2,0.05);
      // Guardar factores para que edDrawMultiSel escale el marco visualmente durante el gesto
      edMultiTransform._curSx = sx2;
      edMultiTransform._curSy = sy2;
      // Escalar posiciones relativas al centro del bbox en el espacio ROTADO del grupo
      const _cr = Math.cos(_gr2), _sr = Math.sin(_gr2);
      items.forEach(s=>{
        const la=edLayers[s.i]; if(!la) return;
        // Vector objeto→centro en px workspace
        const _ox=(s.x-bb.cx)*pw, _oy=(s.y-bb.cy)*ph;
        // Desrotar al espacio local del bbox
        const _lox=( _ox*_c2 - _oy*_s2);
        const _loy=( _ox*_s2 + _oy*_c2);
        // Escalar en espacio local
        const _slx = _lox * sx2;
        const _sly = _loy * sy2;
        // Volver a rotar al espacio global
        la.x = bb.cx + (_slx*_cr - _sly*_sr)/pw;
        la.y = bb.cy + (_slx*_sr + _sly*_cr)/ph;
        // DrawLayer: transformar el bitmap con la escala, no width/height (siempre 1.0)
        if(la.type==='draw'){
          const _nw=Math.round(ED_CANVAS_W*Math.abs(_swL)), _nh=Math.round(ED_CANVAS_H*Math.abs(_shL));
          if(_nw>0&&_nh>0&&(_nw!==ED_CANVAS_W||_nh!==ED_CANVAS_H)){
            const tmp=document.createElement('canvas');
            tmp.width=ED_CANVAS_W; tmp.height=ED_CANVAS_H;
            const tctx=tmp.getContext('2d');
            tctx.drawImage(la._canvas, 0,0,ED_CANVAS_W,ED_CANVAS_H, 0,0,_nw,_nh);
            la._ctx.clearRect(0,0,ED_CANVAS_W,ED_CANVAS_H);
            la._ctx.drawImage(tmp,0,0);
          }
          return; // no tocar width/height
        }
        // Proyectar sx2/sy2 (espacio del AABB) al espacio local del objeto.
        // Un objeto rotado θ relativo al grupo tiene sus ejes locales a θ del AABB.
        // Fabric.js/Konva usan esta misma proyección para resize no proporcional.
        const _objRelRad = ((la.rotation||0) - (groupRot||0)) * Math.PI / 180;
        const _cos2 = Math.cos(_objRelRad)*Math.cos(_objRelRad);
        const _sin2 = Math.sin(_objRelRad)*Math.sin(_objRelRad);
        const _swL = Math.abs(_cos2*sx2 + _sin2*sy2);
        const _shL = Math.abs(_sin2*sx2 + _cos2*sy2);
        la.width  = Math.max(s.w * _swL, 0.02);
        la.height = Math.max(s.h * _shL, 0.02);
        // LineLayer: escalar también los puntos locales para que la forma se estire
        if(la.type==='line' && s._linePoints){
          la.points = s._linePoints.map(p=>p?({x:p.x*_swL, y:p.y*_shL}):null);
          // Escalar subPaths (T1)
          if(s._subPaths) la.subPaths = s._subPaths.map(sp=>sp.map(p=>({x:p.x*_swL, y:p.y*_shL})));
          if(typeof la._updateBbox==='function') la._updateBbox();
        }
        // ShapeLayer/LineLayer: escalar cornerRadii
        if(s._cornerRadii && la.cornerRadii){
          const _scR = Math.min(_swL, _shL);
          const _maxR = Math.min(la.width*pw, la.height*ph) / 2;
          if(Array.isArray(la.cornerRadii)){
            la.cornerRadii = s._cornerRadii.map(r => r ? Math.min(r*_scR, _maxR) : 0);
          } else {
            const _ncr = {};
            for(const k in s._cornerRadii){ const r=s._cornerRadii[k]||0; _ncr[k]=r?Math.min(r*_scR,_maxR):0; }
            la.cornerRadii = _ncr;
          }
        }
      });
      window._edMoved=true; edRedraw(); return;
    }
    if(edMultiRotating && edMultiTransform){
      e.preventDefault();
      const {items,cx,cy,startAngle,startGroupRot}=edMultiTransform;
      const pw=edPageW(),ph=edPageH();
      const curAngle=Math.atan2(c.ny-cy, c.nx-cx);
      const delta=curAngle-startAngle;
      // Acumular rotación del bbox del grupo desde el inicio del gesto
      edMultiGroupRot = startGroupRot + delta*180/Math.PI;
      items.forEach(s=>{
        const la=edLayers[s.i]; if(!la) return;
        // DrawLayer: no rotar (su bitmap no se puede rotar en tiempo real)
        if(la.type==='draw') return;
        // Posición rotada alrededor del centro del bbox (en px para evitar distorsión)
        const dx_px=(s.x-cx)*pw, dy_px=(s.y-cy)*ph;
        const cos=Math.cos(delta), sin=Math.sin(delta);
        la.x=cx+(dx_px*cos-dy_px*sin)/pw;
        la.y=cy+(dx_px*sin+dy_px*cos)/ph;
        la.rotation=(s.rot+delta*180/Math.PI)%360;
      });
      window._edMoved=true; edRedraw(); return;
    }
    return;
  }
  // ─────────────────────────────────────────────────────────

  // Pinch activo — debe comprobarse ANTES del guard gestureActive
  // (el primer dedo puede no tener gesto activo aún cuando llega el segundo)
  if(window._edActivePointers && window._edActivePointers.size >= 2){
    if(e.pointerId !== undefined) window._edActivePointers.set(e.pointerId, {x:e.clientX,y:e.clientY});
    e.preventDefault();
    // Pan independiente para _edLineLayer en construcción
    if(window._edLinePan){
      const _panTgt = window._edLinePan.target;
      if(_panTgt){
        const _pts = [...window._edActivePointers.values()];
        const cx = (_pts[0].x+_pts[1].x)/2;
        const cy = (_pts[0].y+_pts[1].y)/2;
        const pw=edPageW(), ph=edPageH(), z=edCamera.z;
        const dxNorm = (cx - window._edLinePan.cx0) / (pw * z);
        const dyNorm = (cy - window._edLinePan.cy0) / (ph * z);
        _panTgt.x = window._edLinePan.lx0 + dxNorm;
        _panTgt.y = window._edLinePan.ly0 + dyNorm;
        // Mover también los objetos de la sesión de fusión
        window._edLinePan.fsnaps.forEach((snap, l) => {
          l.x = snap.x + dxNorm;
          l.y = snap.y + dyNorm;
        });
        // Aplicar resize si hay snapshot de pinch
        if(edPinchScale0 && edPinchDist0 > 0){
          const _dist = _pinchDist(window._edActivePointers);
          const _ratio = _dist / edPinchDist0;
          const _ang = _pinchAngle(window._edActivePointers);
          const _dAng = (_ang - edPinchAngle0) * 180 / Math.PI;
          const newW = Math.min(Math.max(edPinchScale0.w * _ratio, 0.04), 2.0);
          const newH = newW * (edPinchScale0.h / Math.max(edPinchScale0.w, 0.01));
          _panTgt.width = newW;
          _panTgt.height = newH;
          _panTgt.rotation = edPinchScale0.rot + _dAng;
          if(_panTgt.type==='line' && edPinchScale0._linePoints){
            const sw = newW / edPinchScale0.w;
            const sh = newH / edPinchScale0.h;
            _panTgt.points = edPinchScale0._linePoints.map(p => p ? ({x:p.x*sw, y:p.y*sh}) : null);
          }
        }
        edRedraw(); return;
      }
    }
    // Con multiselección activa: pinch afecta SOLO al grupo — nunca a la cámara
    if(edActiveTool==='multiselect' && edMultiSel.length && window._edPinchMulti){
      edPinchMove(e);
      return;
    }
    // Sin multiselección activa: comportamiento normal (cámara u objeto individual)
    if(edActiveTool!=='multiselect'){
      edPinchMove(e);
    }
    return;
  }

  // Nuevo sistema cursor: reposicionamiento, pendingStart, o trazo activo
  if(_cof.on && (_cof._dragging || _cof._pendingStart || _cof._strokeStarted)){
    e.preventDefault();
    _cofHandleMove(e);
    return;
  }
  // Sin gesto activo → ignorar el resto
  const gestureActive = edIsDragging||edIsResizing||edIsTailDragging||edPainting||edPinching||edIsRotating||!!edRubberBand||!!_edShapeStart;
  if(!gestureActive) return;
  e.preventDefault();
  if(edPinching) return; // segundo dedo levantado, esperar edOnEnd
  // Si estamos pintando activamente, el pinch ya terminó — limpiar flag y continuar trazo
  if(_edPinchHappened && edPainting) _edPinchHappened = false;
  if(_edPinchHappened) return; // hubo pinch — ignorar movimiento del dedo que queda
  if(['draw','eraser'].includes(edActiveTool)&&edPainting){edContinuePaint(e);return;}
  if(edActiveTool==='fill'){edMoveBrush(e);return;}
  // ── SHAPE: preview en tiempo real durante el drag ──
  if(edActiveTool==='shape' && _edShapeStart && _edShapePreview){
    const c=edCoords(e);
    const x0=_edShapeStart.x, y0=_edShapeStart.y;
    _edShapePreview.x = (x0+c.nx)/2;
    _edShapePreview.y = (y0+c.ny)/2;
    _edShapePreview.width  = Math.max(Math.abs(c.nx-x0), 0.01);
    _edShapePreview.height = Math.max(Math.abs(c.ny-y0), 0.01);
    edRedraw(); return;
  }
  const c=edCoords(e);
  _edTouchMoved = true;
  clearTimeout(window._edLongPress); // cancelar longpress si el dedo se movió
  if(edIsTailDragging&&edSelectedIdx>=0){
    const la=edLayers[edSelectedIdx];
    if(edTailPointType==='thoughtBig'){
      la.thoughtBig={x:(c.nx-la.x)/la.width, y:(c.ny-la.y)/la.height};
      edRedraw();return;
    }
    if(edTailPointType==='thoughtSmall'){
      la.thoughtSmall={x:(c.nx-la.x)/la.width, y:(c.ny-la.y)/la.height};
      edRedraw();return;
    }
    if(edTailPointType==='explosion'){
      const pw=edPageW(),ph=edPageH();
      const w=la.width*pw, h=la.height*ph;
      if(w>0&&h>0){
        la._initExplosionRadii();
        // Calcular posiciones absolutas de todos los vértices ANTES de cambiar nada
        const absPts = la.explosionRadii.map(v=>({
          ax: la.x + v.ox*w/2/pw,
          ay: la.y + v.oy*h/2/ph
        }));
        // Actualizar el vértice arrastrado
        absPts[edTailVoiceIdx] = {ax: c.nx, ay: c.ny};
        // Recalcular centro y tamaño del bbox desde las posiciones absolutas
        const minAx=Math.min(...absPts.map(p=>p.ax)), maxAx=Math.max(...absPts.map(p=>p.ax));
        const minAy=Math.min(...absPts.map(p=>p.ay)), maxAy=Math.max(...absPts.map(p=>p.ay));
        const newCx=(minAx+maxAx)/2, newCy=(minAy+maxAy)/2;
        const newW=Math.max(0.05,(maxAx-minAx)), newH=Math.max(0.05,(maxAy-minAy));
        // Recalcular ox/oy de todos los vértices con el nuevo centro y tamaño
        la.x=newCx; la.y=newCy;
        la.width=newW; la.height=newH;
        const nw=newW*pw, nh=newH*ph;
        la.explosionRadii = absPts.map(p=>({
          ox: (p.ax-newCx)*pw/(nw/2),
          oy: (p.ay-newCy)*ph/(nh/2)
        }));
      }
      edRedraw();return;
    }
    if(edTailPointType==='linevertex' && la.type==='shape' && la.shape==='rect'){
      // Mover esquina del rect: recalcular posición y tamaño manteniendo esquina opuesta fija
      const pw2=edPageW(), ph2=edPageH();
      const rot=(la.rotation||0)*Math.PI/180;
      const cosR=Math.cos(-rot), sinR=Math.sin(-rot);
      const dxR=(c.nx-la.x)*pw2, dyR=(c.ny-la.y)*ph2;
      const lxR=(dxR*cosR-dyR*sinR)/pw2, lyR=(dxR*sinR+dyR*cosR)/ph2;
      const hw=la.width/2, hh=la.height/2;
      const vi=edTailVoiceIdx;
      // Calcular nuevo half-size según qué esquina se mueve
      const newHw = vi===0||vi===3 ? Math.max(0.01, -lxR) : Math.max(0.01, lxR);
      const newHh = vi===0||vi===1 ? Math.max(0.01, -lyR) : Math.max(0.01, lyR);
      // El centro se desplaza la mitad de la diferencia de tamaño, en el eje rotado
      const ddw=(newHw-hw), ddh=(newHh-hh);
      // Dirección del desplazamiento según la esquina opuesta
      const signX = (vi===0||vi===3) ? -1 : 1;
      const signY = (vi===0||vi===1) ? -1 : 1;
      la.x += (signX*ddw*Math.cos(rot) - signY*ddh*Math.sin(rot));
      la.y += (signX*ddw*Math.sin(rot) + signY*ddh*Math.cos(rot));
      la.width=newHw*2; la.height=newHh*2;
      window._edMoved=true; edRedraw(); return;
    }
    if(edTailPointType==='linevertex'){
      // Convertir posición absoluta al espacio local de la línea
      const pw2=edPageW(), ph2=edPageH();
      const rot=-(la.rotation||0)*Math.PI/180;
      const cos=Math.cos(rot), sin=Math.sin(rot);
      const dx=(c.nx-la.x)*pw2, dy=(c.ny-la.y)*ph2; // en px
      la.points[edTailVoiceIdx]={
        x: (dx*cos - dy*sin) / pw2,
        y: (dx*sin + dy*cos) / ph2
      };
      // Recalcular width/height sin recentrar (recentrar durante drag causa saltos)
      const _rxs=la.points.filter(Boolean).map(p=>p.x);
      const _rys=la.points.filter(Boolean).map(p=>p.y);
      if(_rxs.length){
        la.width=Math.max(Math.max(..._rxs)-Math.min(..._rxs),0.01);
        la.height=Math.max(Math.max(..._rys)-Math.min(..._rys),0.01);
      }
      edRedraw();return;
    }

    const dx=c.nx-la.x,dy=c.ny-la.y;
    const v=edTailVoiceIdx||0;
    if(!la.tailStarts)la.tailStarts=[{...la.tailStart}];
    if(!la.tailEnds)  la.tailEnds  =[{...la.tailEnd}];
    if(edTailPointType==='start'){
      if(!la.tailStarts[v])la.tailStarts[v]={...la.tailStarts[0]};
      la.tailStarts[v]={x:dx/la.width,y:dy/la.height};
    } else {
      if(!la.tailEnds[v])la.tailEnds[v]={...la.tailEnds[0]};
      la.tailEnds[v]={x:dx/la.width,y:dy/la.height};
    }
    edRedraw();return;
  }
  if(edIsRotating&&edSelectedIdx>=0){
    const la=edLayers[edSelectedIdx];
    const angle = Math.atan2(c.ny-la.y, c.nx-la.x) - edRotateStartAngle;
    la.rotation = angle*180/Math.PI;
    window._edMoved = true;
    edRedraw();
    return;
  }
  if(edIsResizing&&edSelectedIdx>=0){
    const la=edLayers[edSelectedIdx];
    const pw=edPageW(), ph=edPageH();
    const rot=(edInitialSize.rot||0)*Math.PI/180;
    const corner=edResizeCorner;
    const asp = edInitialSize.width*pw > 0 ? (edInitialSize.height*ph)/(edInitialSize.width*pw) : 1;
    const isImg = la.type==='image';

    // ── Resize profesional: el vértice opuesto (ancla) permanece fijo ──
    // Vector ancla→cursor en píxeles de página
    const adx_px = (c.nx - edInitialSize.anchorX) * pw;
    const ady_px = (c.ny - edInitialSize.anchorY) * ph;
    // Rotar al espacio local del objeto
    const alx_px =  adx_px*Math.cos(-rot) - ady_px*Math.sin(-rot);
    const aly_px =  adx_px*Math.sin(-rot) + ady_px*Math.cos(-rot);
    // Signo según el corner: tl/bl/ml → cursor a la izquierda del ancla (signo negativo en local)
    // El tamaño es el valor absoluto; el centro es el punto medio entre ancla y cursor
    const propKey = e.shiftKey; // Shift = proporcional en vértices

    // El nuevo centro = ancla + semitamaño en dirección rotada del objeto
    // Esto garantiza que el ancla permanece absolutamente fija
    const _setCenterFromAnchor = (newW, newH, anchorLocalX, anchorLocalY) => {
      // El centro está desplazado desde el ancla por el semitamaño en espacio local
      // anchorLocal es el desplazamiento del ancla respecto al centro en espacio local (px)
      // El nuevo centro en mundo = ancla - anchorLocal_rotado
      const cx_px = anchorLocalX * Math.cos(rot) - anchorLocalY * Math.sin(rot);
      const cy_px = anchorLocalX * Math.sin(rot) + anchorLocalY * Math.cos(rot);
      la.x = edInitialSize.anchorX - cx_px / pw;
      la.y = edInitialSize.anchorY - cy_px / ph;
    };

    if(corner==='ml'||corner==='mr'){
      const nw_px = Math.abs(alx_px);
      if(nw_px > pw*0.02){
        la.width = nw_px/pw;
        // Ancla local: para ml ancla es el borde derecho (+hw), para mr es el izquierdo (-hw)
        const aLocalX = corner==='ml' ?  nw_px/2 : -nw_px/2;
        _setCenterFromAnchor(la.width, la.height, aLocalX, 0);
      }
    } else if(corner==='mt'||corner==='mb'){
      const nh_px = Math.abs(aly_px);
      if(nh_px > ph*0.02){
        la.height = nh_px/ph;
        // Ancla local: para mt ancla es el borde inferior (+hh), para mb es el superior (-hh)
        const aLocalY = corner==='mt' ?  nh_px/2 : -nh_px/2;
        _setCenterFromAnchor(la.width, la.height, 0, aLocalY);
      }
    } else {
      // Esquinas: libre por defecto, proporcional con Shift (estándar Figma/Illustrator)
      const nw_px = Math.abs(alx_px);
      const nh_px = Math.abs(aly_px);
      if(Math.max(nw_px, nh_px) > pw*0.02){
        const safeW = Math.max(nw_px, pw*0.01);
        const safeH = Math.max(nh_px, ph*0.01);
        if(propKey){
          // Shift: escala proporcional
          const sc = Math.max(safeW/(edInitialSize.width*pw), safeH/(edInitialSize.height*ph));
          la.width  = edInitialSize.width  * sc;
          la.height = edInitialSize.height * sc;
        } else {
          // Libre: ancho y alto independientes
          la.width  = safeW / pw;
          la.height = safeH / ph;
        }
        const aLocalX = (corner==='tl'||corner==='bl') ?  la.width/2*pw : -la.width/2*pw;
        const aLocalY = (corner==='tl'||corner==='tr') ?  la.height/2*ph : -la.height/2*ph;
        _setCenterFromAnchor(la.width, la.height, aLocalX, aLocalY);
      }
    }
    window._edMoved = true;
    // Escalar cornerRadii según resize no proporcional (estándar Figma/Illustrator)
    if(edInitialSize._cornerRadii && la.cornerRadii){
      const sw = la.width  / (edInitialSize.width  || 0.01);
      const sh = la.height / (edInitialSize.height || 0.01);
      const pw2=edPageW(), ph2=edPageH();
      // Factor de escala para radios: cada radio afecta a ambos ejes por igual
      // (es un arco circular, no elíptico). El radio máximo posible es
      // min(w,h)/2 del nuevo tamaño. Escalamos con min(sw,sh) y luego
      // recortamos al máximo — esto reproduce el comportamiento de Figma/Affinity.
      const _scR = Math.min(sw, sh);
      const _maxR = Math.min(la.width*pw2, la.height*ph2) / 2;
      if(Array.isArray(la.cornerRadii)){
        la.cornerRadii = edInitialSize._cornerRadii.map(r =>
          r ? Math.min((r||0)*_scR, _maxR) : 0
        );
      } else {
        const newCR = {};
        for(const k in edInitialSize._cornerRadii){
          const r = edInitialSize._cornerRadii[k]||0;
          newCR[k] = r ? Math.min(r*_scR, _maxR) : 0;
        }
        la.cornerRadii = newCR;
      }
    }
    // LineLayer: escalar los puntos locales según el nuevo width/height
    if(la.type==='line' && edInitialSize._linePoints){
      const sw = la.width  / (edInitialSize.width  || 0.01);
      const sh = la.height / (edInitialSize.height || 0.01);
      la.points = edInitialSize._linePoints.map(p=>p?({x: p.x*sw, y: p.y*sh}):null);
      // Escalar también subPaths (T1)
      if(edInitialSize._subPaths) la.subPaths = edInitialSize._subPaths.map(sp=>sp.map(p=>({x:p.x*sw, y:p.y*sh})));
      // Recalcular width/height desde puntos reales (base para el próximo resize)
      const xs=la.points.filter(Boolean).map(p=>p.x), ys=la.points.filter(Boolean).map(p=>p.y);
      const _ptW=Math.max(Math.max(...xs)-Math.min(...xs), 0.01);
      const _ptH=Math.max(Math.max(...ys)-Math.min(...ys), 0.01);
      // Si tiene radios: actualizar bbox curvado; si no, usar bbox de puntos
      const _cr3=la.cornerRadii||{};
      if(Object.keys(_cr3).some(k=>(_cr3[k]||0)>0)){
        la.width=_ptW; la.height=_ptH; // base para próximo edInitialSize
        la._updateBbox(); // actualiza width/height al bbox curvado para el cuadro visual
      } else {
        la.width=_ptW; la.height=_ptH;
      }
    }
    edRedraw();
    edHideGearIcon();
    // No cerrar el panel mientras se arrastra — el dimming debe mantenerse activo
    return;
  }
  if(!edIsDragging||edSelectedIdx<0)return;
  const la=edLayers[edSelectedIdx];
  la.x = c.nx - edDragOffX;
  la.y = c.ny - edDragOffY;
  // ── Snap a reglas (T29) ──────────────────────────────────────────────────
  if(edRules.length) _edSnapToRules(la);
  window._edMoved = true;
  edRedraw();
  edHideGearIcon();
  // No cerrar el panel mientras se arrastra — el dimming debe mantenerse activo
}
function edOnEnd(e){
  // Limpiar pan de _edLineLayer si se sueltan dedos
  if(window._edLinePan && (!window._edActivePointers || window._edActivePointers.size <= 1)){
    window._edLinePan = null;
  }
  // ── FIN DE DRAG DE NODO DE RECORTE ────────────────────────
  if (_edCropMode && _edCropDragIdx >= 0) {
    _edCropHandleCanvasEnd();
    return;
  }
  if(_edRuleDrag) {
    const _finDrag = _edRuleDrag;
    _edRuleDrag = null;
    // ── Fusión de círculos (T21 parte 2) ──
    if(_finDrag.part === 'a' || _finDrag.part === 'b') {
      const _rDragged = edRules.find(r => r.id === _finDrag.ruleId);
      // Una guía que ya pertenece a un grupo no puede fusionarse por su otro extremo
      if(_rDragged && !_rDragged.nodeA && !_rDragged.nodeB) {
        const _ex = _finDrag.part === 'a' ? _rDragged.x1 : _rDragged.x2;
        const _ey = _finDrag.part === 'a' ? _rDragged.y1 : _rDragged.y2;
        // Umbral de fusión: ampliado en táctil (dedo) para facilitar agrupamiento
        const _isFinDragTouch = edLastPointerIsTouch;
        const _rPx = (_ED_RULE_R * 2) / Math.max(0.1, edCamera.z);
        const _fusionThresh = _isFinDragTouch ? (28 / Math.max(0.1, edCamera.z)) : _rPx * 0.2;
        // Radio del nodo compartido para hit de incorporación (también ampliado en táctil)
        const _nPx = _isFinDragTouch ? (32 / Math.max(0.1, edCamera.z)) : (_ED_RULE_R * 1.5) / Math.max(0.1, edCamera.z);
        let _fused = false;

        // CASO A: arrastrar sobre un nodo compartido existente → incorporar al grupo
        for(const _node of edRuleNodes) {
          if(_fused) break;
          // La guía arrastrada no debe estar ya en ese nodo
          if(_node.ruleIds.includes(_rDragged.id)) continue;
          if(Math.hypot(_ex - _node.x, _ey - _node.y) <= _nPx) {
            // Anclar el extremo arrastrado al centro del nodo
            if(_finDrag.part === 'a') { _rDragged.x1 = _node.x; _rDragged.y1 = _node.y; _rDragged.nodeA = _node.id; }
            else                      { _rDragged.x2 = _node.x; _rDragged.y2 = _node.y; _rDragged.nodeB = _node.id; }
            _node.ruleIds.push(_rDragged.id);
            _fused = true;
          }
        }

        // CASO B: arrastrar sobre el círculo libre de otra guía → crear nodo nuevo
        if(!_fused) {
          for(const _rOther of edRules) {
            if(_rOther.id === _rDragged.id || _fused) continue;
            for(const [_ox, _oy, _oPart] of [[_rOther.x1, _rOther.y1, 'a'], [_rOther.x2, _rOther.y2, 'b']]) {
              if(_oPart === 'a' && _rOther.nodeA) continue;
              if(_oPart === 'b' && _rOther.nodeB) continue;
              if(Math.hypot(_ex - _ox, _ey - _oy) <= _fusionThresh) {
                const _nx = (_ex + _ox) / 2, _ny = (_ey + _oy) / 2;
                const _nid = ++_edRuleNodeId;
                edRuleNodes.push({ id: _nid, x: _nx, y: _ny, ruleIds: [_rDragged.id, _rOther.id], locked: false });
                if(_finDrag.part === 'a') { _rDragged.x1 = _nx; _rDragged.y1 = _ny; _rDragged.nodeA = _nid; }
                else                      { _rDragged.x2 = _nx; _rDragged.y2 = _ny; _rDragged.nodeB = _nid; }
                if(_oPart === 'a') { _rOther.x1 = _nx; _rOther.y1 = _ny; _rOther.nodeA = _nid; }
                else               { _rOther.x2 = _nx; _rOther.y2 = _ny; _rOther.nodeB = _nid; }
                _fused = true; break;
              }
            }
          }
        }
      }
    }
    edRedraw();
  }
  // Cancelar timer de doble tap de regla si el dedo se levantó sin segundo tap
  // (el timer mismo iniciará el drag diferido si procede)
  // Limpiar pointer del mapa SIEMPRE (antes de la guarda)
  if(e && e.pointerId !== undefined && window._edActivePointers){
    window._edActivePointers.delete(e.pointerId);
  }
  // Fill touch: confirmar siempre que no haya pinch activo — fuera de la guarda gestureActive
  if(edActiveTool === 'fill' && window._edFillPending){
    const fp = window._edFillPending; window._edFillPending = null;
    if(!window._edActivePointers || window._edActivePointers.size === 0){
      // Si hay shape/line seleccionada en modo barra flotante, aplicar fillColor
      if($('edDrawBar')?.classList.contains('visible') && edSelectedIdx >= 0){
        const _la = edLayers[edSelectedIdx];
        if(_la && (_la.type==='shape' || _la.type==='line')){
          _la.fillColor = edDrawColor;
          edPushHistory(); edRedraw();
        } else { edFloodFill(fp.nx, fp.ny); }
      } else { edFloodFill(fp.nx, fp.ny); }
    }
  }
  // ── RUBBER BAND en modo select (PC) → activar multiselect ──
  if(edActiveTool==='select' && edRubberBand){
    const _rbPos = window._edRubberBandEndPos || {clientX: window.innerWidth/2, clientY: window.innerHeight/2};
    window._edRubberBandEndPos = null;
    const rx0=Math.min(edRubberBand.x0,edRubberBand.x1);
    const ry0=Math.min(edRubberBand.y0,edRubberBand.y1);
    const rx1=Math.max(edRubberBand.x0,edRubberBand.x1);
    const ry1=Math.max(edRubberBand.y0,edRubberBand.y1);
    edRubberBand=null;
    if((rx1-rx0)>0.01 || (ry1-ry0)>0.01){
      const _found=[];
      edLayers.forEach((la,i)=>{ if(_edAllCornersInside(la,rx0,ry0,rx1,ry1)) _found.push(i); });
      if(_found.length===1){
        // Un solo objeto → selección normal
        edSelectedIdx=_found[0];
        _edDrawLockUI(); _edPropsOverlayShow();
        edRenderOptionsPanel('props');
      } else if(_found.length>=2){
        edMultiSel=_found;
        edSelectedIdx=-1;
        edActiveTool='multiselect';
        edCanvas.className='tool-multiselect';
        _msRecalcBbox();
        $('edMultiSelBtn')?.classList.add('active');
        _edUpdateMultiSelPanel();
      }
    }
    edRedraw(); return;
  }
  // ── MULTI-SELECCIÓN ────────────────────────────────────────
  if(edActiveTool==='multiselect'){
    if(edRubberBand){
      // Confirmar rubber band → poblar edMultiSel
      const rx0=Math.min(edRubberBand.x0,edRubberBand.x1);
      const ry0=Math.min(edRubberBand.y0,edRubberBand.y1);
      const rx1=Math.max(edRubberBand.x0,edRubberBand.x1);
      const ry1=Math.max(edRubberBand.y0,edRubberBand.y1);
      edRubberBand=null;
      if((rx1-rx0)>0.005 || (ry1-ry0)>0.005){
        edMultiSel=[];
        edLayers.forEach((la,i)=>{
          // Los objetos bloqueados se incluyen — solo se impide moverlos
          if(_edAllCornersInside(la,rx0,ry0,rx1,ry1)) edMultiSel.push(i);
        });
      }
      if(edMultiSel.length) _msRecalcBbox();  // bbox inicial al seleccionar
      if(edMultiSel.length >= 2){
        window._edRubberBandEndPos = null;
        _edUpdateMultiSelPanel();
      }
      edRedraw();
    }
    if(edMultiDragging||edMultiResizing||edMultiRotating){
      if(!_edPinchHappened && edMultiSel.length && window._edMoved) edPushHistory();
      if(edMultiSel.length) _msRecalcBbox();
    }
    edMultiDragging=false; edMultiResizing=false; edMultiRotating=false;
    edMultiDragOffs=[];
    const _wasMoved = window._edMoved;
    window._edMoved=false;
    // Modo grupo silencioso: nunca limpiar aquí — solo se limpia al tocar fuera (edOnStart)
    if(window._edGroupSilentTool !== undefined){
      if(_wasMoved) _msRecalcBbox();
      clearTimeout(window._edLongPress); window._edLongPressReady=false;
      if(!window._edActivePointers || window._edActivePointers.size === 0) _edPinchHappened = false;
      return;
    }
    // Resetear flag de pinch cuando no quedan dedos
    if(!window._edActivePointers || window._edActivePointers.size === 0) _edPinchHappened = false;
    clearTimeout(window._edLongPress); window._edLongPressReady=false;
    return;
  }
  // ─────────────────────────────────────────────────────────

  // ── Nuevo sistema cursor: levantar el dedo ──
  if(_cof.on && (_cof._dragging || _cof._pendingStart || _cof._strokeStarted)){
    _cofHandleUp(e);
    clearTimeout(window._edLongPress); window._edLongPressReady=false;
    return;
  }

  // Sin gesto activo → ignorar el resto
  const gestureActive2 = edIsDragging||edIsResizing||edIsTailDragging||edPainting||edPinching||edIsRotating||!!edRubberBand||!!_edShapeStart||(_cof.on&&(_cof._dragging||_cof._pendingStart||_cof._strokeStarted));
  if(!gestureActive2){ clearTimeout(window._edLongPress); window._edLongPressReady=false; return; }
  if(edPinching && (!window._edActivePointers || window._edActivePointers.size < 2)){
    edPinchEnd();
    return;
  }
  if(edPainting && edActiveTool !== 'fill'){
    // Nuevo sistema cursor: el trazo lo gestiona _cofHandleUp → no duplicar
    if(_cof.on && _cof._strokeStarted) return;
    edSaveDrawData(); _edOffsetFirstMove = false; _edFromSaved = false;
  }
  // ── SHAPE: al soltar, convertir a LineLayer y fusionar inmediatamente ──
  if(edActiveTool==='shape' && _edShapeStart && _edShapePreview){
    _edShapePreview.width  = Math.max(_edShapePreview.width,  0.02);
    _edShapePreview.height = Math.max(_edShapePreview.height, 0.02);
    _edShapePreview.color     = edDrawColor || '#000000';
    _edShapePreview.fillColor = 'none'; // sin relleno durante construcción
    _edShapePreview.lineWidth = edDrawSize  || 3;
    // Convertir siempre a LineLayer (rect=4pts con nodos, ellipse=32pts)
    const _ll = _edShapeToLineLayer(_edShapePreview);
    _edLineFusionId = null;
    delete _ll._fusionId;
    const _pi = edLayers.indexOf(_edShapePreview);
    if(_pi >= 0) edLayers[_pi] = _ll;
    _edPendingShape = null; _edShapeStart = null; _edShapePreview = null;
    edSelectedIdx = edLayers.indexOf(_ll);
    _edLineType = 'select'; edActiveTool = 'select'; edCanvas.className = '';
    edPushHistory(); edRedraw();
    _edActivateLineTool(false, true); // true = objeto recién creado
    return;
  }
  clearTimeout(window._edLongPress);
  const wasDragging = edIsDragging||edIsResizing||edIsTailDragging||edIsRotating;
  window._edLongPressReady = false;
  // BUG-E09: solo guardar historial si algo cambió de verdad
  // Si hubo pinch, cancelar cualquier drag — el último dedo al levantarse no debe mover nada
  if(_edPinchHappened){
    // Resetear flag solo cuando no quedan dedos activos
    if(!window._edActivePointers || window._edActivePointers.size === 0) _edPinchHappened = false;
    edIsDragging=false; edIsResizing=false; edIsTailDragging=false; edIsRotating=false;
    return;
  }
  if(wasDragging && (window._edMoved || edIsTailDragging)){
    // Si el objeto activo es shape/line con panel abierto → historial local
    const _panel=$('edOptionsPanel');
    const _mode=_panel?.dataset.mode;
    const _la=edSelectedIdx>=0?edLayers[edSelectedIdx]:null;
    if((_mode==='shape'||_mode==='line'||$('edShapeBar')?.classList.contains('visible'))
       && _la && (_la.type==='shape'||_la.type==='line')){
      _edShapePushHistory();
    } else {
      edPushHistory();
    }
  }
  window._edMoved = false;
  edIsDragging=false;edIsResizing=false;edIsTailDragging=false;edIsRotating=false;
  // Limpiar snapshots de LineLayer
  if(edSelectedIdx>=0 && edLayers[edSelectedIdx]?.type==='line'){
    const _ll=edLayers[edSelectedIdx];
    // Recentrar bbox al soltar el vértice arrastrado
    if(_ll.points && _ll.points.length) _ll._updateBbox();
    delete _ll._rotPointsSnap; delete _ll._rotCx; delete _ll._rotCy; delete _ll._rotStartAngle;
    delete _ll._dragPointsSnap; delete _ll._dragStartX; delete _ll._dragStartY;
  }
  if(edInitialSize._linePointsSnap) delete edInitialSize._linePointsSnap;
}


/* ══════════════════════════════════════════
   HISTORIAL LOCAL — SHAPE / LINE
   Independiente del historial global. Se inicia al abrir el panel
   y se destruye al cerrarlo. Los botones undo/redo del panel y de
   la barra flotante usan ESTE historial, no el global.
   ══════════════════════════════════════════ */
let _edShapeHistory = [], _edShapeHistIdx = -1, _edShapeHistIdxBase = 0;
// ── Historial vectorial por snapshots (sistema nuevo) ──
// Cada snapshot = { vecLayers: [...JSON], lineLayer: JSON|null }
// vecLayers = layers de tipo 'line' o 'shape' de la página actual
// lineLayer = _edLineLayer en construcción (si existe)
let _vsHistory = [];   // array de snapshots
let _vsHistIdx  = -1;  // índice actual

// ── Historial vectorial por snapshots ────────────────────────────────────
function _vsSerLayer(l) {
  // Serialización ligera para historial local (sin bitmaps)
  if (l.type === 'line') {
    const cr = l.cornerRadii || {};
    return {
      type: 'line',
      x: l.x, y: l.y, width: l.width, height: l.height,
      rotation: l.rotation || 0,
      color: l.color, fillColor: l.fillColor || 'none',
      lineWidth: l.lineWidth, opacity: l.opacity ?? 1,
      closed: l.closed || false,
      _fromEllipse: l._fromEllipse || false,
      points: l.points ? l.points.map(p => p ? { x: p.x, y: p.y, cp1: p.cp1 ? { ...p.cp1 } : undefined, cp2: p.cp2 ? { ...p.cp2 } : undefined, curve: p.curve } : null) : [],
      cornerRadii: Object.keys(cr).length ? { ...cr } : undefined,
      subPaths: l.subPaths && l.subPaths.length ? l.subPaths.map(sp => sp.map(p => p ? { x: p.x, y: p.y } : null)) : undefined,
      _fusionId: l._fusionId,
      groupId: l.groupId, locked: l.locked,
    };
  }
  if (l.type === 'shape') {
    return {
      type: 'shape', shape: l.shape,
      x: l.x, y: l.y, width: l.width, height: l.height,
      rotation: l.rotation || 0,
      color: l.color, fillColor: l.fillColor || 'none',
      lineWidth: l.lineWidth, opacity: l.opacity ?? 1,
      cornerRadius: l.cornerRadius,
      cornerRadii: l.cornerRadii ? (Array.isArray(l.cornerRadii) ? [...l.cornerRadii] : { ...l.cornerRadii }) : undefined,
      _fusionId: l._fusionId,
      groupId: l.groupId, locked: l.locked,
    };
  }
  return null;
}

function _vsSnapshot() {
  const page = edPages[edCurrentPage];
  if (!page) return null;
  // Excluir _edLineLayer de vecLayers — se guarda por separado
  const vecLayers = page.layers
    .filter(l => (l.type === 'line' || l.type === 'shape') && l !== _edLineLayer)
    .map(l => _vsSerLayer(l));
  const lineLayer = _edLineLayer ? _vsSerLayer(_edLineLayer) : null;
  return { vecLayers, lineLayer };
}

function _vsPush() {
  const snap = _vsSnapshot();
  if (!snap) return;
  // Descartar futuros si estamos en medio del historial
  _vsHistory = _vsHistory.slice(0, _vsHistIdx + 1);
  _vsHistory.push(snap);
  _vsHistIdx = _vsHistory.length - 1;
  _edShapeUpdateUndoRedoBtns();
}

function _vsApply(snap) {
  if (!snap) return;
  const page = edPages[edCurrentPage];
  if (!page) return;

  // Restaurar layers vectoriales (excluye _edLineLayer)
  const vecRestored = snap.vecLayers
    .map(d => d ? edDeserLayer(d) : null)
    .filter(Boolean);

  // Restaurar _edLineLayer si estaba en construcción
  if (snap.lineLayer) {
    _edLineLayer = edDeserLayer(snap.lineLayer);
  } else {
    _edLineLayer = null;
  }

  // Reconstruir page.layers: mantener no-vectoriales en su posición,
  // insertar vectoriales donde estaban (antes del draw layer, después de stroke)
  const nonVec = page.layers.filter(l => l.type !== 'line' && l.type !== 'shape');
  const drawIdx = nonVec.findIndex(l => l.type === 'draw');
  const textIdx = nonVec.findIndex(l => l.type === 'text' || l.type === 'bubble');
  let insertAt = drawIdx >= 0 ? drawIdx : (textIdx >= 0 ? textIdx : nonVec.length);
  const before = nonVec.slice(0, insertAt);
  const after  = nonVec.slice(insertAt);
  const allVec = _edLineLayer ? [...vecRestored, _edLineLayer] : vecRestored;
  page.layers = [...before, ...allVec, ...after];
  edLayers = page.layers;

  // Seleccionar el último layer vectorial restaurado (el más relevante)
  const lastVec = vecRestored[vecRestored.length - 1];
  edSelectedIdx = lastVec ? page.layers.indexOf(lastVec) : (_edLineLayer ? page.layers.indexOf(_edLineLayer) : -1);
}

function _vsUndo() {
  if (_vsHistIdx < 0) {
    edToast('Nada que deshacer');
    return;
  }
  if (_vsHistIdx === 0) {
    // Restaurar al snapshot inicial (estado antes de crear objetos en esta sesión)
    _vsApply(_vsHistory[0]);
    _edLineLayer = null;
    edSelectedIdx = -1;
    _vsHistIdx = -1;
    _vsHistory = [];
    _edShapeHistory = []; _edShapeHistIdx = -1; _edShapeHistIdxBase = 0;
    edCloseOptionsPanel(); edShapeBarHide(); _edDrawUnlockUI();
    edActiveTool = 'select'; edCanvas.className = '';
    window._edIgnoreNextTap = true;
    edPushHistory();
    edRedraw();
    _edShapeUpdateUndoRedoBtns();
    return;
  }
  _vsHistIdx--;
  _vsApply(_vsHistory[_vsHistIdx]);
  edRedraw();
  _edActivateLineTool(false, true);
  _edShapeUpdateUndoRedoBtns();
}

function _vsRedo() {
  if (_vsHistIdx >= _vsHistory.length - 1) return;
  _vsHistIdx++;
  _vsApply(_vsHistory[_vsHistIdx]);
  edRedraw();
  _edActivateLineTool(false, true);
  _edShapeUpdateUndoRedoBtns();
}

let _vsPreSessionLayers = new Set(); // referencias a layers vectoriales previos a la sesión

function _vsInit(isNew) {
  const page = edPages[edCurrentPage];
  if (!page) return;

  if (isNew) {
    _vsPreSessionLayers = new Set(
      page.layers.filter(l => l.type === 'line' || l.type === 'shape')
    );
    _vsHistory = [_vsSnapshot()];
    _vsHistIdx = 0;
  } else {
    const _currentLayer = edSelectedIdx >= 0 ? page.layers[edSelectedIdx] : null;
    _vsPreSessionLayers = new Set(
      page.layers.filter(l =>
        (l.type === 'line' || l.type === 'shape') && l !== _currentLayer
      )
    );
    _vsHistory = [];
    _vsHistIdx = -1;
  }
  _edShapeUpdateUndoRedoBtns();
}

function _vsClear() {
  _vsHistory = []; _vsHistIdx = -1;
  _vsPreSessionLayers = new Set();
  _edShapeUpdateUndoRedoBtns();
}

// ── Parche: _edShapeUpdateUndoRedoBtns ahora usa _vsHistIdx ──
// Se sobreescribe más abajo tras la definición original.

function _edShapePushHistory(){
  let la = edSelectedIdx>=0 ? edLayers[edSelectedIdx] : null;
  if(!la && _edLineLayer) la = _edLineLayer; // durante construcción
  if(!la){
    const _mode = $("edOptionsPanel")?.dataset.mode;
    if(_mode==="shape"||_mode==="line"||$("edShapeBar")?.classList.contains("visible")){
      la = edLayers.find(l => l.type==="shape"||l.type==="line")||null;
    }
  }
  if(!la) return;
  // Guard anti-contaminación: si no hay sesión activa (historial vacío) Y no hay
  // objeto seleccionado ni en construcción, no capturar objetos ajenos del canvas.
  if(_edShapeHistory.length === 0 && !_edLineLayer && edSelectedIdx < 0) return;
  _edShapeHistory = _edShapeHistory.slice(0, _edShapeHistIdx + 1);
  _edShapeHistory.push(JSON.stringify(edSerLayer(la)));
  _edShapeHistIdx = _edShapeHistory.length - 1;
  // Sistema _vs*: snapshot completo independiente del historial global
  _vsPush();
  _edShapeUpdateUndoRedoBtns();
  // Actualizar miniaturas con debounce (evitar regenerar en cada evento de slider)
  clearTimeout(window._edThumbRefreshTimer);
  window._edThumbRefreshTimer = setTimeout(()=>{
    // Regenerar todos los thumbs del nav (garantiza fidelidad con curvas V/C)
    edUpdateNavPages();
    // El overlay de capas se destruye al cerrar — si existe, está abierto
    if(typeof _lyRender==='function' && document.getElementById('edLayersOverlay')){
      _lyRender();
    }
  }, 300);
}

function _edShapeInitHistory(isNew){
  let la = edSelectedIdx>=0 ? edLayers[edSelectedIdx] : null;
  if(!la){ la = edLayers.find(l => l.type==="line"||l.type==="shape")||null; }
  if(isNew && la){
    if(_edShapeHistory.length > 1) {
      // Historial de nodos ya existe (cierre de polígono o re-render del panel):
      // El push del cierre ya fue registrado por _edShapePushHistory en _edFinishLine.
      // NO tocar el historial — solo actualizar los botones.
      // (no hacer nada más aquí)
    } else if(_edShapeHistory.length > 0 && _edLineFusionId){
      // Sesión de fusión en curso: añadir nuevo estado al historial existente
      _edShapeHistory = _edShapeHistory.slice(0, _edShapeHistIdx + 1);
      _edShapeHistory.push(JSON.stringify(edSerLayer(la)));
      _edShapeHistIdx = _edShapeHistory.length - 1;
    } else {
      // Primera apertura real: historial nuevo con null como estado 0
      _edShapeHistory = [null, JSON.stringify(edSerLayer(la))];
      _edShapeHistIdx = 1;
      _edShapeHistIdxBase = 0;
    }
  } else {
    // Si ya hay historial activo con pasos (sesión en curso), conservarlo.
    // Esto ocurre cuando el usuario cambia de herramienta dentro del panel
    // (ej: de recta a rectángulo) sin cerrar la sesión.
    if(_edShapeHistory.length > 1) {
      // No reiniciar — el historial sigue siendo válido
    } else {
      // Apertura de objeto existente (doble tap) o primera vez: estado base = objeto actual
      _edShapeHistory = [la ? JSON.stringify(edSerLayer(la)) : null];
      _edShapeHistIdx = 0;
      _edShapeHistIdxBase = 0;
    }
  }
  _edShapeUpdateUndoRedoBtns();
}

function _edShapeClearHistory(){
  _edShapeHistory = []; _edShapeHistIdx = -1; _edShapeHistIdxBase = 0;
  _edShapeUpdateUndoRedoBtns();
}

function _edShapeApplyHistory(snapshot){
  if(!snapshot){
    // Estado inicial: el objeto no existía → eliminar
    const la = edSelectedIdx>=0 ? edLayers[edSelectedIdx] : (_edLineLayer || null);
    if(la){
      // Si tiene múltiples contornos (fusión), quitar solo el último contorno
      if(la.type==='line' && la.points){
        const _lastNull = la.points.lastIndexOf(null);
        if(_lastNull > 0){
          la.points = la.points.slice(0, _lastNull);
          la._updateBbox();
          // Si queda solo 1 contorno, ya no hay fusión activa
          if(!la.points.includes(null)) _edLineFusionId = null;
          edRedraw();
          return;
        }
      }
      // Solo 1 contorno o no es line → eliminar el objeto
      const idx = edLayers.indexOf(la);
      if(idx>=0) edLayers.splice(idx, 1);
      const page=edPages[edCurrentPage]; if(page) page.layers=edLayers;
    }
    if(la === _edLineLayer) _edLineLayer = null;
    // Limpiar sesión de fusión
    _edLineFusionId = null;
    edSelectedIdx=-1;
    edCloseOptionsPanel();
    edShapeBarHide();
    _edDrawUnlockUI();
    edActiveTool='select'; edCanvas.className='';
    _edShapeStart=null; _edShapePreview=null; _edPendingShape=null;
    // Bloquear el siguiente toque para evitar selección accidental
    window._edIgnoreNextTap = true;
    // Limpiar historial vectorial: ya no hay sesión activa
    _edShapeHistory = []; _edShapeHistIdx = -1; _edShapeHistIdxBase = 0;
    // Sincronizar historial global: el objeto ya no existe en el canvas
    // Esto evita que un redo global restaure el objeto eliminado por undo local
    edPushHistory();
    edRedraw();
    return;
  }
  const la = edSelectedIdx>=0 ? edLayers[edSelectedIdx] : (_edLineLayer || null); if(!la) return;
  const d = JSON.parse(snapshot);
  // Restaurar propiedades del layer sin cambiar su posición en el array
  if(d.color        !== undefined) la.color       = d.color;
  if(d.fillColor    !== undefined) la.fillColor   = d.fillColor;
  if(d.lineWidth    !== undefined) la.lineWidth   = d.lineWidth;
  if(d.opacity      !== undefined) la.opacity     = d.opacity;
  if(d.rotation     !== undefined) la.rotation    = d.rotation;
  if(d.x            !== undefined){ la.x=d.x; la.y=d.y; la.width=d.width; la.height=d.height; }
  if(d.shape        !== undefined) la.shape       = d.shape;
  if(d.points       !== undefined) la.points      = d.points.slice();
  // T1: restaurar _fusionId para que el historial vectorial sea coherente
  if(d._fusionId !== undefined){ la._fusionId = d._fusionId; }
  else { delete la._fusionId; } // snapshot sin _fusionId → objeto ya no es miembro de fusión
  if(d.closed       !== undefined) la.closed      = d.closed;
  if(d.cornerRadius !== undefined) la.cornerRadius= d.cornerRadius;
  la.cornerRadii = d.cornerRadii
    ? (Array.isArray(d.cornerRadii) ? [...d.cornerRadii] : {...d.cornerRadii})
    : undefined;
  _esbSync();
  edRedraw();
}

function edShapeUndo(){
  if(_vsHistory.length === 0){ edToast('Nada que deshacer'); return; }
  _vsUndo();
}

function edShapeRedo(){
  if(_vsHistIdx >= _vsHistory.length - 1){ edToast('Nada que rehacer'); return; }
  _vsRedo();
}

function _edShapeUpdateUndoRedoBtns(){
  const canUndo = _vsHistory.length > 0;
  const canRedo = _vsHistIdx < _vsHistory.length - 1;
  const su=$('op-shape-undo'), sr=$('op-shape-redo');
  if(su) su.disabled = !canUndo;
  if(sr) sr.disabled = !canRedo;
  const lu=$('op-line-undo'), lr=$('op-line-redo');
  if(lu) lu.disabled = !canUndo;
  if(lr) lr.disabled = !canRedo;
  const bu=$('esb-undo'), br=$('esb-redo');
  if(bu) bu.style.opacity = canUndo ? '1' : '0.3';
  if(br) br.style.opacity = canRedo ? '1' : '0.3';
}

function _edDrawPushHistory(){
  // Guardar snapshot del DrawLayer actual
  const page = edPages[edCurrentPage]; if(!page) return;
  const dl = page.layers.find(l => l.type === 'draw'); if(!dl) return;
  // Cortar el futuro si hay
  edDrawHistory = edDrawHistory.slice(0, edDrawHistoryIdx + 1);
  edDrawHistory.push(dl.toDataUrlFull());
  if(edDrawHistory.length > ED_MAX_DRAW_HISTORY) edDrawHistory.shift();
  edDrawHistoryIdx = edDrawHistory.length - 1;
  _edDrawUpdateUndoRedoBtns();
}
function _edDrawApplyHistory(dataUrl){
  // El historial ahora guarda el workspace completo (toDataUrlFull)
  // → restaurar 1:1 sin recortar ni reposicionar
  const page = edPages[edCurrentPage]; if(!page) return;
  let dl = page.layers.find(l => l.type === 'draw');
  if(!dl){
    dl = new DrawLayer();
    const firstTextIdx = page.layers.findIndex(l => l.type==='text' || l.type==='bubble');
    if(firstTextIdx >= 0) page.layers.splice(firstTextIdx, 0, dl);
    else page.layers.push(dl);
    edLayers = page.layers;
  }
  dl.clear();
  if(dataUrl){
    const img = new Image();
    img.onload = () => {
      dl._ctx.drawImage(img, 0, 0, ED_CANVAS_W, ED_CANVAS_H);
      edRedraw();
    };
    img.src = dataUrl;
  } else {
    edRedraw();
  }
}
function edDrawUndo(){
  if(edDrawHistoryIdx <= 0){ edToast('Nada que deshacer'); return; }
  edDrawHistoryIdx--;
  _edDrawApplyHistory(edDrawHistory[edDrawHistoryIdx]);
  _edDrawUpdateUndoRedoBtns();
}
function edDrawRedo(){
  if(edDrawHistoryIdx >= edDrawHistory.length - 1){ edToast('Nada que rehacer'); return; }
  edDrawHistoryIdx++;
  _edDrawApplyHistory(edDrawHistory[edDrawHistoryIdx]);
  _edDrawUpdateUndoRedoBtns();
}
function _edDrawUpdateUndoRedoBtns(){
  const u=$('op-draw-undo'), r=$('op-draw-redo');
  if(u) u.disabled = edDrawHistoryIdx <= 0;
  if(r) r.disabled = edDrawHistoryIdx >= edDrawHistory.length - 1;
  // Barra flotante
  const bu=$('edb-undo'), br=$('edb-redo');
  if(bu) bu.style.opacity = edDrawHistoryIdx <= 0 ? '0.3' : '1';
  if(br) br.style.opacity = edDrawHistoryIdx >= edDrawHistory.length - 1 ? '0.3' : '1';
}
function _edDrawClearHistory(){
  edDrawHistory = []; edDrawHistoryIdx = -1;
  _edDrawUpdateUndoRedoBtns();
}
function _edDrawInitHistory(){
  // Captura el estado actual del DrawLayer como punto de partida.
  // El primer trazo nuevo quedará en idx=1 y podrá deshacerse hasta idx=0.
  const page = edPages[edCurrentPage]; if(!page) return;
  const dl = page.layers.find(l => l.type === 'draw');
  edDrawHistory = [dl ? dl.toDataUrlFull() : null];
  edDrawHistoryIdx = 0;
  _edDrawUpdateUndoRedoBtns();
}
/* ══════════════════════════════════════════
   DIBUJO LIBRE  (DrawLayer)
   ══════════════════════════════════════════ */
function _edGetOrCreateDrawLayer(){
  const page = edPages[edCurrentPage]; if(!page) return null;
  let dl = page.layers.find(l => l.type === 'draw');
  if(dl){
    // T9: DrawLayer ya existe — usarlo en su posición actual sin moverlo
    edLayers = page.layers;
    return dl;
  }
  // No existe: crear nuevo e insertar antes del primer texto (o al final)
  dl = new DrawLayer();
  const firstTextIdx = page.layers.findIndex(l => l.type==='text' || l.type==='bubble');
  if(firstTextIdx >= 0) page.layers.splice(firstTextIdx, 0, dl);
  else page.layers.push(dl);
  edLayers = page.layers;
  return dl;
}

/* ══════════════════════════════════════════
   FLOOD FILL (Scanline algorithm)
   ══════════════════════════════════════════ */
function edFloodFill(nx, ny){
  const page = edPages[edCurrentPage]; if(!page) return;
  const dl = _edGetOrCreateDrawLayer();
  if(dl.locked && !($('edOptionsPanel')?.classList.contains('open') && $('edOptionsPanel')?.dataset.mode==='draw')){ _edShowLockIconDraw(dl); return; }
  const canvas = dl._canvas, ctx = dl._ctx;
  const W = canvas.width, H = canvas.height;

  const wx = Math.round(edMarginX() + nx * edPageW());
  const wy = Math.round(edMarginY() + ny * edPageH());
  if(wx < 0 || wx >= W || wy < 0 || wy >= H) return;

  const mx = Math.round(edMarginX()), my = Math.round(edMarginY());
  const pw = Math.round(edPageW()),   ph = Math.round(edPageH());
  const insidePage = wx >= mx && wx < mx+pw && wy >= my && wy < my+ph;
  const x0 = insidePage ? mx : 0,      y0 = insidePage ? my : 0;
  const x1 = insidePage ? mx+pw-1 : W-1, y1 = insidePage ? my+ph-1 : H-1;
  const fw = x1-x0+1, fh = y1-y0+1;

  // Leer datos originales del DrawLayer
  const origImageData = ctx.getImageData(x0, y0, fw, fh);
  const orig = origImageData.data;

  // Color de relleno
  const fc = edDrawColor;
  const fR = parseInt(fc.slice(1,3),16),
        fG = parseInt(fc.slice(3,5),16),
        fB = parseInt(fc.slice(5,7),16),
        fA = Math.round((edDrawOpacity/100) * 255);

  // ── TÉCNICA DOS CAPAS (como Krita/Photoshop) ─────────────────────────────
  // 1. Canvas de RELLENO: binarizar semitransparentes, hacer flood fill.
  // 2. Canvas de LINE ART: el original sin modificar.
  // 3. Composicionar: fill debajo, line art original encima (source-over).
  //    El antialiasing del trazo composiciona sobre el nuevo fill naturalmente.

  // Canvas de relleno con datos binarizados
  const fillCanvas = document.createElement('canvas');
  fillCanvas.width = fw; fillCanvas.height = fh;
  const fillCtx = fillCanvas.getContext('2d');
  const fillImageData = fillCtx.createImageData(fw, fh);
  const fd = fillImageData.data;

  for(let i=0; i<fw*fh; i++){
    const pi=i*4, a=orig[pi+3];
    if(a===255){ fd[pi]=orig[pi]; fd[pi+1]=orig[pi+1]; fd[pi+2]=orig[pi+2]; fd[pi+3]=255; }
    else if(a>=128){ fd[pi]=orig[pi]; fd[pi+1]=orig[pi+1]; fd[pi+2]=orig[pi+2]; fd[pi+3]=255; }
    else { fd[pi]=0; fd[pi+1]=0; fd[pi+2]=0; fd[pi+3]=0; }
  }

  // Semilla desde canvas binarizado
  const lx = wx-x0, ly = wy-y0;
  const si0 = (ly*fw+lx)*4;
  const tR=fd[si0], tG=fd[si0+1], tB=fd[si0+2], tA=fd[si0+3];
  if(tR===fR && tG===fG && tB===fB && tA===fA) return;

  // Flood fill sobre canvas binarizado
  const TOL = 15;
  function match(i){
    return Math.abs(fd[i  ]-tR)<=TOL && Math.abs(fd[i+1]-tG)<=TOL &&
           Math.abs(fd[i+2]-tB)<=TOL && Math.abs(fd[i+3]-tA)<=TOL;
  }
  const filled = new Uint8Array(fw*fh);
  const stack = [];
  stack.push({y:ly, left:lx, right:lx, dy:1});
  stack.push({y:ly, left:lx, right:lx, dy:-1});
  filled[ly*fw+lx]=1;
  fd[si0]=fR; fd[si0+1]=fG; fd[si0+2]=fB; fd[si0+3]=fA;

  while(stack.length){
    const {y, left, right, dy} = stack.pop();
    const ny2 = y+dy;
    if(ny2<0||ny2>=fh) continue;
    let x=left;
    while(x>0 && !filled[ny2*fw+(x-1)] && match((ny2*fw+(x-1))*4)) x--;
    let rx=right;
    while(rx<fw-1 && !filled[ny2*fw+(rx+1)] && match((ny2*fw+(rx+1))*4)) rx++;
    let segStart=-1;
    for(let sx=x;sx<=rx;sx++){
      const idx=ny2*fw+sx;
      if(!filled[idx] && match(idx*4)){
        if(segStart===-1) segStart=sx;
        filled[idx]=1;
        const pi=idx*4;
        fd[pi]=fR; fd[pi+1]=fG; fd[pi+2]=fB; fd[pi+3]=fA;
      } else if(segStart!==-1){
        stack.push({y:ny2,left:segStart,right:sx-1,dy:dy});
        stack.push({y:ny2,left:segStart,right:sx-1,dy:-dy});
        segStart=-1;
      }
    }
    if(segStart!==-1){
      stack.push({y:ny2,left:segStart,right:rx,dy:dy});
      stack.push({y:ny2,left:segStart,right:rx,dy:-dy});
    }
  }

  // Escribir resultado al DrawLayer combinando a nivel de píxel
  // Para preservar la editabilidad futura, el DrawLayer queda con:
  //   · Píxeles rellenados (filled=1): color fill opaco
  //   · Resto: valor EXACTO de origData (semitransparentes del trazo intactos)
  // NO usar ctx.drawImage() para composicionar — mezcla semitransparentes
  // con el fill convirtiéndolos en opacos y rompiendo futuros rellenos.
  const resultImageData = ctx.createImageData(fw, fh);
  const rd = resultImageData.data;
  for(let i=0; i<fw*fh; i++){
    const pi=i*4;
    if(filled[i]){
      rd[pi]=fR; rd[pi+1]=fG; rd[pi+2]=fB; rd[pi+3]=fA;
    } else {
      rd[pi]=orig[pi]; rd[pi+1]=orig[pi+1]; rd[pi+2]=orig[pi+2]; rd[pi+3]=orig[pi+3];
    }
  }

  _edDrawPushHistory();
  ctx.putImageData(resultImageData, x0, y0);
  edRedraw();
}

function edColorErase(nx, ny){
  const page = edPages[edCurrentPage]; if(!page) return;
  const dl = page.layers.find(l => l.type === 'draw'); if(!dl) return;
  const canvas = dl._canvas, ctx = dl._ctx;
  const W = canvas.width, H = canvas.height;

  const wx = Math.round(edMarginX() + nx * edPageW());
  const wy = Math.round(edMarginY() + ny * edPageH());
  if(wx < 0 || wx >= W || wy < 0 || wy >= H) return;

  const mx = Math.round(edMarginX()), my = Math.round(edMarginY());
  const pw = Math.round(edPageW()),   ph = Math.round(edPageH());
  const insidePage = wx >= mx && wx < mx+pw && wy >= my && wy < my+ph;
  const x0 = insidePage ? mx : 0,    y0 = insidePage ? my : 0;
  const x1 = insidePage ? mx+pw-1 : W-1, y1 = insidePage ? my+ph-1 : H-1;
  const fw = x1-x0+1, fh = y1-y0+1;

  const imageData = ctx.getImageData(x0, y0, fw, fh);
  const data = imageData.data;

  const lx = wx-x0, ly = wy-y0;
  const si0 = (ly*fw+lx)*4;
  const tR=data[si0], tG=data[si0+1], tB=data[si0+2], tA=data[si0+3];
  if(tA < 5) return;

  const strength = 1.0;  // siempre al 100%

  // Tolerancia amplia para capturar píxeles de antialiasing del borde
  // (los píxeles de borde son mezcla del color del trazo + fondo)
  const TOL = 80;
  function match(i){
    return Math.abs(data[i  ]-tR) <= TOL &&
           Math.abs(data[i+1]-tG) <= TOL &&
           Math.abs(data[i+2]-tB) <= TOL &&
           data[i+3] > 3;  // solo píxeles con algo de contenido
  }

  // Span Fill para zona contigua (igual que flood fill)
  const inZone = new Uint8Array(fw * fh);
  const stack2 = [];
  stack2.push({y:ly, left:lx, right:lx, dy:1});
  stack2.push({y:ly, left:lx, right:lx, dy:-1});
  inZone[ly*fw+lx] = 1;
  while(stack2.length){
    const {y, left, right, dy} = stack2.pop();
    const ny2 = y + dy;
    if(ny2 < 0 || ny2 >= fh) continue;
    let x = left;
    while(x > 0 && !inZone[ny2*fw+(x-1)] && match((ny2*fw+(x-1))*4)) x--;
    let rx = right;
    while(rx < fw-1 && !inZone[ny2*fw+(rx+1)] && match((ny2*fw+(rx+1))*4)) rx++;
    let segStart = -1;
    for(let sx=x; sx<=rx; sx++){
      const idx = ny2*fw+sx;
      if(!inZone[idx] && match(idx*4)){
        if(segStart === -1) segStart = sx;
        inZone[idx] = 1;
      } else if(segStart !== -1){
        stack2.push({y:ny2, left:segStart, right:sx-1, dy:dy});
        stack2.push({y:ny2, left:segStart, right:sx-1, dy:-dy});
        segStart = -1;
      }
    }
    if(segStart !== -1){
      stack2.push({y:ny2, left:segStart, right:rx, dy:dy});
      stack2.push({y:ny2, left:segStart, right:rx, dy:-dy});
    }
  }

  // Algoritmo "Color to Alpha" de Krita/GIMP (Kevin Cozens):
  // Calcula exactamente cuánto del color objetivo contribuye a cada píxel
  // y lo elimina sin dejar contorno residual.
  // 
  // Para cada canal C: si pix.C > target.C → alphaC = (pix.C - target.C) / (255 - target.C)
  //                    si pix.C < target.C → alphaC = (target.C - pix.C) / target.C
  //                    si pix.C = target.C → alphaC = 0
  // new_alpha = max(alphaR, alphaG, alphaB)  ← contribución total del color objetivo
  // Luego descomponer: pix = target*(1-new_alpha) + result*new_alpha → despejar result
  // new_A = original_alpha * new_alpha * strength  (strength = opacidad del usuario)

  for(let i=0; i<fw*fh; i++){
    if(!inZone[i]) continue;
    const pi = i*4;
    const r=data[pi], g=data[pi+1], b=data[pi+2], a=data[pi+3];
    if(a < 1) continue;

    // Calcular alpha por canal (cuánto del target hay en este pixel)
    let aR=0, aG=0, aB=0;
    if(r > tR && tR < 255) aR = (r - tR) / (255 - tR);
    else if(r < tR && tR > 0)   aR = (tR - r) / tR;
    if(g > tG && tG < 255) aG = (g - tG) / (255 - tG);
    else if(g < tG && tG > 0)   aG = (tG - g) / tG;
    if(b > tB && tB < 255) aB = (b - tB) / (255 - tB);
    else if(b < tB && tB > 0)   aB = (tB - b) / tB;

    // El nuevo alpha es la máxima contribución del color objetivo (extracción completa)
    const newAlpha = Math.max(aR, aG, aB);
    if(newAlpha < 0.001){ data[pi+3]=0; continue; }  // prácticamente idéntico → borrar

    // Calcular resultado de Color to Alpha al 100% (extracción completa del color objetivo)
    const inv = 1 - newAlpha;
    const outR = Math.max(0, Math.min(255, (r - tR*inv) / newAlpha));
    const outG = Math.max(0, Math.min(255, (g - tG*inv) / newAlpha));
    const outB = Math.max(0, Math.min(255, (b - tB*inv) / newAlpha));
    const outA = a * newAlpha;

    // Interpolar entre pixel original y resultado según la opacidad del usuario:
    // strength=1.0 → resultado completo (borrado total del color)
    // strength=0.5 → mezcla 50/50 (semi-borrado limpio sin artefactos)
    // strength=0.0 → sin cambio
    data[pi  ] = Math.round(r   + (outR - r)   * strength);
    data[pi+1] = Math.round(g   + (outG - g)   * strength);
    data[pi+2] = Math.round(b   + (outB - b)   * strength);
    data[pi+3] = Math.round(a   + (outA - a)   * strength);
  }

  // Guardar snapshot ANTES de aplicar
  _edDrawPushHistory();
  ctx.putImageData(imageData, x0, y0);
  edRedraw();
}
let _edLineAddTimer = null; // retardo táctil para detectar segundo dedo
function _edLineAddPoint(nx, ny, isTouch=false){
  if(!_edLineLayer){
    // Crear capa con el primer punto como centro
    _edLineLayer = new LineLayer();
    _edLineLayer.color    = edDrawColor || '#000000';
    _edLineLayer.fillColor = 'none'; // sin relleno durante construcción; se aplica al OK o al fusionar
    _edLineLayer.lineWidth = edDrawSize || 3;
    _edLineLayer.x = nx; _edLineLayer.y = ny;
    _edLineLayer.points.push({x:0, y:0}); // primer punto en local = (0,0)
    _edInsertLayerAbove(_edLineLayer);
  } else {
    // Comprobar si toca el primer vértice (cerrar polígono)
    const absFirst = _edLineLayer.absPoints()[0];
    const pw=edPageW(), ph=edPageH();
    const dx=(nx-absFirst.x)*pw, dy=(ny-absFirst.y)*ph;
    const _closeR = isTouch ? 44 : 15; // radio de cierre ampliado en táctil
    if(_edLineLayer.points.length>=3 && Math.sqrt(dx*dx+dy*dy)*edCamera.z<_closeR){
      _edLineLayer.closed=true;
      _edFinishLine();
      // Al cerrar un polígono → modo selección para editar vértices
      if(!edMinimized){
        _edLineType='select'; edActiveTool='select'; edCanvas.className='';
        // T6: recrear el panel completo para reflejar modo selección correctamente
        // (incluye botón ╱ listo para crear polígono fusionable)
        // Solo si el panel ya estaba abierto en modo line; NO abrir si veníamos de la barra flotante
        const _panelOpen2 = $('edOptionsPanel')?.classList.contains('open') && $('edOptionsPanel')?.dataset.mode==='line';
        const _shapeBarWasOpen = $('edShapeBar')?.classList.contains('visible');
        if(_panelOpen2 && !_shapeBarWasOpen) _edActivateLineTool(false, true); // true=isCreating: no reiniciar _vsPreSessionLayers
      }
      return;
    }
    _edLineLayer.addAbsPoint(nx, ny);
    // Modo segmento: confirmar automáticamente al llegar a 2 puntos
    if(_edLineType === 'segment' && _edLineLayer.points.length >= 2){
      _edFinishLine();
      return;
    }
  }
  _edShapePushHistory(); // guardar estado tras cada nodo para deshacer/rehacer
  edRedraw();
  const info=$('op-line-info');
  if(info) info.textContent=`${_edLineLayer.points.length} vértice(s). Toca el primero para cerrar.`;
}

// ── Cursor offset: inicia el seguimiento visual sin dibujar ──
// ════════════════════════════════════════════════
//  NUEVO SISTEMA DE CURSOR DESPLAZADO (_cof)
// ════════════════════════════════════════════════
function _cofShowHint(show) {
  const h = document.getElementById('edCofHint');
  if (!h) return;
  if (show) {
    h.innerHTML = '<b style="color:#1a8cff">Guía azul:</b> Posiciona el cursor<br><b style="color:#e02020">Guía roja:</b> Arrastra para dibujar';
    // Posicionar debajo del topbar + panel de opciones (si está abierto)
    const topbar = document.getElementById('edTopbar');
    const menu   = document.getElementById('edMenuBar');
    const panel  = document.getElementById('edOptionsPanel');
    const topH   = topbar ? topbar.getBoundingClientRect().bottom : 0;
    const menuH  = (menu && menu.style.display !== 'none') ? menu.getBoundingClientRect().height : 0;
    const panelH = (panel && panel.classList.contains('open')) ? panel.getBoundingClientRect().height : 0;
    h.style.top = (topH + menuH + panelH + 8) + 'px';
    h.style.display = 'block';
  } else {
    h.style.display = 'none';
  }
}
function _cofSetOn(on) {
  _cof.on = on;
  _edCursorOffset = on;
  if (!on) { _cofReset(); _cofHide(); _cofShowHint(false); return; }
  // Usar el centro del viewport visible (coordenadas CSS de pantalla)
  // El punto de arrastre aparece en el centro, el cursor 76px arriba
  const shell = document.getElementById('editorShell');
  const r = shell ? shell.getBoundingClientRect()
                  : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  const cw = r.left + r.width  / 2;
  const ch = r.top  + r.height / 2;
  // Posición del punto de arrastre: centro de la pantalla
  _cof.touchX = cw;
  _cof.touchY = ch;
  // Cursor desplazado según el ángulo elegido (izq/vertical/dcha)
  const _rad0 = _edCursorOffsetAngle * Math.PI / 180;
  _cof.cursorX = cw + _cof.distDefault * Math.sin(_rad0);
  _cof.cursorY = ch - _cof.distDefault * Math.cos(_rad0);
  _cof.dist = _cof.distDefault;
  _cof.savedClientX = _cof.cursorX;
  _cof.savedClientY = _cof.cursorY;
  _cof.state = 'idle_blue';
  // Sincronizar todos los controles visuales del cursor
  requestAnimationFrame(() => { _cofDraw(); _edbSyncOffsetBtn(); });
  if (on) _cofShowHint(true);
}
function _cofReset() {
  clearTimeout(_cof._timer);
  _cof.state = 'off';
  _cof._dragging = false;
  _cof._strokeStarted = false;
  _cof._pendingStart = false;
}
function _cofDist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

function _cofHandleTouch(e) {
  if (!_cof.on) return;
  _cofShowHint(false);
  const tx = e.clientX, ty = e.clientY;
  const dToArrastre = _cofDist(tx, ty, _cof.touchX, _cof.touchY);

  if (_cof.state === 'idle_blue') {
    if (dToArrastre <= _cof.MARGIN) {
      _cof._dragging = true;
    } else {
      // Saltar: mover el conjunto al nuevo punto, cursor en dirección del ángulo
      const _radJ = _edCursorOffsetAngle * Math.PI / 180;
      _cof.touchX = tx; _cof.touchY = ty;
      _cof.cursorX = tx + _cof.distDefault * Math.sin(_radJ);
      _cof.cursorY = ty - _cof.distDefault * Math.cos(_radJ);
      _cof.dist = _cof.distDefault;
      _cof.savedClientX = _cof.cursorX; _cof.savedClientY = _cof.cursorY;
      _cofDraw();
    }
    return;
  }
  if (_cof.state === 'red_ready' || _cof.state === 'red_cool') {
    if (dToArrastre <= _cof.MARGIN) {
      clearTimeout(_cof._timer);
      _cof._pendingStart = true;
      _cof._pendingMoveX = tx; _cof._pendingMoveY = ty;
    }
    // Fuera del margen en rojo → ignorar
    return;
  }
}

function _cofHandleMove(e) {
  if (!_cof.on) return;
  const tx = e.clientX, ty = e.clientY;

  if (_cof._dragging && _cof.state === 'idle_blue') {
    const _radD = _edCursorOffsetAngle * Math.PI / 180;
    _cof.touchX = tx; _cof.touchY = ty;
    _cof.cursorX = tx + _cof.dist * Math.sin(_radD);
    _cof.cursorY = ty - _cof.dist * Math.cos(_radD);
    _cofDraw();
    return;
  }
  if (_cof._pendingStart) {
    // La distancia se mide entre el dedo y el cursor guardado (punto real del trazo).
    // La herramienta se posiciona desde cursorX/Y usando esa distancia y el ángulo,
    // no en la posición cruda del dedo — así no hay error desde el primer momento.
    const d = _cofDist(tx, ty, _cof.cursorX, _cof.cursorY);
    _cof.dist = Math.max(10, d);
    const _radP = _edCursorOffsetAngle * Math.PI / 180;
    _cof.touchX = _cof.cursorX - _cof.dist * Math.sin(_radP);
    _cof.touchY = _cof.cursorY + _cof.dist * Math.cos(_radP);
    _cof._pendingStart = false;
    _cof.state = 'red_ready';
    _cofDraw();
    if (!_cof._strokeStarted) _cofStartStroke(e);
    return;
  }
  if (_cof._strokeStarted && edPainting) {
    // El punto real del trazo (cursorX/Y) se mueve con el delta del dedo.
    // La herramienta (touchX/Y) se recalcula desde cursorX/Y para estar
    // siempre geométricamente alineada — sin acumulación de error.
    const dxN = tx - _cof.touchX, dyN = ty - _cof.touchY;
    _cof.cursorX += dxN; _cof.cursorY += dyN;
    const _radM = _edCursorOffsetAngle * Math.PI / 180;
    _cof.touchX = _cof.cursorX - _cof.dist * Math.sin(_radM);
    _cof.touchY = _cof.cursorY + _cof.dist * Math.cos(_radM);
    _cofDraw();
    const synth = { clientX: _cof.cursorX, clientY: _cof.cursorY,
                    pointerType: 'touch', pointerId: e.pointerId, touches: null };
    edContinuePaint(synth);
  }
}

function _cofHandleUp(e) {
  if (!_cof.on) return;
  if (_cof._dragging && _cof.state === 'idle_blue') {
    _cof._dragging = false;
    _cof.savedClientX = _cof.cursorX; _cof.savedClientY = _cof.cursorY;
    _cof.state = 'red_ready';
    _cofDraw();
    clearTimeout(_cof._timer);
    _cof._timer = setTimeout(_cofExpire, _cof.MS_READY);
    return;
  }
  if (_cof._pendingStart) {
    const tx = (e && e.clientX) || _cof._pendingMoveX;
    const ty = (e && e.clientY) || _cof._pendingMoveY;
    _cof.dist = Math.max(10, _cofDist(tx, ty, _cof.cursorX, _cof.cursorY));
    _cof.touchX = tx; _cof.touchY = ty;
    _cof._pendingStart = false;
    _cof.state = 'red_ready';
    _cofDraw();
    clearTimeout(_cof._timer);
    _cof._timer = setTimeout(_cofExpire, _cof.MS_READY);
    return;
  }
  if (_cof._strokeStarted) {
    _cof._strokeStarted = false;
    _cof._dragging = false;
    _cof.savedClientX = _cof.cursorX; _cof.savedClientY = _cof.cursorY;
    edSaveDrawData();
    _cofAfterStroke();
  }
}

function _cofAfterStroke() {
  if (!_cof.on) return;
  _cof._strokeStarted = false;
  clearTimeout(_cof._timer);
  _cofExpire();
}

function _cofExpire() {
  if (!_cof.on) return;
  _cof.state = 'idle_blue';
  _cof.dist = _cof.distDefault;
  // Reposicionar punto de arrastre según el ángulo (inverso del offset)
  const _radE = _edCursorOffsetAngle * Math.PI / 180;
  _cof.touchX = _cof.cursorX - _cof.dist * Math.sin(_radE);
  _cof.touchY = _cof.cursorY + _cof.dist * Math.cos(_radE);
  _cofDraw();
}

function _cofStartStroke(e) {
  if (!_cof.on) return;
  _cof._strokeStarted = true;
  _cof.state = 'red_ready';
  _cofDraw();
  const synth = {
    clientX: _cof.savedClientX, clientY: _cof.savedClientY,
    pointerType: 'touch', pointerId: e.pointerId, touches: null,
    _skipMoveBrush: true, _cofStroke: true
  };
  edStartPaint(synth);
}

function _cofDraw() {
  // Visual idéntico al sistema original: contenedor centrado en el punto de arrastre,
  // rotado ang grados. Los hijos están en coordenadas locales verticales.
  const isRed = (_cof.state === 'red_ready' || _cof.state === 'red_cool');
  const lineColor = isRed ? 'rgba(220,50,50,0.85)' : 'rgba(60,140,255,0.75)';
  const ang = _edCursorOffsetAngle; // -40, 0, +40 según botón elegido
  const sz = Math.max(2, Math.round((edActiveTool === 'eraser' ? edEraserSize : edDrawSize) * (edCamera ? edCamera.z : 1)));
  const cursorR = sz / 2; // radio real sin forzar mínimo — el centrado usa transform
  const isEr = edActiveTool === 'eraser';
  const dotColor = isEr ? '#888' : edDrawColor;
  const dotSize = 18;
  const dist = Math.max(10, _cof.dist);
  const lineLen = Math.max(0, dist - cursorR - dotSize / 2);

  let wrap = document.getElementById('edOffsetWrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'edOffsetWrap';
    wrap.style.cssText = 'position:fixed;pointer-events:none;z-index:998;';
    (document.getElementById('editorShell') || document.body).appendChild(wrap);
  }
  wrap.style.display = '';
  // El contenedor se centra en el punto de arrastre y rota ang grados
  wrap.style.left = _cof.touchX + 'px';
  wrap.style.top  = _cof.touchY + 'px';
  wrap.style.transform = 'rotate(' + ang + 'deg)';

  wrap.innerHTML =
    // Cuadrado de arrastre: centrado en el origen
    '<div style="position:absolute;' +
    'left:' + (-dotSize/2) + 'px;top:' + (-dotSize/2) + 'px;' +
    'width:' + dotSize + 'px;height:' + dotSize + 'px;' +
    'background:' + dotColor + ';border-radius:2px;' +
    'box-shadow:0 0 0 1.5px rgba(255,255,255,0.7);"></div>' +
    // Línea vertical desde el borde superior del cuadrado hacia arriba
    '<div style="position:absolute;' +
    'left:-1px;top:' + (-dotSize/2 - lineLen) + 'px;' +
    'width:2px;height:' + lineLen + 'px;' +
    'background:' + lineColor + ';"></div>' +
    // Cursor circular: centrado horizontalmente con transform para evitar sub-pixel
    '<div style="position:absolute;' +
    'left:0px;top:' + (-dotSize/2 - lineLen - sz) + 'px;' +
    'width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;' +
    'transform:translateX(-50%);' +
    'border:1.5px solid ' + (isEr ? 'rgba(150,150,150,0.6)' : lineColor) + ';' +
    'background:' + (isEr ? 'rgba(255,255,255,0.5)' : dotColor + '33') + ';"></div>';

  const cur = document.getElementById('edBrushCursor');
  if (cur) cur.style.display = 'none';
  _edCursorLineColor = lineColor;
  _edOffsetLastTouch = { x: _cof.touchX, y: _cof.touchY };
  if (isRed) {
    _edCursorSavedPos = { clientX: _cof.cursorX, clientY: _cof.cursorY };
    _edCursorSavedTime = Date.now();
  }
}

function _cofHide() {
  const w = document.getElementById('edOffsetWrap');
  if (w) { w.style.display = 'none'; w.innerHTML = ''; }
  const c = document.getElementById('edBrushCursor');
  if (c) c.style.display = '';
}

// Stubs de compatibilidad
function _edCursorStartPositioning(e){ if(_cof.on){ _cof._dragging=true; _cofHandleMove(e); } }
function _edRefreshOffsetCursor(){ if(_cof.on) _cofDraw(); }
function _edCursorSetLineColor(c){ _edCursorLineColor=c; }
function _edOffsetHide(){ _cofHide(); }
function _edOffsetShowReset(){ if(_cof.on) _cofDraw(); }
function _edOffsetShow(){ if(_cof.on) _cofDraw(); }
function _edCursorStartExpireTimer(ms){ clearTimeout(_cof._timer); _cof._timer=setTimeout(_cofExpire, ms||_cof.MS_READY); }
function edStartPaintFromSaved(e) {
  if (_cof.on && (_cof.state==='red_ready'||_cof.state==='red_cool')) { _cofStartStroke(e); }
  else { edStartPaint(e); }
}

function _edApplyCursorOffset(e){
  // Eventos sintéticos del nuevo cursor: coordenadas ya correctas
  if(e._skipMoveBrush || e._cofStroke) return e;
  const isTouch = e.pointerType === 'touch' || (e.touches && e.touches.length > 0);
  // Con nuevo sistema activo: no aplicar offset (el cursor ya está calculado)
  if(_cof.on || !_edCursorOffset || !isTouch) return e;
  const src2 = e.touches ? e.touches[0] : e;
  const rad = _edCursorOffsetAngle * Math.PI / 180;
  const dx = _ED_CURSOR_OFFSET_PX * Math.sin(rad);
  const dy = _ED_CURSOR_OFFSET_PX * Math.cos(rad);
  return { clientX: src2.clientX + dx, clientY: src2.clientY - dy,
           pointerType: e.pointerType, pointerId: e.pointerId, touches: null };
}
// T14: helper — devuelve factor de presión del lápiz (0.05–1.0).
// Activo para pointerType==='pen' Y también para 'mouse' cuando pressure varía (Wacom en Windows
// reporta el lápiz como mouse). Táctil siempre devuelve 1 (sin modulación).
// Wacom con Windows Ink activado → pointerType='pen', pressure 0..1 ✓
// Wacom con Windows Ink desactivado → pointerType='mouse', pressure 0..1 ✓  
// Ratón real → pointerType='mouse', pressure siempre 0 o 0.5 (detectamos y devolvemos 1)
function _edPenPressure(e) {
  if (e.pointerType === 'touch') return 1; // táctil: sin modulación
  const p = e.pressure ?? 0;
  // Ratón real: pressure es siempre exactamente 0 (sin pulsar) o 0.5 (pulsado, valor fijo del estándar)
  // Lápiz real: pressure varía continuamente entre 0 y 1
  // Si pressure es exactamente 0.5 (valor constante de ratón) o 0, devolver 1 (sin modulación)
  if (p === 0 || p === 0.5) return 1;
  // Lápiz con presión real: escalar (mínimo 0.05 para que no desaparezca)
  return Math.max(0.05, Math.min(1, p));
}

function edStartPaint(e){
  edPainting = true;
  const _pp=$('edOptionsPanel');
  if(_pp&&_pp.classList.contains('open')&&_pp.dataset.mode!=='draw'){
    _pp.classList.remove('open'); _pp.innerHTML='';
  }
  const _dlCheck = edPages[edCurrentPage]?.layers.find(l=>l.type==='draw');
  const _drawPanelOpen = $('edOptionsPanel')?.classList.contains('open') && $('edOptionsPanel')?.dataset.mode==='draw';
  if(_dlCheck && _dlCheck.locked && !_drawPanelOpen){ edPainting = false; _edShowLockIconDraw(_dlCheck); return; }
  if(e.pointerId !== undefined && edCanvas){
    try { edCanvas.setPointerCapture(e.pointerId); } catch(_){} }
  const _drawPanelIsOpen = $('edOptionsPanel')?.classList.contains('open') && $('edOptionsPanel')?.dataset.mode==='draw';
  // Deseleccionar cualquier objeto previo al iniciar un nuevo trazo
  if(edSelectedIdx >= 0){ edSelectedIdx = -1; }
  if(edMultiSel.length){ _msClear(); edActiveTool='draw'; edCanvas.className='tool-draw'; }
  // Limpiar sesión vectorial si quedó activa (evita que BLOCKED_VS bloquee edPushHistory)
  if(_vsHistory.length > 0){ _edShapeClearHistory(); _vsClear(); }
  const dl = _edGetOrCreateDrawLayer(); if(!dl) return;
  const _eTmp = _edApplyCursorOffset(e);
  const isTouch = e.pointerType === 'touch' || (e.touches && e.touches.length > 0);
  const er = edActiveTool==='eraser';
  // T14: factor de presión del lápiz (solo pen; eraser no se modula por presión)
  const _pres = er ? 1 : _edPenPressure(e);
  // Nuevo sistema cursor: iniciar trazo directo sin offset
  if(_cof.on && isTouch){
    const c = edCoords(_eTmp);
    const _sz = er ? edEraserSize : edDrawSize;
    dl.beginStroke(c.nx, c.ny, edDrawColor, _sz, er, edDrawOpacity, 0);
    edRedraw();
    return;
  }
  const _cr4base = _edCursorOffset && isTouch ? (er?edEraserSize:edDrawSize)/2 : 0;
  if(_edCursorOffset && isTouch) _edCursorSetLineColor('rgba(220,50,50,0.85)');
  if(_edCursorOffset && isTouch && !e._skipMoveBrush){
    const c = edCoords(_eTmp);
    dl.beginStrokeNoDot(c.nx, c.ny);
    _edOffsetFirstMove = true;
  } else {
    const c = edCoords(_eTmp);
    const _baseBS = (_cr4base > 0) ? Math.max(1, _cr4base * 2 - 1) : (er?edEraserSize:edDrawSize);
    const _sizeBS = Math.max(1, Math.round(_baseBS * _pres));
    _edPenPendingStroke = null;
    if(e.pointerType === 'pen' && _cr4base === 0){
      // Lápiz gráfico: NUNCA dibujar punto en pointerdown.
      // Además: si pressure < umbral mínimo, ignorar el evento completamente.
      // Patrón documentado de tldraw (PR #5693): pressure < 0.05 = hover espurio.
      // Inicio siempre con NoDot — el dibujo real empieza en el primer pointermove
      // con presión suficiente (lógica en edContinuePaint)
      dl.beginStrokeNoDot(c.nx, c.ny);
    } else {
      dl.beginStroke(c.nx, c.ny, edDrawColor, _sizeBS, er, edDrawOpacity, _cr4base);
      edRedraw();
    }
    _edOffsetFirstMove = false;
  }
  if(!e._skipMoveBrush) edMoveBrush(e);
}
function edContinuePaint(e){
  if(!edPainting) return;
  // Máquina de estados de presión para lápiz gráfico
  if(e.pointerType === 'pen'){
    if(e.buttons === 0){ edSaveDrawData(); return; } // hover sin contacto
    const _penP2 = e.pressure ?? 0;
    if(_penP2 >= _ED_PEN_MIN_PRESSURE){
      // Presión suficiente: cancelar timer de baja presión y permitir dibujo
      if(_edPenLowPressureTimer){ clearTimeout(_edPenLowPressureTimer); _edPenLowPressureTimer = null; }
      _edPenCanDraw = true;
    } else {
      // Presión baja: si ya estábamos dibujando, iniciar timer de 250ms
      if(_edPenCanDraw && !_edPenLowPressureTimer){
        _edPenLowPressureTimer = setTimeout(() => {
          _edPenLowPressureTimer = null;
          _edPenCanDraw = false;
          edSaveDrawData();
        }, 250);
      }
      // No dibujar en este evento — esperar a que suba la presión o expire el timer
      edMoveBrush(e);
      return;
    }
  }
  const page = edPages[edCurrentPage]; if(!page) return;
  const dl = page.layers.find(l => l.type === 'draw'); if(!dl) return;
  if(_edFromSaved){ _edFromSaved = false; edMoveBrush(e); return; }
  const _eTmp = _edApplyCursorOffset(e);
  const c = edCoords(_eTmp), er = edActiveTool==='eraser';
  const isTouch = e.pointerType === 'touch' || (e.touches && e.touches.length > 0);
  // T14: factor de presión del lápiz (solo pen; eraser no se modula)
  const _pres = er ? 1 : _edPenPressure(e);
  // Nuevo sistema cursor: continuar trazo sin offset ni _edOffsetFirstMove
  if(_cof.on && isTouch){
    const _sz = er ? edEraserSize : edDrawSize;
    dl.continueStroke(c.nx, c.ny, edDrawColor, _sz, er, edDrawOpacity, 0);
    edRedraw();
    return;
  }

  if(_edOffsetFirstMove){
    _edOffsetFirstMove = false;
    const _cr4f = _edCursorOffset && isTouch ? (er?edEraserSize:edDrawSize)/2 : 0;
    const _baseF = (_cr4f > 0) ? Math.max(1, _cr4f * 2 - 1) : (er?edEraserSize:edDrawSize);
    const _sizeFM = Math.max(1, Math.round(_baseF * _pres));
    dl.continueStroke(c.nx, c.ny, edDrawColor, _sizeFM, er, edDrawOpacity, _cr4f);
  } else {
    const _cr4c = _edCursorOffset && isTouch ? (er?edEraserSize:edDrawSize)/2 : 0;
    const _baseC = (_cr4c > 0) ? Math.max(1, _cr4c * 2 - 1) : (er?edEraserSize:edDrawSize);
    const _sizeCS = Math.max(1, Math.round(_baseC * _pres));
    dl.continueStroke(c.nx, c.ny, edDrawColor, _sizeCS, er, edDrawOpacity, _cr4c);
  }
  edRedraw();
  edMoveBrush(e);
}
function edSaveDrawData(){
  _edPenPendingStroke = null;
  if(_edPenLowPressureTimer){ clearTimeout(_edPenLowPressureTimer); _edPenLowPressureTimer = null; }
  _edPenCanDraw = false;
  edPainting = false;
  _edDrawPushHistory();  // historial local de dibujo (deshacer trazo)
  // NO llamar edPushHistory aquí — el historial global se guarda al congelar
}
function edClearDraw(){
  const page=edPages[edCurrentPage];if(!page)return;
  const dl = page.layers.find(l => l.type === 'draw');
  if(dl) dl.clear();
  // También eliminar page.drawData legado si existiera
  page.drawData = null;
  edPainting = false;
  edRedraw(); edToast('Dibujos borrados');
}
function edMoveBrush(e){
  const src = e.touches ? e.touches[0] : e;
  const cur = $('edBrushCursor');
  if(!cur) return;
  if(edActiveTool==='fill'){
    cur.style.display='none';
    _edOffsetHide();
    return;
  }
  const sz = Math.round((edActiveTool==='eraser' ? edEraserSize : edDrawSize) * (edCamera ? edCamera.z : 1));
  const isTouch = e.pointerType === 'touch' || (e.touches && e.touches.length > 0);
  if(_cof.on){
    // Nuevo sistema: el visual lo gestiona _cofDraw, solo ocultar cursor normal
    cur.style.display = 'none';
  } else {
    cur.style.display = 'block';
    cur.style.left = src.clientX + 'px'; cur.style.top = src.clientY + 'px';
    cur.style.width = sz + 'px'; cur.style.height = sz + 'px';
    cur.style.background = ''; cur.style.borderColor = '';
    _edOffsetHide();
  }
}

/* ══════════════════════════════════════════
   MENÚ
   ══════════════════════════════════════════ */
function edCloseMenus(){
  document.querySelectorAll('.ed-dropdown').forEach(d=>{
    d.classList.remove('open');
    // Devolver al padre original si fue movido a body
    if(d._origParent && d.parentNode === document.body){
      d._origParent.appendChild(d);
    }
    d.style.removeProperty('position');
    d.style.removeProperty('top');
    d.style.removeProperty('left');
    d.style.removeProperty('right');
    d.style.removeProperty('z-index');
  });
  // Cerrar submenús inline
  document.querySelectorAll('.ed-submenu').forEach(s=>s.classList.remove('open'));
  document.querySelectorAll('.ed-menu-btn').forEach(b=>b.classList.remove('open'));
  edMenuOpen=null;
}

function edToggleMenu(id){
  if(edMenuOpen===id){edCloseMenus();return;}
  edCloseMenus();
  // Si hay panel de herramienta abierto, cerrarlo antes de abrir el menú
  const _panel=$('edOptionsPanel');
  if(_panel&&_panel.classList.contains('open')){
    const _mode=_panel.dataset.mode;
    edCloseOptionsPanel();
    if(_mode==='draw'||_mode==='shape'||_mode==='line'){
      // NO llamar _vsClear() ni _edShapeClearHistory() aquí:
      // la sesión vectorial debe preservarse para que al cerrar el menú
      // el usuario pueda seguir trabajando con los mismos objetos y fusionarlos.
      // Solo limpiar la construcción activa (shape/line en curso) sin terminar la sesión.
      _edShapeStart=null;_edShapePreview=null;_edPendingShape=null;
      edActiveTool='select';edCanvas.className='';
      edShapeBarHide();
      _edDrawUnlockUI();
    }
  }
  if(['draw','eraser','fill'].includes(edActiveTool)) edDeactivateDrawTool();
  const dd=$('dd-'+id);if(!dd)return;
  const btn=document.querySelector(`[data-menu="${id}"]`);
  if(!btn)return;

  // Mover el dropdown a body para escapar de cualquier overflow/stacking context
  dd._origParent = dd._origParent || dd.parentNode;
  document.body.appendChild(dd);

  // Posicionar con fixed relativo al botón
  const r = btn.getBoundingClientRect();
  dd.style.position = 'fixed';
  dd.style.top  = r.bottom + 'px';
  dd.style.zIndex = '9999';
  // Proyecto: siempre alineado por la derecha con el botón
  if(id === 'project' || id === 'rules' || id === 'biblioteca'){
    dd.style.left = 'auto';
    dd.style.right = (window.innerWidth - r.right) + 'px';
  } else {
    dd.style.left = r.left + 'px';
    dd.style.right = 'auto';
  }

  dd.classList.add('open');
  btn.classList.add('open');
  edMenuOpen = id;
  if(id === 'nav') edUpdateNavPages();
  if(id === 'rules') _edRuleToggleSync();
}

function edDeactivateDrawTool(){
  _edFocusDone = false;
  // Cancelar herramientas shape/line en curso
  _edShapeStart = null; _edShapePreview = null; _edPendingShape = null;
  _edLineFusionId = null; // T1: limpiar ID de fusión
  if (_edLineLayer) {
    if (_edLineLayer.points.length < 2) {
      const idx = edLayers.indexOf(_edLineLayer);
      if (idx >= 0) edLayers.splice(idx, 1);
    }
    _edLineLayer = null;
  }
  edActiveTool='select';
  edCanvas.className='';
  const cur=$('edBrushCursor');if(cur)cur.style.display='none';
  const panel=$('edOptionsPanel');
  if(panel){ panel.classList.remove('open'); delete panel.dataset.mode; }
  edDrawBarHide();
  _edDrawUnlockUI();
  // Apagar cursor offset al salir del panel de dibujo
  _cofSetOn(false);
  _edOffsetHide();
  _edFreezeDrawLayer();
  requestAnimationFrame(edFitCanvas);
}

/* ── HERRAMIENTA SHAPE (rectángulo / elipse) ── */
/* ══════════════════════════════════════════
   HERRAMIENTA SHAPE (rectángulo / elipse)
   Patrón idéntico a edRenderOptionsPanel('draw')
   ══════════════════════════════════════════ */

/* ══════════════════════════════════════════
   T1-shapes: Convertir ShapeLayer a LineLayer con puntos
   rect  → 4 puntos (TL, TR, BR, BL) en coords locales normalizadas
   ellipse → 32 puntos aproximados en coords locales normalizadas
   ══════════════════════════════════════════ */
function _edShapeToLineLayer(s) {
  const l = new LineLayer();
  // Heredar propiedades visuales
  l.color     = s.color     || '#000000';
  l.fillColor = s.fillColor || 'none';
  l.lineWidth = s.lineWidth ?? 3;
  l.opacity   = s.opacity   ?? 1;
  l.rotation  = s.rotation  || 0;
  l.x = s.x; l.y = s.y;
  l.width  = s.width;
  l.height = s.height;
  if (s.groupId) l.groupId = s.groupId;
  if (s.locked)  l.locked  = true;
  if (s._fusionId) l._fusionId = s._fusionId;
  // Generar puntos en coords locales (relativas al centro, normalizadas a página)
  const hw = s.width  / 2;  // half-width  en coords normalizadas
  const hh = s.height / 2;  // half-height en coords normalizadas
  if (s.shape === 'ellipse') {
    const N = 32;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      l.points.push({ x: Math.cos(a) * hw, y: Math.sin(a) * hh });
    }
  } else {
    // rect: TL → TR → BR → BL
    l.points.push({ x: -hw, y: -hh });
    l.points.push({ x:  hw, y: -hh });
    l.points.push({ x:  hw, y:  hh });
    l.points.push({ x: -hw, y:  hh });
    // Aplicar cornerRadii si existen
    if (s.cornerRadii && s.cornerRadii.some(r => r > 0)) l.cornerRadii = [...s.cornerRadii];
    else if (s.cornerRadius && s.cornerRadius > 0) l.cornerRadius = s.cornerRadius;
  }
  l.closed = true;
  if (s.shape === 'ellipse') l._fromEllipse = true;
  return l;
}

function _edActivateShapeTool(isNew) {
  const panel=$('edOptionsPanel');
  if(!panel) return;
  // Táctil: si los menús están ocultos, la barra flotante ya está visible — no abrir panel
  if(edMinimized){ edShapeBarShow(); edRedraw(); return; }

  _edDrawLockUI(); // deshabilitar menús igual que en draw

  const _sel = (edSelectedIdx>=0 && edLayers[edSelectedIdx]?.type==='shape') ? edLayers[edSelectedIdx] : null;
  const col     = _sel?.color     || edDrawColor  || '#000000';
  const fillCol = _sel ? (_sel.fillColor||'#ffffff') : (edDrawFillColor||'#ffffff');
  const lw      = _sel?.lineWidth ?? edDrawSize ?? 3;
  const opacity = _sel ? Math.round((_sel.opacity??1)*100) : 100;
  const hasFill = fillCol !== 'none';
  const fillVal = hasFill ? fillCol : '#ffffff';

  panel.innerHTML = `
<div style="display:flex;flex-direction:column;width:100%;gap:0">
  <!-- FILA 1: Tipo + cambiar a Rectas -->
  <div style="display:flex;flex-direction:row;align-items:center;width:100%;min-height:32px;padding:3px 0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-overflow-scrolling:touch">
    <button id="op-tool-shape" style="flex-shrink:0;border:none;border-radius:6px;padding:5px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.85rem);font-weight:900;cursor:pointer;white-space:nowrap;background:rgba(0,0,0,.08);color:var(--black)">Objeto</button>
    <div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>
    <button id="op-tool-line" style="flex-shrink:0;border:none;border-radius:6px;padding:5px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.85rem);font-weight:900;cursor:pointer;white-space:nowrap;background:transparent;color:var(--gray-600)">Rectas</button>
  </div>
  <div style="height:1px;background:var(--gray-300);width:100%"></div>
  <!-- FILA 2: Tipo de forma + color + grosor + opacidad -->
  <div style="display:flex;flex-direction:row;align-items:center;gap:4px;padding:4px 0;min-height:32px;width:100%">
    <button id="op-shape-rect" style="flex-shrink:0;border:2px solid ${_edShapeType==='rect'?'var(--black)':'var(--gray-300)'};border-radius:6px;padding:3px 8px;font-size:.82rem;font-weight:900;cursor:pointer;background:${_edShapeType==='rect'?'rgba(0,0,0,.08)':'transparent'}">▭</button>
    <button id="op-shape-ellipse" style="flex-shrink:0;border:2px solid ${_edShapeType==='ellipse'?'var(--black)':'var(--gray-300)'};border-radius:6px;padding:3px 8px;font-size:.82rem;font-weight:900;cursor:pointer;background:${_edShapeType==='ellipse'?'rgba(0,0,0,.08)':'transparent'}">◯</button>
    <button id="op-shape-select" style="flex-shrink:0;border:2px solid ${_edShapeType==='select'?'var(--black)':'var(--gray-300)'};border-radius:6px;padding:3px 8px;font-size:.82rem;font-weight:900;cursor:pointer;background:${_edShapeType==='select'?'rgba(0,0,0,.08)':'transparent'}"><svg width='16' height='16' viewBox='0 0 18 18' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M3 3 L3 14 L6.5 10.5 L9 15.5 L11 14.5 L8.5 9.5 L13 9.5 Z' stroke='currentColor' stroke-width='1.8' stroke-linejoin='round' stroke-linecap='round' fill='none'/></svg></button>
    <div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>
    <button id="op-shape-color-btn" style="width:26px;height:26px;border-radius:50%;background:${col};border:2px solid var(--gray-300);cursor:pointer;flex-shrink:0;padding:0" title="Color borde"></button>
    <button id="op-shape-eyedrop" style="flex-shrink:0;border:none;background:transparent;cursor:pointer;font-size:.9rem;padding:2px 4px" title="Cuentagotas">💧</button>
    <div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>
    <button id="op-size-btn" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.68rem,2vw,.8rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)">Grosor</button>
    <div id="op-size-slider" style="display:none;flex:1;align-items:center;gap:4px;min-width:0">
      <div class="ed-slider-wrap" style="flex:1;min-width:40px">
        <input type="range" id="op-dsize" min="0" max="20" data-suffix="px" value="${lw}" style="width:100%;accent-color:var(--black)">
        <span class="ed-slider-bubble"></span>
      </div>
    </div>
    <div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>
    <button id="op-opacity-btn" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.68rem,2vw,.8rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)">Op%</button>
    <div id="op-opacity-slider" style="display:none;flex:1;align-items:center;gap:4px;min-width:0">
      <div class="ed-slider-wrap" style="flex:1;min-width:40px">
        <input type="range" id="op-shape-opacity" min="0" max="100" data-suffix="%" value="${opacity}" style="width:100%;accent-color:var(--black)">
        <span class="ed-slider-bubble"></span>
      </div>
    </div>
  </div>
  <div style="height:1px;background:var(--gray-300);width:100%"></div>
  <!-- FILA RELLENO -->
  <div style="display:flex;flex-direction:row;align-items:center;gap:6px;padding:4px 0">
    <span style="font-size:.72rem;font-weight:700;color:var(--gray-600)">Relleno</span>
    <input type="checkbox" id="op-shape-fill-on" ${hasFill?'checked':''} style="cursor:pointer;flex-shrink:0">
    <div style="position:relative;display:flex;align-items:center;flex-shrink:0">
      <button id="op-shape-fill-btn" style="width:26px;height:26px;border-radius:50%;background:${fillVal};border:2px solid var(--gray-300);cursor:pointer;flex-shrink:0;padding:0;opacity:${hasFill?1:0.4}"></button>
    </div>
  </div>
  <div style="height:1px;background:var(--gray-300);width:100%"></div>
  <!-- FILA ACCIONES -->
  <div style="display:flex;flex-direction:row;align-items:center;gap:4px;padding:4px 0 2px 0;min-height:32px;width:100%">
    <button id="op-shape-curve-btn" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.68rem,2vw,.78rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)" title="Convertir vértice a curva"><b>V⟺C</b></button>
    <div id="op-shape-curve-slider" style="display:none;flex:1;align-items:center;gap:4px;min-width:0">
      <input type="number" inputmode="numeric" enterkeyhint="done" id="op-shape-curve-rnum" min="0" max="80" value="${_sel?(_sel.cornerRadius||0):0}" style="width:38px;text-align:right;font-size:.8rem;font-weight:700;border:1px solid var(--gray-300);border-radius:6px;padding:2px 4px;background:transparent;-moz-appearance:textfield;flex-shrink:0">
      <input type="range" id="op-shape-curve-r" min="0" max="80" value="${_sel?(_sel.cornerRadius||0):0}" style="flex:1;min-width:40px;accent-color:var(--black)">
    </div>
    <div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>
    <button id="op-shape-del" style="flex-shrink:0;border:1px solid #fcc;border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer;color:#c00">✕</button>
    <button id="op-shape-dup" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)">⧉</button>
    <button id="op-shape-mirror" title="Reflejar" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 6px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)">${_ED_MIRROR_ICON}</button>
    <button id="op-shape-undo" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer" disabled>↩</button>
    <button id="op-shape-redo" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer" disabled>↪</button>
    <button id="op-lock-btn" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:${_sel?.locked?'var(--gray-800)':'transparent'};color:${_sel?.locked?'var(--white)':'var(--gray-700)'};cursor:pointer" title="${_sel?.locked?'Desbloquear':'Bloquear'}">${_sel?.locked?'🔒':'🔓'}</button>

    <span id="op-shape-info" style="flex:1;text-align:right;font-size:clamp(.65rem,1.8vw,.75rem);font-weight:700;color:var(--gray-500);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 4px">${_sel?_edShapeType+' · '+lw+'px · '+opacity+'%':'Sin objeto'}</span>
    <button id="op-draw-ok" style="flex-shrink:0;background:var(--black);color:var(--white);border:none;border-radius:6px;padding:5px 12px;font-family:inherit;font-size:clamp(.75rem,2.2vw,.85rem);font-weight:900;cursor:pointer">✓</button>
  </div>
</div>`;
  panel.classList.add('open');
  panel.style.visibility='';
  panel.dataset.mode = 'shape';
  edFitCanvas(); // actualizar _edCanvasTop
  _edInitSliderBubbles(panel);
  // Guardar estado previo en historial global (objeto existente)
  if(_sel) edPushHistory(); else if(isNew) edPushHistory(); // estado previo a objeto nuevo
  _edShapeInitHistory(!!isNew);
  // Sistema _vs*: inicializar solo si no hay sesión activa
  if(_vsHistory.length === 0) _vsInit(!!isNew && !_sel);
  // Centrar cámara en el objeto al abrir el panel
  // No centrar si ya hay objetos en sesión de fusión
  const _hasFusionObjs5 = _edLineFusionId && edLayers.some(l => l._fusionId===_edLineFusionId);
  if(!_hasFusionObjs5) _edFocusDone = false;
  if(_sel && !_edFocusDone) setTimeout(()=>_edFocusOnLayer(_sel), 220);

  // ── Helpers ──
  const _curShape = () => {
    const l = edSelectedIdx>=0 ? edLayers[edSelectedIdx] : null;
    return l?.type==='shape' ? l : null;
  };
  const _updateInfo = () => {
    const s=_curShape();
    const info=$('op-shape-info');
    if(info) info.textContent = s ? _edShapeType+'·'+s.lineWidth+'px·'+Math.round((s.opacity??1)*100)+'%' : 'Sin objeto';
  };

  // ── Herramientas ──
  $('op-tool-shape')?.addEventListener('click',()=>{ _edActivateShapeTool(); });
  $('op-tool-line')?.addEventListener('click',()=>{
    // T1-shapes: convertir shape actual a LineLayer y asignar fusionId
    const _curS = _curShape();
    if(_curS){
      const _ll = _edShapeToLineLayer(_curS);
      if(!_edLineFusionId) _edLineFusionId = 'fusion_' + Math.random().toString(36).slice(2);
      _ll._fusionId = _edLineFusionId;
      const _si = edLayers.indexOf(_curS);
      if(_si >= 0){ edLayers[_si] = _ll; edSelectedIdx = _si; }
    }
    edActiveTool='line'; edCanvas.className='tool-line'; _edActivateLineTool();
  });

  // ── Tipo ──
  $('op-shape-rect')?.addEventListener('click',()=>{
    _edShapeType='rect';
    const s=_curShape();
    // Si hay sesión de fusión activa, NO cambiar el shape existente — preparar el siguiente
    if(s && !_edLineFusionId){ _edShapePushHistory(); s.shape='rect'; edRedraw(); }
    _edActivateShapeTool();
  });
  $('op-shape-ellipse')?.addEventListener('click',()=>{
    _edShapeType='ellipse';
    const s=_curShape();
    // Si hay sesión de fusión activa, NO cambiar el shape existente — preparar el siguiente
    if(s && !_edLineFusionId){ _edShapePushHistory(); s.shape='ellipse'; edRedraw(); }
    _edActivateShapeTool();
  });
  $('op-shape-select')?.addEventListener('click',()=>{
    // Cerrar modo V⟺C si estaba abierto
    const _slVCS=$('op-shape-curve-slider');
    if(_slVCS && _slVCS.style.display==='flex'){
      _slVCS.style.display='none';
      const _vcBtnS=$('op-shape-curve-btn');
      if(_vcBtnS){ _vcBtnS.style.background='transparent'; _vcBtnS.style.color='var(--gray-700)'; _vcBtnS.style.borderColor='var(--gray-300)'; }
      window._edCurveVertIdx=-1;
    }
    _edShapeType='select'; edActiveTool='select'; edCanvas.className='';
    _edActivateShapeTool();
  });

  // ── Color borde ──
  $('op-shape-color-btn')?.addEventListener('click', e=>{
    const s=_curShape(); if(!s) return;
    _edPickColor(e, s.color||'#000000',
      hex=>{ s.color=hex; $('op-shape-color-btn').style.background=hex; edRedraw(); },
      ()=>{ _edShapePushHistory(); }
    );
  });
  // ── Grosor ──
  $('op-size-btn')?.addEventListener('click',()=>{
    const sl=$('op-size-slider'),ob=$('op-opacity-slider');
    const open=sl.style.display==='none'||sl.style.display==='';
    sl.style.display=open?'flex':'none';
    if(open&&ob){ob.style.display='none';$('op-opacity-btn').style.background='transparent';}
    $('op-size-btn').style.background=open?'var(--gray-200)':'transparent';
  });
  $('op-dsize')?.addEventListener('input',e=>{
    const v=+e.target.value; edDrawSize=v;
    const s=_curShape(); if(s){s.lineWidth=v;edRedraw();} _updateInfo();
    _edRefreshOffsetCursor(); // T4: actualizar círculo del cursor en tiempo real
  });
  $('op-dsize')?.addEventListener('change',()=>{ _edShapePushHistory(); });
  $('op-dsize-num')?.addEventListener('change',e=>{
    const v=Math.max(0,Math.min(20,parseInt(e.target.value)||0));
    e.target.value=v; edDrawSize=v;
    const sl=$('op-dsize'); if(sl) sl.value=v;
    const s=_curShape(); if(s){s.lineWidth=v;edRedraw();} _updateInfo();
    _edShapePushHistory();
  });

  // ── Opacidad ──
  $('op-opacity-btn')?.addEventListener('click',()=>{
    const slO=$('op-opacity-slider'),sl=$('op-size-slider');
    if(!slO) return;
    const open=slO.style.display==='none'||slO.style.display==='';
    slO.style.display=open?'flex':'none';
    if(open&&sl){sl.style.display='none';$('op-size-btn').style.background='transparent';}
    $('op-opacity-btn').style.background=open?'var(--gray-200)':'transparent';
  });
  $('op-shape-opacity')?.addEventListener('input',e=>{
    const v=+e.target.value;
    const s=_curShape(); if(s){s.opacity=v/100;edRedraw();} _updateInfo();
  });
  $('op-shape-opacity')?.addEventListener('change',()=>{ _edShapePushHistory(); });
  $('op-shape-opacity-num')?.addEventListener('change',e=>{
    const v=Math.max(0,Math.min(100,parseInt(e.target.value)||100));
    e.target.value=v;
    const sl=$('op-shape-opacity'); if(sl) sl.value=v;
    const s=_curShape(); if(s){s.opacity=v/100;edRedraw();} _updateInfo();
    _edShapePushHistory();
  });

  // ── Relleno ──
  $('op-shape-fill-on')?.addEventListener('change',e=>{
    const on=e.target.checked;
    const fb=$('op-shape-fill-btn'); if(fb) fb.style.opacity=on?1:0.4;
    const s=_curShape(); if(!s) return;
    if(on){
      const hex=s._lastFillColor||edDrawFillColor||'#ffffff';
      s.fillColor=hex; edDrawFillColor=hex;
      if(fb) fb.style.background=hex;
    } else {
      s._lastFillColor=s.fillColor;
      s.fillColor='none'; edDrawFillColor='none';
    }
    edRedraw(); _edShapePushHistory();
  });
  $('op-shape-eyedrop')?.addEventListener('click', ()=>{ _edStartEyedrop(); });
  $('op-shape-fill-btn')?.addEventListener('click', e=>{
    const s=_curShape(); if(!s) return;
    const cur=(s.fillColor&&s.fillColor!=='none')?s.fillColor:'#ffffff';
    _edPickColor(e, cur,
      hex=>{ s.fillColor=hex; $('op-shape-fill-btn').style.background=hex; $('op-shape-fill-on').checked=true; edDrawFillColor=hex; edRedraw(); },
      ()=>{ _edShapePushHistory(); }
    );
  });

  // ── Minimizar (idéntico a draw) ──

  // ── Curva de vértice ──
  $('op-shape-curve-btn')?.addEventListener('click',()=>{
    const sl=$('op-shape-curve-slider');
    const open=sl?.style.display==='none'||sl?.style.display==='';
    if(sl) sl.style.display=open?'flex':'none';
    const btn=$('op-shape-curve-btn');
    btn.style.background=open?'var(--black)':'transparent';
    btn.style.color=open?'var(--white)':'var(--gray-700)';
    btn.style.borderColor=open?'var(--black)':'var(--gray-300)';
    if(!open){ window._edCurveVertIdx=-1; edRedraw(); }
  });
  $('op-shape-curve-r')?.addEventListener('input',e=>{
    const v=+e.target.value;
    const n=$('op-shape-curve-rnum'); if(n) n.value=v;
    window._edCurveRadius=v;
    const s=_curShape(); if(!s) return;
    const vi=window._edCurveVertIdx;
    if(vi>=0&&vi<4&&s.shape==='rect'){
      if(!s.cornerRadii)s.cornerRadii=[0,0,0,0];
      s.cornerRadii[vi]=v;
      edRedraw();
    }
  });
  $('op-shape-curve-r')?.addEventListener('change',()=>{ _edShapePushHistory(); });
  $('op-shape-curve-rnum')?.addEventListener('change',e=>{
    const v=Math.max(0,Math.min(80,parseInt(e.target.value)||0));
    e.target.value=v; const sl=$('op-shape-curve-r'); if(sl) sl.value=v;
    window._edCurveRadius=v;
    const s=_curShape(); if(!s) return;
    const vi=window._edCurveVertIdx;
    if(vi>=0&&vi<4&&s.shape==='rect'){
      if(!s.cornerRadii)s.cornerRadii=[0,0,0,0];
      s.cornerRadii[vi]=v;
      edRedraw(); _edShapePushHistory();
    }
  });

  // ── OK ──
  $('op-draw-ok')?.addEventListener('click',()=>{
    // Cerrar modo V⟺C si estaba abierto
    const _slVCShape=$('op-shape-curve-slider');
    if(_slVCShape && _slVCShape.style.display==='flex'){
      _slVCShape.style.display='none';
      const _vcBtnShape=$('op-shape-curve-btn');
      if(_vcBtnShape){ _vcBtnShape.style.background='transparent'; _vcBtnShape.style.color='var(--gray-700)'; _vcBtnShape.style.borderColor='var(--gray-300)'; }
      window._edCurveVertIdx=-1;
    }
    // T1: limpiar _fusionId de todos los objetos (con ID actual o del objeto seleccionado)
    const _shapeFusId = _edLineFusionId || (edSelectedIdx>=0 ? edLayers[edSelectedIdx]?._fusionId : null);
    if(_shapeFusId){
      edLayers.forEach(l => { if(l._fusionId === _shapeFusId) delete l._fusionId; });
    }
    _edLineFusionId = null;
    _edShapeClearHistory(); _vsClear(); edPushHistory(); // limpiar _vs* antes para que edPushHistory no quede bloqueado
    edCloseOptionsPanel();
    edSelectedIdx=-1; edActiveTool='select'; edCanvas.className='';
    _edShapeStart=null; _edShapePreview=null; _edPendingShape=null;
    edShapeBarHide(); _edDrawUnlockUI();
    if(edMinimized){ window._edMinimizedDrawMode=null; edMaximize(); }
    else { _edResetCameraToFit(); }
    edRedraw();
  });

    // ── Eliminar ──
  $('op-shape-del')?.addEventListener('click',()=>{
    const s=_curShape(); if(!s) return;
    edConfirm('¿Eliminar objeto?', ()=>{
      const idx=edLayers.indexOf(s);
      if(idx>=0){edLayers.splice(idx,1);}
      edSelectedIdx=-1; _edShapeClearHistory(); _vsClear(); edPushHistory(); edRedraw();
    });
  });

  // ── Duplicar ──

  $('op-shape-dup')?.addEventListener('click',()=>{
    const s=_curShape(); if(!s) return;
    const origSnapshot = JSON.stringify(edSerLayer(s));
    const copy=new ShapeLayer(s.shape, s.x+0.03, s.y+0.03, s.width, s.height);
    copy.color=s.color; copy.fillColor=s.fillColor; copy.lineWidth=s.lineWidth;
    copy.opacity=s.opacity??1; copy.rotation=s.rotation||0;
    if(s.cornerRadius) copy.cornerRadius=s.cornerRadius;
    if(s.cornerRadii)  copy.cornerRadii=Array.isArray(s.cornerRadii)?[...s.cornerRadii]:{...s.cornerRadii};
    _edInsertLayerAbove(copy);
    _edShapeClearHistory(); _vsClear(); edPushHistory(); edRedraw(); _edActivateShapeTool();
    _edShapeHistory = [origSnapshot];
    _edShapeHistIdx = 0;
    _edShapeHistIdxBase = 0;
    _edShapeUpdateUndoRedoBtns();
  });
  $('op-shape-mirror')?.addEventListener('click',()=>{ _edShapePushHistory(); edMirrorSelected(); });

  // ── Deshacer / Rehacer — usa historial LOCAL, no el global ──
  const _updURShape = ()=>{ _edShapeUpdateUndoRedoBtns(); };
  _updURShape();
  $('op-shape-undo')?.addEventListener('click',()=>{ edShapeUndo(); });
  $('op-shape-redo')?.addEventListener('click',()=>{ edShapeRedo(); });
  $('op-lock-btn')?.addEventListener('click',()=>{
    const _ls = edSelectedIdx>=0 ? edLayers[edSelectedIdx] : null; if(!_ls) return;
    _ls.locked = !_ls.locked;
    edPushHistory();
    const _btn = $('op-lock-btn');
    if(_btn){
      _btn.textContent = _ls.locked ? '🔒' : '🔓';
      _btn.style.background = _ls.locked ? 'var(--gray-800)' : 'transparent';
      _btn.style.color = _ls.locked ? 'var(--white)' : 'var(--gray-700)';
      _btn.title = _ls.locked ? 'Desbloquear' : 'Bloquear';
    }
  });

  if(isNew) requestAnimationFrame(edFitCanvas);
}

/* ══════════════════════════════════════════
   HERRAMIENTA LINE — rectas y polígonos
   Patrón idéntico a edRenderOptionsPanel('draw')
   ══════════════════════════════════════════ */
function _edActivateLineTool(isNew, isCreating) {
  const panel=$('edOptionsPanel');
  if(!panel) return;
  // Táctil: si los menús están ocultos, la barra flotante ya está visible — no abrir panel
  if(edMinimized){ edShapeBarShow(); edRedraw(); return; }

  _edDrawLockUI(); // deshabilitar menús igual que en draw

  const _active = _edLineLayer;
  const _sel    = (edSelectedIdx>=0 && edLayers[edSelectedIdx]?.type==='line') ? edLayers[edSelectedIdx] : null;
  const _cur    = _active || _sel;
  const col     = _cur?.color    || edDrawColor  || '#000000';
  const lw      = _cur?.lineWidth ?? edDrawSize ?? 3;
  const opacity = _cur ? Math.round((_cur.opacity??1)*100) : 100;
  const isSelectMode = _edLineType === 'select' && edActiveTool !== 'shape';
  const nPoints = _edLineLayer?.points?.length || 0;
  const isClosed = _cur?.closed || false;
  const fillCol = _cur ? (_cur.fillColor||'none') : 'none';
  const hasFill = fillCol !== 'none' && isClosed;
  const fillVal = hasFill ? fillCol : '#ffffff';
  // canFuse: mostrar botón Fusionar si hay ≥2 objetos line cerrados en la página.
  // Se muestra independientemente de selección y de _vsPreSessionLayers.
  // El handler de fusión ya filtra qué objetos fusionar (solo los de sesión actual).
  const canFuse = edLayers.filter(l => l.type==='line' && l.closed).length >= 2;
  // nSubPaths eliminado (T1: huecos son objetos independientes hasta OK)

  panel.innerHTML = `
<div style="display:flex;flex-direction:column;width:100%;gap:0">
  <!-- FILA 1: Tipo de objeto + selección -->
  <div style="display:flex;flex-direction:row;align-items:center;gap:4px;padding:4px 0;min-height:32px;width:100%;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-overflow-scrolling:touch">
    <button id="op-line-draw-btn" style="flex-shrink:0;border:2px solid ${_edLineType==='draw'&&edActiveTool==='line'?'var(--black)':'var(--gray-300)'};border-radius:6px;padding:3px 8px;font-size:.82rem;font-weight:900;cursor:pointer;background:${_edLineType==='draw'&&edActiveTool==='line'?'rgba(0,0,0,.08)':'transparent'}" title="Pol\u00edgono">╱</button>
    <button id="op-line-segment-btn" style="flex-shrink:0;border:2px solid ${_edLineType==='segment'&&edActiveTool==='line'?'var(--black)':'var(--gray-300)'};border-radius:6px;padding:3px 5px;cursor:pointer;background:${_edLineType==='segment'&&edActiveTool==='line'?'rgba(0,0,0,.08)':'transparent'}" title="Segmento"><svg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'><line x1='13' y1='3' x2='3' y2='13' stroke='currentColor' stroke-width='1.8' stroke-linecap='round'/><line x1='10' y1='3' x2='13' y2='3' stroke='currentColor' stroke-width='1.8' stroke-linecap='round'/><line x1='3' y1='10' x2='3' y2='13' stroke='currentColor' stroke-width='1.8' stroke-linecap='round'/></svg></button>
    <button id="op-line-rect-btn" style="flex-shrink:0;border:2px solid ${edActiveTool==='shape'&&_edShapeType==='rect'?'var(--black)':'var(--gray-300)'};border-radius:6px;padding:3px 8px;font-size:.82rem;font-weight:900;cursor:pointer;background:${edActiveTool==='shape'&&_edShapeType==='rect'?'rgba(0,0,0,.08)':'transparent'}">▭</button>
    <button id="op-line-ellipse-btn" style="flex-shrink:0;border:2px solid ${edActiveTool==='shape'&&_edShapeType==='ellipse'?'var(--black)':'var(--gray-300)'};border-radius:6px;padding:3px 8px;font-size:.82rem;font-weight:900;cursor:pointer;background:${edActiveTool==='shape'&&_edShapeType==='ellipse'?'rgba(0,0,0,.08)':'transparent'}">◯</button>
    <button id="op-line-select-btn" style="flex-shrink:0;border:2px solid ${isSelectMode?'var(--black)':'var(--gray-300)'};border-radius:6px;padding:3px 8px;font-size:.82rem;font-weight:900;cursor:pointer;background:${isSelectMode?'rgba(0,0,0,.08)':'transparent'}"><svg width='16' height='16' viewBox='0 0 18 18' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M3 3 L3 14 L6.5 10.5 L9 15.5 L11 14.5 L8.5 9.5 L13 9.5 Z' stroke='currentColor' stroke-width='1.8' stroke-linejoin='round' stroke-linecap='round' fill='none'/></svg></button>
  </div>
  <div style="height:1px;background:var(--gray-300);width:100%"></div>
  <!-- FILA 2: color + grosor + opacidad -->
  <div style="display:flex;flex-direction:row;align-items:center;gap:4px;padding:4px 0;min-height:32px;width:100%">
    <div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>
    <button id="op-line-color-btn" style="width:26px;height:26px;border-radius:50%;background:${col};border:2px solid var(--gray-300);cursor:pointer;flex-shrink:0;padding:0" title="Color línea"></button>
    <button id="op-line-eyedrop" style="flex-shrink:0;border:none;background:transparent;cursor:pointer;font-size:.9rem;padding:2px 4px" title="Cuentagotas">💧</button>
    <div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>
    <button id="op-size-btn" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.68rem,2vw,.8rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)">Grosor</button>
    <div id="op-size-slider" style="display:none;flex:1;align-items:center;gap:4px;min-width:0">
      <div class="ed-slider-wrap" style="flex:1;min-width:40px">
        <input type="range" id="op-dsize" min="0" max="20" data-suffix="px" value="${lw}" style="width:100%;accent-color:var(--black)">
        <span class="ed-slider-bubble"></span>
      </div>
    </div>
    <div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>
    <button id="op-opacity-btn" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.68rem,2vw,.8rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)">Op%</button>
    <div id="op-opacity-slider" style="display:none;flex:1;align-items:center;gap:4px;min-width:0">
      <div class="ed-slider-wrap" style="flex:1;min-width:40px">
        <input type="range" id="op-line-opacity" min="0" max="100" data-suffix="%" value="${opacity}" style="width:100%;accent-color:var(--black)">
        <span class="ed-slider-bubble"></span>
      </div>
    </div>
  </div>
  <div style="height:1px;background:var(--gray-300);width:100%"></div>
  <!-- FILA CERRAR + V/C + INFO VÉRTICES -->
  <div style="display:flex;flex-direction:row;align-items:center;gap:4px;padding:4px 0">
    ${!isClosed?`<button id="op-line-close-btn" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.68rem,2vw,.8rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)">Cerrar objeto</button><div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>`:''}
    <button id="op-line-curve-btn" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.68rem,2vw,.78rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)" title="Convertir vértice a curva"><b>V⟺C</b></button>
    ${(isClosed || canFuse) ? `<div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div><button id="op-line-fuse-btn" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.68rem,2vw,.78rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)" title="Fusionar objetos cerrados en uno solo con huecos">⊕ Fusionar</button>` : ''}
    <div id="op-line-curve-slider" style="display:none;flex:1;align-items:center;gap:4px;min-width:0">
      <input type="number" inputmode="numeric" enterkeyhint="done" id="op-line-curve-rnum" min="0" max="80" value="0" style="width:38px;text-align:right;font-size:.8rem;font-weight:700;border:1px solid var(--gray-300);border-radius:6px;padding:2px 4px;background:transparent;-moz-appearance:textfield;flex-shrink:0">
      <input type="range" id="op-line-curve-r" min="0" max="80" value="0" style="flex:1;min-width:40px;accent-color:var(--black)">
    </div>
    ${!edLastPointerIsTouch ? `<span id="op-line-info" style="flex:1;text-align:right;font-size:.72rem;color:var(--gray-500);padding:0 4px">${nPoints>0?nPoints+' vért.':'Toca para añadir vértices'}</span>` : ''}
  </div>
  ${isClosed?`
  <div style="height:1px;background:var(--gray-300);width:100%"></div>
  <div style="display:flex;flex-direction:row;align-items:center;gap:6px;padding:4px 0">
    <span style="font-size:.72rem;font-weight:700;color:var(--gray-600)">Relleno</span>
    <input type="checkbox" id="op-line-fill-on" ${hasFill?'checked':''} style="cursor:pointer;flex-shrink:0">
    <div style="position:relative;display:flex;align-items:center;flex-shrink:0">
      <button id="op-line-fill-btn" style="width:26px;height:26px;border-radius:50%;background:${fillVal};border:2px solid var(--gray-300);cursor:pointer;flex-shrink:0;padding:0;opacity:${hasFill?1:0.4}"></button>
    </div>
  </div>` : ''}
  <div style="height:1px;background:var(--gray-300);width:100%"></div>
  <!-- FILA ACCIONES -->
  <div style="display:flex;flex-direction:row;align-items:center;gap:4px;padding:4px 0 2px 0;min-height:32px;width:100%">
    <button id="op-line-del" style="flex-shrink:0;border:1px solid #fcc;border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer;color:#c00">✕</button>
    <button id="op-line-dup" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)">⧉</button>
    <button id="op-line-mirror" title="Reflejar" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 6px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)">${_ED_MIRROR_ICON}</button>
    <button id="op-line-undo" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer" disabled>↩</button>
    <button id="op-line-redo" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer" disabled>↪</button>
    <button id="op-lock-btn" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:${_cur?.locked?'var(--gray-800)':'transparent'};color:${_cur?.locked?'var(--white)':'var(--gray-700)'};cursor:pointer" title="${_cur?.locked?'Desbloquear':'Bloquear'}">${_cur?.locked?'🔒':'🔓'}</button>

    <span id="op-line-status" style="flex:1;text-align:right;font-size:clamp(.65rem,1.8vw,.75rem);font-weight:700;color:var(--gray-500);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 4px">${lw}px · ${opacity}%</span>
    <button id="op-draw-ok" style="flex-shrink:0;background:var(--black);color:var(--white);border:none;border-radius:6px;padding:5px 12px;font-family:inherit;font-size:clamp(.75rem,2.2vw,.85rem);font-weight:900;cursor:pointer">✓</button>
  </div>
</div>`;
  // Capturar ANTES de abrir el panel si ya estaba abierto en modo 'line'
  const _panelWasOpen = $('edOptionsPanel')?.classList.contains('open') && $('edOptionsPanel')?.dataset.mode==='line';
  panel.classList.add('open');
  panel.style.visibility='';
  panel.dataset.mode = 'line';
  edFitCanvas(); // actualizar _edCanvasTop
  _edInitSliderBubbles(panel);
  // Guardar estado previo en historial global
  // - isNew: primera apertura (panel cerrado) → guardar estado antes de crear objeto
  // - !isNew && !isCreating: re-editar objeto existente → guardar estado antes de editar
  // - isCreating: objeto ya creado y cerrado → NO guardar (ya se guarda al OK)
  if(!isCreating) edPushHistory();
  _edShapeInitHistory(isNew || isCreating);
  // Sistema _vs*: inicializar solo si no hay sesión activa
  if(!isCreating && _vsHistory.length === 0) _vsInit(!!isNew);
  // Centrar cámara: solo si el panel no estaba ya abierto (apertura real, no re-render interno)
  if(!_panelWasOpen) _edFocusDone = false;
  else _edFocusDone = true;
  const _focusLayer = _edLineLayer || (edSelectedIdx>=0 ? edLayers[edSelectedIdx] : null);
  // Esperar a que termine la transición CSS del panel (max-height 0.2s) antes de medir su tamaño real
  if(_focusLayer && !_edFocusDone) setTimeout(()=>_edFocusOnLayer(_focusLayer), 220);

  // ── Helpers ──
  const _curLine = () => {
    if(_edLineLayer) return _edLineLayer;
    const l = edSelectedIdx>=0 ? edLayers[edSelectedIdx] : null;
    // Incluir ShapeLayer con _fusionId (rectángulos en sesión de fusión)
    return (l?.type==='line' || (l?.type==='shape' && l?._fusionId)) ? l : null;
  };
  const _updateInfo = () => {
    const info=$('op-line-info');
    const l=_curLine();
    if(info) info.textContent = l ? (l.points.length+' vért.') : 'Toca para añadir vértices';
    const status=$('op-line-status');
    if(status){ const ll=_curLine(); if(ll) status.textContent=ll.lineWidth+'px·'+Math.round((ll.opacity??1)*100)+'%'; }
  };
  const _updUR = () => { _edShapeUpdateUndoRedoBtns(); };
  _updUR();

  // ── Herramientas ──
  // Pestañas Objeto/Rectas eliminadas — panel unificado

  // ── Modo dibujar / seleccionar ──
  $('op-line-draw-btn')?.addEventListener('click',()=>{
    if(_edLineLayer && _edLineLayer.points.length >= 2) _edFinishLine();
    _edLineType='draw'; edActiveTool='line'; edCanvas.className='tool-line';
    _edLineFusionId = null;
    _edActivateLineTool();
  });
  $('op-line-segment-btn')?.addEventListener('click',()=>{
    if(_edLineLayer && _edLineLayer.points.length >= 2) _edFinishLine();
    _edLineType='segment'; edActiveTool='line'; edCanvas.className='tool-line';
    _edLineFusionId = null;
    _edActivateLineTool();
  });
  $('op-line-rect-btn')?.addEventListener('click',()=>{
    _edShapeType='rect'; edActiveTool='shape'; edCanvas.className='tool-shape';
    _edLineFusionId = null;
    _edActivateLineTool();
  });
  $('op-line-ellipse-btn')?.addEventListener('click',()=>{
    _edShapeType='ellipse'; edActiveTool='shape'; edCanvas.className='tool-shape';
    _edLineFusionId = null;
    _edActivateLineTool();
  });
  $('op-line-select-btn')?.addEventListener('click',()=>{
    // Cerrar modo V⟺C si estaba abierto
    const _slVC=$('op-line-curve-slider');
    if(_slVC && _slVC.style.display==='flex'){
      _slVC.style.display='none';
      const _vcBtn=$('op-line-curve-btn');
      if(_vcBtn){ _vcBtn.style.background='transparent'; _vcBtn.style.color='var(--gray-700)'; _vcBtn.style.borderColor='var(--gray-300)'; }
      window._edCurveVertIdx=-1;
    }
    // T19: si hay una recta en construcción, confirmarla como objeto abierto independiente
    if(_edLineLayer) {
      if(_edLineLayer.points.length >= 2) {
        _edFinishLine(); // confirma sin cerrar; _edFinishLine ya pone modo selección
        return;
      } else {
        // Menos de 2 puntos: descartar
        const _ix = edLayers.indexOf(_edLineLayer);
        if(_ix >= 0) edLayers.splice(_ix, 1);
        _edLineLayer = null;
        edRedraw();
      }
    }
    _edLineType='select'; edActiveTool='select'; edCanvas.className='';
    _edActivateLineTool();
  });

  // ── Color ──
  $('op-line-color-btn')?.addEventListener('click', e=>{
    const l=_curLine(); if(!l) return;
    _edPickColor(e, l.color||'#000000',
      hex=>{ l.color=hex; $('op-line-color-btn').style.background=hex; edRedraw(); },
      ()=>{ _edShapePushHistory(); }
    );
  });
  $('op-line-eyedrop')?.addEventListener('click', ()=>{ _edStartEyedrop(); });

  // ── Grosor ──
  $('op-size-btn')?.addEventListener('click',()=>{
    const sl=$('op-size-slider'),ob=$('op-opacity-slider');
    const open=sl.style.display==='none'||sl.style.display==='';
    sl.style.display=open?'flex':'none';
    if(open&&ob){ob.style.display='none';$('op-opacity-btn').style.background='transparent';}
    $('op-size-btn').style.background=open?'var(--gray-200)':'transparent';
  });
  $('op-dsize')?.addEventListener('input',e=>{
    const v=+e.target.value; edDrawSize=v;
    const l=_curLine(); if(l){l.lineWidth=v;edRedraw();} _updateInfo();
  });
  $('op-dsize')?.addEventListener('change',()=>{ _edShapePushHistory(); });
  $('op-dsize-num')?.addEventListener('change',e=>{
    const v=Math.max(0,Math.min(20,parseInt(e.target.value)||0));
    e.target.value=v; edDrawSize=v;
    const sl=$('op-dsize'); if(sl) sl.value=v;
    const l=_curLine(); if(l){l.lineWidth=v;edRedraw();} _updateInfo();
    _edShapePushHistory();
  });

  // ── Opacidad ──
  $('op-opacity-btn')?.addEventListener('click',()=>{
    const slO=$('op-opacity-slider'),sl=$('op-size-slider');
    if(!slO) return;
    const open=slO.style.display==='none'||slO.style.display==='';
    slO.style.display=open?'flex':'none';
    if(open&&sl){sl.style.display='none';$('op-size-btn').style.background='transparent';}
    $('op-opacity-btn').style.background=open?'var(--gray-200)':'transparent';
  });
  $('op-line-opacity')?.addEventListener('input',e=>{
    const v=+e.target.value;
    const l=_curLine(); if(l){l.opacity=v/100;edRedraw();} _updateInfo();
  });
  $('op-line-opacity')?.addEventListener('change',()=>{ _edShapePushHistory(); });
  $('op-line-opacity-num')?.addEventListener('change',e=>{
    const v=Math.max(0,Math.min(100,parseInt(e.target.value)||100));
    e.target.value=v;
    const sl=$('op-line-opacity'); if(sl) sl.value=v;
    const l=_curLine(); if(l){l.opacity=v/100;edRedraw();} _updateInfo();
    _edShapePushHistory();
  });

  // ── Cerrar objeto ──
  $('op-line-close-btn')?.addEventListener('click',()=>{
    const l=_curLine(); if(!l||l.points.length<3) return;
    l.closed=true; _edShapePushHistory(); edRedraw(); _edActivateLineTool();
  });

  // ── Relleno ──
  $('op-line-fill-on')?.addEventListener('change',e=>{
    const on=e.target.checked;
    const fb=$('op-line-fill-btn'); if(fb) fb.style.opacity=on?1:0.4;
    const l=_curLine(); if(!l) return;
    if(on){
      const hex=l._lastFillColor||edDrawFillColor||'#ffffff';
      l.fillColor=hex; edDrawFillColor=hex;
      if(fb) fb.style.background=hex;
    } else {
      l._lastFillColor=l.fillColor;
      l.fillColor='none'; edDrawFillColor='none';
    }
    edRedraw(); _edShapePushHistory();
  });
  $('op-line-fill-btn')?.addEventListener('click', e=>{
    const l=_curLine(); if(!l) return;
    const cur=(l.fillColor&&l.fillColor!=='none')?l.fillColor:'#ffffff';
    _edPickColor(e, cur,
      hex=>{ l.fillColor=hex; $('op-line-fill-btn').style.background=hex; $('op-line-fill-on').checked=true; edDrawFillColor=hex; edRedraw(); },
      ()=>{ _edShapePushHistory(); }
    );
  });

  // ── Curva de vértice ──
  window._edCurveVertIdx=-1; // resetear al abrir el panel
  // ── Fusionar — combina todos los objetos cerrados en uno con huecos ──
  $('op-line-fuse-btn')?.addEventListener('click', () => {
    const _closedLayers = edLayers.filter(l =>
      l.type === 'line' && l.closed && !_vsPreSessionLayers.has(l)
    );
    if (_closedLayers.length < 2) {
      edToast('Necesitas al menos 2 objetos cerrados en esta sesión para fusionar');
      return;
    }
    // Fusionar — crea un LineLayer NUEVO independiente (no modifica los originales)
    // Usa el centro del primer objeto como origen del nuevo layer
    const _origin = _closedLayers[0];
    const _newLayer = new LineLayer();
    _newLayer.color    = _origin.color || edDrawColor || '#000000';
    _newLayer.fillColor = edDrawFillColor || '#ffffff'; // relleno aplicado al fusionar
    _newLayer.lineWidth = _origin.lineWidth ?? edDrawSize ?? 3;
    _newLayer.opacity  = _origin.opacity ?? 1;
    _newLayer.rotation = 0; // el nuevo layer no tiene rotación propia
    _newLayer.x = _origin.x;
    _newLayer.y = _origin.y;
    // Añadir puntos de cada objeto en coords locales del nuevo layer
    for (let i = 0; i < _closedLayers.length; i++) {
      const _ll = _closedLayers[i];
      if (i > 0) _newLayer.points.push(null); // separador de contorno
      const _absPoints = _ll.absPoints();
      _absPoints.forEach(p => {
        if (!p) { _newLayer.points.push(null); return; }
        _newLayer.points.push({ x: p.x - _newLayer.x, y: p.y - _newLayer.y });
      });
    }
    _newLayer.closed = true;
    _newLayer._updateBbox();
    // Insertar el nuevo layer y eliminar los originales
    const _firstIdx = edLayers.indexOf(_closedLayers[0]);
    _closedLayers.forEach(l => {
      const ni = edLayers.indexOf(l);
      if (ni >= 0) edLayers.splice(ni, 1);
    });
    const _insertAt = Math.min(_firstIdx, edLayers.length);
    edLayers.splice(_insertAt, 0, _newLayer);
    edPages[edCurrentPage].layers = edLayers;
    edSelectedIdx = _insertAt;
    _edShapePushHistory(); // registrar en historial vectorial (reversible con ↩)
    edRedraw();
    _edActivateLineTool(false, true);
    edToast('Objetos fusionados ✓');
  });

  $('op-line-curve-btn')?.addEventListener('click',()=>{
    const sl=$('op-line-curve-slider');
    const open=sl?.style.display==='none'||sl?.style.display==='';
    if(sl) sl.style.display=open?'flex':'none';
    const btn=$('op-line-curve-btn');
    btn.style.background=open?'var(--black)':'transparent';
    btn.style.color=open?'var(--white)':'var(--gray-700)';
    btn.style.borderColor=open?'var(--black)':'var(--gray-300)';
    if(!open){ window._edCurveVertIdx=-1; edRedraw(); }
  });
  $('op-line-curve-r')?.addEventListener('input',e=>{
    const v=+e.target.value;
    const n=$('op-line-curve-rnum'); if(n) n.value=v;
    window._edCurveRadius=v;
    const la2=edSelectedIdx>=0?edLayers[edSelectedIdx]:null;
    const vi=window._edCurveVertIdx;
    if(la2&&vi>=0){ if(!la2.cornerRadii)la2.cornerRadii={}; la2.cornerRadii[vi]=v; }
    edRedraw();
  });
  $('op-line-curve-r')?.addEventListener('change',()=>{ _edShapePushHistory(); });
  $('op-line-curve-rnum')?.addEventListener('change',e=>{
    const v=Math.max(0,Math.min(80,parseInt(e.target.value)||0));
    e.target.value=v; const sl=$('op-line-curve-r'); if(sl) sl.value=v;
    window._edCurveRadius=v;
    const la2=edSelectedIdx>=0?edLayers[edSelectedIdx]:null;
    const vi=window._edCurveVertIdx;
    if(la2&&vi>=0){ if(!la2.cornerRadii)la2.cornerRadii={}; la2.cornerRadii[vi]=v; }
    edRedraw(); _edShapePushHistory();
  });

  // ── Minimizar (idéntico a draw) ──

  // ── OK ──
  $('op-draw-ok')?.addEventListener('click',()=>{
    // Cerrar modo V⟺C si estaba abierto
    const _slVCL=$('op-line-curve-slider');
    if(_slVCL && _slVCL.style.display==='flex'){
      _slVCL.style.display='none';
      const _vcBtnL=$('op-line-curve-btn');
      if(_vcBtnL){ _vcBtnL.style.background='transparent'; _vcBtnL.style.color='var(--gray-700)'; _vcBtnL.style.borderColor='var(--gray-300)'; }
    }
    window._edCurveVertIdx=-1;
    _edFinishLine();
    // Aplicar relleno a todos los objetos cerrados de la sesión al confirmar
    _edApplyFillToClosedLayers();
    // T1: fusión ya hecha en tiempo real — limpiar _fusionId de TODOS los objetos
    const _okFusId = _edLineFusionId || (edSelectedIdx>=0 ? edLayers[edSelectedIdx]?._fusionId : null);
    if(_okFusId){
      edLayers.forEach(l => { if(l._fusionId === _okFusId) delete l._fusionId; });
    }
    _edLineFusionId = null;
    _edShapeClearHistory(); _vsClear(); edPushHistory(); // limpiar _vs* antes para que edPushHistory no quede bloqueado
    edCloseOptionsPanel();
    edSelectedIdx=-1; edActiveTool='select'; edCanvas.className='';
    edShapeBarHide(); _edDrawUnlockUI();
    if(edMinimized){ window._edMinimizedDrawMode=null; edMaximize(); }
    else { _edResetCameraToFit(); }
    edRedraw();
  });

    // ── Eliminar ──
  $('op-line-del')?.addEventListener('click',()=>{
    const l=_curLine(); if(!l) return;
    edConfirm('¿Eliminar?', ()=>{
      _edLineLayer=null;
      const idx=edLayers.indexOf(l);
      if(idx>=0){edLayers.splice(idx,1);}
      edSelectedIdx=-1; _edShapeClearHistory(); _vsClear(); edPushHistory(); edRedraw();
    });
  });

  // ── Duplicar ──

  $('op-line-dup')?.addEventListener('click',()=>{
    const l=_curLine(); if(!l||l.points.length<2) return;
    // Capturar snapshot del original ANTES de insertar el duplicado
    const origSnapshot = JSON.stringify(edSerLayer(l));
    const copy=new LineLayer();
    copy.points=l.points.map(p=>p?({...p, x:p.x+0.03, y:p.y+0.03}):null);
    copy.color=l.color; copy.fillColor=l.fillColor||'none'; copy.lineWidth=l.lineWidth;
    copy.closed=l.closed; copy.opacity=l.opacity??1; copy.rotation=l.rotation||0;
    if(l.cornerRadii){
      copy.cornerRadii = Array.isArray(l.cornerRadii) ? [...l.cornerRadii] : {...l.cornerRadii};
    }
    copy._updateBbox();
    _edInsertLayerAbove(copy);
    _edShapeClearHistory(); _vsClear(); edPushHistory(); edRedraw();
    // Abrir panel para el duplicado con historial local ya inicializado con el snapshot correcto
    // (evita que _edShapeInitHistory re-serialice desde edLayers y pueda perder datos)
    _edActivateLineTool();
    // Sobreescribir el historial local con el snapshot del original (que tiene cornerRadii correctos)
    // El duplicado es idéntico al original salvo la posición — mismo snapshot es válido
    _edShapeHistory = [origSnapshot];
    _edShapeHistIdx = 0;
    _edShapeHistIdxBase = 0;
    _edShapeUpdateUndoRedoBtns();
  });
  $('op-line-mirror')?.addEventListener('click',()=>{ _edShapePushHistory(); edMirrorSelected(); });

  // ── Deshacer / Rehacer ──
  _updUR();
  $('op-line-undo')?.addEventListener('click',()=>{ edShapeUndo(); });
  $('op-line-redo')?.addEventListener('click',()=>{ edShapeRedo(); });
  $('op-lock-btn')?.addEventListener('click',()=>{
    const _ll = (edSelectedIdx>=0 ? edLayers[edSelectedIdx] : null) || _edLineLayer;
    if(!_ll) return;
    _ll.locked = !_ll.locked;
    edPushHistory();
    const _btn = $('op-lock-btn');
    if(_btn){
      _btn.textContent = _ll.locked ? '🔒' : '🔓';
      _btn.style.background = _ll.locked ? 'var(--gray-800)' : 'transparent';
      _btn.style.color = _ll.locked ? 'var(--white)' : 'var(--gray-700)';
      _btn.title = _ll.locked ? 'Desbloquear' : 'Bloquear';
    }
  });

  // No mover cámara al abrir panel line
}


// Aplicar fillColor a todos los layers vectoriales cerrados de la sesión
function _edApplyFillToClosedLayers() {
  const page = edPages[edCurrentPage];
  if (!page) return;
  page.layers.forEach(l => {
    if ((l.type === 'line' || l.type === 'shape') && l.closed && (!l.fillColor || l.fillColor === 'none')) {
      l.fillColor = edDrawFillColor || '#ffffff';
    }
  });
}

function _edFinishLine() {
  if (_edLineLayer && _edLineLayer.points.length >= 2) {
    _edLineLayer._updateBbox();
    const finished = _edLineLayer;
    _edLineLayer = null;
    _edPendingShape = null;
    edSelectedIdx = edLayers.indexOf(finished);
    // Objeto cerrado: queda como layer independiente.
    // La fusión se hace manualmente con el botón "Fusionar" del panel.
    _edLineFusionId = null;
    delete finished._fusionId;
    _edShapePushHistory();
    edRedraw();
    _edLineType='select'; edActiveTool='select'; edCanvas.className='';
    const _panelOpen = $('edOptionsPanel')?.classList.contains('open') && $('edOptionsPanel')?.dataset.mode==='line';
    const _shapeBarActive = $('edShapeBar')?.classList.contains('visible');
    // En modo barra flotante (menús ocultos): NUNCA abrir el panel al finalizar línea
    if(_panelOpen && !_shapeBarActive) _edActivateLineTool(false, true);
    else if(!edMinimized && !_shapeBarActive) _edActivateLineTool(true);
  } else {
    if (_edLineLayer) {
      const idx = edLayers.indexOf(_edLineLayer);
      if (idx >= 0) edLayers.splice(idx, 1);
    }
    _edLineLayer = null;
    edRedraw();
  }
}

// Congela TODOS los DrawLayers de la página actual, de abajo a arriba.
// Usado tras un recorte de DrawLayer, que deja temporalmente 2 DrawLayers.
function _edFreezeAllDrawLayers(){
  const page = edPages[edCurrentPage]; if(!page) return;
  // Iterar hasta que no quede ningún DrawLayer en la página
  let safety = 20; // máximo 20 iteraciones para evitar bucle infinito
  while(safety-- > 0){
    const dlIdx = page.layers.findIndex(l => l.type === 'draw');
    if(dlIdx < 0) break;
    const dl = page.layers[dlIdx];
    const bb = StrokeLayer._boundingBox(dl._canvas);
    if(!bb){
      // DrawLayer vacío: eliminar sin congelar
      page.layers.splice(dlIdx, 1);
      edLayers = page.layers;
      continue;
    }
    const sl = new StrokeLayer(dl._canvas);
    if(dl.locked) sl.locked = true;
    if(dl.groupId) sl.groupId = dl.groupId;
    // Sustituir DrawLayer por StrokeLayer en la misma posición
    page.layers.splice(dlIdx, 1, sl);
    edLayers = page.layers;
  }
  _edDrawClearHistory();
  edSelectedIdx = -1;
  edPushHistory(true); // force: resultado del recorte siempre se guarda
}

function _edFreezeDrawLayer(){
  const page = edPages[edCurrentPage]; if(!page) return;
  const dlIdx = page.layers.findIndex(l => l.type === 'draw');

  if(dlIdx < 0) return;
  const dl = page.layers[dlIdx];
  const bb = StrokeLayer._boundingBox(dl._canvas);
  _edDrawClearHistory();  // limpiar historial local al convertir en objeto
  if(!bb){
    // Dibujo vacío: eliminar el DrawLayer y registrar en historial global
    page.layers.splice(dlIdx, 1);
    edLayers = page.layers;
    edPushHistory();  // registrar eliminación en historial global
    return;
  }
  const sl = new StrokeLayer(dl._canvas);
  if(dl.locked) sl.locked = true;
  if(dl.groupId) sl.groupId = dl.groupId;
  // T9: Quitar el DrawLayer y reinsertar el StrokeLayer en la MISMA posición (preservar orden de capas)
  page.layers.splice(dlIdx, 1, sl);  // reemplaza en sitio
  edLayers = page.layers;
  edSelectedIdx = page.layers.indexOf(sl);
  // Registrar el resultado final (StrokeLayer) en el historial global.
  // Este es el único punto donde el dibujo "se confirma" — los trazos
  // intermedios solo viven en edDrawHistory (historial local del panel).
  edPushHistory(true); // force: el resultado del dibujo siempre se guarda
  edRedraw();
}

/* ══════════════════════════════════════════
   PANEL DE OPCIONES
   ══════════════════════════════════════════ */
function edCloseOptionsPanel(){
  const panel=$('edOptionsPanel');
  if(panel){
    const _mode=panel.dataset.mode;
    panel.classList.remove('open'); panel.innerHTML=''; delete panel.dataset.mode;
    if(_mode==='props'){ _edDrawUnlockUI(); _edPropsOverlayHide(); }
    if(_mode==='crop'){
      const _wdl = _edCropLayer && _edCropLayer.type === 'draw';
      const _cropSelIdx = edSelectedIdx;
      _edCropMode=false; _edCropLayer=null; _edCropPts=[]; _edCropDragIdx=-1; _edCropDragging=false; _edCropLastTapSeg=-1; _edCropLastTapTime=0; _edCropHistory=[]; _edCropHistIdx=-1;
      if(window._edActivePointers) window._edActivePointers.clear();
      edPinching=false; edPinchScale0=null;
      clearTimeout(window._edCropTouchTimer); window._edCropTouchTimer=null;
      if(!_wdl){
        _edDrawUnlockUI(); _edPropsOverlayHide();
        // Restaurar overlay y panel si hay objeto seleccionado
        if(_cropSelIdx>=0 && _cropSelIdx<edLayers.length){
          edSelectedIdx=_cropSelIdx;
          _edDrawLockUI(); _edPropsOverlayShow();
          edRenderOptionsPanel('props');
        }
      } else {
        _edPropsOverlayHide();
        edRenderOptionsPanel('draw');
      }
    }
    // Limpiar sesión de fusión vectorial y sesión _vs* al cerrar el panel
    // sin OK (toque fuera, swipe). El OK ya llama _vsClear() explícitamente.
    // Sin esto, _vsHistory queda sucio y edPushHistory queda bloqueado
    // impidiendo guardar movimientos/resize/rotate de cualquier objeto posterior.
    if(_mode==='line' || _mode==='shape'){
      _edLineFusionId = null;
      if(typeof _vsClear === 'function') _vsClear();
    }
  }
  _edFocusDone = false;
  edPanelUserClosed = true;
  // No mover cámara al cerrar panel — el usuario decide el zoom
}
/* ══════════════════════════════════════════
   COLOR PICKER PROPIO (táctil/Android)
   Muestra overlay HSL con sliders al 100% por defecto
   ══════════════════════════════════════════ */
function _edUpdatePaletteDots(){
  document.querySelectorAll('.op-pal-dot').forEach(d=>{
    const idx=parseInt(d.dataset.colidx);
    d.style.background=edColorPalette[idx];
    d.style.borderColor = idx === edSelectedPaletteIdx ? 'var(--black)' : 'var(--gray-300)';
    d.style.borderWidth = idx === edSelectedPaletteIdx ? '3px' : '2px';
    // Slots 0 y 1 son fijos (negro/blanco) — cursor indicativo
    if(idx <= 1){
      d.style.cursor='default';
      d.title = idx===0 ? 'Negro (fijo)' : 'Blanco (fijo)';
    }
  });
}
function _hexToHsl(hex){
  let r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b);
  let h,s,l=(max+min)/2;
  if(max===min){ h=s=0; }
  else{
    const d=max-min; s=l>0.5?d/(2-max-min):d/(max+min);
    switch(max){ case r:h=((g-b)/d+(g<b?6:0))/6;break; case g:h=((b-r)/d+2)/6;break; default:h=((r-g)/d+4)/6; }
  }
  return [Math.round(h*360), Math.round(s*100), Math.round(l*100)];
}
function _hslToHex(h,s,l){
  s/=100; l/=100;
  const a=s*Math.min(l,1-l);
  const f=n=>{ const k=(n+h/30)%12; const c=l-a*Math.max(-1,Math.min(k-3,9-k,1)); return Math.round(255*c).toString(16).padStart(2,'0'); };
  return '#'+f(0)+f(8)+f(4);
}
// Helper unificado para picker de color
// En táctil (Android) abre el picker HSL propio; en PC abre el selector nativo.
// Detecta táctil via window._edIsTouch, que se actualiza con cualquier pointerdown real.
function _edPickColor(e, initialHex, onInput, onCommit){
  const _isTouch = e.pointerType==='touch' || window._edIsTouch===true;
  if(_isTouch){
    const _savedSel=edSelectedIdx, _savedCol=edDrawColor;
    edDrawColor = initialHex;
    _edShowColorPicker((hex, commit)=>{
      edSelectedIdx=_savedSel; edDrawColor=_savedCol;
      onInput(hex);
      if(commit) onCommit(hex);
    });
  } else {
    const inp=document.createElement('input');
    inp.type='color'; inp.value=initialHex;
    inp.style.cssText='position:fixed;opacity:0;width:0;height:0;';
    document.body.appendChild(inp);
    // Activar inmediatamente (antes del click) — el focus no siempre se dispara en Chrome
    window._edEyedropActive = true; edRedraw();
    inp.addEventListener('input', ev=>onInput(ev.target.value));
    inp.addEventListener('change', ()=>{
      window._edEyedropActive = false; edRedraw();
      onCommit(inp.value); inp.remove();
    });
    // Fallback: si se cierra sin cambiar color (Escape), restaurar tras breve espera
    inp.addEventListener('blur', ()=>{ setTimeout(()=>{ window._edEyedropActive=false; edRedraw(); }, 200); });
    inp.click();
  }
}

function _edShowColorPicker(onColorChange){
  document.getElementById('ed-hsl-picker')?.remove();
  let [h,s,l] = _hexToHsl(edDrawColor);
  if(s < 10){ s=100; l=50; } // color neutro → arrancar con S y L al 100%/50%
  const overlay = document.createElement('div');
  overlay.id = 'ed-hsl-picker';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;';
  const preview = _hslToHex(h,s,l);
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:20px 18px;width:min(320px,90vw);box-shadow:0 8px 32px rgba(0,0,0,.3)">
      <div id="ecp-preview" style="width:100%;height:44px;border-radius:8px;margin-bottom:14px;background:${preview};border:1px solid #ddd"></div>
      <label style="font-size:.7rem;font-weight:900;color:#666;text-transform:uppercase;letter-spacing:.05em">Tono</label>
      <input type="range" id="ecp-h" min="0" max="360" value="${h}" style="width:100%;margin-bottom:10px;accent-color:hsl(${h},100%,50%)">
      <label style="font-size:.7rem;font-weight:900;color:#666;text-transform:uppercase;letter-spacing:.05em">Saturación <span id="ecp-sv">${s}%</span></label>
      <input type="range" id="ecp-s" min="0" max="100" value="${s}" style="width:100%;margin-bottom:10px;accent-color:hsl(${h},${s}%,50%)">
      <label style="font-size:.7rem;font-weight:900;color:#666;text-transform:uppercase;letter-spacing:.05em">Luminosidad <span id="ecp-lv">${l}%</span></label>
      <input type="range" id="ecp-l" min="0" max="100" value="${l}" style="width:100%;margin-bottom:16px;accent-color:hsl(${h},100%,${l}%)">
      <div style="display:flex;gap:10px">
        <button id="ecp-cancel" style="flex:1;padding:10px;border:2px solid #ddd;border-radius:8px;background:#fff;font-weight:900;font-size:.9rem;cursor:pointer">Cancelar</button>
        <button id="ecp-ok" style="flex:1;padding:10px;border:none;border-radius:8px;background:#111;color:#fff;font-weight:900;font-size:.9rem;cursor:pointer">OK</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const elH=document.getElementById('ecp-h'), elS=document.getElementById('ecp-s'), elL=document.getElementById('ecp-l'), elPrev=document.getElementById('ecp-preview');
  function update(){
    h=+elH.value; s=+elS.value; l=+elL.value;
    const hex=_hslToHex(h,s,l);
    elPrev.style.background=hex;
    elH.style.accentColor=`hsl(${h},100%,50%)`;
    elS.style.accentColor=`hsl(${h},${s}%,50%)`;
    elL.style.accentColor=`hsl(${h},100%,${l}%)`;
    document.getElementById('ecp-sv').textContent=s+'%';
    document.getElementById('ecp-lv').textContent=l+'%';
    onColorChange(hex, false);
  }
  elH.addEventListener('input', update);
  elS.addEventListener('input', update);
  elL.addEventListener('input', update);
  document.getElementById('ecp-ok').addEventListener('click',()=>{
    const hex=_hslToHex(+elH.value,+elS.value,+elL.value);
    onColorChange(hex, true);
    overlay.remove();
  });
  document.getElementById('ecp-cancel').addEventListener('click',()=>{
    onColorChange(edDrawColor, true);
    overlay.remove();
  });
  overlay.addEventListener('click', e=>{ if(e.target===overlay){ onColorChange(edDrawColor,true); overlay.remove(); } });
  // Detener propagación de todos los eventos para no interferir con el canvas
  overlay.addEventListener('pointerdown', e=>e.stopPropagation(), true);
  overlay.addEventListener('touchstart',  e=>e.stopPropagation(), {passive:true, capture:true});
}


/* T5 — Cerrar teclado virtual Android al pulsar Enter en inputs numéricos */
// ── Burbuja flotante sobre thumb del slider ──
function _edUpdateBubble(slider, suffix) {
  const wrap = slider.closest('.ed-slider-wrap'); if (!wrap) return;
  const bubble = wrap.querySelector('.ed-slider-bubble'); if (!bubble) return;
  const val = slider.value + (suffix || '');
  bubble.textContent = val;
  // Posicionar la burbuja centrada sobre el thumb
  const min = parseFloat(slider.min) || 0;
  const max = parseFloat(slider.max) || 100;
  const pct = (parseFloat(slider.value) - min) / (max - min);
  // El thumb ocupa ~10px en ambos extremos (corrección de recorrido real)
  const thumbW = 10;
  const trackW = slider.offsetWidth - thumbW * 2;
  const leftPx = thumbW + pct * trackW;
  bubble.style.left = leftPx + 'px';
}
function _edInitSliderBubbles(container) {
  if (!container) return;
  container.querySelectorAll('.ed-slider-wrap input[type="range"]').forEach(sl => {
    // Detectar sufijo según ID
    const suffix = (sl.id.includes('opacity') || sl.id.includes('dopacity')) ? '%' : 'px';
    // Mostrar burbuja al arrastrar
    sl.addEventListener('input', () => {
      const wrap = sl.closest('.ed-slider-wrap');
      if (wrap) wrap.classList.add('dragging');
      _edUpdateBubble(sl, suffix);
    });
    sl.addEventListener('pointerdown', () => {
      const wrap = sl.closest('.ed-slider-wrap');
      if (wrap) wrap.classList.add('dragging');
      _edUpdateBubble(sl, suffix);
    });
    sl.addEventListener('pointerup', () => {
      const wrap = sl.closest('.ed-slider-wrap');
      if (wrap) wrap.classList.remove('dragging');
    });
    sl.addEventListener('pointercancel', () => {
      const wrap = sl.closest('.ed-slider-wrap');
      if (wrap) wrap.classList.remove('dragging');
    });
    // Inicializar posición
    _edUpdateBubble(sl, suffix);
  });
}

function _edBindNumInput(el) {
  if (!el) return;
  el.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); this.blur(); }
  });
  el.addEventListener('change', function() {
    // En Android táctil, blur cierra el teclado virtual
    if (window._edIsTouch) this.blur();
  });
}
function _edBindAllNumInputs(container) {
  if (!container) return;
  container.querySelectorAll('input[type="number"]').forEach(_edBindNumInput);
  _edInitSliderBubbles(container);
}

function edRenderOptionsPanel(mode){
  const panel=$('edOptionsPanel');if(!panel)return;
  // Restaurar visibility solo si NO estamos minimizados (si estamos minimizados, el panel debe quedar hidden)
  if(mode && !edMinimized) panel.style.visibility='';

  // Sin objeto: cerrar panel — pero respetar modos shape/line activos
  if(!mode||(mode==='props'&&edSelectedIdx<0)){
    // Si hay un submenú shape/line activo, no cerrar
    if(panel.dataset.mode==='shape' || panel.dataset.mode==='line'){
      return;
    }
    // Si el panel estaba en modo recorte, limpiar estado
    if(panel.dataset.mode==='crop'){
      const _wdl2 = _edCropLayer && _edCropLayer.type === 'draw';
      const _cropSelIdx2 = edSelectedIdx;
      _edCropMode=false; _edCropLayer=null; _edCropPts=[]; _edCropDragIdx=-1; _edCropDragging=false; _edCropLastTapSeg=-1; _edCropLastTapTime=0; _edCropHistory=[]; _edCropHistIdx=-1;
      if(window._edActivePointers) window._edActivePointers.clear();
      edPinching=false; edPinchScale0=null;
      clearTimeout(window._edCropTouchTimer); window._edCropTouchTimer=null;
      if(!_wdl2){
        _edDrawUnlockUI(); _edPropsOverlayHide();
        panel.classList.remove('open');panel.innerHTML='';
        if(_cropSelIdx2>=0 && _cropSelIdx2<edLayers.length){
          edSelectedIdx=_cropSelIdx2;
          _edDrawLockUI(); _edPropsOverlayShow();
          edRenderOptionsPanel('props');
        } else { requestAnimationFrame(edFitCanvas); }
        return;
      } else {
        _edPropsOverlayHide();
        panel.classList.remove('open');panel.innerHTML='';
        edRenderOptionsPanel('draw');
        return;
      }
    }
    panel.classList.remove('open');panel.innerHTML='';
    requestAnimationFrame(edFitCanvas);return;
  }

  if(mode==='draw' || mode==='eraser' || mode==='fill'){
    // Si está minimizado, mostrar barra flotante en vez del panel
    if(edMinimized){
      window._edMinimizedDrawMode = mode;
      const panel=$('edOptionsPanel');
      if(panel){ panel.style.visibility='hidden'; }
      edDrawBarShow();
      return;
    }
    edDrawBarHide();
    const isFill = edActiveTool === 'fill';
    const isEr   = edActiveTool === 'eraser';
    const isPen  = !isFill && !isEr;
    const curSize = isEr ? edEraserSize : edDrawSize;
    const curOpacity = 100; // future: per-tool opacity
    // Función helper para generar info de estado
    const _infoText = () => {
      if(isFill) return `Color ${edDrawColor}`;
      return `${isEr ? edEraserSize : edDrawSize}px`;
    };
    panel.innerHTML=`
<div style="display:flex;flex-direction:column;width:100%;gap:0">
  <!-- FILA 1: Herramientas con scroll horizontal -->
  <div style="display:flex;flex-direction:row;align-items:center;width:100%;min-height:32px;padding:3px 0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-overflow-scrolling:touch">
    <button id="op-tool-pen"
      style="flex-shrink:0;border:none;border-radius:6px;padding:5px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.85rem);font-weight:900;cursor:pointer;text-align:center;white-space:nowrap;background:${isPen?'rgba(0,0,0,.08)':'transparent'};color:${isPen?'var(--black)':'var(--gray-600)'}">Dibujar</button>
    <div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>
    <button id="op-tool-eraser"
      style="flex-shrink:0;border:none;border-radius:6px;padding:5px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.85rem);font-weight:900;cursor:pointer;text-align:center;white-space:nowrap;background:${isEr?'rgba(0,0,0,.08)':'transparent'};color:${isEr?'var(--black)':'var(--gray-600)'}">Borrar</button>
    <div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>
    <button id="op-tool-fill"
      style="flex-shrink:0;border:none;border-radius:6px;padding:5px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.85rem);font-weight:900;cursor:pointer;text-align:center;white-space:nowrap;background:${isFill?'rgba(0,0,0,.08)':'transparent'};color:${isFill?'var(--black)':'var(--gray-600)'}">Rellenar</button>

  </div>
  <!-- SEP H -->
  <div style="height:1px;background:var(--gray-300);width:100%"></div>
  <!-- FILA 2: Controles -->
  <div style="display:flex;flex-direction:row;align-items:center;gap:6px;padding:4px 0;min-height:32px;width:100%">
    ${!isEr ? `
    <div style="position:relative;display:flex;align-items:center;flex-shrink:0">
      <button id="op-custom-color-btn" style="width:26px;height:26px;border-radius:50%;background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red);border:2px solid var(--gray-300);cursor:pointer;flex-shrink:0;padding:0;position:relative" title="Color personalizado">🎨
        <input type="color" id="op-dcolor" value="${edDrawColor}"
          style="width:0;height:0;opacity:0;position:absolute;pointer-events:none">
      </button>
    </div>
    <button id="op-eyedrop-btn" style="width:26px;height:26px;border-radius:50%;background:var(--gray-100);border:2px solid var(--gray-300);cursor:pointer;flex-shrink:0;padding:0;font-size:0.85rem" title="Cuentagotas">💧</button>
    <div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>` : ''}
    ${!isFill ? `
    <button id="op-size-btn"
      style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.68rem,2vw,.8rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)">Grosor</button>
    <div id="op-size-slider"
      style="display:none;flex:1;align-items:center;gap:4px;min-width:0">
      <div class="ed-slider-wrap">
        <input type="range" id="op-dsize" min="1" max="${isEr?80:48}" value="${isEr?edEraserSize:edDrawSize}"
          style="width:100%;accent-color:var(--black)">
        <span class="ed-slider-bubble"></span>
      </div>
    </div>
    <div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>` : ''}
    <button id="op-opacity-btn"
      style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.68rem,2vw,.8rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)">Op%</button>
    <div id="op-opacity-slider"
      style="display:none;flex:1;align-items:center;gap:4px;min-width:0">
      <div class="ed-slider-wrap">
        <input type="range" id="op-dopacity" min="1" max="100" value="${edDrawOpacity}"
          style="width:100%;accent-color:var(--black)">
        <span class="ed-slider-bubble"></span>
      </div>
    </div>
    ${isEr ? `
    <div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0"></div>
    <button id="op-color-erase-btn"
      style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.68rem,2vw,.8rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700);white-space:nowrap">Borrar color</button>` : ''}

  </div>
  <!-- SEP H -->\n  <div style="height:1px;background:var(--gray-300);width:100%"></div>\n  <!-- FILA PALETA -->\n  ${!isEr ? `<div id="op-color-palette" style="display:flex;flex-direction:row;align-items:center;gap:4px;padding:4px 0;flex-wrap:wrap">\n    ${edColorPalette.map((c,i) => `<button class="op-pal-dot" data-colidx="${i}" style="width:22px;height:22px;border-radius:50%;background:${c};border:${i===edSelectedPaletteIdx?'3px solid var(--black)':'2px solid var(--gray-300)'};cursor:pointer;flex-shrink:0;padding:0" title="${c}"></button>`).join('')}\n    ${!isFill && window._edIsTouch ? `<div style="width:1px;height:18px;background:var(--gray-300);flex-shrink:0;margin:0 2px"></div><button id="op-offset-btn" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.68rem,2vw,.8rem);font-weight:900;cursor:pointer;white-space:nowrap;background:${_edCursorOffset?'var(--black)':'transparent'};color:${_edCursorOffset?'var(--white)':'var(--gray-700)'}">↑ CURSOR</button><div id="op-offset-pop" style="display:none;position:fixed;z-index:1200;background:var(--white);border:1px solid var(--gray-300);border-radius:10px;padding:6px;box-shadow:0 6px 24px rgba(0,0,0,.3),0 0 0 1px rgba(0,0,0,.07);flex-direction:row;align-items:center;gap:6px;"><button id="op-offset-pop-l" style="border:1px solid var(--gray-300);border-radius:6px;padding:4px 6px;background:transparent;cursor:pointer;" title="Inclinado izquierda"><svg width="22" height="28" viewBox="0 0 22 28"><line x1="15" y1="4" x2="7" y2="24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button><button id="op-offset-pop-r" style="border:1px solid var(--gray-300);border-radius:6px;padding:4px 6px;background:transparent;cursor:pointer;" title="Inclinado derecha"><svg width="22" height="28" viewBox="0 0 22 28"><line x1="7" y1="4" x2="15" y2="24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>` : ''}\n  </div>` : ''}\n  ${isEr && window._edIsTouch ? `
  <!-- SEP H --><div style="height:1px;background:var(--gray-300);width:100%"></div>
  <!-- FILA CURSOR BORRADOR -->
  <div style="display:flex;flex-direction:row;align-items:center;gap:6px;padding:4px 0;min-height:32px;width:100%;position:relative">
    <button id="op-offset-btn" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.68rem,2vw,.8rem);font-weight:900;cursor:pointer;white-space:nowrap;background:${_edCursorOffset?'var(--black)':'transparent'};color:${_edCursorOffset?'var(--white)':'var(--gray-700)'}">↑ CURSOR</button>
    <div id="op-offset-pop" style="display:none;position:fixed;z-index:1200;background:var(--white);border:1px solid var(--gray-300);border-radius:10px;padding:6px;box-shadow:0 6px 24px rgba(0,0,0,.3),0 0 0 1px rgba(0,0,0,.07);flex-direction:row;align-items:center;gap:6px;">
      <button id="op-offset-pop-l" style="border:1px solid var(--gray-300);border-radius:6px;padding:4px 6px;background:transparent;cursor:pointer;" title="Inclinado izquierda"><svg width="22" height="28" viewBox="0 0 22 28"><line x1="15" y1="4" x2="7" y2="24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      <button id="op-offset-pop-r" style="border:1px solid var(--gray-300);border-radius:6px;padding:4px 6px;background:transparent;cursor:pointer;" title="Inclinado derecha"><svg width="22" height="28" viewBox="0 0 22 28"><line x1="7" y1="4" x2="15" y2="24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    </div>
  </div>
` : ''}
<!-- SEP H -->\n  <div style="height:1px;background:var(--gray-300);width:100%"></div>\n  <!-- FILA 3: Acciones -->
  <div style="display:flex;flex-direction:row;align-items:center;gap:4px;padding:4px 0 2px 0;min-height:32px;width:100%">
    <button id="op-draw-del"
      style="flex-shrink:0;border:1px solid #fcc;border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer;color:#c00">✕</button>
    <button id="op-draw-dup"
      style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)">⧉</button>
    <button id="op-draw-mirror"
      title="Reflejar" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 6px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)">${_ED_MIRROR_ICON}</button>
    <button id="op-draw-crop"
      style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer;color:var(--gray-700)" title="Recortar">✂</button>
    <button id="op-draw-undo"
      style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer" disabled>↩</button>
    <button id="op-draw-redo"
      style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:transparent;cursor:pointer" disabled>↪</button>
    <button id="op-draw-lock"
      style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:3px 8px;font-family:inherit;font-size:clamp(.72rem,2.2vw,.82rem);font-weight:900;background:${(()=>{const _dl=edPages[edCurrentPage]?.layers.find(l=>l.type==='draw');return _dl?.locked?'var(--gray-800)':'transparent'})()};color:${(()=>{const _dl=edPages[edCurrentPage]?.layers.find(l=>l.type==='draw');return _dl?.locked?'var(--white)':'var(--gray-700)'})()};cursor:pointer" title="${(()=>{const _dl=edPages[edCurrentPage]?.layers.find(l=>l.type==='draw');return _dl?.locked?'Desbloquear':'Bloquear'})()}">${(()=>{const _dl=edPages[edCurrentPage]?.layers.find(l=>l.type==='draw');return _dl?.locked?'🔒':'🔓'})()}</button>
    <span id="op-draw-info"
      style="flex:1;text-align:right;font-size:clamp(.65rem,1.8vw,.75rem);font-weight:700;color:var(--gray-500);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 4px">${isFill?'Color '+edDrawColor:(isEr?edEraserSize:edDrawSize)+'px · '+edDrawOpacity+'%'}</span>
    <button id="op-draw-ok"
      style="flex-shrink:0;background:var(--black);color:var(--white);border:none;border-radius:6px;padding:5px 12px;font-family:inherit;font-size:clamp(.75rem,2.2vw,.85rem);font-weight:900;cursor:pointer">✓</button>
  </div>
</div>`;
    const _drawPanelAlreadyOpen = panel.classList.contains('open') && panel.dataset.mode === 'draw';
    panel.classList.add('open');
    panel.dataset.mode = 'draw';
    edFitCanvas(); // actualizar _edCanvasTop
    _edInitSliderBubbles(panel);
    // Centrar cámara en el contenido del DrawLayer al abrir el panel,
    // pero NO si ya estaba abierto en modo draw (cambio lápiz↔goma no mueve la cámara)
    _edFocusDone = _drawPanelAlreadyOpen;
    setTimeout(()=>{
      const _page = edPages[edCurrentPage];
      const _dl = _page ? _page.layers.find(l=>l.type==='draw') : null;
      if(!_dl) return;
      const idata = _dl._ctx.getImageData(0, 0, ED_CANVAS_W, ED_CANVAS_H);
      const d = idata.data;
      let minX=ED_CANVAS_W, maxX=0, minY=ED_CANVAS_H, maxY=0, found=false;
      const step = 4;
      for(let y=0; y<ED_CANVAS_H; y+=step){
        for(let x=0; x<ED_CANVAS_W; x+=step){
          if(d[(y*ED_CANVAS_W+x)*4+3] > 8){
            if(x<minX)minX=x; if(x>maxX)maxX=x;
            if(y<minY)minY=y; if(y>maxY)maxY=y;
            found=true;
          }
        }
      }
      if(!found) return;
      const pw=edPageW(), ph=edPageH();
      const cx=((minX+maxX)/2-edMarginX())/pw;
      const cy=((minY+maxY)/2-edMarginY())/ph;
      const bw=(maxX-minX)/pw, bh=(maxY-minY)/ph;
      _edFocusOnLayer({x:cx, y:cy, width:Math.max(bw,0.05), height:Math.max(bh,0.05)});
    }, 220);

    // ── Herramientas ──
    $('op-tool-pen')?.addEventListener('click',()=>{
      edActiveTool='draw'; edCanvas.className='tool-draw';
      edRenderOptionsPanel('draw');
    });
    $('op-tool-eraser')?.addEventListener('click',()=>{
      edActiveTool='eraser'; edCanvas.className='tool-eraser';
      edRenderOptionsPanel('eraser');
    });
    $('op-tool-fill')?.addEventListener('click',()=>{
      edActiveTool='fill'; edCanvas.className='tool-fill';
      edRenderOptionsPanel('fill');
    });
    $('op-tool-shape')?.addEventListener('click',()=>{
      edActiveTool='shape'; edCanvas.className='tool-shape';
      _edActivateShapeTool(true);
    });
    $('op-tool-line')?.addEventListener('click',()=>{
      edActiveTool='line'; edCanvas.className='tool-line';
      _edActivateLineTool();
    });

    $('op-eyedrop-btn')?.addEventListener('click', ()=>{ _edStartEyedrop(); });
    // ── Color: botón arcoíris abre picker propio en táctil, nativo en PC ──
    $('op-custom-color-btn')?.addEventListener('click',()=>{
      if(edSelectedPaletteIdx <= 1){ edToast('Este color no es editable'); return; }
      if(window._edIsTouch){
        _edShowColorPicker((hex, final)=>{
          edDrawColor = hex;
          if(final){ edColorPalette[edSelectedPaletteIdx] = hex; }
          _edUpdatePaletteDots();
        });
      } else {
        window._edEyedropActive = true; edRedraw();
        $('op-dcolor')?.click();
      }
    });
    $('op-dcolor')?.addEventListener('input',e=>{
      if(edSelectedPaletteIdx <= 1) return;
      edDrawColor = e.target.value;
      edColorPalette[edSelectedPaletteIdx] = edDrawColor;
      _edUpdatePaletteDots();
    });
    $('op-dcolor')?.addEventListener('change', ()=>{ window._edEyedropActive=false; edRedraw(); });
    $('op-dcolor')?.addEventListener('blur',   ()=>{ setTimeout(()=>{ window._edEyedropActive=false; edRedraw(); }, 200); });
    // Dots de la paleta
    document.querySelectorAll('.op-pal-dot').forEach(dot=>{
      dot.addEventListener('click',()=>{
        const idx = parseInt(dot.dataset.colidx);
        edSelectedPaletteIdx = idx;
        edDrawColor = edColorPalette[idx];
        _edUpdatePaletteDots();
      });
    });

    // ── Grosor: botón toggle (mutuamente exclusivo con opacidad) ──
    $('op-size-btn')?.addEventListener('click',()=>{
      const sl=$('op-size-slider'), slO=$('op-opacity-slider');
      if(!sl) return;
      const open = sl.style.display==='none' || sl.style.display==='';
      sl.style.display = open ? 'flex' : 'none';
      if(open && slO){ slO.style.display='none'; $('op-opacity-btn').style.background='transparent'; }
      $('op-size-btn').style.background = open ? 'var(--gray-200)' : 'transparent';
    });
    $('op-dsize')?.addEventListener('input',e=>{
      const v=+e.target.value;
      if(edActiveTool==='eraser') edEraserSize=v; else edDrawSize=v;
      const num=$('op-dsize-num'); if(num) num.value=v;
      _edbSyncSize(); _edUpdateDrawInfo();
    });
    $('op-dsize-num')?.addEventListener('change',e=>{
      const max=edActiveTool==='eraser'?80:48;
      const v=Math.max(1,Math.min(max,parseInt(e.target.value)||1));
      e.target.value=v;
      if(edActiveTool==='eraser') edEraserSize=v; else edDrawSize=v;
      const sl=$('op-dsize'); if(sl){ sl.value=v; _edUpdateBubble(sl,'px'); }
      _edbSyncSize(); _edUpdateDrawInfo();
    });
    $('op-color-erase-btn')?.addEventListener('click',()=>{
      edCanvas.style.cursor = 'crosshair';
      window._edColorEraseReady = true;
      const btn=$('op-color-erase-btn');
      if(btn) btn.style.background='var(--gray-200)';
      edToast('Toca el color a borrar');
    });
    // ── Opacidad: botón toggle (mutuamente exclusivo con grosor) ──
    $('op-opacity-btn')?.addEventListener('click',()=>{
      const slO=$('op-opacity-slider'), sl=$('op-size-slider');
      if(!slO) return;
      const open = slO.style.display==='none' || slO.style.display==='';
      slO.style.display = open ? 'flex' : 'none';
      if(open && sl){ sl.style.display='none'; $('op-size-btn').style.background='transparent'; }
      $('op-opacity-btn').style.background = open ? 'var(--gray-200)' : 'transparent';
    });
    $('op-dopacity')?.addEventListener('input',e=>{
      edDrawOpacity=+e.target.value;

      _edUpdateDrawInfo();
    });
    $('op-draw-opacity-num')?.addEventListener('change',e=>{
      const v=Math.max(1,Math.min(100,parseInt(e.target.value)||1));
      e.target.value=v; edDrawOpacity=v;
      const sl=$('op-dopacity'); if(sl) sl.value=v;
      _edUpdateDrawInfo();
    });

    // ── Cursor offset — botón único con popover de orientación ──
    const _opOffsetBtn = $('op-offset-btn');
    const _opOffsetPop = $('op-offset-pop');
    // Abrir/cerrar popover al pulsar el botón principal
    _opOffsetBtn?.addEventListener('click', e => {
      e.stopPropagation();
      if(!_opOffsetPop) return;
      const isOpen = _opOffsetPop.style.display === 'flex';
      if(isOpen){ _opOffsetPop.style.display = 'none'; return; }
      if(_edCursorOffset){
        // Offset activo y popover cerrado → desactivar
        _cofSetOn(false);
        _opOffsetBtn.style.background = 'transparent';
        _opOffsetBtn.style.color = 'var(--gray-700)';
        _edbSyncOffsetBtn();
        _edOffsetHide();
        return;
      }
      // Offset inactivo → abrir popover
      const br = _opOffsetBtn.getBoundingClientRect();
      const panel = $('edOptionsPanel');
      const pr = panel ? panel.getBoundingClientRect() : {left:0,top:0};
      _opOffsetPop.style.display = 'flex';
      _opOffsetPop.style.left = br.left + 'px';
      _opOffsetPop.style.top = '0px';
      requestAnimationFrame(() => {
        const ph = _opOffsetPop.getBoundingClientRect().height;
        _opOffsetPop.style.top = (br.top - ph - 6) + 'px';
      });
    });
    // El popover bloquea pointerdown/touchstart para que no lleguen al cierre exterior
    ['pointerdown','touchstart'].forEach(ev =>
      $('op-offset-pop')?.addEventListener(ev, e => e.stopPropagation(), { passive: true })
    );
    // Botones del popover
    [{id:'op-offset-pop-l', angle:40}, {id:'op-offset-pop-r', angle:-40}]
      .forEach(({id, angle}) => {
        $(id)?.addEventListener('click', e => {
          e.stopPropagation();
          if(_edCursorOffset && _edCursorOffsetAngle === angle){
            _cofSetOn(false);
          } else {
            _edCursorOffsetAngle = angle;
            _cofSetOn(true);
            // T2: mostrar instrucciones al activar
            // hint mostrado via _cofShowHint en _cofSetOn
          }
          _opOffsetPop.style.display = 'none';
          if(_opOffsetBtn){
            _opOffsetBtn.style.background = _edCursorOffset ? 'var(--black)' : 'transparent';
            _opOffsetBtn.style.color = _edCursorOffset ? 'var(--white)' : 'var(--gray-700)';
          }
          ['op-offset-pop-l','op-offset-pop-r'].forEach(bid => {
            const b = $(bid); if(!b) return;
            const a = bid==='op-offset-pop-l' ? 40 : -40;
            b.style.background = (_edCursorOffset && _edCursorOffsetAngle === a) ? 'var(--gray-200)' : 'transparent';
          });
          _edbSyncOffsetBtn();
          if(!_edCursorOffset) _edOffsetHide();
        });
      });
    // Cerrar al tocar fuera — passive sin capture, igual que edb-size-pop
    document.addEventListener('pointerdown', e => {
      if(!_opOffsetPop || _opOffsetPop.style.display !== 'flex') return;
      if(!_opOffsetPop.contains(e.target) && e.target !== _opOffsetBtn)
        _opOffsetPop.style.display = 'none';
    }, { passive: true });

    // ── Deshacer / Rehacer ──
    $('op-draw-undo')?.addEventListener('click', edDrawUndo);
    $('op-draw-crop')?.addEventListener('click',()=>{
      const _page = edPages[edCurrentPage]; if(!_page) return;
      const _dl = _page.layers.find(l=>l.type==='draw'); if(!_dl) return;
      _edStartCrop(_dl);
    });
    $('op-draw-redo')?.addEventListener('click', edDrawRedo);
    _edDrawUpdateUndoRedoBtns();

    // ── Minimizar (desde el panel draw) ──


    // ── OK: congelar ──
    $('op-draw-ok')?.addEventListener('click',()=>{
      edCloseOptionsPanel();
      if(['draw','eraser','fill'].includes(edActiveTool)) edDeactivateDrawTool();
      if(edMinimized){ window._edMinimizedDrawMode = null; edMaximize(); }
      else { _edResetCameraToFit(); }
    });

    // ── Duplicar ──
    $('op-draw-dup')?.addEventListener('click',()=>{
      if(['draw','eraser','fill'].includes(edActiveTool)) edDeactivateDrawTool();
      edDuplicateSelected();
      edCloseOptionsPanel();
    });
    $('op-draw-mirror')?.addEventListener('click',()=>{ _edDrawPushHistory(); edMirrorSelected(); });

    // ── Bloquear ──
    $('op-draw-lock')?.addEventListener('click',()=>{
      const _dl = edPages[edCurrentPage]?.layers.find(l=>l.type==='draw');
      if(!_dl) return;
      _dl.locked = !_dl.locked;
      edPushHistory();
      const _btn = $('op-draw-lock');
      if(_btn){
        _btn.textContent = _dl.locked ? '🔒' : '🔓';
        _btn.style.background = _dl.locked ? 'var(--gray-800)' : 'transparent';
        _btn.style.color = _dl.locked ? 'var(--white)' : 'var(--gray-700)';
        _btn.title = _dl.locked ? 'Desbloquear' : 'Bloquear';
      }
    });

    // ── Eliminar ──
    $('op-draw-del')?.addEventListener('click',()=>{
      edConfirm('¿Eliminar el dibujo?', ()=>{
        const page=edPages[edCurrentPage];if(!page)return;
        const dlIdx=page.layers.findIndex(l=>l.type==='draw');
        if(dlIdx>=0){page.layers.splice(dlIdx,1);edLayers=page.layers;}
        edActiveTool='select'; edCanvas.className='';
        const cur=$('edBrushCursor');if(cur)cur.style.display='none';
        // Desactivar cursor offset si estaba activo (evita que el cursor quede visible)
        if(_cof.on) _cofSetOn(false);
        delete panel.dataset.mode;
        _edDrawClearHistory();
        _edDrawUnlockUI();
        _edPropsOverlayHide();
        edCloseOptionsPanel();
        edPushHistory(); // guardar eliminación en historial global
        edRedraw();
        edToast('Dibujo eliminado');
      });
    });

    // Solo redibujar el canvas para actualizar el cursor; NO redimensionar
    edRedraw();return;
  }

  if(mode==='props'){
    if(edSelectedIdx<0||edSelectedIdx>=edLayers.length){
      panel.classList.remove('open');panel.innerHTML='';requestAnimationFrame(edFitCanvas);return;
    }
    panel.dataset.mode = 'props';
    const la=edLayers[edSelectedIdx];
    // Centrar cámara en el objeto al abrir el panel
    _edFocusDone = false;
    setTimeout(()=>_edFocusOnLayer(la), 220);

    // ── PANEL DE GRUPO ──────────────────────────────────────────
    // Objeto agrupado: panel simplificado sin controles de edición individual.
    // Solo muestra operaciones sobre el grupo completo.
    if(la.groupId){
      const gid = la.groupId;
      const _grpAllLocked = _edGroupMemberIdxs(gid).every(i => edLayers[i]?.locked);
      panel.innerHTML=`
        <div class="op-row" style="margin-top:4px;justify-content:space-between;gap:4px">
          <button class="op-btn danger" id="pp-grp-del" style="flex:1">✕ Eliminar</button>
          <button class="op-btn" id="pp-grp-dup" style="flex:1;background:var(--gray-100);border:1px solid var(--gray-300);border-radius:6px;padding:4px 8px;font-weight:900;font-size:.78rem;cursor:pointer">⧉ Duplicar</button>
          <button class="op-btn" id="pp-grp-mirror" title="Simetría" style="flex-shrink:0;background:var(--gray-100);border:1px solid var(--gray-300);border-radius:6px;padding:4px 6px;font-weight:900;font-size:.78rem;cursor:pointer">${_ED_MIRROR_ICON}</button>
          <button class="op-btn" id="pp-grp-lock" title="${_grpAllLocked?'Desbloquear grupo':'Bloquear grupo'}" style="flex-shrink:0;${_grpAllLocked?'background:var(--gray-800);color:var(--white)':'background:var(--gray-100);color:var(--gray-700)'};border:1px solid var(--gray-300);border-radius:6px;padding:4px 6px;font-weight:900;font-size:.82rem;cursor:pointer">${_grpAllLocked?'🔒':'🔓'}</button>
          <button class="op-btn" id="pp-grp-ungroup" style="flex:1;background:var(--gray-100);border:1px solid var(--gray-300);border-radius:6px;padding:4px 8px;font-weight:900;font-size:.78rem;cursor:pointer">⊟ Desagrupar</button>
          <button id="pp-grp-ok" style="background:var(--black);color:var(--white);border:none;border-radius:6px;padding:4px 10px;font-weight:900;font-size:.82rem;cursor:pointer;flex-shrink:0">✓ OK</button>
        </div>`;
      panel.classList.add('open');
      edFitCanvas(); // actualizar _edCanvasTop
      // Eliminar todo el grupo
      $('pp-grp-del')?.addEventListener('click',()=>{
        edConfirm('¿Eliminar el grupo completo?', ()=>{
          const idxs = _edGroupMemberIdxs(gid).sort((a,b)=>b-a);
          edPushHistory();
          idxs.forEach(i => edLayers.splice(i,1));
          edSelectedIdx=-1; edMultiSel=[]; edMultiBbox=null;
          if(window._edGroupSilentTool!==undefined){ edActiveTool=window._edGroupSilentTool; delete window._edGroupSilentTool; }
          else if(edActiveTool==='multiselect'){ edActiveTool='select'; edCanvas.className=''; $('edMultiSelBtn')?.classList.remove('active'); }
          edCloseOptionsPanel(); edPushHistory(); edRedraw();
        });
      });
      // Duplicar todo el grupo con un nuevo groupId
      $('pp-grp-dup')?.addEventListener('click',()=>{
        const idxs = _edGroupMemberIdxs(gid);
        const newGid = _edNewGroupId();
        edPushHistory();
        const copies = idxs.map(i=>{
          const copy = edDeserLayer(edSerLayer(edLayers[i]));
          if(copy){ copy.groupId=newGid; copy.x+=0.03; copy.y+=0.03; }
          return copy;
        }).filter(Boolean);
        copies.forEach(c=>edLayers.push(c));
        edPushHistory(); edRedraw();
        edToast('Grupo duplicado ✓');
      });
      // Simetría — refleja el grupo entero respecto al eje vertical central
      $('pp-grp-mirror')?.addEventListener('click',()=>{
        const idxs = _edGroupMemberIdxs(gid);
        if(!idxs.length) return;
        edPushHistory();
        // Centro horizontal del grupo = promedio de los centros de los miembros
        const gcx = idxs.reduce((s,i)=>s+(edLayers[i].x||0), 0) / idxs.length;
        // Aplicar simetría a cada miembro
        idxs.forEach(i=>{
          const m = edLayers[i]; if(!m) return;
          // Reflejar posición respecto al eje central del grupo
          m.x = 2*gcx - m.x;
          // Aplicar simetría interna del objeto (misma lógica que edMirrorSelected)
          if(m.type==='image'){
            const img=m.img; if(!img) return;
            const tmp=document.createElement('canvas');
            tmp.width=img.naturalWidth||img.width; tmp.height=img.naturalHeight||img.height;
            const tctx=tmp.getContext('2d');
            tctx.translate(tmp.width,0); tctx.scale(-1,1); tctx.drawImage(img,0,0);
            const mi=new Image();
            mi.onload=()=>{ m.img=mi; m.rotation=-(m.rotation||0); edRedraw(); };
            mi.src=tmp.toDataURL();
          } else if(m.type==='stroke'){
            const c=document.createElement('canvas');
            c.width=m._canvas.width; c.height=m._canvas.height;
            const cctx=c.getContext('2d');
            cctx.translate(c.width,0); cctx.scale(-1,1); cctx.drawImage(m._canvas,0,0);
            m._canvas=c; m._ctx=c.getContext('2d');
            m.rotation=-(m.rotation||0);
          } else if(m.type==='draw'){
            const pw=edPageW(), ph=edPageH();
            const axisPx=edMarginX()+gcx*pw;
            const tmp=document.createElement('canvas');
            tmp.width=ED_CANVAS_W; tmp.height=ED_CANVAS_H;
            const tctx=tmp.getContext('2d');
            tctx.translate(axisPx*2,0); tctx.scale(-1,1); tctx.drawImage(m._canvas,0,0);
            m._ctx.clearRect(0,0,ED_CANVAS_W,ED_CANVAS_H);
            m._ctx.drawImage(tmp,0,0);
          } else if(m.type==='shape'){
            m.rotation=-(m.rotation||0);
            if(m.cornerRadii&&m.cornerRadii.length===4){
              const [tl,tr,br,bl]=m.cornerRadii; m.cornerRadii=[tr,tl,bl,br];
            }
          } else if(m.type==='line'){
            m.points=m.points.map(p=>({...p,x:-p.x,
              cx1:p.cx1!==undefined?-p.cx1:undefined,
              cx2:p.cx2!==undefined?-p.cx2:undefined}));
            m.rotation=-(m.rotation||0);
            if(typeof m._updateBbox==='function') m._updateBbox();
          } else if(m.type==='text'||m.type==='bubble'){
            m.rotation=-(m.rotation||0);
            if(m.type==='bubble'){
              if(m.tailStart) m.tailStart={x:1-m.tailStart.x,y:m.tailStart.y};
              if(m.tailEnd)   m.tailEnd  ={x:1-m.tailEnd.x,  y:m.tailEnd.y};
              if(m.tailStarts) m.tailStarts=m.tailStarts.map(s=>({x:1-s.x,y:s.y}));
              if(m.tailEnds)   m.tailEnds  =m.tailEnds.map(e=>({x:1-e.x,y:e.y}));
            }
          }
        });
        edPushHistory(); edRedraw();
      });
      // Desagrupar
      $('pp-grp-ungroup')?.addEventListener('click',()=>{ edCloseOptionsPanel(); edUngroupSelected(); });
      // OK — cerrar panel y volver al grupo seleccionado
      // Bloquear/desbloquear todos los miembros del grupo
      $('pp-grp-lock')?.addEventListener('click',()=>{
        const idxs = _edGroupMemberIdxs(gid);
        if(!idxs.length) return;
        const allLocked = idxs.every(i => edLayers[i]?.locked);
        const newLocked = !allLocked;
        edPushHistory();
        idxs.forEach(i => { if(edLayers[i]) edLayers[i].locked = newLocked; });
        edPushHistory();
        // Actualizar visual del botón sin rerenderizar todo el panel
        const btn = $('pp-grp-lock');
        if(btn){
          btn.textContent = newLocked ? '🔒' : '🔓';
          btn.title = newLocked ? 'Desbloquear grupo' : 'Bloquear grupo';
          btn.style.background = newLocked ? 'var(--gray-800)' : 'var(--gray-100)';
          btn.style.color = newLocked ? 'var(--white)' : 'var(--gray-700)';
        }
        edToast(newLocked ? 'Grupo bloqueado 🔒' : 'Grupo desbloqueado 🔓');
      });
      $('pp-grp-ok')?.addEventListener('click',()=>{
        edCloseOptionsPanel();
        // Restaurar selección del grupo
        const idxs = _edGroupMemberIdxs(gid);
        if(idxs.length>1){
          edSelectedIdx=-1; edMultiSel=idxs; edMultiGroupRot=0; _msRecalcBbox();
          const _prev = edActiveTool;
          edActiveTool='multiselect';
          window._edGroupSilentTool=_prev;
          edRedraw();
        }
      });
      requestAnimationFrame(edFitCanvas); return;
    }
    // ── FIN PANEL DE GRUPO ──────────────────────────────────────

    let html='';

    if(la.type==='text'||la.type==='bubble'){
      html+=`
      <div class="op-prop-row"><span class="op-prop-label">Texto</span>
        <textarea id="pp-text" style="border-radius:8px;resize:vertical;min-height:40px;flex:1;border:2px solid var(--gray-300);padding:4px 8px;font-family:var(--font-body);font-size:.84rem;">${la.text.replace(/</g,'&lt;')}</textarea></div>
      <div class="op-prop-row"><span class="op-prop-label">Fuente</span>
        <select id="pp-font">
          <option value="Patrick Hand" ${la.fontFamily==='Patrick Hand'?'selected':''}>Patrick Hand</option>
          <option value="Bangers" ${la.fontFamily==='Bangers'?'selected':''}>Bangers</option>
          <option value="Permanent Marker" ${la.fontFamily==='Permanent Marker'?'selected':''}>Permanent Marker</option>
          <option value="Bebas Neue" ${la.fontFamily==='Bebas Neue'?'selected':''}>Bebas Neue</option>
          <option value="Oswald" ${la.fontFamily==='Oswald'?'selected':''}>Oswald</option>
          <option value="Comic Neue" ${la.fontFamily==='Comic Neue'?'selected':''}>Comic Neue</option>
          <option value="Arial" ${la.fontFamily==='Arial'?'selected':''}>Arial</option>
          <option value="Verdana" ${la.fontFamily==='Verdana'?'selected':''}>Verdana</option>
        </select>
        <label style="display:flex;align-items:center;gap:3px;font-size:.82rem;font-weight:900;margin-left:6px;cursor:pointer" title="Negrita">
          <input type="checkbox" id="pp-bold" ${la.fontBold?'checked':''}><b>B</b>
        </label>
        <label style="display:flex;align-items:center;gap:3px;font-size:.82rem;font-style:italic;margin-left:4px;cursor:pointer" title="Cursiva">
          <input type="checkbox" id="pp-italic" ${la.fontItalic?'checked':''}><i>I</i>
        </label>
        <span class="op-prop-label" style="min-width:auto;margin-left:8px">Tamaño</span>
        <input type="number" inputmode="numeric" enterkeyhint="done" id="pp-fs" value="${la.fontSize}" min="8" max="120">
        <input type="color" id="pp-color" value="${la.color}">
        <input type="color" id="pp-bg" value="${la.backgroundColor.startsWith('#')?la.backgroundColor:'#ffffff'}">
      </div>
      <div class="op-prop-row"><span class="op-prop-label">Marco</span>
        <select id="pp-bw">
          ${[0,1,2,3,4,5].map(n=>`<option value="${n}" ${la.borderWidth===n?'selected':''}>${n===0?'Sin borde':n+'px'}</option>`).join('')}
        </select>
        <input type="color" id="pp-bc" value="${la.borderColor}">
        <span class="op-prop-label" style="min-width:auto;margin-left:8px">Fondo</span>
        <span id="pp-bgop-val" style="font-size:.75rem;font-weight:900;min-width:28px;text-align:left">${Math.round((la.bgOpacity??1)*100)}%</span>
        <input type="range" id="pp-bgop" min="0" max="100" value="${Math.round((la.bgOpacity??1)*100)}" style="flex:1;min-width:40px;accent-color:var(--black)">
      </div>`;
      if(la.type==='bubble'){
        html+=`
        <div class="op-prop-row"><span class="op-prop-label">Estilo</span>
          <select id="pp-style">
            <option value="conventional" ${la.style==='conventional'?'selected':''}>Convencional</option>
            <option value="lowvoice" ${la.style==='lowvoice'?'selected':''}>Voz baja</option>
            <option value="thought" ${la.style==='thought'?'selected':''}>Pensamiento</option>
            <option value="explosion" ${la.style==='explosion'?'selected':''}>Explosión/Grito</option>
          </select>
        </div>
        <div class="op-prop-row">
          <span class="op-prop-label">Nº voces</span>
          <input type="number" inputmode="numeric" enterkeyhint="done" id="pp-vc" value="${la.voiceCount||1}" min="1" max="5" style="width:48px">
          <label style="display:flex;align-items:center;gap:4px;font-size:.75rem;font-weight:700;margin-left:12px">
            <input type="checkbox" id="pp-tail" ${la.tail?'checked':''}>  Cola
          </label>
        </div>`;
      }
    } else if(la.type==='stroke'){
      html+=`
      <div class="op-prop-row"><span class="op-prop-label">Opacidad</span>
        <span id="pp-opacity-val" style="font-size:.75rem;font-weight:900;min-width:32px;text-align:left">${Math.round((la.opacity??1)*100)}%</span>
        <input type="range" id="pp-opacity" min="0" max="100" value="${Math.round((la.opacity??1)*100)}" style="flex:1;accent-color:var(--black)">
      </div>
      <div class="op-prop-row">
        <button id="pp-edit-stroke" style="flex:1;background:var(--black);color:var(--white);border:none;border-radius:6px;padding:6px 10px;font-weight:900;font-size:.82rem;cursor:pointer">✏️ Editar dibujo</button>
        <button id="pp-crop" style="flex:1;background:var(--gray-100);border:1px solid var(--gray-300);border-radius:6px;padding:6px 10px;font-weight:900;font-size:.82rem;cursor:pointer">✂ Recortar</button>
      </div>`;
    } else if(la.type==='image'){
      html+=`
      <div class="op-prop-row"><span class="op-prop-label">Rotación</span>
        <input type="number" inputmode="numeric" enterkeyhint="done" id="pp-rot" value="${la.rotation}" min="-180" max="180"> °
      </div>
      <div class="op-prop-row"><span class="op-prop-label">Opacidad</span>
        <span id="pp-opacity-val" style="font-size:.75rem;font-weight:900;min-width:32px;text-align:left">${Math.round((la.opacity??1)*100)}%</span>
        <input type="range" id="pp-opacity" min="0" max="100" value="${Math.round((la.opacity??1)*100)}" style="flex:1;accent-color:var(--black)">
      </div>
      <div class="op-prop-row">
        <button id="pp-crop" style="flex:1;background:var(--gray-100);border:1px solid var(--gray-300);border-radius:6px;padding:6px 10px;font-weight:900;font-size:.82rem;cursor:pointer">✂ Recortar</button>
      </div>`;
    } else if(la.type==='shape'){
      html+=`
      <div class="op-prop-row">
        <button id="pp-edit-shape" style="flex:1;background:var(--black);color:var(--white);border:none;border-radius:6px;padding:6px 10px;font-weight:900;font-size:.82rem;cursor:pointer">✏️ Editar objeto</button>
      </div>
      <div class="op-prop-row"><span class="op-prop-label">Opacidad</span>
        <span id="pp-opacity-val" style="font-size:.75rem;font-weight:900;min-width:32px;text-align:left">${Math.round((la.opacity??1)*100)}%</span>
        <input type="range" id="pp-opacity" min="0" max="100" value="${Math.round((la.opacity??1)*100)}" style="flex:1;accent-color:var(--black)">
      </div>`;
    } else if(la.type==='line'){
      html+=`
      <div class="op-prop-row">
        <button id="pp-edit-line" style="flex:1;background:var(--black);color:var(--white);border:none;border-radius:6px;padding:6px 10px;font-weight:900;font-size:.82rem;cursor:pointer">✏️ Editar recta</button>
      </div>
      <div class="op-prop-row"><span class="op-prop-label">Polígono</span>
        <button id="pp-line-toggle-close" style="flex:1;border:1px solid var(--gray-300);border-radius:6px;padding:4px;font-weight:700;cursor:pointer">${la.closed?'Abrir':'Cerrar'}</button>
      </div>
      <div class="op-prop-row"><span class="op-prop-label">Opacidad</span>
        <span id="pp-opacity-val" style="font-size:.75rem;font-weight:900;min-width:32px;text-align:left">${Math.round((la.opacity??1)*100)}%</span>
        <input type="range" id="pp-opacity" min="0" max="100" value="${Math.round((la.opacity??1)*100)}" style="flex:1;accent-color:var(--black)">
      </div>`;
    }
    html+=`<div class="op-row" style="margin-top:2px;justify-content:space-between;gap:4px">
      <button class="op-btn danger" id="pp-del" style="flex:1">✕ Eliminar</button>
      ${la.groupId
        ? `<button class="op-btn" id="pp-ungroup" style="flex:1;background:var(--gray-100);border:1px solid var(--gray-300);border-radius:6px;padding:4px 8px;font-weight:900;font-size:.78rem;cursor:pointer">⊟ Desagrupar</button>`
        : `<button class="op-btn" id="pp-dup" style="flex:1;background:var(--gray-100);border:1px solid var(--gray-300);border-radius:6px;padding:4px 8px;font-weight:900;font-size:.78rem;cursor:pointer">⧉ Duplicar</button>`}
      ${(la.type!=='text'&&la.type!=='bubble')?`<button class="op-btn" id="pp-mirror" title="Reflejar" style="flex-shrink:0;background:var(--gray-100);border:1px solid var(--gray-300);border-radius:6px;padding:4px 6px;font-weight:900;font-size:.78rem;cursor:pointer">${_ED_MIRROR_ICON}</button>`:''}
      <button id="pp-lock" style="flex-shrink:0;border:1px solid var(--gray-300);border-radius:6px;padding:4px 8px;font-weight:900;font-size:.82rem;cursor:pointer;background:${la.locked?'var(--gray-800)':'var(--gray-100)'};color:${la.locked?'var(--white)':'var(--gray-700)'}" title="${la.locked?'Desbloquear':'Bloquear'}">${la.locked?'🔒':'🔓'}</button>
      <button id="pp-ok" style="background:var(--black);color:var(--white);border:none;border-radius:6px;padding:4px 10px;font-weight:900;font-size:.82rem;cursor:pointer;flex-shrink:0">✓ OK</button>
    </div>`;

    panel.innerHTML=html;
    panel.classList.add('open');
    // Actualizar _edCanvasTop síncronamente: el panel ya está open, el layout
    // ha cambiado, edFitCanvas recalcula totalBarsH y actualiza _edCanvasTop.
    edFitCanvas();

    // (voiceCount es independiente del estilo)
    // Live update
    panel.querySelectorAll('input,select,textarea').forEach(inp=>{
      // input[type=color] en PC: restaurar opacidad del canvas al abrirlo
      if(inp.type === 'color'){
        inp.addEventListener('click',  ()=>{ window._edEyedropActive=true;  edRedraw(); });
        inp.addEventListener('change', ()=>{ window._edEyedropActive=false; edRedraw(); });
        inp.addEventListener('blur',   ()=>{ setTimeout(()=>{ window._edEyedropActive=false; edRedraw(); }, 200); });
      }
      inp.addEventListener('input',e=>{
        if(edSelectedIdx<0)return;
        const la=edLayers[edSelectedIdx],id=e.target.id;
        if(id==='pp-text'){
          // Borrar placeholder al empezar a escribir
          if(la.text==='Escribe aquí' && e.target.value.length > 'Escribe aquí'.length){
            la.text = e.target.value.replace('Escribe aquí','');
            e.target.value = la.text;
          } else {
            la.text=e.target.value;
          }
          la.resizeToFitText(edCanvas);
        }
        else if(id==='pp-font'){la.fontFamily=e.target.value;la.resizeToFitText(edCanvas);}
        else if(id==='pp-bold')  {la.fontBold=e.target.checked;la.resizeToFitText(edCanvas);}
        else if(id==='pp-italic'){la.fontItalic=e.target.checked;la.resizeToFitText(edCanvas);}
        else if(id==='pp-fs'){la.fontSize=parseInt(e.target.value)||12;la.resizeToFitText(edCanvas);}
        else if(id==='pp-color')  la.color=e.target.value;
        else if(id==='pp-bg')     la.backgroundColor=e.target.value;
        else if(id==='pp-bgop'){const v=parseInt(e.target.value)||0;la.bgOpacity=v/100;const lbl=$('pp-bgop-val');if(lbl)lbl.textContent=v+'%';}
        else if(id==='pp-bc')     la.borderColor=e.target.value;
        else if(id==='pp-bw')     la.borderWidth=parseInt(e.target.value);
        else if(id==='pp-style')  {la.style=e.target.value;la.resizeToFitText(edCanvas);}
        else if(id==='pp-vc')     la.voiceCount=Math.max(1,parseInt(e.target.value)||1);
        else if(id==='pp-tail')   la.tail=e.target.checked;
        edRedraw();
      });
    });
    $('pp-del')?.addEventListener('click',()=>{
      edConfirm('¿Eliminar este objeto?', ()=>{ edDeleteSelected(); edCloseOptionsPanel(); });
    });
    $('pp-dup')?.addEventListener('click',()=>{ edDuplicateSelected(); edCloseOptionsPanel(); });
    $('pp-ungroup')?.addEventListener('click',()=>{ edCloseOptionsPanel(); edUngroupSelected(); });
    $('pp-mirror')?.addEventListener('click',()=>{ edMirrorSelected(); });
    $('pp-lock')?.addEventListener('click',()=>{
      const _la = edSelectedIdx>=0 ? edLayers[edSelectedIdx] : null; if(!_la) return;
      _la.locked = !_la.locked;
      edPushHistory();
      const _btn = $('pp-lock');
      if(_btn){
        _btn.textContent = _la.locked ? '🔒' : '🔓';
        _btn.style.background = _la.locked ? 'var(--gray-800)' : 'var(--gray-100)';
        _btn.style.color = _la.locked ? 'var(--white)' : 'var(--gray-700)';
        _btn.title = _la.locked ? 'Desbloquear' : 'Bloquear';
      }
    });
    $('pp-ok')?.addEventListener('click',()=>{ edCloseOptionsPanel(); _edResetCameraToFit(); });
    $('pp-crop')?.addEventListener('click',()=>{ _edStartCrop(la); });
    $('pp-edit-stroke')?.addEventListener('click',()=>{
      const page=edPages[edCurrentPage]; if(!page) return;
      const sl=edLayers[edSelectedIdx]; if(!sl||sl.type!=='stroke') return;
      // Guardar estado global con el StrokeLayer antes de editar
      edPushHistory();
      const dl=sl.toDrawLayer();
      page.layers.splice(edSelectedIdx, 1, dl);
      edLayers=page.layers;
      edSelectedIdx=-1;
      edActiveTool='draw';
      edCanvas.className='tool-draw';
      const cur=$('edBrushCursor');if(cur)cur.style.display='block';
      _edDrawInitHistory();
      _edDrawLockUI();
      edRenderOptionsPanel('draw');
      edRedraw();
    });
    // Shape props — editar objeto abre submenú Objeto con este shape seleccionado
    $('pp-edit-shape')?.addEventListener('click',()=>{
      edActiveTool='shape';
      edCanvas.className='tool-shape';
      _edShapeType = la.shape || 'rect';
      edDrawColor  = la.color || '#000000';
      edDrawSize   = la.lineWidth || 3;
      _edActivateShapeTool(true);
    });
    $('pp-shape-rect')?.addEventListener('click',()=>{ la.shape='rect'; edRedraw(); edRenderOptionsPanel('props'); });
    $('pp-shape-ellipse')?.addEventListener('click',()=>{ la.shape='ellipse'; edRedraw(); edRenderOptionsPanel('props'); });
    $('pp-shape-color')?.addEventListener('input',e=>{ la.color=e.target.value; edRedraw(); });
    $('pp-shape-lw')?.addEventListener('change',e=>{ la.lineWidth=Math.max(0,Math.min(20,+e.target.value)); edRedraw(); });
    // Line props — editar recta abre submenú Rectas
    $('pp-edit-line')?.addEventListener('click',()=>{
      edActiveTool='line';
      edCanvas.className='tool-line';
      edDrawColor = la.color || '#000000';
      edDrawSize  = la.lineWidth || 3;
      _edActivateLineTool();
    });
    $('pp-line-toggle-close')?.addEventListener('click',()=>{ la.closed=!la.closed; edRedraw(); edRenderOptionsPanel('props'); });
    $('pp-rot')?.addEventListener('input',e=>{
      const la2=edSelectedIdx>=0?edLayers[edSelectedIdx]:null; if(!la2)return;
      la2.rotation=parseFloat(e.target.value)||0;
      edRedraw();
    });
    $('pp-opacity')?.addEventListener('input',e=>{
      la.opacity = e.target.value/100;
      const v=$('pp-opacity-val'); if(v) v.textContent=e.target.value+'%';
      edRedraw();
    });
    // Si el texto es placeholder, seleccionar todo para sobreescribir directamente
    const ppText = $('pp-text');
    if(ppText && (edLayers[edSelectedIdx]?.text === 'Escribe aquí')){
      requestAnimationFrame(()=>{ ppText.select(); });
    }
    requestAnimationFrame(edFitCanvas);return;
  } // fin if(mode==='props')

  panel.classList.remove('open');panel.innerHTML='';requestAnimationFrame(edFitCanvas);
} // fin edRenderOptionsPanel

/* ══════════════════════════════════════════
   MINIMIZAR / BOTÓN FLOTANTE
   ══════════════════════════════════════════ */
/* Reposiciona las barras flotantes visibles para que queden
   completamente dentro de la pantalla (se llama tras cambios de layout). */
function _edBarClampToScreen(){
  const W = window.innerWidth, H = window.innerHeight;
  const drawBar = $('edDrawBar');
  if(drawBar && drawBar.classList.contains('visible')){
    const bw = drawBar.offsetWidth  || 36;
    const bh = drawBar.offsetHeight || 200;
    _edbX = Math.max(0, Math.min(W - bw, _edbX));
    _edbY = Math.max(0, Math.min(H - bh, _edbY));
    drawBar.style.left = _edbX + 'px';
    drawBar.style.top  = _edbY + 'px';
  }
  const shapeBar = $('edShapeBar');
  if(shapeBar && shapeBar.classList.contains('visible')){
    const bw = shapeBar.offsetWidth  || 36;
    const bh = shapeBar.offsetHeight || 200;
    _esbX = Math.max(0, Math.min(W - bw, _esbX));
    _esbY = Math.max(0, Math.min(H - bh, _esbY));
    shapeBar.style.left = _esbX + 'px';
    shapeBar.style.top  = _esbY + 'px';
  }
}
function edMinimize(){
  edMinimized=true;
  const menu=$('edMenuBar'),top=$('edTopbar');
  if(menu)menu.style.display='none';
  if(top)top.style.display='none';
  const btn=$('edFloatBtn');
  if(btn){
    btn.classList.add('visible');
    btn.style.left=edFloatX+'px';
    btn.style.top=edFloatY+'px';
  }
  // Ocultar siempre el panel de opciones, sea cual sea su modo
  const _panel=$('edOptionsPanel');
  if(_panel?.classList.contains('open')){
    const mode = _panel.dataset.mode || '';
    // Guardar modo para restaurar al maximizar
    if(mode) window._edMinimizedDrawMode = mode;
    _panel.style.visibility='hidden';
    // Mostrar barra flotante si corresponde al modo
    if(['draw','eraser','fill'].includes(edActiveTool)){
      edDrawBarShow();
    } else if(mode==='shape' || mode==='line'){
      edShapeBarShow();
    }
    // Para props (imagen, texto, bocadillo, stroke): panel oculto sin barra flotante
  }
  _edResetCameraToFit();
  requestAnimationFrame(_edBarClampToScreen);
}
function edMaximize(keepBar=false){
  edMinimized=false;
  const menu=$('edMenuBar'),top=$('edTopbar');
  if(menu)menu.style.display='';
  if(top)top.style.display='';
  $('edFloatBtn')?.classList.remove('visible');
  if(!keepBar){ edDrawBarHide(); }
  edShapeBarHide();
  // Restaurar panel si estaba activo al minimizar
  if(window._edMinimizedDrawMode){
    const mode = window._edMinimizedDrawMode;
    window._edMinimizedDrawMode = null;
    const panel=$('edOptionsPanel');
    if(panel) panel.style.visibility='';
    _edResetCameraToFit();
    requestAnimationFrame(_edBarClampToScreen);
    if(mode === 'shape'){
      edShapeBarHide();
      _edActivateShapeTool(false); // false = no resetear cámara al restaurar desde barra
    } else if(mode === 'line'){
      edShapeBarHide();
      _edActivateLineTool(false); // false = no resetear cámara al restaurar desde barra
    } else {
      edRenderOptionsPanel(mode);
    }
  } else if(_vsHistory.length > 0) {
    edShapeBarHide();
    _edResetCameraToFit();
    requestAnimationFrame(_edBarClampToScreen);
    if(edActiveTool === 'shape') {
      _edActivateShapeTool(false);
    } else {
      _edActivateLineTool(false);
    }
  } else {
    _edResetCameraToFit();
    requestAnimationFrame(_edBarClampToScreen);
  }
}
function edInitFloatDrag(){
  const btn=$('edFloatBtn');if(!btn)return;
  let dragging=false,startX=0,startY=0,startLeft=0,startTop=0;
  function onDown(e){
    dragging=true;
    const src=e.touches?e.touches[0]:e;
    startX=src.clientX;startY=src.clientY;
    startLeft=parseInt(btn.style.left)||edFloatX;
    startTop=parseInt(btn.style.top)||edFloatY;
    e.preventDefault();
  }
  function onMove(e){
    if(!dragging)return;
    const src=e.touches?e.touches[0]:e;
    const dx=src.clientX-startX,dy=src.clientY-startY;
    edFloatX=Math.max(0,Math.min(window.innerWidth-48,startLeft+dx));
    edFloatY=Math.max(0,Math.min(window.innerHeight-48,startTop+dy));
    btn.style.left=edFloatX+'px';btn.style.top=edFloatY+'px';
    e.preventDefault();
  }
  function onUp(e){
    if(!dragging)return;
    dragging=false;
    // Si apenas se movió, es un click
    const src=e.changedTouches?e.changedTouches[0]:e;
    if(Math.hypot(src.clientX-startX,src.clientY-startY)<8)edMaximize();
  }
  btn.addEventListener('pointerdown',onDown,{passive:false});
  window.addEventListener('pointermove',onMove,{passive:false});
  window.addEventListener('pointerup',onUp);
  btn.addEventListener('touchstart',onDown,{passive:false});
  window.addEventListener('touchmove',onMove,{passive:false});
  window.addEventListener('touchend',onUp);
}


/* ══════════════════════════════════════════
   REGLAS (T29) — guías orientables en el workspace
   ══════════════════════════════════════════ */

const _ED_RULE_R = 10;        // radio arrastrador en coords workspace
const _ED_RULE_LINE_HIT = 6;  // tolerancia línea en PC (px workspace)
const _ED_RULE_LINE_HIT_TOUCH = 22; // tolerancia línea en táctil (px workspace)

function _edRuleAdd() {
  const mx = edMarginX(), my = edMarginY();
  const pw = edPageW(),   ph = edPageH();
  const cy = my + ph / 2;
  const id = ++_edRuleId;
  edRules.push({ id, x1: mx - _ED_RULE_R*2, y1: cy, x2: mx + pw + _ED_RULE_R*2, y2: cy });
  edRedraw();
}

function _edRuleClear() {
  if(!edRules.length) return;
  edConfirm('¿Borrar todas las guías de esta hoja?', ()=>{
    edRules = [];
    edRuleNodes = [];
    _edRulesPanelClose();
    edRedraw();
  }, 'Borrar');
}

function _edRuleDelete(id) {
  const _rDel = edRules.find(r => r.id === id);
  if(_rDel) {
    // Si la regla pertenece a algún nodo compartido, eliminar el grupo completo
    const _nodeIds = [];
    if(_rDel.nodeA) _nodeIds.push(_rDel.nodeA);
    if(_rDel.nodeB) _nodeIds.push(_rDel.nodeB);
    if(_nodeIds.length) {
      // Recoger todas las reglas del grupo
      const _groupRuleIds = new Set([id]);
      for(const nid of _nodeIds) {
        const _n = edRuleNodes.find(n => n.id === nid);
        if(_n) _n.ruleIds.forEach(rid => _groupRuleIds.add(rid));
      }
      edRules = edRules.filter(r => !_groupRuleIds.has(r.id));
      edRuleNodes = edRuleNodes.filter(n => !_nodeIds.includes(n.id));
    } else {
      edRules = edRules.filter(r => r.id !== id);
    }
  } else {
    edRules = edRules.filter(r => r.id !== id);
  }
  _edRulesPanelClose();
  edRedraw();
}

function _edRuleDuplicate(id) {
  const r = edRules.find(r => r.id === id); if(!r) return;
  const newId = ++_edRuleId;
  edRules.push({ id: newId, x1: r.x1+20, y1: r.y1+20, x2: r.x2+20, y2: r.y2+20 });
  _edRulesPanelClose();
  edRedraw();
}

function _edRulesNodePanel(n) {
  _edRulesClosePop();
  const sc = edWorldToScreen(n.x, n.y);
  const pop = document.createElement('div');
  pop.id = 'ed-rule-pop';
  pop.style.cssText = 'position:fixed;z-index:10000;background:rgba(28,28,28,0.96);border-radius:10px;padding:6px 8px;display:flex;flex-direction:row;align-items:center;gap:6px;box-shadow:0 4px 18px rgba(0,0,0,0.55);';
  const _bs = 'background:rgba(255,255,255,0.12);border:none;border-radius:7px;padding:7px 9px;cursor:pointer;display:flex;align-items:center;justify-content:center;';
  const _bsLock = `background:${n.locked ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)'};border:none;border-radius:7px;padding:7px 9px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1rem;`;
  pop.innerHTML = `<button id="enp-lock" title="${n.locked ? 'Desbloquear punto' : 'Bloquear punto'}" style="${_bsLock}">${n.locked ? '🔒' : '🔓'}</button><div style="width:1px;height:26px;background:rgba(255,255,255,0.18);flex-shrink:0"></div><button id="enp-del" title="Borrar punto de fuga" style="${_bs}font-size:.9rem;font-weight:900;color:#ff6b6b;">✕</button>`;
  document.body.appendChild(pop);
  const PW = pop.offsetWidth || 100, PH = pop.offsetHeight || 44;
  let px = sc.x + 22, py = sc.y - PH / 2;
  if(px + PW > window.innerWidth - 8) px = sc.x - PW - 22;
  if(py < 8) py = 8;
  if(py + PH > window.innerHeight - 8) py = window.innerHeight - PH - 8;
  pop.style.left = px + 'px'; pop.style.top = py + 'px';
  document.getElementById('enp-lock')?.addEventListener('click', ev => {
    ev.stopPropagation();
    n.locked = !n.locked;
    for(const rid of n.ruleIds) { const _rr=edRules.find(r=>r.id===rid); if(_rr) _rr.locked=n.locked; }
    _edRulesClosePop(); edRedraw();
  });
  document.getElementById('enp-del')?.addEventListener('click', ev => {
    ev.stopPropagation();
    for(const rid of n.ruleIds) {
      const _rr = edRules.find(r=>r.id===rid);
      if(_rr) { if(_rr.nodeA===n.id) _rr.nodeA=null; if(_rr.nodeB===n.id) _rr.nodeB=null; }
    }
    edRuleNodes = edRuleNodes.filter(nn=>nn.id!==n.id);
    _edRulesClosePop(); edRedraw();
  });
  ['pointerdown','touchstart'].forEach(ev2 => pop.addEventListener(ev2, e => e.stopPropagation(), {passive:true}));
  setTimeout(() => { document.addEventListener('pointerdown', _edRulesPopOutside, {passive:true}); }, 50);
}

function _edRulesOpenPanel(id, part, wx, wy) {
  _edRulesClosePop();
  const r = edRules.find(r => r.id === id); if(!r) return;
  const sc = edWorldToScreen(wx, wy);
  const pop = document.createElement('div');
  pop.id = 'ed-rule-pop';
  pop.style.cssText = 'position:fixed;z-index:10000;background:rgba(28,28,28,0.96);border-radius:10px;padding:6px 8px;display:flex;flex-direction:row;align-items:center;gap:6px;box-shadow:0 4px 18px rgba(0,0,0,0.55);';
  const _svgH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22"><line x1="2" y1="12" x2="22" y2="12" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>`;
  const _svgV = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22"><line x1="12" y1="2" x2="12" y2="22" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>`;
  const _svgDup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22"><rect x="9" y="9" width="11" height="11" rx="1.5" stroke="white" stroke-width="2" fill="none"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" stroke="white" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
  const _bs = 'background:rgba(255,255,255,0.12);border:none;border-radius:7px;padding:7px 9px;cursor:pointer;display:flex;align-items:center;justify-content:center;';
  const _bsLock = `background:${r.locked ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)'};border:none;border-radius:7px;padding:7px 9px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1rem;`;
  const _svgEye = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="white" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="white" stroke-width="2" fill="none"/></svg>`;
  const _bsHide = `background:rgba(255,255,255,0.12);border:none;border-radius:7px;padding:7px 9px;cursor:pointer;display:flex;align-items:center;justify-content:center;`;
  const _sep = '<div style="width:1px;height:26px;background:rgba(255,255,255,0.18);flex-shrink:0"></div>';
  // Si la regla pertenece a un grupo (algún extremo vinculado a nodo), mostrar solo dup + lock + hide + delete
  const _inGroup = !!(r.nodeA || r.nodeB);
  if(_inGroup) {
    pop.innerHTML = `<button id="erp-dup" title="Duplicar guía" style="${_bs}">${_svgDup}</button>${_sep}<button id="erp-lock" title="${r.locked ? 'Desbloquear regla' : 'Bloquear regla'}" style="${_bsLock}">${r.locked ? '🔒' : '🔓'}</button>${_sep}<button id="erp-hide" title="Ocultar esta guía" style="${_bsHide}">${_svgEye}</button>${_sep}<button id="erp-del" title="Borrar regla" style="${_bs}font-size:.9rem;font-weight:900;color:#ff6b6b;">✕</button>`;
  } else {
    pop.innerHTML = `<button id="erp-horiz" title="Hacer horizontal" style="${_bs}">${_svgH}</button><button id="erp-vert" title="Hacer vertical" style="${_bs}">${_svgV}</button>${_sep}<button id="erp-dup" title="Duplicar guía" style="${_bs}">${_svgDup}</button>${_sep}<button id="erp-lock" title="${r.locked ? 'Desbloquear regla' : 'Bloquear regla'}" style="${_bsLock}">${r.locked ? '🔒' : '🔓'}</button>${_sep}<button id="erp-hide" title="Ocultar esta guía" style="${_bsHide}">${_svgEye}</button>${_sep}<button id="erp-del" title="Borrar regla" style="${_bs}font-size:.9rem;font-weight:900;color:#ff6b6b;">✕</button>`;
  }
  document.body.appendChild(pop);
  const PW = pop.offsetWidth || 150, PH = pop.offsetHeight || 44;
  let px = sc.x + 22, py = sc.y - PH / 2;
  if(px + PW > window.innerWidth - 8) px = sc.x - PW - 22;
  if(py < 8) py = 8;
  if(py + PH > window.innerHeight - 8) py = window.innerHeight - PH - 8;
  pop.style.left = px + 'px'; pop.style.top = py + 'px';

  document.getElementById('erp-dup')?.addEventListener('click', e => {
    e.stopPropagation(); _edRuleDuplicate(id); 
  });
  document.getElementById('erp-horiz')?.addEventListener('click', e => {
    e.stopPropagation();
    const dist = Math.hypot(r.x2-r.x1, r.y2-r.y1);
    if(part==='a'){ r.x2=r.x1+dist; r.y2=r.y1; } else { r.x1=r.x2-dist; r.y1=r.y2; }
    _edRulesClosePop(); edRedraw();
  });
  document.getElementById('erp-vert')?.addEventListener('click', e => {
    e.stopPropagation();
    const dist = Math.hypot(r.x2-r.x1, r.y2-r.y1);
    if(part==='a'){ r.x2=r.x1; r.y2=r.y1+dist; } else { r.x1=r.x2; r.y1=r.y2-dist; }
    _edRulesClosePop(); edRedraw();
  });
  document.getElementById('erp-lock')?.addEventListener('click', e => {
    e.stopPropagation();
    r.locked = !r.locked;
    _edRulesClosePop(); edRedraw();
  });
  document.getElementById('erp-hide')?.addEventListener('click', e => {
    e.stopPropagation();
    r.hidden = true; // ocultar solo esta guía
    _edRulesClosePop(); edRedraw();
  });
  document.getElementById('erp-del')?.addEventListener('click', e => {
    e.stopPropagation(); _edRuleDelete(id);
  });
  ['pointerdown','touchstart'].forEach(ev => pop.addEventListener(ev, e => e.stopPropagation(), {passive:true}));
  setTimeout(() => { document.addEventListener('pointerdown', _edRulesPopOutside, {passive:true}); }, 50);
}

function _edRulesPopOutside(e) {
  // No cerrar si se pulsa dentro del menú o sus dropdowns
  if(e.target.closest('#edMenuBar') || e.target.closest('.ed-dropdown') ||
     e.target.closest('.ed-submenu') || e.target.closest('#ed-rule-pop')) return;
  _edRulesClosePop();
}

function _edRulesClosePop() {
  const pop = document.getElementById('ed-rule-pop');
  if(pop) pop.remove();
  document.removeEventListener('pointerdown', _edRulesPopOutside, {passive:true});
}

function _edRulesPanelClose() { _edRulesClosePop(); }

function _edRulesDraw(ctx) {
  if(!edRules.length && !edRuleNodes.length) return;
  if(edRulesHidden) return; // guías ocultas: no dibujar
  const z = edCamera.z;
  ctx.save();
  // Extremos ya cubiertos por un nodo compartido
  const _sharedEnds = new Set();
  for(const n of edRuleNodes) {
    for(const rid of n.ruleIds) {
      const _rr = edRules.find(r=>r.id===rid);
      if(!_rr) continue;
      if(_rr.nodeA===n.id) _sharedEnds.add(rid+'_a');
      if(_rr.nodeB===n.id) _sharedEnds.add(rid+'_b');
    }
  }
  for(const r of edRules) {
    if(r.hidden) continue; // guía individualmente oculta
    const isActive = (_edRulePanelId === r.id) || (_edRuleDrag?.ruleId === r.id);
    const lineColor = r.locked ? 'rgba(255,160,30,0.8)' : (isActive ? '#1a8cff' : 'rgba(30,140,255,0.7)');
    const dotColor  = r.locked ? 'rgba(255,160,30,0.9)' : (isActive ? '#1a8cff' : 'rgba(30,140,255,0.75)');
    ctx.beginPath();
    ctx.moveTo(r.x1, r.y1);
    ctx.lineTo(r.x2, r.y2);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5 / z;
    ctx.setLineDash([8/z, 5/z]);
    ctx.stroke();
    ctx.setLineDash([]);
    for(const [ex, ey, key] of [[r.x1,r.y1,r.id+'_a'],[r.x2,r.y2,r.id+'_b']]) {
      if(_sharedEnds.has(key)) continue; // dibujado por el nodo compartido
      ctx.beginPath();
      ctx.arc(ex, ey, _ED_RULE_R / z, 0, Math.PI*2);
      ctx.fillStyle = dotColor;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5 / z;
      ctx.stroke();
    }
  }
  // Nodos compartidos: círculo naranja más grande
  for(const n of edRuleNodes) {
    const isActiveN = (_edRuleDrag?.nodeId === n.id);
    const nodeColor = n.locked ? 'rgba(255,160,30,0.95)' : (isActiveN ? '#ff9900' : 'rgba(255,140,0,0.9)');
    const nr = (_ED_RULE_R * 1.5) / z;
    ctx.beginPath();
    ctx.arc(n.x, n.y, nr, 0, Math.PI*2);
    ctx.fillStyle = nodeColor;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2 / z;
    ctx.stroke();
    // Cruz interior (punto de fuga)
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.2 / z;
    ctx.beginPath();
    ctx.moveTo(n.x - nr*0.5, n.y); ctx.lineTo(n.x + nr*0.5, n.y);
    ctx.moveTo(n.x, n.y - nr*0.5); ctx.lineTo(n.x, n.y + nr*0.5);
    ctx.stroke();
  }
  ctx.restore();
}

function _edRulesHit(wx, wy, isTouch) {
  if(edRulesHidden) return null; // guías ocultas: no seleccionables
  const z = edCamera.z;
  const rPx  = (isTouch ? 22 : _ED_RULE_R) / z;
  const lPx  = (isTouch ? _ED_RULE_LINE_HIT_TOUCH : _ED_RULE_LINE_HIT) / z;
  const nPx  = (_ED_RULE_R * 1.5) / z;
  // Primero: nodos compartidos (prioridad máxima)
  for(let i = edRuleNodes.length-1; i >= 0; i--) {
    const n = edRuleNodes[i];
    if(Math.hypot(wx-n.x, wy-n.y) <= nPx) return { nodeId: n.id };
  }
  // Luego: reglas individuales
  for(let i = edRules.length-1; i >= 0; i--) {
    const r = edRules[i];
    if(r.hidden) continue; // guía individualmente oculta: no seleccionable
    // Extremo A — solo si no pertenece a un nodo compartido
    if(!r.nodeA && Math.hypot(wx-r.x1, wy-r.y1) <= rPx) return { ruleId: r.id, part: 'a' };
    // Extremo B
    if(!r.nodeB && Math.hypot(wx-r.x2, wy-r.y2) <= rPx) return { ruleId: r.id, part: 'b' };
    // Línea — solo si la regla NO está bloqueada (T21 parte 1)
    if(!r.locked) {
      const dx = r.x2-r.x1, dy = r.y2-r.y1, len2 = dx*dx+dy*dy;
      if(len2 > 0) {
        const t  = Math.max(0, Math.min(1, ((wx-r.x1)*dx+(wy-r.y1)*dy)/len2));
        if(Math.hypot(wx-(r.x1+t*dx), wy-(r.y1+t*dy)) <= lPx) return { ruleId: r.id, part: 'line' };
      }
    }
  }
  return null;
}

// Actualiza el texto del botón toggle según el estado actual de visibilidad de guías.
// Global para que pueda llamarse desde edToggleMenu al abrir el menú.
function _edRuleToggleSync() {
  const _txt = $('dd-rule-toggle-txt'); if(!_txt) return;
  const _anyHidden = edRulesHidden || edRules.some(r => r.hidden);
  _txt.textContent = _anyHidden ? 'Mostrar guías' : 'Ocultar guías';
}

function edInitRules() {
  $('dd-rule-add')?.addEventListener('click', () => {
    _edRuleAdd();
    document.querySelectorAll('.ed-dropdown').forEach(d => d.classList.remove('open'));
  });
  $('dd-rule-clear')?.addEventListener('click', () => {
    document.querySelectorAll('.ed-dropdown').forEach(d => d.classList.remove('open'));
    _edRuleClear();
  });
  $('dd-rule-toggle')?.addEventListener('click', () => {
    const _anyHidden = edRulesHidden || edRules.some(r => r.hidden);
    if(_anyHidden){
      // Hay algo oculto → mostrar todo
      edRulesHidden = false;
      edRules.forEach(r => { r.hidden = false; });
    } else {
      // Todo visible → ocultar todo
      edRulesHidden = true;
    }
    _edRuleToggleSync();
    document.querySelectorAll('.ed-dropdown').forEach(d => d.classList.remove('open'));
    edRedraw();
  });
  $('dd-rule-lock-all')?.addEventListener('click', () => {
    // Bloquear todas las guías que no estén ya bloqueadas
    let _count = 0;
    edRules.forEach(r => { if(!r.locked){ r.locked = true; _count++; } });
    // Bloquear también los nodos compartidos
    edRuleNodes.forEach(n => { if(!n.locked){ n.locked = true; } });
    document.querySelectorAll('.ed-dropdown').forEach(d => d.classList.remove('open'));
    edRedraw();
  });
}

// ── Snap a reglas durante el drag ────────────────────────────────────────────
// Algoritmo estándar (Figma / Konva / Krita):
// Para cada punto candidato del objeto (bordes + centro), calcular distancia
// perpendicular a cada regla. Recoger el mejor snap en componente X y en
// componente Y por separado para permitir snap simultáneo a dos reglas perpendiculares.
const _ED_SNAP_THRESHOLD_PX = 8; // px de pantalla — umbral estándar de la industria

function _edSnapToRules(la) {
  if(!edRules.length || edRulesHidden) return; // sin snap si no hay guías o están ocultas
  // (las guías individuales ocultas se saltan en el bucle interno)
  const pw = edPageW(), ph = edPageH();
  const mx = edMarginX(), my = edMarginY();
  const z  = edCamera.z;
  const threshold = _ED_SNAP_THRESHOLD_PX / z; // convertir a coords workspace

  // Puntos candidatos del objeto en coords workspace (bordes y centro del bbox)
  const objCx = mx + la.x * pw;
  const objCy = my + la.y * ph;
  const hw = (la.width  || 0) * pw / 2;
  const hh = (la.height || 0) * ph / 2;

  const candidates = [
    { ox: 0,   oy: 0   },  // centro
    { ox: -hw, oy: 0   },  // borde izquierdo
    { ox:  hw, oy: 0   },  // borde derecho
    { ox: 0,   oy: -hh },  // borde superior
    { ox: 0,   oy:  hh },  // borde inferior
  ];

  // Recoger mejor snap en componente X e Y por separado
  // Esto permite snap simultáneo a dos reglas perpendiculares
  let bestDistX = threshold, bestDistY = threshold;
  let snapDx = 0, snapDy = 0;

  for(const r of edRules) {
    if(r.hidden) continue; // guía individualmente oculta: sin snap
    const rdx = r.x2 - r.x1, rdy = r.y2 - r.y1;
    const rlen = Math.hypot(rdx, rdy);
    if(rlen < 1) continue;
    // Normal a la línea (perpendicular)
    const rnx = -rdy / rlen, rny = rdx / rlen;

    for(const cand of candidates) {
      const px = objCx + cand.ox;
      const py = objCy + cand.oy;
      const vx = px - r.x1, vy = py - r.y1;
      // Distancia perpendicular (con signo)
      const proj = vx * rnx + vy * rny;
      const dist = Math.abs(proj);

      if(dist < threshold) {
        // Desplazamiento para poner el punto sobre la recta
        const dx = -proj * rnx;
        const dy = -proj * rny;

        // Separar en componentes X e Y — coger el mejor para cada eje
        // Una regla predominantemente vertical aporta snap en X
        // Una regla predominantemente horizontal aporta snap en Y
        const isMoreVertical = Math.abs(rdy) > Math.abs(rdx);
        if(isMoreVertical) {
          // Esta regla da snap horizontal (mueve en X)
          if(dist < bestDistX) { bestDistX = dist; snapDx = dx; }
        } else {
          // Esta regla da snap vertical (mueve en Y)
          if(dist < bestDistY) { bestDistY = dist; snapDy = dy; }
        }
        // Para reglas diagonales (45°), aplicar en ambos ejes si es el mejor
        if(Math.abs(Math.abs(rdx) - Math.abs(rdy)) < rlen * 0.2) {
          if(dist < bestDistX) { bestDistX = dist; snapDx = dx; }
          if(dist < bestDistY) { bestDistY = dist; snapDy = dy; }
        }
      }
    }
  }

  if(snapDx !== 0) la.x += snapDx / pw;
  if(snapDy !== 0) la.y += snapDy / ph;
}

/* ══════════════════════════════════════════
   BARRA HERRAMIENTAS DIBUJO FLOTANTE (T5)
   ══════════════════════════════════════════ */
let _edbX = 64, _edbY = 12;  // posición persistente de la barra

function edInitDrawBar() {
  const bar = $('edDrawBar'); if (!bar) return;

  // ── Drag con long-press (300ms) en touch, inmediato en pointer no-touch ──
  let _drag = false, _sx = 0, _sy = 0, _sl = 0, _st = 0, _longTimer = null;
  let _edbDragLocked = false;   // true durante drag: bloquea clicks de botones
  let _edbPid = null;           // pointerId capturado

  function _edbStartDrag(e) {
    _drag = true;
    _edbDragLocked = true;
    // Coordenadas relativas al shell para que los límites sean correctos
    // tanto en pantalla completa como en ventana normal del navegador
    const shell = document.getElementById('editorShell');
    const shellRect = shell ? shell.getBoundingClientRect() : { left: 0, top: 0 };
    _sx = e.clientX - shellRect.left;
    _sy = e.clientY - shellRect.top;
    _sl = parseInt(bar.style.left) || _edbX;
    _st = parseInt(bar.style.top)  || _edbY;
    // Feedback visual: fondo más claro indica modo arrastre
    bar.style.background = 'rgba(80,80,80,0.92)';
    bar.style.willChange = 'transform';
    const cur = $('edBrushCursor'); if (cur) cur.style.display = 'none';
    if (_edbPid !== null) { try { bar.setPointerCapture(_edbPid); } catch(_){} }
    if (navigator.vibrate) navigator.vibrate(30);
  }

  // Bloquear clicks en botones mientras está en modo drag
  bar.addEventListener('click', e => {
    if (_edbDragLocked) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);

  // ── Pestaña de arrastre: drag inmediato desde el handle ──
  const handle = bar.querySelector('.edb-handle');
  if (handle) {
    handle.addEventListener('pointerdown', e => {
      _edbPid = e.pointerId;
      _edbDragLocked = false;
      e.preventDefault();
      e.stopPropagation();
      _edbStartDrag(e);
    }, { passive: false });
  }

  bar.addEventListener('pointerdown', e => {
    if (e.target.closest('.edb-handle')) return; // ya gestionado por el handle
    _edbPid = e.pointerId;
    _edbDragLocked = false;
    e.preventDefault();
    if (e.pointerType === 'touch') {
      // Touch: long-press de 300ms activa el drag desde cualquier punto de la barra
      // Guardar posición inicial relativa al shell (igual que _edbStartDrag)
      const _shell0 = document.getElementById('editorShell');
      const _rect0  = _shell0 ? _shell0.getBoundingClientRect() : { left: 0, top: 0 };
      _sx = e.clientX - _rect0.left; _sy = e.clientY - _rect0.top;
      _longTimer = setTimeout(() => {
        _longTimer = null;
        _edbStartDrag(e);
      }, 300);
    } else {
      // Mouse/stylus: drag inmediato solo desde fondo (no botones)
      if (!e.target.closest('button')) _edbStartDrag(e);
    }
  }, { passive: false });

  bar.addEventListener('pointermove', e => {
    const shell = document.getElementById('editorShell');
    const shellRect = shell ? shell.getBoundingClientRect() : { left: 0, top: 0 };
    const ex = e.clientX - shellRect.left;
    const ey = e.clientY - shellRect.top;
    if (_longTimer && (Math.abs(ex - _sx) > 6 || Math.abs(ey - _sy) > 6)) {
      clearTimeout(_longTimer); _longTimer = null;
    }
    if (!_drag) return;
    e.preventDefault();
    const dx = ex - _sx, dy = ey - _sy;
    const W = shell ? shell.offsetWidth  : window.innerWidth;
    const H = shell ? shell.offsetHeight : window.innerHeight;
    const bw = bar.offsetWidth, bh = bar.offsetHeight;
    _edbX = Math.max(0, Math.min(W - bw, _sl + dx));
    _edbY = Math.max(0, Math.min(H - bh, _st + dy));
    bar.style.left = _edbX + 'px';
    bar.style.top  = _edbY + 'px';
    // Snap de orientación: solo cambia al ENTRAR en zona de borde, nunca al salir
    const SNAP = 48;
    const wasHoriz = bar.classList.contains('horiz');
    const distPtrTB = Math.min(ey, H - ey);
    const distPtrLR = Math.min(ex, W - ex);
    // Solo actuar si el puntero está dentro del rango de algún borde
    if (distPtrTB < SNAP || distPtrLR < SNAP) {
      const shouldHoriz = distPtrTB <= distPtrLR;
      if (shouldHoriz !== wasHoriz) {
        bar.classList.toggle('horiz', shouldHoriz);
        // Reajustar origen del drag para compensar el nuevo tamaño
        const newBw = bar.offsetWidth, newBh = bar.offsetHeight;
        const adjX = (bw - newBw) / 2, adjY = (bh - newBh) / 2;
        _sl += adjX; _st += adjY;
        _edbX = Math.max(0, Math.min(W - newBw, _edbX + adjX));
        _edbY = Math.max(0, Math.min(H - newBh, _edbY + adjY));
        bar.style.left = _edbX + 'px';
        bar.style.top  = _edbY + 'px';
      }
    }
    // Fuera de rango: mantener orientación sin tocarla
  }, { passive: false });

  function _edbApplySnap() {
    // La orientación ya se gestiona en tiempo real durante el drag.
    // Esta función se mantiene por si se necesita en el futuro (p.ej. resize de ventana).
  }

  function _edbEndDrag() {
    if (_longTimer) { clearTimeout(_longTimer); _longTimer = null; }
    _drag = false;
    bar.style.background = '';
    bar.style.willChange = '';
    // Pequeño delay para que el click bloqueado no se propague tras soltar
    setTimeout(() => { _edbDragLocked = false; }, 50);
    if (['draw','eraser'].includes(edActiveTool)) {
      const cur = $('edBrushCursor'); if (cur) cur.style.display = 'block';
    }
  }

  bar.addEventListener('pointerup',     _edbEndDrag);
  bar.addEventListener('pointercancel', _edbEndDrag);

  // ── Botones herramienta ──
  $('edb-pen')?.addEventListener('click', () => {
    edPushHistory(); // guardar estado previo antes de entrar a dibujo
    edActiveTool = 'draw'; edCanvas.className = 'tool-draw';
    _edbSyncTool();
    $('op-tool-pen')?.click();
  });
  $('edb-eraser')?.addEventListener('click', () => {
    edActiveTool = 'eraser'; edCanvas.className = 'tool-eraser';
    _edbSyncTool();
    $('op-tool-eraser')?.click();
  });
  $('edb-fill')?.addEventListener('click', () => {
    edActiveTool = 'fill'; edCanvas.className = 'tool-fill';
    _edbSyncTool();
    $('op-tool-fill')?.click();
  });

  // ── Color: abre popover de paleta ──
  $('edb-color')?.addEventListener('click', e => {
    e.stopPropagation();
    _edbTogglePalette();
  });

  // ── Cuentagotas en barra flotante ──
  $('edb-eyedrop')?.addEventListener('pointerup', e => {
    e.stopPropagation();
    _edStartEyedrop();
  });

  // ── Grosor: abre panel anclado SIEMPRE AL LADO de la barra flotante ──
  function _edbOpenSizePop(btn) {
    const pop = $('edb-size-pop');
    if (!pop) return;
    const isOpen = pop.style.display === 'flex';
    if (isOpen) { pop.style.display = 'none'; return; }
    _edbSyncSize();
    pop.style.display = 'flex';
    pop.style.left = '-9999px'; pop.style.top = '-9999px';
    _edbSyncSizePreview();
    // Posicionar al lado de la barra flotante, adaptando según bordes de pantalla
    const bar = $('edDrawBar');
    const br  = bar ? bar.getBoundingClientRect() : btn.getBoundingClientRect();
    const pw  = pop.offsetWidth  || 170;
    const ph  = pop.offsetHeight || 120;
    const W   = window.innerWidth;
    const H   = window.innerHeight;
    const GAP = 8;
    // Posicionar siempre AL LADO de la barra (nunca encima/debajo)
    // Preferir el lado con más espacio: izquierda o derecha
    const spaceRight = W - br.right - GAP;
    const spaceLeft  = br.left - GAP;
    let left, top;
    if (spaceRight >= pw || spaceRight >= spaceLeft) {
      // A la derecha de la barra
      left = br.right + GAP;
    } else {
      // A la izquierda de la barra
      left = br.left - pw - GAP;
    }
    // Centrado verticalmente respecto a la barra, ajustado para no salir de pantalla
    top = Math.max(GAP, Math.min(H - ph - GAP, br.top + br.height/2 - ph/2));
    // Asegurar que no sale por la derecha (por si la barra está muy a la derecha)
    left = Math.max(GAP, Math.min(W - pw - GAP, left));
    pop.style.left = left + 'px';
    pop.style.top  = top  + 'px';
  }
  $('edb-pen-size')?.addEventListener('click', e => { e.stopPropagation(); _edbOpenSizePop($('edb-pen-size')); });
  $('edb-eraser-size')?.addEventListener('click', e => { e.stopPropagation(); _edbOpenSizePop($('edb-eraser-size')); });
  $('edb-size-num')?.addEventListener('change', e => {
    const pop=$('edb-size-pop');
    if(pop?._esbOpMode){
      const v=Math.max(0,Math.min(100,parseInt(e.target.value)||0));
      e.target.value=v;
      const la=edSelectedIdx>=0?edLayers[edSelectedIdx]:null;
      if(la){ la.opacity=v/100; _edShapePushHistory(); edRedraw(); _esbSync(); }
      const sl=$('edb-size-slider'); if(sl) sl.value=v;
      return;
    }
    const isEr = edActiveTool === 'eraser';
    const max = isEr ? 80 : 48;
    const v = Math.max(0, Math.min(max, parseInt(e.target.value) || 0));
    e.target.value = v;
    if(pop?._esbMode){
      const la = edSelectedIdx >= 0 ? edLayers[edSelectedIdx] : null;
      if(la && (la.type==='shape'||la.type==='line')){ la.lineWidth = v; _edShapePushHistory(); edRedraw(); }
      edDrawSize = v;
    } else {
      if (isEr) edEraserSize = v; else edDrawSize = v;
    }
    _edbSyncSize();
    const sl = $('op-dsize'); if (sl) { sl.value = v; _edUpdateBubble(sl,'px'); }
  });
  // Slider de grosor en tiempo real
  $('edb-size-slider')?.addEventListener('input', e => {
    const pop=$('edb-size-pop');
    const v = parseInt(e.target.value) || 0;
    if(pop?._esbOpMode){
      // Modo opacidad: solo actualizar número y aplicar
      const la = edSelectedIdx >= 0 ? edLayers[edSelectedIdx] : null;
      if(la){ la.opacity=v/100; edRedraw(); _esbSync(); }
      const num=$('edb-size-num'); if(num) num.value=v;
      return;
    }
    const isEr = edActiveTool === 'eraser';
    if(pop?._esbMode){
      const la = edSelectedIdx >= 0 ? edLayers[edSelectedIdx] : null;
      if(la && (la.type==='shape'||la.type==='line')){ la.lineWidth = v; edRedraw(); }
      edDrawSize = v;
    } else {
      if (isEr) edEraserSize = v; else edDrawSize = v;
    }
    // Actualizar número y preview inmediatamente
    const num = $('edb-size-num'); if(num) num.value = v;
    const prev = $('edb-size-preview');
    if(prev){ const pd=Math.max(4,Math.min(80,v*2)); prev.style.width=pd+'px'; prev.style.height=pd+'px'; }
    // Actualizar preview en tiempo real
    _edbSyncSizePreview();
    const sl = $('op-dsize'); if(sl){ sl.value=v; _edUpdateBubble(sl,'px'); }
    _edRefreshOffsetCursor(); // T4: actualizar círculo del cursor en tiempo real
  });
  $('edb-size-slider')?.addEventListener('pointerup', e => {
    const pop=$('edb-size-pop');
    if(pop?._esbOpMode || pop?._esbMode) _edShapePushHistory();
  });
  $('edb-size-slider')?.addEventListener('pointerdown', e => e.stopPropagation());
  $('edb-size-slider')?.addEventListener('touchstart', e => e.stopPropagation(), {passive:true});
  ['pointerdown','touchstart'].forEach(ev =>
    $('edb-size-pop')?.addEventListener(ev, e => e.stopPropagation(), { passive: true })
  );
  // Cerrar popover de grosor al tocar fuera
  document.addEventListener('pointerdown', e => {
    const pop = $('edb-size-pop');
    if (pop && pop.style.display === 'flex' && !pop.contains(e.target) && e.target.id !== 'edb-pen-size' && e.target.id !== 'edb-eraser-size' && e.target.id !== 'esb-size' && e.target.id !== 'esb-opacity'){
      pop.style.display = 'none';
      pop._esbMode = false; pop._esbOpMode = false;
      // Restaurar preview dot y etiqueta para el modo grosor
      const prev=$('edb-size-preview'); if(prev) prev.style.display='';
      const lbl=pop.querySelector('span[style*="color:#ccc"]'); if(lbl) lbl.textContent='px';
    }
  }, { passive: true });

  // ── Deshacer / Rehacer ──
  $('edb-undo')?.addEventListener('click', () => edDrawUndo());
  $('edb-redo')?.addEventListener('click', () => edDrawRedo());

  // ── Cursor offset (T18) — botón único con popover ──
  function _edbOpenOffsetPop() {
    const pop = $('edb-offset-pop');
    if(!pop) return;
    const isOpen = pop.style.display === 'flex';
    if(isOpen){ pop.style.display = 'none'; return; }
    // Si offset activo → desactivar directamente sin abrir el popover
    if(_edCursorOffset){
      _cofSetOn(false);
      _edbSyncOffsetBtn();
      _edOffsetHide();
      return;
    }
    // Posicionar igual que edb-size-pop: al lado de la barra con más espacio
    pop.style.display = 'flex';
    pop.style.left = '-9999px'; pop.style.top = '-9999px';
    const bar = $('edDrawBar');
    const br  = bar ? bar.getBoundingClientRect() : {left:0, right:0, top:0, bottom:0, width:0, height:0};
    const pw  = pop.offsetWidth  || 130;
    const ph  = pop.offsetHeight || 52;
    const W   = window.innerWidth;
    const H   = window.innerHeight;
    const GAP = 8;
    const spaceRight = W - br.right - GAP;
    const spaceLeft  = br.left - GAP;
    let left;
    if(spaceRight >= pw || spaceRight >= spaceLeft){
      left = br.right + GAP;
    } else {
      left = br.left - pw - GAP;
    }
    let top = Math.max(GAP, Math.min(H - ph - GAP, br.top + br.height/2 - ph/2));
    left = Math.max(GAP, Math.min(W - pw - GAP, left));
    pop.style.left = left + 'px';
    pop.style.top  = top  + 'px';
  }
  $('edb-offset')?.addEventListener('click', e => { e.stopPropagation(); _edbOpenOffsetPop(); });
  // Los botones del popover bloquean pointerdown/touchstart igual que edb-size-pop
  ['pointerdown','touchstart'].forEach(ev =>
    $('edb-offset-pop')?.addEventListener(ev, e => e.stopPropagation(), { passive: true })
  );
  [{id:'edb-offset-pop-l', angle:40}, {id:'edb-offset-pop-r', angle:-40}]
    .forEach(({id, angle}) => {
      $(id)?.addEventListener('click', e => {
        e.stopPropagation();
        if(_edCursorOffset && _edCursorOffsetAngle === angle){
          _cofSetOn(false);
        } else {
          _edCursorOffsetAngle = angle;
          _cofSetOn(true);
        }
        $('edb-offset-pop').style.display = 'none';
        _edbSyncOffsetBtn();
        if(!_edCursorOffset) _edOffsetHide();
      });
    });
  // Cerrar al tocar fuera — passive:true sin capture, igual que edb-size-pop
  document.addEventListener('pointerdown', e => {
    const pop = $('edb-offset-pop');
    if(pop && pop.style.display === 'flex' &&
       !pop.contains(e.target) && e.target.id !== 'edb-offset'){
      pop.style.display = 'none';
    }
  }, { passive: true });

  // ── OK: finaliza el modo dibujo ──
  $('edb-ok')?.addEventListener('click', () => {
    const panel = $('edOptionsPanel');
    if(panel) panel.style.visibility = '';
    $('op-draw-ok')?.click();
  });
}

function _edbTogglePalette() {
  const pop = $('edb-palette-pop');
  if (!pop) return;
  if (pop.classList.contains('open')) { _edbClosePalette(); return; }
  _edbBuildPalette();
  _edbPositionPalette();
  pop.classList.add('open');
  // Cerrar al tocar fuera
  setTimeout(() => {
    window._edbPaletteClose = e => {
      if (!e.target.closest('#edb-palette-pop') && !e.target.closest('#edb-color')) {
        _edbClosePalette();
      }
    };
    document.addEventListener('pointerdown', window._edbPaletteClose, { once: true });
  }, 0);
}

function _edbClosePalette() {
  $('edb-palette-pop')?.classList.remove('open');
}

function _edbBuildPalette() {
  const pop = $('edb-palette-pop'); if (!pop) return;
  const bar = $('edDrawBar');
  const isHoriz = bar?.classList.contains('horiz');
  pop.className = 'edb-palette-pop' + (isHoriz ? ' horiz-pop' : '');
  pop.id = 'edb-palette-pop';
  pop.classList.toggle('open', true); // mantener open al reconstruir

  pop.innerHTML = edColorPalette.map((c, i) =>
    `<button class="edb-pal-dot${c === edDrawColor ? ' current' : ''}"
      data-colidx="${i}" style="background:${c}" title="${c}"></button>`
  ).join('') +
  `<button class="edb-pal-dot edb-pal-custom" data-custom="1" title="Color personalizado">+</button>`;

  pop.querySelectorAll('.edb-pal-dot').forEach(btn => {
    btn.addEventListener('pointerup', e => {
      e.stopPropagation();
      if (btn.dataset.custom) {
        // Slots 0 y 1 son negro/blanco fijos — no editables
        if(edSelectedPaletteIdx <= 1){ edToast('Este color no es editable'); _edbClosePalette(); return; }
        _edbClosePalette();
        if(window._edIsTouch){
          // Android: picker HSL propio (sin cuentagotas)
          _edShowColorPicker((hex, commit) => {
            edDrawColor = hex;
            if(commit){ edColorPalette[edSelectedPaletteIdx]=hex; _edUpdatePaletteDots(); }
            _edbSyncColor();
          });
        } else {
          // PC: selector nativo del navegador (con cuentagotas)
          const _inp=document.createElement('input'); _inp.type='color'; _inp.value=edDrawColor;
          _inp.style.cssText='position:fixed;opacity:0;width:0;height:0;';
          document.body.appendChild(_inp);
          _inp.addEventListener('input', ev=>{ edDrawColor=ev.target.value; _edbSyncColor(); });
          _inp.addEventListener('change', ()=>{
            edColorPalette[edSelectedPaletteIdx]=edDrawColor;
            _edUpdatePaletteDots(); _edbSyncColor(); _inp.remove();
          });
          _inp.click();
        }
        return;
      }
      const idx = +btn.dataset.colidx;
      edSelectedPaletteIdx = idx; // sincronizar índice para que el botón arcoíris sepa qué slot editar
      edDrawColor = edColorPalette[idx];
      _edbSyncColor();
      // Sincronizar panel principal si está abierto
      const mainDot = document.querySelector(`.op-pal-dot[data-colidx="${idx}"]`);
      if (mainDot) mainDot.dispatchEvent(new Event('click'));
      _edbClosePalette();
    });
  });
}


function _edbPositionPalette() {
  const pop = $('edb-palette-pop');
  const bar = $('edDrawBar');
  const sw  = $('edb-color');
  if (!pop || !bar || !sw) return;

  const isHoriz = bar.classList.contains('horiz');
  const br = bar.getBoundingClientRect();
  const shell = document.getElementById('editorShell');
  const sr = shell ? shell.getBoundingClientRect() : { left: 0, top: 0 };

  // Mostrar sin visibilidad para medir tamaño
  pop.style.visibility = 'hidden';
  pop.style.display = 'flex';
  const pw = pop.offsetWidth || 44;
  const ph = pop.offsetHeight || 200;
  pop.style.display = '';
  pop.style.visibility = '';

  let left, top;
  if (isHoriz) {
    // Barra horizontal → paleta debajo
    left = br.left - sr.left + (br.width / 2) - pw / 2;
    top  = br.bottom - sr.top + 6;
  } else {
    // Barra vertical → paleta a la derecha
    left = br.right - sr.left + 6;
    top  = br.top - sr.top + (br.height / 2) - ph / 2;
  }
  // Ajustar para no salir del shell
  const sw2 = shell ? shell.offsetWidth  : window.innerWidth;
  const sh2 = shell ? shell.offsetHeight : window.innerHeight;
  left = Math.max(4, Math.min(sw2 - pw - 4, left));
  top  = Math.max(4, Math.min(sh2 - ph - 4, top));

  pop.style.left = left + 'px';
  pop.style.top  = top  + 'px';
}


function _edbSyncTool() {
  const bar = $('edDrawBar'); if (!bar) return;
  const t = edActiveTool;
  $('edb-pen')?.classList.toggle('active', t === 'draw');
  $('edb-eraser')?.classList.toggle('active', t === 'eraser');
  $('edb-fill')?.classList.toggle('active', t === 'fill');
  // Ocultar botón offset cuando se usa fill o en PC (solo táctil)
  const isFill = t === 'fill';
  const offsetBtn = $('edb-offset');
  if(offsetBtn) offsetBtn.style.display = (isFill || !window._edIsTouch) ? 'none' : '';
  if(isFill || !window._edIsTouch) { const pop=$('edb-offset-pop'); if(pop) pop.style.display='none'; }
  _edbSyncOffsetBtn();
  _edbSyncSize();
  _edbSyncColor();
}
function _edbSyncOffsetBtn(){
  // Botón de la barra flotante (edb-offset)
  const edbBtn = $('edb-offset');
  if(edbBtn){
    edbBtn.classList.toggle('active', _edCursorOffset);
    edbBtn.style.opacity = '1';
    edbBtn.style.color = _edCursorOffset ? '#fff' : 'rgba(255,255,255,0.5)';
  }
  // Botones izq/der en el popover de la BARRA FLOTANTE
  [{id:'edb-offset-pop-l', a:40},{id:'edb-offset-pop-r', a:-40}].forEach(({id,a}) => {
    const b = $(id); if(!b) return;
    const on = _edCursorOffset && _edCursorOffsetAngle === a;
    b.style.background = on ? 'rgba(255,255,255,0.2)' : 'transparent';
  });
  // Botón del PANEL (op-offset-btn)
  const opBtn = $('op-offset-btn');
  if(opBtn){
    opBtn.style.background = _edCursorOffset ? 'var(--black)' : 'transparent';
    opBtn.style.color = _edCursorOffset ? 'var(--white)' : 'var(--gray-700)';
  }
  // Botones izq/der en el popover del PANEL (op-offset-pop-l/r)
  [{id:'op-offset-pop-l', a:40},{id:'op-offset-pop-r', a:-40}].forEach(({id,a}) => {
    const b = $(id); if(!b) return;
    b.style.background = (_edCursorOffset && _edCursorOffsetAngle === a) ? 'var(--gray-200)' : 'transparent';
  });
}

function _edbSyncColor() {
  const sw = $('edb-color'); if (!sw) return;
  sw.style.background = edDrawColor;
  sw.style.display = edActiveTool === 'eraser' ? 'none' : '';
  // También actualizar el swatch de la barra de polígonos
  const sw2 = $('esb-color'); if(sw2) sw2.style.background = edDrawColor;
  // Actualizar preview del panel de grosor si está abierto
  _edbSyncSizePreview();
  // Refrescar cursor offset si está visible y hay posición guardada
  _edRefreshOffsetCursor();
}

function _edUpdateDrawInfo() {
  const info = $('op-draw-info'); if (!info) return;
  const isEr = edActiveTool === 'eraser';
  const isFill = edActiveTool === 'fill';
  info.textContent = isFill
    ? 'Color ' + edDrawColor
    : (isEr ? edEraserSize : edDrawSize) + 'px · ' + edDrawOpacity + '%';
}

function _edbSyncSize() {
  const isEr = edActiveTool === 'eraser';
  const sz   = isEr ? edEraserSize : edDrawSize;
  // Mostrar/ocultar botones según herramienta activa
  const btnPen = $('edb-pen-size');
  const btnEr  = $('edb-eraser-size');
  if(btnPen) btnPen.style.display = isEr ? 'none' : '';
  if(btnEr)  btnEr.style.display  = isEr ? '' : 'none';
  // Sincronizar slider y número
  const num = $('edb-size-num');
  if(num){ num.value=sz; num.max=isEr?80:48; }
  const sl = $('edb-size-slider');
  if(sl){ sl.value=sz; sl.max=isEr?80:48; }
  _edbSyncSizePreview();
  // Refrescar cursor offset si está visible y hay posición guardada
  _edRefreshOffsetCursor();
}

// Actualiza el círculo de preview en el panel de grosor
function _edbSyncSizePreview() {
  const pop = $('edb-size-pop');
  if(!pop || pop.style.display==='none') return;
  const isEr = edActiveTool === 'eraser';
  const sz   = isEr ? edEraserSize : edDrawSize;
  const prev = $('edb-size-preview');
  if(!prev) return;
  // Lápiz: círculo del color seleccionado, tamaño escala con zoom
  // Goma: círculo blanco con borde, tamaño fijo
  const _dz = typeof edCamera!=='undefined' ? edCamera.z : 1;
  let d, color, border;
  // Preview escala con zoom de cámara, límite 80px
  d = Math.max(4, Math.min(80, Math.round(sz * _dz)));
  if(isEr){
    color = '#ffffff';
    border = '2px solid rgba(180,180,180,0.6)';
  } else {
    color = edDrawColor || '#000000';
    border = 'none';
  }
  prev.style.width  = d+'px';
  prev.style.height = d+'px';
  prev.style.background = color;
  prev.style.border = border;
  prev.style.boxShadow = isEr ? 'none' : '0 0 0 1.5px rgba(255,255,255,0.25)';
}


/* Calcular posición por defecto de una barra flotante:
   pegada al borde izquierdo del lienzo, centrada verticalmente */

function _edCurveModeActive(){
  const panelS=$('op-shape-curve-slider');
  const panelL=$('op-line-curve-slider');
  const barBtn=$('esb-curve');
  return (panelS&&panelS.style.display==='flex')||
         (panelL&&panelL.style.display==='flex')||
         (barBtn&&barBtn.dataset.curveActive==='1');
}

function _edBarDefaultPos(barEl) {
  const shell = document.getElementById('editorShell');
  if (!shell) return { x: 8, y: 120 };
  const bw = barEl.offsetWidth  || 36;
  const bh = barEl.offsetHeight || 200;
  const shellR = shell.getBoundingClientRect();
  const canv   = document.getElementById('editorCanvas');
  const canvR  = canv ? canv.getBoundingClientRect() : shellR;
  // X: justo a la izquierda del borde del canvas; si no cabe, solapar ligeramente
  const leftSpace = canvR.left - shellR.left;
  const x = leftSpace >= bw + 6
    ? Math.round(leftSpace - bw - 6)   // cabe a la izquierda
    : Math.max(4, Math.round(leftSpace + 6)); // solapar el borde izquierdo
  // Y: centrado verticalmente respecto al shell
  const shellH = shellR.height || shell.offsetHeight || window.innerHeight;
  const y = Math.max(4, Math.round((shellH - bh) / 2));
  return { x, y };
}

function edDrawBarShow() {
  const bar = $('edDrawBar'); if (!bar) return;
  bar.classList.add('visible'); // visible primero para medir offsetHeight
  // Si sigue en la posición inicial, centrar en el borde izquierdo del lienzo
  if (_edbX === 64 && _edbY === 12) {
    const pos = _edBarDefaultPos(bar);
    _edbX = pos.x; _edbY = pos.y;
  }
  bar.style.left = _edbX + 'px';
  bar.style.top  = _edbY + 'px';
  // T2: cursor offset NUNCA activo por defecto — el usuario lo activa manualmente
  if(typeof _edCursorOffsetInitialized === 'undefined'){
    window._edCursorOffsetInitialized = true;
    _cofSetOn(false);
  }
  _edbSyncTool();
}

function edDrawBarHide() {
  $('edDrawBar')?.classList.remove('visible');
  _edbClosePalette();
  _edOffsetHide();
}

/* ══════════════════════════════════════════
   BARRA FLOTANTE SHAPE / LINE
   ══════════════════════════════════════════ */
let _esbX = 12, _esbY = 120;

function edShapeBarShow() {
  const bar = $('edShapeBar'); if(!bar) return;
  bar.classList.add('visible');
  _edShapeInitHistory();
  if(_vsHistory.length === 0) _vsInit(false);
  if (_esbX === 12 && _esbY === 120) {
    const pos = _edBarDefaultPos(bar);
    _esbX = pos.x; _esbY = pos.y;
  }
  bar.style.left = _esbX + 'px';
  bar.style.top  = _esbY + 'px';
  _esbSync();
}
function edShapeBarHide() {
  // Ocultar slider directamente por DOM (no depender del closure de edInitShapeBar)
  const _sp=$('esb-slider-panel');
  if(_sp){ _sp.style.display='none'; _sp._mode=null; }
  // Cerrar modo V⟺C de la barra flotante
  const _curveBtn=$('esb-curve');
  if(_curveBtn && _curveBtn.dataset.curveActive==='1'){
    _curveBtn.dataset.curveActive='0';
    _curveBtn.style.background=''; _curveBtn.style.color=''; _curveBtn.style.outline='';
  }
  window._edCurveVertIdx=-1;
  $('edShapeBar')?.classList.remove('visible');
}

function _esbSync() {
  const la = edSelectedIdx >= 0 ? edLayers[edSelectedIdx] : null;
  if(!la || (la.type !== 'shape' && la.type !== 'line')) return;
  // Swatch color borde
  const colorBtn = $('esb-color');
  if(colorBtn) colorBtn.style.background = la.color || '#000000';
  // Estado relleno
  const hasFill = la.fillColor && la.fillColor !== 'none';
  // Botón toggle relleno: activo (iluminado) si tiene relleno
  const fillOnBtn = $('esb-fill-on');
  if(fillOnBtn) fillOnBtn.classList.toggle('active', !!hasFill);
  // Swatch color relleno
  const fillBtn = $('esb-fill');
  if(fillBtn){
    fillBtn.style.background = hasFill ? la.fillColor : (la._lastFillColor || '#ffffff');
    fillBtn.style.opacity = hasFill ? '1' : '0.4';
  }
  // Dot de grosor
  const dot = $('esb-size-dot');
  if(dot){
    const _dz2 = typeof edCamera !== 'undefined' ? edCamera.z : 1;
    const d = Math.max(3, Math.min(22, Math.round((la.lineWidth||0) * _dz2)));
    dot.style.cssText = `width:${d}px;height:${d}px;border-radius:50%;background:#fff;display:inline-block;`;
  }
}

// Congela un LineLayer con radios en un StrokeLayer, guardando los datos geométricos
function _edFreezeLineLayer(la, idx) {
  if(la.type !== 'line') return;
  const cr = la.cornerRadii || {};
  const hasR = Object.keys(cr).some(k => (cr[k]||0) > 0);
  if(!hasR) return; // sin radios, no congelar

  // Renderizar el LineLayer en un canvas del tamaño del workspace
  const offW = ED_CANVAS_W, offH = ED_CANVAS_H;
  const off = document.createElement('canvas');
  off.width = offW; off.height = offH;
  const octx = off.getContext('2d');
  // Aplicar transformación idéntica a edRedraw
  octx.setTransform(1,0,0,1,0,0);
  la.draw(octx);

  // Crear StrokeLayer con el bitmap
  const sl = new StrokeLayer(off);
  // Copiar propiedades comunes
  sl.opacity = la.opacity ?? 1;
  sl.rotation = la.rotation || 0;
  // Guardar datos geométricos originales para descongelar
  sl._frozenLine = {
    points: la.points.map(p=>p?({...p}):null),
    cornerRadii: {...cr},
    color: la.color,
    fillColor: la.fillColor,
    lineWidth: la.lineWidth,
    closed: la.closed,
    opacity: la.opacity ?? 1,
    rotation: la.rotation || 0,
    // Guardar dimensiones originales para calcular transformaciones al descongelar
    origX: la.x, origY: la.y,
    origW: la.width, origH: la.height,
  };
  // Reemplazar la capa en el array
  edLayers[idx] = sl;
  edPages[edCurrentPage].layers[idx] = sl;
  edSelectedIdx = idx;
  edPushHistory();
  edRedraw();
}

// Descongela un StrokeLayer congelado de vuelta a LineLayer editable
function _edUnfreezeLineLayer(la, idx) {
  if(la.type !== 'stroke' || !la._frozenLine) return;
  const d = la._frozenLine;
  const pw = edPageW(), ph = edPageH();

  // Factores de transformación: ratio entre dimensiones actuales y originales
  const origW = d.origW || la.width;
  const origH = d.origH || la.height;
  const scaleX = origW > 0.001 ? la.width  / origW : 1;
  const scaleY = origH > 0.001 ? la.height / origH : 1;
  // Diferencia de rotación entre el estado actual y el original
  const rotDelta = ((la.rotation||0) - (d.rotation||0)) * Math.PI / 180;
  const cosD = Math.cos(rotDelta), sinD = Math.sin(rotDelta);

  const ll = new LineLayer();
  // Aplicar escala asimétrica a los puntos (en espacio local, en px)
  ll.points = d.points.map(p => {
    // Escalar en espacio local
    const lpx = p.x * pw * scaleX;
    const lpy = p.y * ph * scaleY;
    // Rotar por el delta de rotación
    const rx = (lpx * cosD - lpy * sinD) / pw;
    const ry = (lpx * sinD + lpy * cosD) / ph;
    return {x: rx, y: ry};
  });
  // Escalar también los radios de curva
  const cr = d.cornerRadii || {};
  ll.cornerRadii = {};
  for(const k in cr){
    if(cr[k]) ll.cornerRadii[k] = cr[k] * Math.min(scaleX, scaleY);
  }
  ll.color = la.color || d.color;       // respetar cambios de color
  ll.fillColor = la.fillColor || d.fillColor;
  ll.lineWidth = la.lineWidth || d.lineWidth;
  ll.closed = d.closed;
  ll.opacity = la.opacity ?? d.opacity;
  ll.rotation = la.rotation || 0;       // usar rotación actual
  // Posición: usar la posición actual del StrokeLayer
  ll.x = la.x; ll.y = la.y;
  ll._updateBbox();
  edLayers[idx] = ll;
  edPages[edCurrentPage].layers[idx] = ll;
  edSelectedIdx = idx;
  edPushHistory();
  edRedraw();
}

function edInitShapeBar() {
  const bar = $('edShapeBar'); if(!bar) return;

  // ── Drag + snap de orientación (idéntico a edInitDrawBar) ──
  let _drag=false, _sx=0, _sy=0, _sl=0, _st=0, _longTimer=null;
  let _locked=false, _pid=null;

  // ── Drag: inmediato desde handle, long-press desde fondo/sep ──
  const _handle = bar.querySelector('.edb-handle');
  if (_handle) {
    _handle.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      _pid = e.pointerId; bar.setPointerCapture(_pid);
      const shell = document.getElementById('editorShell');
      const sr = shell ? shell.getBoundingClientRect() : { left:0, top:0 };
      _sx = e.clientX - sr.left; _sy = e.clientY - sr.top;
      _sl = parseInt(bar.style.left) || _esbX; _st = parseInt(bar.style.top) || _esbY;
      _drag = true; _locked = true; bar.style.cursor = 'grabbing';
    }, { passive: false });
  }

  bar.addEventListener('pointerdown', e => {
    if (e.target.closest('.edb-handle')) return; // ya gestionado
    if(e.target !== bar && !e.target.classList.contains('edb-sep')) return;
    const shell=document.getElementById('editorShell');
    const sr=shell?shell.getBoundingClientRect():{left:0,top:0};
    _sx=e.clientX-sr.left; _sy=e.clientY-sr.top;
    _sl=parseInt(bar.style.left)||_esbX; _st=parseInt(bar.style.top)||_esbY;
    _longTimer=setTimeout(()=>{ _drag=true; _locked=true; bar.style.cursor='grabbing'; }, 300);
    e.preventDefault();
  }, {passive:false});

  bar.addEventListener('pointermove', e => {
    const shell=document.getElementById('editorShell');
    const sr=shell?shell.getBoundingClientRect():{left:0,top:0};
    const ex=e.clientX-sr.left, ey=e.clientY-sr.top;
    if(_longTimer && (Math.abs(ex-_sx)>6 || Math.abs(ey-_sy)>6)){ clearTimeout(_longTimer); _longTimer=null; }
    if(!_drag) return;
    e.preventDefault();
    const W=shell?shell.offsetWidth:window.innerWidth;
    const H=shell?shell.offsetHeight:window.innerHeight;
    const bw=bar.offsetWidth, bh=bar.offsetHeight;
    _esbX=Math.max(0,Math.min(W-bw,_sl+(ex-_sx)));
    _esbY=Math.max(0,Math.min(H-bh,_st+(ey-_sy)));
    bar.style.left=_esbX+'px'; bar.style.top=_esbY+'px';
    // Reposicionar slider adjunto si está visible
    const _sp2=$('esb-slider-panel');
    if(_sp2&&_sp2.style.display!=='none'){
      const _br2=bar.getBoundingClientRect();
      const _pr2=_sp2.getBoundingClientRect();
      const _isH=bar.classList.contains('horiz');
      const _vw=window.innerWidth,_vh=window.innerHeight,_G=6;
      let _l,_t;
      if(_isH){_t=_br2.top-_pr2.height-_G>=0?_br2.top-_pr2.height-_G:_br2.bottom+_G;_l=Math.max(_G,Math.min(_vw-_pr2.width-_G,_br2.left+_br2.width/2-_pr2.width/2));}
      else{_l=_br2.right+_G+_pr2.width<=_vw?_br2.right+_G:_br2.left-_pr2.width-_G;_t=Math.max(_G,Math.min(_vh-_pr2.height-_G,_br2.top+_br2.height/2-_pr2.height/2));}
      _sp2.style.left=_l+'px'; _sp2.style.top=_t+'px';
    }
    // Snap orientación — mismo umbral que edDrawBar
    const SNAP=48;
    const wasHoriz=bar.classList.contains('horiz');
    const distTB=Math.min(ey,H-ey), distLR=Math.min(ex,W-ex);
    if(distTB<SNAP||distLR<SNAP){
      const shouldHoriz=distTB<=distLR;
      if(shouldHoriz!==wasHoriz){
        bar.classList.toggle('horiz',shouldHoriz);
        const nBw=bar.offsetWidth, nBh=bar.offsetHeight;
        const adjX=(bw-nBw)/2, adjY=(bh-nBh)/2;
        _sl+=adjX; _st+=adjY;
        _esbX=Math.max(0,Math.min(W-nBw,_esbX+adjX));
        _esbY=Math.max(0,Math.min(H-nBh,_esbY+adjY));
        bar.style.left=_esbX+'px'; bar.style.top=_esbY+'px';
      }
    }
  }, {passive:false});

  const _endDrag=()=>{
    if(_longTimer){clearTimeout(_longTimer);_longTimer=null;}
    _drag=false; bar.style.cursor='grab';
    setTimeout(()=>{ _locked=false; }, 50);
  };
  bar.addEventListener('pointerup',     _endDrag);
  bar.addEventListener('pointercancel', _endDrag);

  // ── Botones ──
  // Color borde
  // Color borde: nativo en PC (con cuentagotas), HSL en Android
  $('esb-color')?.addEventListener('click', e => {
    if(_locked) return;
    const la=edSelectedIdx>=0?edLayers[edSelectedIdx]:null; if(!la) return;
    _edPickColor(e, la.color||'#000000',
      hex=>{ la.color=hex; _esbSync(); edRedraw();
        // Sincronizar botón color del panel si está abierto
        const _pcb=$('op-line-color-btn'); if(_pcb) _pcb.style.background=hex;
        const _pcb2=$('op-shape-color-btn'); if(_pcb2) _pcb2.style.background=hex;
      },
      ()=>{ _edShapePushHistory(); }
    );
  });

  // Cuentagotas
  $('esb-eyedrop')?.addEventListener('click', ()=>{ if(_locked) return; _edStartEyedrop(); });

  // Toggle relleno
  $('esb-fill-on')?.addEventListener('click', () => {
    if(_locked) return;
    const la=edSelectedIdx>=0?edLayers[edSelectedIdx]:null; if(!la) return;
    if(la.fillColor && la.fillColor!=='none'){
      la._lastFillColor=la.fillColor;
      la.fillColor='none';
    } else {
      la.fillColor=la._lastFillColor||'#ffffff';
    }
    _esbSync(); _edShapePushHistory(); edRedraw();
  });

  // Color relleno: nativo en PC, HSL en Android; activa relleno automáticamente
  $('esb-fill')?.addEventListener('click', e => {
    if(_locked) return;
    const la=edSelectedIdx>=0?edLayers[edSelectedIdx]:null; if(!la) return;
    const cur=(la.fillColor&&la.fillColor!=='none')?la.fillColor:'#ffffff';
    _edPickColor(e, cur,
      hex=>{ la.fillColor=hex; la._lastFillColor=hex; _esbSync(); edRedraw(); },
      ()=>{ _edShapePushHistory(); }
    );
  });


  // ── Helper: posicionar y mostrar slider adjunto a edShapeBar ──
  function _esbShowSlider(mode, minVal, maxVal, curVal, onInput, onChange){
    const bar=$('edShapeBar'); const panel=$('esb-slider-panel'); const sl=$('esb-slider-input');
    if(!bar||!panel||!sl) return;
    // Si ya está el mismo modo activo, cerrar
    if(panel.style.display!=='none' && panel._mode===mode){ panel.style.display='none'; panel._mode=null; return; }
    panel._mode=mode;
    sl.min=minVal; sl.max=maxVal; sl.value=curVal;
    const isHoriz=bar.classList.contains('horiz');
    // Slider con MISMA orientación que la barra
    // Barra horizontal → slider horizontal pegado arriba o abajo
    // Barra vertical   → slider vertical pegado a derecha o izquierda
    sl.style.writingMode=isHoriz?'horizontal-tb':'vertical-lr';
    sl.style.width=isHoriz?'120px':'20px';
    sl.style.height=isHoriz?'20px':'120px';
    panel.style.flexDirection=isHoriz?'column':'row';
    panel.style.display='flex';
    panel.style.left='-9999px'; panel.style.top='-9999px';
    requestAnimationFrame(()=>{
      const br=bar.getBoundingClientRect();
      const pr=panel.getBoundingClientRect();
      const vw=window.innerWidth, vh=window.innerHeight, GAP=6;
      let left, top;
      if(isHoriz){
        // Barra horizontal: slider horizontal arriba o abajo
        top = br.top-pr.height-GAP>=0 ? br.top-pr.height-GAP : br.bottom+GAP;
        left = Math.max(GAP, Math.min(vw-pr.width-GAP, br.left+br.width/2-pr.width/2));
      } else {
        // Barra vertical: slider vertical a derecha o izquierda
        left = br.right+GAP+pr.width<=vw ? br.right+GAP : br.left-pr.width-GAP;
        top  = Math.max(GAP, Math.min(vh-pr.height-GAP, br.top+br.height/2-pr.height/2));
      }
      panel.style.left=left+'px'; panel.style.top=top+'px';
    });
    sl._onInput=onInput; sl._onChange=onChange;
  }
  function _esbHideSlider(){ const p=$('esb-slider-panel'); if(p){p.style.display='none';p._mode=null;} }
  // Listener único del slider
  $('esb-slider-input')?.addEventListener('input',e=>{ e.target._onInput&&e.target._onInput(+e.target.value); });
  $('esb-slider-input')?.addEventListener('change',e=>{ e.target._onChange&&e.target._onChange(+e.target.value); });
  $('esb-slider-input')?.addEventListener('pointerdown',e=>e.stopPropagation());

  // Grosor — slider adjunto a la barra
  $('esb-size')?.addEventListener('click', e => {
    if(_locked) return; e.stopPropagation();
    const la=edSelectedIdx>=0?edLayers[edSelectedIdx]:null;
    const sz=la?.lineWidth??3;
    _esbShowSlider('size', 0, 20, sz,
      v=>{ const l=edSelectedIdx>=0?edLayers[edSelectedIdx]:null; if(l){l.lineWidth=v; edRedraw();
        // Sincronizar sliders del panel si está abierto
        const _sl=$('op-dsize'); if(_sl){ _sl.value=v; _edUpdateBubble(_sl, 'px'); }
        const _ss=$('op-size-btn'); if(_ss) _ss.style.background='var(--gray-200)';
        const _sls=$('op-size-slider'); if(_sls) _sls.style.display='flex';
        const _st=$('op-line-status'); if(_st){ const ll=l; _st.textContent=ll.lineWidth+'px·'+Math.round((ll.opacity??1)*100)+'%'; }
      } },
      v=>{
        _edShapePushHistory();
      }
    );
  });

  // Opacidad — slider adjunto a la barra
  $('esb-opacity')?.addEventListener('click', e => {
    if(_locked) return; e.stopPropagation();
    const la=edSelectedIdx>=0?edLayers[edSelectedIdx]:null;
    const op=la?Math.round((la.opacity??1)*100):100;
    _esbShowSlider('opacity', 0, 100, op,
      v=>{ const l=edSelectedIdx>=0?edLayers[edSelectedIdx]:null; if(l){l.opacity=v/100; edRedraw();
        // Sincronizar slider de opacidad del panel si está abierto
        const _osl=$('op-line-opacity'); if(_osl){ _osl.value=v; _edUpdateBubble(_osl,'%'); }
        const _st=$('op-line-status'); if(_st){ _st.textContent=(l.lineWidth||3)+'px·'+v+'%'; }
      } },
      v=>{ _edShapePushHistory(); }
    );
  });

  // ── V⟺C curva de vértice ──
  $('esb-curve')?.addEventListener('click', e => {
    if(_locked) return; e.stopPropagation();
    const btn=$('esb-curve');
    const active=btn.dataset.curveActive==='1';
    btn.dataset.curveActive=active?'0':'1';
    btn.style.background=active?'':'rgba(0,0,0,.7)';
    btn.style.color=active?'rgba(255,255,255,1)':'#FFE135';
    btn.style.outline=active?'':'1px solid rgba(255,255,0,.5)';
    if(active){
      window._edCurveVertIdx=-1;
      _esbHideSlider();
      edRedraw(); return;
    }
    edRedraw(); // actualizar vértices a verde inmediatamente al activar V⟺C
    const _savedSelCurve=edSelectedIdx;
    const curR=window._edCurveRadius||0;
    _esbShowSlider('curve', 0, 200, curR,
      v=>{
        // onInput: previsualizar la curva en tiempo real (solo visual, no hornear)
        window._edCurveRadius=v;
        const la2=edSelectedIdx>=0?edLayers[edSelectedIdx]:null;
        const vi=window._edCurveVertIdx;
        if(la2&&vi>=0){
          if(la2.type==='line'){ if(!la2.cornerRadii)la2.cornerRadii={}; la2.cornerRadii[vi]=v; la2._updateBbox(); }
          else if(la2.type==='shape'&&la2.shape==='rect'){ if(!la2.cornerRadii)la2.cornerRadii=[0,0,0,0]; la2.cornerRadii[vi]=v; }
          edRedraw();
        }
      },
      v=>{ _edShapePushHistory(); }
    );
    // El slider permanece abierto hasta que se desactive V⟺C pulsando el botón de nuevo
  });

  // Deshacer/Rehacer
  $('esb-undo')?.addEventListener('click', ()=>{ if(_locked) return; edShapeUndo(); });
  $('esb-redo')?.addEventListener('click', ()=>{ if(_locked) return; edShapeRedo(); });

  // OK
  $('esb-ok')?.addEventListener('click', ()=>{
    if(_locked) return;
    _edApplyFillToClosedLayers(); // relleno al confirmar
    _edShapeClearHistory(); _vsClear(); edPushHistory(); // limpiar _vs* antes para que edPushHistory no quede bloqueado
    // Desactivar V⟺C si estaba activo, y cerrar su slider
    const _curveBtn=$('esb-curve');
    if(_curveBtn){ _curveBtn.dataset.curveActive='0'; _curveBtn.style.background=''; _curveBtn.style.color=''; _curveBtn.style.outline=''; }
    window._edCurveVertIdx=-1;
    _esbHideSlider(); // cerrar slider V/C (y cualquier otro slider activo)
    edShapeBarHide();
    window._edMinimizedDrawMode=null;
    // Limpiar estado antes de maximizar
    edSelectedIdx=-1;
    edActiveTool='select'; edCanvas.className='';
    const _panel=$('edOptionsPanel');
    if(_panel){ _panel.style.visibility=''; _panel.classList.remove('open'); _panel.innerHTML=''; delete _panel.dataset.mode; }
    _edDrawUnlockUI();
    edMaximize();
    edRedraw();
  });
}
function _edDrawLockUI()   { $('editorShell')?.classList.add('draw-active'); }
function _edDrawUnlockUI() { $('editorShell')?.classList.remove('draw-active'); }

// Overlay transparente sobre el canvas para bloquear clicks cuando panel props abierto
// No usa pointer-events en la barra — así los clicks en barra no llegan al canvas
function _edPropsOverlayShow(){
  let ov=document.getElementById('_edPropsOverlay');
  if(!ov){
    ov=document.createElement('div');
    ov.id='_edPropsOverlay';
    // Overlay encima de la barra de menús — absorbe clicks sin hacer nada
    ov.style.cssText='position:absolute;inset:0;z-index:500;background:transparent;cursor:default;';
    $('edMenuBar')?.appendChild(ov);
  }
  ov.style.display='block';
}
function _edPropsOverlayHide(){
  const ov=document.getElementById('_edPropsOverlay');
  if(ov) ov.style.display='none';
}

function edDrawBarUpdate() {
  if (!$('edDrawBar')?.classList.contains('visible')) return;
  _edbSyncTool();
}


function _edBubbleTailDir(l){
  // Determinar la dirección de la cola del bocadillo para el reader.
  // tailEnd es la punta de la cola en coordenadas relativas al centro del bocadillo.
  // Devuelve: 'bottom', 'bottom-left', 'bottom-right', 'top', 'top-left', 'top-right', 'left', 'right'
  const e = (l.tailEnds && l.tailEnds[0]) || l.tailEnd || {x:0, y:0.6};
  const ex = e.x, ey = e.y;  // fracción relativa al bbox del bocadillo
  // ey > 0.3 → cola hacia abajo; ey < -0.3 → cola hacia arriba
  // ex > 0.3 → cola hacia derecha; ex < -0.3 → cola hacia izquierda
  if(Math.abs(ey) >= Math.abs(ex)){
    if(ey > 0){
      if(ex < -0.15) return 'bottom-left';
      if(ex >  0.15) return 'bottom-right';
      return 'bottom';
    } else {
      if(ex < -0.15) return 'top-left';
      if(ex >  0.15) return 'top-right';
      return 'top';
    }
  } else {
    return ex > 0 ? 'right' : 'left';
  }
}
let _edCloudSavingStart = 0;
let _edCloudSavingTimer = null;
function _edCloudSavingUpdateBadge() {
  if (!_edCloudSaving) return;
  const elapsed = Math.floor((Date.now() - _edCloudSavingStart) / 1000);
  const badge = document.getElementById('_edCloudSavingBadge');
  if (badge) badge.textContent = `☁️ Guardando en nube... ${elapsed}s`;
  _edCloudSavingTimer = setTimeout(_edCloudSavingUpdateBadge, 1000);
}
function _edCloudSavingStop() {
  if (_edCloudSavingTimer) { clearTimeout(_edCloudSavingTimer); _edCloudSavingTimer = null; }
  const badge = document.getElementById('_edCloudSavingBadge');
  if (badge) badge.remove();
}
async function edCloudSave() {
  if (!edProjectId) { edToast('Sin proyecto activo'); return; }
  if (typeof SupabaseClient === 'undefined') { edToast('Sin conexión al servidor'); return; }
  if (!Auth?.currentUser?.()) {
    // Sin sesión: ofrecer login en lugar de rechazar
    edToast('Inicia sesión para guardar en la nube');
    setTimeout(() => {
      if (confirm('¿Quieres iniciar sesión para guardar en la nube?')) {
        // Guardar localmente antes de salir al login
        edSaveProject();
        Router.go('login');
      }
    }, 400);
    return;
  }

  // Guardar localmente primero para asegurar que editorData refleja el estado actual del canvas
  await edSaveProject();

  const comic = ComicStore.getById(edProjectId);
  if (!comic) { edToast('Error: obra no encontrada'); return; }

  // Asignar supabaseId si aún no tiene
  if (!comic.supabaseId) {
    comic.supabaseId = crypto.randomUUID();
    ComicStore.save(comic);
  }

  const btn = $('edCloudSaveBtn');
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
  _edCloudSaving = true;
  _edCloudSavingStart = Date.now();
  _edCloudSavingUpdateBadge();

  try {
    const { sizeKB } = await SupabaseClient.saveDraft(comic);
    edToast(`☁️ Guardado en nube (${sizeKB < 1024 ? sizeKB + ' KB' : Math.round(sizeKB/1024) + ' MB'})`);
    // Si la obra estaba publicada o en revisión, guardar en nube la vuelve a borrador.
    // El autor deberá volver a solicitar publicación.
    const _comicAfter = ComicStore.getById(edProjectId);
    if (_comicAfter && (_comicAfter.approved || _comicAfter.pendingReview)) {
      ComicStore.save({ ..._comicAfter, published: false, approved: false, pendingReview: false });
      if (typeof homeInvalidateCache === 'function') homeInvalidateCache();
    }
    // Sincronizar biblioteca con la nube
    const user = Auth?.currentUser?.();
    if (user && user.id) {
      try {
        const _bib = _bibLoad();
        await SupabaseClient.bibSync(user.id, _bib, comic.supabaseId);
      } catch(e) { console.warn('bibSync error:', e); }
    }
  } catch(err) {
    edToast('⚠️ ' + (err.message || 'Error al guardar en nube'));
    console.error('edCloudSave:', err);
  } finally {
    _edCloudSaving = false;
    _edCloudSavingStop();
    if (btn) { btn.textContent = '☁️'; btn.disabled = false; }
  }
}

async function edSaveProject(){
  if(!edProjectId){edToast('Sin proyecto activo');return;}
  // Asegurar que las reglas de la hoja actual están guardadas en edPages antes de serializar
  const existing=ComicStore.getById(edProjectId)||{};
  // Guardar estado de cámara para restaurarlo al volver a editar
  const _camState = { x: edCamera.x, y: edCamera.y, z: edCamera.z, page: edCurrentPage };
  const panels=edPages.map((p,i)=>{
    // Exportar capas de texto/bocadillo para el reader.
    // El orden del array layers[] es el orden secuencial de aparición.
    // Tanto BubbleLayer como TextLayer aparecen uno a uno al tocar.
    const texts = [];
    let seqOrder = 0;
    p.layers.forEach(l => {
      const rawText = (l.type === 'text' || l.type === 'bubble') ? l.text : null;
      if(!rawText || rawText === 'Escribe aquí') return;

      const xPct = Math.round((l.x - l.width/2)  * 100 * 10) / 10;
      const yPct = Math.round((l.y - l.height/2) * 100 * 10) / 10;
      const wPct = Math.round(l.width  * 100 * 10) / 10;
      const hPct = Math.round(l.height * 100 * 10) / 10;

      if(l.type === 'bubble'){
        texts.push({
          type:        'bubble',
          text:        rawText,
          x: xPct, y: yPct, w: wPct, h: hPct,
          style:       l.style      || 'conventional',
          order:       seqOrder++,
          fontSize:    l.fontSize   || 30,
          fontFamily:  l.fontFamily || 'Patrick Hand',
          fontBold:    l.fontBold   || false,
          fontItalic:  l.fontItalic || false,
          color:       l.color      || '#000000',
          bg:          l.backgroundColor || '#ffffff',
          border:      l.borderWidth ?? 2,
          borderColor: l.borderColor || '#000000',
          rotation:    l.rotation   || 0,
          padding:     l.padding    || 15,
          hasTail:     true,
          voiceCount:  l.voiceCount || 1,
          tailStarts:  l.tailStarts || [l.tailStart || {x:-0.4, y:0.4}],
          tailEnds:    l.tailEnds   || [l.tailEnd   || {x:-0.4, y:0.6}],
        });
      } else if(l.type === 'text'){
        texts.push({
          type:        'text',
          text:        rawText,
          x: xPct, y: yPct, w: wPct, h: hPct,
          order:       seqOrder++,
          fontSize:    l.fontSize   || 30,
          fontFamily:  l.fontFamily || 'Patrick Hand',
          fontBold:    l.fontBold   || false,
          fontItalic:  l.fontItalic || false,
          color:       l.color      || '#000000',
          bg:          l.backgroundColor || '#ffffff',
          border:      l.borderWidth ?? 0,
          borderColor: l.borderColor || '#000000',
          rotation:    l.rotation   || 0,
          padding:     l.padding    || 10,
          hasTail:     false,
        });
      }
    });
    return {
      id:'panel_'+i,
      dataUrl:edRenderPage(p),
      orientation:(p.orientation||edOrientation)==='vertical' ? 'v' : 'h',
      textMode: p.textMode || 'sequential',
      texts,
    };
  });
  // Construir pages serializando capas y externalizando _pngFrames a IDB
  // (evita QuotaExceededError silencioso en localStorage con frames PNG grandes)
  const _savedOrient2=edOrientation, _savedPage2=edCurrentPage;
  const _edPages = [];
  for (let _pi=0; _pi<edPages.length; _pi++) {
    const p = edPages[_pi];
    edCurrentPage = _pi;
    edOrientation = p.orientation || _savedOrient2;
    const _pageLayers = [];
    for (let _li=0; _li<p.layers.length; _li++) {
      const _sl = edSerLayer(p.layers[_li]);
      if (!_sl) continue;
      // Externalizar _pngFrames a IndexedDB para no saturar localStorage
      if (_sl._pngFrames && _sl._pngFrames.length) {
        const _idbKey = edProjectId + '_' + _pi + '_' + _li;
        try { await _edAnimIdbSave(_idbKey, _sl._pngFrames); } catch(e) {}
        delete _sl._pngFrames;
        _sl._pngFramesKey = _idbKey;
      }
      _pageLayers.push(_sl);
    }
    _edPages.push({layers:_pageLayers,textLayerOpacity:p.textLayerOpacity??1,textMode:p.textMode||'sequential',orientation:p.orientation||_savedOrient2});
  }
  edOrientation=_savedOrient2; edCurrentPage=_savedPage2;

  ComicStore.save({
    ...existing,
    id:edProjectId,
    ...edProjectMeta,
    panels,
    editorData:{
      orientation:edOrientation,
      pages:_edPages,
      _rules: edRules,
      _ruleNodes: edRuleNodes,
    },
    updatedAt:new Date().toISOString(),
    localSavedAt:new Date().toISOString(),
    cameraState: _camState,
    // Al guardar localmente: esta es la versión local canónica
    cloudOnly:  false,
    cloudNewer: false,
    // localEditorData NO se toca aquí — es el backup de la versión previa de la nube
  });
  edToast('Guardado ✓');
  // Marcar punto de guardado y limpiar historial (los estados anteriores ya no son relevantes)
  _edSavedHistoryIdx = edHistoryIdx;
  edHistory = edHistory.length > 0 ? [edHistory[edHistoryIdx]] : [];
  edHistoryIdx = edHistory.length - 1;
  _edSavedHistoryIdx = edHistoryIdx;
}
function edRenderPage(page){
  const _savedOrient = edOrientation;
  const _savedPage   = edCurrentPage;
  const _pageIdx     = edPages.indexOf(page);
  if(_pageIdx >= 0){ edCurrentPage = _pageIdx; }
  if(page.orientation) edOrientation = page.orientation;
  const pw=edPageW(), ph=edPageH();
  const tmp=document.createElement('canvas');tmp.width=pw;tmp.height=ph;
  const full=document.createElement('canvas');full.width=ED_CANVAS_W;full.height=ED_CANVAS_H;
  const ctx=full.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(edMarginX(),edMarginY(),pw,ph);
  // Imágenes, DrawLayer y Strokes — SIN textos/bocadillos.
  // Los textos se superponen en el reader por encima del data_url, igual que el visor del editor.
  page.layers.filter(l=>l.type==='image').forEach(l=>l.draw(ctx,full));
  page.layers.filter(l=>l.type==='gif').forEach(l=>l.draw(ctx));
  const _rdl=page.layers.find(l=>l.type==='draw');
  if(_rdl) _rdl.draw(ctx);
  page.layers.filter(l=>l.type==='stroke').forEach(l=>l.draw(ctx));
  page.layers.filter(l=>l.type==='shape'||l.type==='line').forEach(l=>l.draw(ctx));
  // Recortar zona de la página del canvas de trabajo
  const outCtx=tmp.getContext('2d');
  outCtx.drawImage(full, edMarginX(), edMarginY(), pw, ph, 0, 0, pw, ph);
  edOrientation = _savedOrient;
  edCurrentPage = _savedPage;
  return tmp.toDataURL('image/jpeg',0.85);
}
function _edCompressImageSrc(src, maxPx=1080, quality=0.82){
  // Redimensiona y comprime una imagen a JPEG para ahorrar espacio en localStorage
  // Las imágenes PNG con transparencia (recortes) deben conservarse como PNG
  if(!src) return src;
  const isPng = src.startsWith('data:image/png');
  if(!isPng && src.startsWith('data:image/jpeg') && src.length < 200000) return src; // ya pequeña JPEG
  try {
    const img = new Image();
    img.src = src;
    if(!img.complete || img.naturalWidth === 0) return src; // no cargada aún
    const ratio = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth  * ratio);
    const h = Math.round(img.naturalHeight * ratio);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const cctx = cv.getContext('2d');
    cctx.drawImage(img, 0, 0, w, h);
    // Si es PNG, verificar si tiene píxeles transparentes — si los tiene, conservar PNG
    if(isPng){
      const d = cctx.getImageData(0, 0, w, h).data;
      let hasAlpha = false;
      for(let i=3; i<d.length; i+=4){ if(d[i]<255){ hasAlpha=true; break; } }
      if(hasAlpha) return cv.toDataURL('image/png'); // preservar transparencia
    }
    return cv.toDataURL('image/jpeg', quality);
  } catch(e) { return src; }
}

/* ══════════════════════════════════════════
   GROUP LAYER — contenedor de capas agrupadas
   ══════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════
   SISTEMA DE GRUPOS — basado en groupId
   ══════════════════════════════════════════════════════════════
   Cada objeto agrupado lleva groupId (string único).
   Al tocar cualquier miembro → autoselección múltiple del grupo.
   Al desagrupar → se elimina groupId de todos los miembros.
   Sin GroupLayer. Sin transformaciones. Siempre funciona.
   ══════════════════════════════════════════════════════════════ */

function _edNewGroupId(){
  return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
}

/* Índices de todos los miembros del grupo en edLayers */
function _edGroupMemberIdxs(groupId){
  const idxs = [];
  for(let i=0; i<edLayers.length; i++){
    if(edLayers[i] && edLayers[i].groupId === groupId) idxs.push(i);
  }
  return idxs;
}

/* ── Agrupar los layers de edMultiSel ── */
function edGroupSelected(){
  if(!edMultiSel.length || edMultiSel.length < 2) return;
  edPushHistory();
  const gid = _edNewGroupId();
  edMultiSel.forEach(i => { if(edLayers[i]) edLayers[i].groupId = gid; });
  // Volver a herramienta select tras agrupar
  _edDeactivateMultiSel();
  edPushHistory(); edRedraw();
  edToast('Agrupados ✓');
}

/* ── Desagrupar: elimina groupId de todos los miembros del grupo activo ── */
function edUngroupSelected(){
  // Puede llamarse con un objeto seleccionado (edSelectedIdx) o con multiselección
  let gid = null;
  if(edSelectedIdx >= 0 && edLayers[edSelectedIdx]?.groupId){
    gid = edLayers[edSelectedIdx].groupId;
  } else if(edMultiSel.length){
    gid = edLayers[edMultiSel[0]]?.groupId;
  }
  if(!gid) return;
  edPushHistory();
  edLayers.forEach(l => { if(l && l.groupId === gid) delete l.groupId; });
  edSelectedIdx = -1; _msClear();
  // Restaurar herramienta previa si estaba en modo grupo silencioso
  if(window._edGroupSilentTool !== undefined){
    edActiveTool = window._edGroupSilentTool;
    delete window._edGroupSilentTool;
  } else if(edActiveTool === 'multiselect'){
    // Por si acaso quedó en multiselect sin flag
    edActiveTool = 'select';
    edCanvas.className = '';
    $('edMultiSelBtn')?.classList.remove('active');
  }
  // Cerrar panel de opciones si estaba abierto
  edCloseOptionsPanel();
  edPushHistory(); edRedraw();
  edToast('Desagrupados ✓');
}



/* ── Comprueba si la selección actual es unible, devuelve el tipo o null ── */
function _edMergeableTypes(){
  if(!edMultiSel || edMultiSel.length < 2) return null;
  const layers = edMultiSel.map(i => edLayers[i]).filter(Boolean);
  if(layers.length < 2) return null;
  const t0 = layers[0].type;
  // Vectoriales: line y shape se pueden unir entre sí
  const isVec = t => t === 'line' || t === 'shape';
  if(isVec(t0)){
    if(layers.every(l => isVec(l.type))) return 'vector';
    return null;
  }
  // Stroke, draw e image solo se pueden unir con su mismo tipo
  if(t0 === 'stroke' || t0 === 'draw' || t0 === 'image'){
    if(layers.every(l => l.type === t0)) return t0;
    return null;
  }
  return null;
}

/* ── Convierte un ShapeLayer a array de puntos absolutos (normalizados 0-1) ── */
function _edShapeToAbsPoints(sl, nEllipse){
  const n = nEllipse || 48;
  const pts = [];
  if(sl.shape === 'ellipse'){
    for(let i = 0; i < n; i++){
      const ang = (i / n) * Math.PI * 2;
      pts.push({
        x: sl.x + Math.cos(ang) * sl.width  / 2,
        y: sl.y + Math.sin(ang) * sl.height / 2
      });
    }
  } else {
    // rect (con rotación si la tiene)
    const hw = sl.width / 2, hh = sl.height / 2;
    const rot = (sl.rotation || 0) * Math.PI / 180;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    for(const [lx, ly] of [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]]){
      pts.push({
        x: sl.x + lx * cos - ly * sin,
        y: sl.y + lx * sin + ly * cos
      });
    }
  }
  return pts;
}

/* ── Renderiza un layer en el canvas workspace completo (para merge de stroke/draw) ── */
function _edRenderLayerToWorkspace(la){
  const pw = edPageW(), ph = edPageH();
  const wc = document.createElement('canvas');
  wc.width  = ED_CANVAS_W;
  wc.height = ED_CANVAS_H;
  const ctx = wc.getContext('2d');
  la.draw(ctx);
  return wc;
}

/* ── Une los objetos seleccionados en uno solo ── */
function edMergeSelected(){
  const mtype = _edMergeableTypes();
  if(!mtype) return;
  edPushHistory();
  // Ordenar índices ascendente: índice menor = capa inferior (se dibuja primero)
  const idxs  = [...edMultiSel].sort((a,b) => a - b);
  const layers = idxs.map(i => edLayers[i]);

  /* ── helper: finalizar inserción ── */
  function _finishMerge(newLayer){
    const insertAt = idxs[0];
    // Eliminar originales de mayor a menor para no desplazar índices
    for(let i = idxs.length - 1; i >= 0; i--) edLayers.splice(idxs[i], 1);
    edLayers.splice(Math.min(insertAt, edLayers.length), 0, newLayer);
    edPages[edCurrentPage].layers = edLayers;
    edSelectedIdx = Math.min(insertAt, edLayers.length - 1);
    _msClear();
    edActiveTool = 'select';
    if(edCanvas) edCanvas.className = '';
    $('edMultiSelBtn')?.classList.remove('active');
    edPushHistory(); edRedraw();
    edToast('Objetos unidos ✓');
  }

  if(mtype === 'vector'){
    const newLL = new LineLayer();
    const first = layers[0];
    newLL.color     = first.color     || '#000000';
    newLL.lineWidth = first.lineWidth || 3;
    newLL.opacity   = first.opacity   ?? 1;
    const _fillLayer = layers.find(l => l.fillColor && l.fillColor !== 'none');
    newLL.fillColor = _fillLayer ? _fillLayer.fillColor : (first.fillColor || 'none');
    const _allClosed = layers.every(l => l.type === 'shape' || (l.type === 'line' && l.closed));

    // Trabajar en píxeles workspace para respetar rotación y escala X/Y distintas.
    // Los puntos locales están en normalizado (aprox 0-1) con pw/ph distintos.
    const pw = edPageW(), ph = edPageH();
    const mx = edMarginX(), my = edMarginY();

    // Transforma un vector local (dx,dy) en normalizado al espacio px rotado del layer
    function _rotPx(dx, dy, cos, sin) {
      const lpx = dx * pw, lpy = dy * ph;
      return { x: lpx * cos - lpy * sin, y: lpx * sin + lpy * cos };
    }

    // Devuelve array de contornos en px absolutos.
    // Cada punto preserva: x, y (px), cp1, cp2 (px, opcionales), curve, cornerRadius (de cornerRadii)
    function _layerToPixelContours(la) {
      const contours = [];
      if(la.type === 'line') {
        const cx = mx + la.x * pw;
        const cy = my + la.y * ph;
        const rot = (la.rotation || 0) * Math.PI / 180;
        const cos = Math.cos(rot), sin = Math.sin(rot);
        const cr = la.cornerRadii || {};
        let cur = [];
        for(let _pi = 0; _pi < la.points.length; _pi++) {
          const p = la.points[_pi];
          if(p === null) {
            if(cur.length) { contours.push(cur); cur = []; }
          } else {
            const rp = _rotPx(p.x, p.y, cos, sin);
            const np = { x: cx + rp.x, y: cy + rp.y };
            if(p.curve !== undefined) np.curve = p.curve;
            if(p.cp1) { const c1 = _rotPx(p.cp1.x, p.cp1.y, cos, sin); np.cp1 = { x: cx + c1.x, y: cy + c1.y }; }
            if(p.cp2) { const c2 = _rotPx(p.cp2.x, p.cp2.y, cos, sin); np.cp2 = { x: cx + c2.x, y: cy + c2.y }; }
            // cornerRadii indexado por posición en la.points (incluyendo nulls)
            if(cr[_pi]) np._cr = cr[_pi];
            cur.push(np);
          }
        }
        if(cur.length) contours.push(cur);
      } else {
        // ShapeLayer → polígono en px (sin datos de curva)
        const cx = mx + la.x * pw;
        const cy = my + la.y * ph;
        const rot = (la.rotation || 0) * Math.PI / 180;
        const cos = Math.cos(rot), sin = Math.sin(rot);
        const pts = [];
        if(la.shape === 'ellipse') {
          const n = 48, rw = la.width * pw / 2, rh = la.height * ph / 2;
          for(let i = 0; i < n; i++) {
            const ang = (i / n) * Math.PI * 2;
            const lpx = Math.cos(ang) * rw, lpy = Math.sin(ang) * rh;
            pts.push({ x: cx + lpx*cos - lpy*sin, y: cy + lpx*sin + lpy*cos });
          }
        } else {
          const hw = la.width * pw / 2, hh = la.height * ph / 2;
          for(const [lx, ly] of [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]]) {
            pts.push({ x: cx + lx*cos - ly*sin, y: cy + lx*sin + ly*cos });
          }
        }
        contours.push(pts);
      }
      return contours;
    }

    // Recoger todos los contornos en px, con sus estilos individuales
    const allContoursPx = [];
    const allContourStyles = []; // estilo por contorno
    for(const la of layers) {
      const _cs = _layerToPixelContours(la);
      const _style = {
        fillColor: la.fillColor || 'none',
        color:     la.color     || '#000000',
        lineWidth: la.lineWidth ?? 3,
        closed:    la.type === 'shape' || (la.type === 'line' && !!la.closed)
      };
      for(const c of _cs) {
        allContoursPx.push(c);
        allContourStyles.push(_style);
      }
    }

    // Centro del bbox en px
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const c of allContoursPx) for(const p of c) {
      if(p.x<minX)minX=p.x; if(p.x>maxX)maxX=p.x;
      if(p.y<minY)minY=p.y; if(p.y>maxY)maxY=p.y;
    }
    const cxPx = (minX + maxX) / 2;
    const cyPx = (minY + maxY) / 2;
    newLL.x = (cxPx - mx) / pw;
    newLL.y = (cyPx - my) / ph;
    newLL.rotation = 0; // absorbida en los puntos
    newLL.cornerRadii = {};

    for(let ci = 0; ci < allContoursPx.length; ci++) {
      if(ci > 0) { newLL.points.push(null); } // el null ocupa índice en points
      for(const p of allContoursPx[ci]) {
        const np = { x: (p.x - cxPx) / pw, y: (p.y - cyPx) / ph };
        if(p.curve !== undefined) np.curve = p.curve;
        if(p.cp1) np.cp1 = { x: (p.cp1.x - cxPx) / pw, y: (p.cp1.y - cyPx) / ph };
        if(p.cp2) np.cp2 = { x: (p.cp2.x - cxPx) / pw, y: (p.cp2.y - cyPx) / ph };
        // cornerRadii se indexa por posición en points INCLUYENDO nulls
        if(p._cr) newLL.cornerRadii[newLL.points.length] = p._cr;
        newLL.points.push(np);
      }
    }
    newLL.closed = _allClosed;
    newLL.grouped = true; // agrupado sin fusión booleana
    newLL.groupedStyles = allContourStyles; // estilos individuales por contorno
    newLL._updateBbox();
    _finishMerge(newLL);
    return;
  }

  if(mtype === 'stroke' || mtype === 'draw'){
    // Composición de píxeles en orden de capa (ascendente = inferior primero)
    const wc = document.createElement('canvas');
    wc.width  = ED_CANVAS_W;
    wc.height = ED_CANVAS_H;
    const ctx = wc.getContext('2d');
    for(const la of layers){ la.draw(ctx); }
    const newSL = new StrokeLayer(wc);
    _finishMerge(newSL);
    return;
  }

  if(mtype === 'image'){
    // Unión de alta calidad: componer en un canvas a resolución nativa
    const pw = edPageW(), ph = edPageH();
    // 1. Calcular el bbox normalizado (0-1) que engloba todas las imágenes
    let bx0=Infinity, by0=Infinity, bx1=-Infinity, by1=-Infinity;
    for(const la of layers){
      const rot = (la.rotation||0) * Math.PI/180;
      const hw = la.width/2, hh = la.height/2;
      const cos = Math.cos(rot), sin = Math.sin(rot);
      for(const [lx,ly] of [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]]){
        const ax = la.x + lx*cos - ly*sin;
        const ay = la.y + lx*sin + ly*cos;
        if(ax < bx0) bx0=ax; if(ax > bx1) bx1=ax;
        if(ay < by0) by0=ay; if(ay > by1) by1=ay;
      }
    }
    const bboxW = bx1 - bx0;  // en coordenadas normalizadas
    const bboxH = by1 - by0;

    // 2. Resolución del canvas de composición: usar la imagen con mayor densidad de píxeles
    //    (naturalWidth / ancho normalizado * ancho página) → px/unidad-norm
    let maxPPU = 0;
    for(const la of layers){
      if(la.img && la.img.naturalWidth > 0){
        const ppu = la.img.naturalWidth / (la.width * pw);
        if(ppu > maxPPU) maxPPU = ppu;
      }
    }
    // Si no hay imágenes cargadas, fallback al workspace
    if(maxPPU <= 0) maxPPU = 1;

    // Tamaño del canvas de composición en píxeles
    const canW = Math.round(bboxW * pw * maxPPU);
    const canH = Math.round(bboxH * ph * maxPPU);
    const MAX_DIM = 8192;
    const scale = Math.min(1, MAX_DIM / Math.max(canW, canH));
    const outW = Math.max(1, Math.round(canW * scale));
    const outH = Math.max(1, Math.round(canH * scale));
    const ppu  = maxPPU * scale;  // píxeles por unidad normalizada en el canvas de salida

    const wc = document.createElement('canvas');
    wc.width  = outW;
    wc.height = outH;
    const ctx = wc.getContext('2d');

    // 3. Componer cada imagen en el canvas de salida (de abajo arriba)
    for(const la of layers){
      if(!la.img || !la.img.complete || la.img.naturalWidth === 0) continue;
      const rot  = (la.rotation||0) * Math.PI/180;
      // Centro de esta imagen en coords del canvas de salida
      const cx = (la.x - bx0) * pw * ppu;
      const cy = (la.y - by0) * ph * ppu;
      const iw = la.width  * pw * ppu;
      const ih = la.height * ph * ppu;
      ctx.save();
      ctx.globalAlpha = la.opacity ?? 1;
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.drawImage(la.img, -iw/2, -ih/2, iw, ih);
      ctx.restore();
    }

    // 4. Crear StrokeLayer a partir del canvas de alta resolución
    //    Necesitamos ubicarlo en coords normalizadas del workspace
    const cx_norm = (bx0 + bx1) / 2;
    const cy_norm = (by0 + by1) / 2;
    const newSL = new StrokeLayer(document.createElement('canvas'));
    newSL.x      = cx_norm;
    newSL.y      = cy_norm;
    newSL.width  = bboxW;
    newSL.height = bboxH;
    newSL._canvas = wc;
    _finishMerge(newSL);
    return;
  }
}

function edSerLayer(l){
  const op = l.opacity !== undefined ? {opacity:l.opacity} : {};
  if(l.type==='gif'){
    const _g={type:'gif',gifKey:l.gifKey,x:l.x,y:l.y,width:l.width,height:l.height,rotation:l.rotation||0,...op};
    if(l.groupId) _g.groupId=l.groupId; if(l.locked) _g.locked=true; return _g;
  }
  if(l.type==='image'){
    const compressedSrc = _edCompressImageSrc(l.src || (l.img ? l.img.src : ''));
    const _r={type:'image',x:l.x,y:l.y,width:l.width,height:l.height,rotation:l.rotation,src:compressedSrc,...op};
    if(l.groupId) _r.groupId=l.groupId;
    if(l.locked) _r.locked=true;
    if(l._keepSize) _r._keepSize=true;
    if(l._isGcpImage) _r._isGcpImage=true;
    // Frames en IDB: usar clave (nunca guardar frames grandes en localStorage)
    // Solo serializar _pngFrames con contenido real (no strings vacíos de placeholder)
    if(l._pngFrames && l._pngFrames.length && l._pngFrames[0]) _r._pngFrames=l._pngFrames;
    if(l.animKey)    _r.animKey    = l.animKey;
    if(l._bibItemId) _r._bibItemId = l._bibItemId; // id del item en biblioteca para re-edición
    // _apngSrc NO se serializa — es el dataUrl enorme, va al bucket por animKey
    if(l._gcpLayersData) _r._gcpLayersData=l._gcpLayersData;
    if(l._gcpFramesData) _r._gcpFramesData=l._gcpFramesData;
    if(l._gcpFrameDelay  != null) _r._gcpFrameDelay  = l._gcpFrameDelay;
    if(l._gcpRepeatCount != null) _r._gcpRepeatCount = l._gcpRepeatCount;
    if(l._gcpStopAtEnd)           _r._gcpStopAtEnd   = true;
    return _r;
  }
  if(l.type==='text'){const _o={type:'text',x:l.x,y:l.y,width:l.width,height:l.height,rotation:l.rotation,
    _hasText:!!(l.text&&l.text!=='Escribe aquí'),
    text:l.text,fontSize:l.fontSize,fontFamily:l.fontFamily,fontBold:l.fontBold||false,fontItalic:l.fontItalic||false,color:l.color,
    backgroundColor:l.backgroundColor,bgOpacity:l.bgOpacity??1,borderColor:l.borderColor,borderWidth:l.borderWidth,
    padding:l.padding||10,...op};
    if(l.groupId)_o.groupId=l.groupId; if(l.locked)_o.locked=true; return _o;}
  if(l.type==='bubble'){
    const _bobj={type:'bubble',x:l.x,y:l.y,width:l.width,height:l.height,rotation:l.rotation,
      _hasText:!!(l.text&&l.text!=='Escribe aquí'),
      text:l.text,fontSize:l.fontSize,fontFamily:l.fontFamily,fontBold:l.fontBold||false,fontItalic:l.fontItalic||false,color:l.color,
      backgroundColor:l.backgroundColor,bgOpacity:l.bgOpacity??1,borderColor:l.borderColor,borderWidth:l.borderWidth,
      tail:l.tail,style:l.style,tailStart:{...l.tailStart},tailEnd:{...l.tailEnd},voiceCount:l.voiceCount||1,
      tailStarts:l.tailStarts?l.tailStarts.map(s=>({...s})):undefined,tailEnds:l.tailEnds?l.tailEnds.map(e=>({...e})):undefined,
      padding:l.padding||15,
      explosionRadii:l.explosionRadii?l.explosionRadii.map(v=>({...v})):undefined,
      thoughtBig:l.thoughtBig?{...l.thoughtBig}:undefined,
      thoughtSmall:l.thoughtSmall?{...l.thoughtSmall}:undefined,
      ...op};
    if(l.groupId)_bobj.groupId=l.groupId;
    if(l.locked)_bobj.locked=true;
    // Para estilos complejos: guardar bitmap completo (forma+cola+texto) para reproducción fiel
    if(l.style==='thought'||l.style==='explosion'){
      try{
        const _pw=edPageW(),_ph=edPageH();
        // Para thought: bitmap sin texto (el reader lo superpone centrado)
        // Para explosion: bitmap CON texto (el centroide de los valles es complejo)
        const _savedText=l.text;
        if(l.style==='thought') l.text='';

        // Calcular bbox que incluye bocadillo + cola completa
        const _bpad=Math.ceil((l.borderWidth||2)/2)+6;
        // Para thought: el bbox real de los círculos es w/4+w/3=7w/12 en X, h/4+h/3=7h/12 en Y
        const _thoughtOverX = l.style==='thought' ? l.width*7/12  : l.width/2;
        const _thoughtOverY = l.style==='thought' ? l.height*7/12 : l.height/2;
        let _maxOX=_thoughtOverX, _maxOY=_thoughtOverY;
        // Cola convencional (tailStarts/tailEnds)
        const _tails=[...(l.tailStarts||[l.tailStart||{x:-0.4,y:0.4}]),
                       ...(l.tailEnds  ||[l.tailEnd  ||{x:-0.4,y:0.6}])];
        _tails.forEach(t=>{
          _maxOX=Math.max(_maxOX,Math.abs((t.x||0)*l.width));
          _maxOY=Math.max(_maxOY,Math.abs((t.y||0)*l.height));
        });
        // Cola thought (thoughtBig/thoughtSmall son relativos al tamaño del bocadillo)
        if(l.style==='thought'&&l.tail){
          const _tB=l.thoughtBig  ||{x:0.35,y:0.55};
          const _tS=l.thoughtSmall||{x:0.55,y:0.80};
          _maxOX=Math.max(_maxOX,Math.abs(_tB.x)*l.width+0.25*l.width);
          _maxOY=Math.max(_maxOY,Math.abs(_tB.y)*l.height+0.25*l.height);
          _maxOX=Math.max(_maxOX,Math.abs(_tS.x)*l.width+0.15*l.width);
          _maxOY=Math.max(_maxOY,Math.abs(_tS.y)*l.height+0.15*l.height);
        }

        // Renderizar en workspace completo (como LineLayer) — draw() usa coordenadas absolutas
        const _full=document.createElement('canvas');
        _full.width=ED_CANVAS_W; _full.height=ED_CANVAS_H;
        const _fctx=_full.getContext('2d');
        l.draw(_fctx,_full);
        l.text=_savedText;

        // Recortar zona del bocadillo + cola con bbox calculado
        const _cx=edMarginX()+l.x*_pw, _cy=edMarginY()+l.y*_ph;
        const _ox=Math.max(0,Math.round(_cx-_maxOX*_pw-_bpad));
        const _oy=Math.max(0,Math.round(_cy-_maxOY*_ph-_bpad));
        const _ow=Math.min(_full.width-_ox, Math.round(_maxOX*2*_pw+_bpad*2));
        const _oh=Math.min(_full.height-_oy, Math.round(_maxOY*2*_ph+_bpad*2));
        const _crop=document.createElement('canvas');
        _crop.width=_ow; _crop.height=_oh;
        _crop.getContext('2d').drawImage(_full,_ox,_oy,_ow,_oh,0,0,_ow,_oh);
        _bobj.renderDataUrl=_crop.toDataURL('image/png');
        _bobj._renderPad=_bpad;
        _bobj._renderW=_maxOX*2;
        _bobj._renderH=_maxOY*2;
      }catch(e){}
    }
    return _bobj;
  }
  if(l.type==='group') return null; // obsoleto
  if(l.type==='draw'){const _o={type:'draw', dataUrl:l.toDataUrl()}; if(l.groupId)_o.groupId=l.groupId; if(l.locked)_o.locked=true; return _o;}
  if(l.type==='stroke'){const _o={type:'stroke', dataUrl:l.toDataUrl(),
    x:l.x, y:l.y, width:l.width, height:l.height, rotation:l.rotation||0, opacity:l.opacity,
    color:l.color||'#000000', lineWidth:l.lineWidth??3}; if(l.groupId)_o.groupId=l.groupId; if(l.locked)_o.locked=true; return _o;}
  if(l.type==='shape'){
    const _sobj={type:'shape', shape:l.shape, x:l.x, y:l.y,
      width:l.width, height:l.height, rotation:l.rotation||0,
      color:l.color, fillColor:l.fillColor||'none', lineWidth:l.lineWidth, opacity:l.opacity??1,
      cornerRadii:l.cornerRadii?[...l.cornerRadii]:undefined,
      cornerRadius:l.cornerRadius||0};
    if(l.groupId)_sobj.groupId=l.groupId;
    if(l.locked)_sobj.locked=true;
    // Si tiene cornerRadii con valores, generar bitmap fiel
    const _hasCR=l.cornerRadii&&l.cornerRadii.some&&l.cornerRadii.some(r=>r>0);
    const _hasCRg=l.cornerRadius&&l.cornerRadius>0;
    if(_hasCR||_hasCRg){
      try{
        const _pw=edPageW(),_ph=edPageH();
        const _savedRot=l.rotation||0; l.rotation=0;
        const _pad=Math.ceil((l.lineWidth||3)/2)+2;
        const _bw=Math.round(l.width*_pw+_pad*2);
        const _bh=Math.round(l.height*_ph+_pad*2);
        const _crop=document.createElement('canvas');
        _crop.width=_bw; _crop.height=_bh;
        const _cctx=_crop.getContext('2d');
        const _dx=_bw/2-(edMarginX()+l.x*_pw);
        const _dy=_bh/2-(edMarginY()+l.y*_ph);
        _cctx.translate(_dx,_dy);
        l.draw(_cctx);
        l.rotation=_savedRot;
        _sobj.renderDataUrl=_crop.toDataURL('image/png');
        _sobj._renderPad=_pad;
      }catch(e){}
    }
    return _sobj;
  }
  if(l.type==='line'){
    const _cr=l.cornerRadii||{};
    const _hasR=Object.keys(_cr).some(k=>(_cr[k]||0)>0);
    const _lobj={type:'line', points:l.points.slice(),
      x:l.x, y:l.y, width:l.width, height:l.height, rotation:l.rotation||0,
      closed:l.closed, color:l.color, fillColor:l.fillColor||'#ffffff', lineWidth:l.lineWidth, opacity:l.opacity??1,
      _fromEllipse:l._fromEllipse||false,
      cornerRadii:_hasR?{..._cr}:undefined,
      subPaths: l.subPaths&&l.subPaths.length ? l.subPaths.map(sp=>{const _s=sp.slice(); if(sp.cornerRadii)_s.cornerRadii={...sp.cornerRadii}; return _s;}) : undefined};
    if(l.groupId)_lobj.groupId=l.groupId;
    if(l.locked)_lobj.locked=true;
    if(l._fusionId)_lobj._fusionId=l._fusionId; // T1: preservar en historial vectorial
    if(_hasR){
      try{
        const _pw=edPageW(),_ph=edPageH();
        // Renderizar SIN rotación para que el reader la aplique una sola vez
        const _savedRot=l.rotation||0; l.rotation=0;
        const _full=document.createElement('canvas');
        _full.width=ED_CANVAS_W; _full.height=ED_CANVAS_H;
        const _fctx=_full.getContext('2d');
        l.draw(_fctx);
        l.rotation=_savedRot;
        // Recortar zona del objeto con margen para el trazo
        const _pad=Math.ceil((l.lineWidth||3)/2)+2;
        const _cx=edMarginX()+l.x*_pw, _cy=edMarginY()+l.y*_ph;
        const _hw=l.width*_pw/2, _hh=l.height*_ph/2;
        const _ox=Math.max(0,Math.round(_cx-_hw-_pad));
        const _oy=Math.max(0,Math.round(_cy-_hh-_pad));
        const _ow=Math.min(_full.width-_ox, Math.round(_hw*2+_pad*2));
        const _oh=Math.min(_full.height-_oy, Math.round(_hh*2+_pad*2));
        const _crop=document.createElement('canvas');
        _crop.width=_ow; _crop.height=_oh;
        _crop.getContext('2d').drawImage(_full,_ox,_oy,_ow,_oh,0,0,_ow,_oh);
        _lobj.renderDataUrl=_crop.toDataURL('image/png');
        _lobj._renderPad=_pad;
      }catch(e){}
    }
    return _lobj;
  }
}
// Carga _pngFrames desde IndexedDB 'cxAnims' por clave _pngFramesKey
function _edAnimIdbLoad(key) {
  return new Promise(res => {
    const req = indexedDB.open('cxAnims', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('anims');
    req.onsuccess = e => {
      const r = e.target.result.transaction('anims').objectStore('anims').get(key);
      r.onsuccess = e2 => res(e2.target.result || null);
      r.onerror   = () => res(null);
    };
    req.onerror = () => res(null);
  });
}

function _edAnimIdbSave(key, frames) {
  return new Promise(res => {
    const req = indexedDB.open('cxAnims', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('anims');
    req.onsuccess = e => {
      const tx = e.target.result.transaction('anims', 'readwrite');
      tx.objectStore('anims').put(frames, key);
      tx.oncomplete = () => res();
      tx.onerror    = () => res();
    };
    req.onerror = () => res();
  });
}

function edDeserLayer(d, pageOrientation){
  if(!d) return null;
  if(d.type==='group') return null; // obsoleto
  if(d.type==='draw'){
    const _isV = (pageOrientation||'vertical')==='vertical';
    const _pw = _isV ? ED_PAGE_W : ED_PAGE_H;
    const _ph = _isV ? ED_PAGE_H : ED_PAGE_W;
    const dl = d.dataUrl ? DrawLayer.fromDataUrl(d.dataUrl, _pw, _ph) : new DrawLayer();
    if(d.groupId) dl.groupId=d.groupId;
    if(d.locked) dl.locked=true;
    return dl;
  }
  if(d.type==='stroke'){
    const _isV = (pageOrientation||'vertical')==='vertical';
    const _pw = _isV ? ED_PAGE_W : ED_PAGE_H;
    const _ph = _isV ? ED_PAGE_H : ED_PAGE_W;
    // Strokes antiguos (sin x/y/width/height) usan bbox completo de página — compatibilidad hacia atrás
    const _sx = d.x != null ? d.x : 0.5;
    const _sy = d.y != null ? d.y : 0.5;
    const _sw = d.width  != null ? d.width  : 1.0;
    const _sh = d.height != null ? d.height : 1.0;
    const sl = StrokeLayer.fromDataUrl(d.dataUrl||'', _sx, _sy, _sw, _sh, _pw, _ph);
    if(d.rotation) sl.rotation = d.rotation;
    if(d.opacity !== undefined) sl.opacity = d.opacity;
    if(d.color) sl.color = d.color;
    if(d.lineWidth !== undefined) sl.lineWidth = d.lineWidth;
    if(d.groupId) sl.groupId = d.groupId;
    if(d.locked) sl.locked = true;
    return sl;
  }
  if(d.type==='shape'){
    const l=new ShapeLayer(d.shape||'rect',d.x||0.5,d.y||0.5,d.width||0.3,d.height||0.2);
    l.color=d.color||'#000'; l.fillColor=d.fillColor||'none'; l.lineWidth=d.lineWidth??3; l.rotation=d.rotation||0; l.opacity=d.opacity??1;
    if(d.cornerRadius) l.cornerRadius=d.cornerRadius;
    if(d.cornerRadii) l.cornerRadii=Array.isArray(d.cornerRadii)?[...d.cornerRadii]:{...d.cornerRadii};
    if(d.groupId) l.groupId=d.groupId;
    if(d.locked) l.locked=true;
    return l;
  }
  if(d.type==='line'){
    const l=new LineLayer();
    l.points=d.points||[]; l.closed=d.closed||false;
    l.color=d.color||'#000'; l.fillColor=d.fillColor||'#ffffff'; l.lineWidth=d.lineWidth??3; l.opacity=d.opacity??1;
    l.rotation=d.rotation||0;
    if(d._fromEllipse) l._fromEllipse=true;
    if(d.cornerRadii) l.cornerRadii=Array.isArray(d.cornerRadii)?[...d.cornerRadii]:{...d.cornerRadii};
    if(d.subPaths&&d.subPaths.length) l.subPaths=d.subPaths.map(sp=>{const _s=sp.slice(); if(sp.cornerRadii)_s.cornerRadii={...sp.cornerRadii}; return _s;});
    if(d.x!=null){l.x=d.x;l.y=d.y;l.width=d.width||0.01;l.height=d.height||0.01;}
    else l._updateBbox();
    if(d.groupId) l.groupId=d.groupId;
    if(d.locked) l.locked=true;
    return l;
  }
  if(d.type==='text'){const l=new TextLayer(d.text,d.x,d.y);Object.assign(l,d);return l;}
  if(d.type==='bubble'){const l=new BubbleLayer(d.text,d.x,d.y);Object.assign(l,d);
    if(d.tailStart)l.tailStart={...d.tailStart};if(d.tailEnd)l.tailEnd={...d.tailEnd};
    if(d.tailStarts)l.tailStarts=d.tailStarts.map(s=>({...s}));
    if(d.tailEnds)  l.tailEnds  =d.tailEnds.map(e=>({...e}));
    if(d.multipleCount&&!d.voiceCount)l.voiceCount=d.multipleCount;
    return l;}
  if(d.type==='gif'){
    const l=new GifLayer(d.gifKey||'',d.x,d.y,d.width);
    l.height=d.height||0.3; l.rotation=d.rotation||0;
    if(d.opacity!==undefined) l.opacity=d.opacity;
    if(d.gifKey) _gifIdbLoad(d.gifKey).then(src=>{
      if(!src) return;
      l.load(src, () => {
        // Si el visor está abierto y reproduciendo, arrancar animación en este layer
        if($('editorViewer')?.classList.contains('open') && typeof _edGifSetPlaying==='function') {
          l._playing = true;
          l._applyFrame(0);
        }
        if(typeof edUpdateViewer==='function' && $('editorViewer')?.classList.contains('open')) {
          edUpdateViewer();
        } else if(typeof edRedraw==='function') {
          edRedraw();
        }
      });
    }).catch(()=>{});
    return l;
  }
  if(d.type==='image'){
    const l=new ImageLayer(null,d.x,d.y,d.width);
    l.rotation=d.rotation||0; l.src=d.src||'';
    if(d.opacity!==undefined) l.opacity=d.opacity;
    if(d.locked) l.locked=true;
    if(d._keepSize) l._keepSize=true;
    if(d.height) l.height = d.height;
    if(d.groupId) l.groupId=d.groupId;
    if(d._isGcpImage) l._isGcpImage=true;
    if(d._gcpLayersData) l._gcpLayersData=d._gcpLayersData;
    if(d._gcpFramesData) l._gcpFramesData=d._gcpFramesData;
    if(d._gcpFrameDelay  != null) l._gcpFrameDelay  = d._gcpFrameDelay;
    if(d._gcpRepeatCount != null) l._gcpRepeatCount = d._gcpRepeatCount;
    if(d._gcpStopAtEnd)           l._gcpStopAtEnd   = true;
    if(d.animKey)    l.animKey    = d.animKey;
    if(d._bibItemId) l._bibItemId = d._bibItemId;
    if(d._apngSrc) {
      // APNG descargado de nube — loadAnim con string → decodeApng → N frames reales
      l._apngSrc = d._apngSrc;
      l._fIdx = 0;
      l.loadAnim(d._apngSrc, () => { if(typeof edRedraw==='function') edRedraw(); });
    } else if(d._pngFrames && d._pngFrames.length && d._pngFrames[0]) {
      // _pngFrames con contenido real (no strings vacíos)
      l._pngFrames=d._pngFrames;
      l._fIdx=0;
      l.loadAnim(l._pngFrames, () => { if(typeof edRedraw==='function') edRedraw(); });
    }
    if(d._pngFramesKey && !d._pngFrames && !d._apngSrc) {
      _edAnimIdbLoad(d._pngFramesKey).then(data => {
        if(!data) return;
        // data puede ser string dataUrl APNG o array de frames PNG
        const input = (typeof data === 'string') ? data
                    : (Array.isArray(data) && data.length) ? data : null;
        if(!input) return;
        // Asignar al campo correcto para que _edGifSetPlaying lo detecte
        if(typeof data === 'string') { l._apngSrc = data; }
        else { l._pngFrames = data; }
        // Cargar frames
        l.loadAnim(input, () => {
          if($('editorViewer')?.classList.contains('open')) {
            l._playing = true;
            l._applyFrame(0);
            if(typeof edUpdateViewer==='function') edUpdateViewer();
          } else {
            if(typeof edRedraw==='function') edRedraw();
          }
        });
      });
    }
    if(d.src){
      const img=new Image();
      img.onload=()=>{
        l.img=img; l.src=img.src;
        if(l._keepSize){ edRedraw(); if(window._gcpActive) _gcpRedraw(); return; }
        const _isV = (pageOrientation||'vertical') === 'vertical';
        const _pw = _isV ? ED_PAGE_W : ED_PAGE_H;
        const _ph = _isV ? ED_PAGE_H : ED_PAGE_W;
        const _natH = l.width * (img.naturalHeight / img.naturalWidth) * (_pw / _ph);
        // Solo ajustar height si NO se guardó explícitamente (imagen nueva sin height)
        // Si d.height existe, respetar siempre el valor guardado (puede ser no proporcional)
        if(!d.height) {
          l.height = _natH;
        }
        edRedraw();
        if(window._gcpActive) _gcpRedraw();
      };
      img.onerror=()=>{ console.warn('edDeserLayer: failed to load image'); };
      img.src=d.src;
      // Si ya está en caché (complete antes de onload), disparar manualmente
      if(img.complete && img.naturalWidth > 0){
        l.img=img; l.src=img.src;
        if(window._gcpActive) setTimeout(_gcpRedraw, 0);
      }
    }
    return l;
  }
  return null;
}
function edLoadProject(id){
  const comic=ComicStore.getById(id);if(!comic)return;
  edProjectId=id;
  // Resetear marcador de guardado — al cargar, el estado es "guardado"
  edHistory=[]; edHistoryIdx=-1; _edSavedHistoryIdx=-1;
  edProjectMeta={title:comic.title||'',author:comic.author||comic.username||'',genre:comic.genre||'',navMode:comic.navMode||'fixed',social:comic.social||''};
  const pt=$('edProjectTitle');if(pt)pt.textContent=edProjectMeta.title||'Sin título';
  if(comic.editorData){
    edOrientation=comic.editorData.orientation||'vertical';
    edRules = comic.editorData._rules || [];
    edRuleNodes = comic.editorData._ruleNodes || [];
    _edRuleNodeId = edRuleNodes.reduce((m,n)=>Math.max(m,n.id),0);
    _edRuleId     = edRules.reduce((m,r)=>Math.max(m,r.id||0),0); // evitar colisión de IDs
    edPages=(comic.editorData.pages||[]).map(pd=>{
      const orient = pd.orientation||comic.editorData.orientation||'vertical';
      const layers = (pd.layers||[]).map(d=>edDeserLayer(d, orient)).filter(Boolean);
      // Migrar drawData legado (versiones <5.20) a DrawLayer si no hay DrawLayer ya
      if(pd.drawData && !layers.find(l=>l.type==='draw')){
        const _isV = orient==='vertical';
        layers.unshift(DrawLayer.fromDataUrl(pd.drawData, _isV?ED_PAGE_W:ED_PAGE_H, _isV?ED_PAGE_H:ED_PAGE_W)); // legacy
      }
      return {
        drawData: null,
        layers,
        textLayerOpacity: pd.textLayerOpacity??1,
        textMode: pd.textMode||'sequential',
        orientation: orient,
      };
    });
  }else{
    edOrientation='vertical';edPages=[{layers:[],drawData:null,textLayerOpacity:1,textMode:'sequential',orientation:'vertical'}];
    edRules=[];
    edRuleNodes=[];
  }
  if(!edPages.length)edPages.push({layers:[],drawData:null,textLayerOpacity:1,textMode:'sequential'});
  edCurrentPage=0;edLayers=edPages[0].layers;
  // Reconstruir _cache de grupos en todas las páginas (buildCache usa edOrientation/edCurrentPage)
  edPages.forEach((pg, _pgi) => {
    const _savedP=edCurrentPage, _savedO=edOrientation;
    edCurrentPage=_pgi; edOrientation=pg.orientation||edOrientation;
    edCurrentPage=_savedP; edOrientation=_savedO;
  });
  // Centrar cámara al cargar — igual que la lupa: reset completo garantizado
  // Forzar reset inmediato de cámara sin esperar al frame (evita que quede cámara de obra anterior)
  edCamera.x = 0; edCamera.y = 0; edCamera.z = 0; // z=0 fuerza recalculo en _edCameraReset
  window._edLoadReset=true;
  const _doLoadReset = () => {
    window._edUserRequestedReset=true;
    edFitCanvas(true);
    edRedraw();
  };
  if(edCanvas){
    requestAnimationFrame(()=>requestAnimationFrame(()=>{ _doLoadReset(); }));
    setTimeout(()=>{ _doLoadReset(); }, 150);
    setTimeout(()=>{ _doLoadReset(); window._edLoadReset=false; }, 400);
  }
  // Actualizar nav de páginas en topbar (si ya existe el DOM)
  requestAnimationFrame(()=>edUpdateNavPages());
}

/* ══════════════════════════════════════════
   VISOR
   ══════════════════════════════════════════ */
let edViewerIdx=0;
function edUpdateCanvasFullscreen(){ edFitCanvas(); }


/* Activar/desactivar animación GIF en todas las páginas */
function _edGifSetPlaying(playing) {
  edPages.forEach(page => {
    page.layers.forEach(l => {
      // GIF importado
      if (l.type === 'gif' && l._ready) {
        if (playing) {
          l._fIdx = 0;  // siempre desde frame 0
          l._playing = true;
          l._applyFrame(0);
        } else {
          l.stopAnim(); // stopAnim ya resetea _fIdx a 0
        }
      }
      // Animación PNG (APNG desde biblioteca, importado, o descargado de nube)
      if (l.type === 'image' && ((l._pngFrames && l._pngFrames.length > 1) || l._apngSrc)) {
        if (playing) {
          l._fIdx = 0;
          l._gcpPlayCount = 0;
          l._playing = true;
          // _apngSrc (descarga de nube) tiene prioridad — decodeApng extrae N frames
          l.loadAnim(l._apngSrc || l._pngFrames, () => {
            // Poblar _pngFrames con la longitud real para futuros ciclos
            if (l._playing) l._applyFrame(0);
          });
        } else {
          l.stopAnim();
        }
      }
    });
  });
}
function edOpenViewer(){
  edHideGearIcon();
  // Resetear estado de animaciones de TODAS las hojas antes de empezar
  edPages.forEach((p, pi) => _edResetPageAnims(pi));
  _edGifSetPlaying(true); // activar animación GIF al entrar al visor
  edViewerIdx=0;
  { const _fp=edPages[0]; const _ftl=_fp?.layers.filter(l=>l.type==='text'||l.type==='bubble')||[];
    edViewerTextStep=(_fp?.textMode==='sequential'&&_ftl.length>0)?1:0; }
  edPages.forEach(p=>{ if(!p.orientation) p.orientation=edOrientation; });
  $('editorViewer')?.classList.add('open');

  const _nm = edProjectMeta.navMode || 'fixed';
  const _isTouch = window._edIsTouch || window.matchMedia('(hover:none) and (pointer:coarse)').matches;

  if ((_nm === 'horizontal' || _nm === 'vertical') && _isTouch) {
    // Modo scroll táctil: contenedor con slides
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
      _edOpenViewerScroll(_nm);
    });
  } else {
    // Modo fixed (o PC siempre fixed)
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
      edUpdateViewer();
      edInitViewerTap();
    });
  }
  // Orientación: resize recalcula canvas al girar dispositivo
  if(_viewerResizeFn) window.removeEventListener('resize', _viewerResizeFn);
  let _viewerResizeTimer;
  _viewerResizeFn = () => {
    clearTimeout(_viewerResizeTimer);
    _viewerResizeTimer = setTimeout(() => {
      if (_viewerScrollMode) {
        // Reajustar slides al nuevo viewport (giro de dispositivo)
        const _sc = $('viewerScroll');
        if (!_sc) return;
        const _isH = _sc.classList.contains('vs-h');
        const _vw = window.innerWidth, _vh = window.innerHeight;
        const _so = edOrientation;
        Array.from(_sc.children).forEach((slide, pi) => {
          const page = edPages[pi]; if (!page) return;
          const orient = page.orientation || _so;
          const pw = orient === 'vertical' ? ED_PAGE_W : ED_PAGE_H;
          const ph = orient === 'vertical' ? ED_PAGE_H : ED_PAGE_W;
          const scale = Math.min(_vw / pw, _vh / ph);
          slide.style.width  = _vw + 'px';
          slide.style.height = _vh + 'px';
          const cv = slide.querySelector('canvas');
          if (cv) {
            cv.style.width  = Math.round(pw * scale) + 'px';
            cv.style.height = Math.round(ph * scale) + 'px';
          }
        });
        // Reposicionar scroll al slide activo
        const _sz = _isH ? _sc.clientWidth : _sc.clientHeight;
        if (_sz) _sc.scrollTo({ left: _isH ? edViewerIdx*_sz : 0, top: _isH ? 0 : edViewerIdx*_sz, behavior:'instant' });
        edUpdateViewer();
      } else {
        edUpdateViewer();
      }
    }, 150);
  };
  window.addEventListener('resize', _viewerResizeFn);
  // Fullscreen: reentrar si el navegador lo cierra al girar
  if(_viewerFsFn){
    document.removeEventListener('fullscreenchange', _viewerFsFn);
    document.removeEventListener('webkitfullscreenchange', _viewerFsFn);
  }
  _viewerFsFn = () => {
    if(!$('editorViewer')?.classList.contains('open')) return;
    // No intentar re-entrar FS si la cámara está abierta: getUserMedia causa
    // salida de FS en Android y requestFullscreen sin gesto corrompe los permisos
    if(!$('edCameraOverlay')?.classList.contains('hidden')) return;
    const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if(!active && typeof Fullscreen !== 'undefined') Fullscreen.enter();
  };
  document.addEventListener('fullscreenchange', _viewerFsFn);
  document.addEventListener('webkitfullscreenchange', _viewerFsFn);
  // Teclado PC
  if(_viewerKeyHandler) document.removeEventListener('keydown', _viewerKeyHandler);
  _viewerKeyHandler = _edViewerKey;
  document.addEventListener('keydown', _viewerKeyHandler);
}
// ── Visor en modo scroll (horizontal / vertical) ──────────────
//
// Arquitectura (igual que Webtoon / Tapas / Kindle):
//   - Scroll nativo SIEMPRE activo — overflow NUNCA cambia → sin saltos
//   - Un slide por página con canvas; scroll-snap + scroll-behavior:smooth
//     dan la animación natural (ease-out del navegador, acelerada al inicio
//     y desacelerada al final)
//   - Un overlay transparente (position:absolute, inset:0) encima del scroll:
//       · pointer-events:all  → cuando hay textos pendientes: intercepta el
//         swipe y avanza el bocadillo SIN mover el scroll
//       · pointer-events:none → cuando la página está completa: los toques
//         llegan al scroll nativo que mueve la hoja suavemente
// ─────────────────────────────────────────────────────────────

function _edOpenViewerScroll(navMode) {
  const isH = navMode === 'horizontal';
  const vw = window.innerWidth, vh = window.innerHeight;

  _viewerScrollMode = true;

  // Ocultar canvas/controles del modo fijo
  const fc = $('viewerCanvas');
  if (fc) fc.style.display = 'none';
  $('viewerControls')?.classList.add('hidden');

  // Configurar contenedor — overflow NUNCA se toca después de aquí
  const sc = $('viewerScroll');
  sc.className = isH ? 'vs-h' : 'vs-v';
  sc.innerHTML = '';

  const _savedOrient = edOrientation;

  // ── Construir slides ──
  const _canvases = [];

  edPages.forEach((page, pi) => {
    const orient = page.orientation || _savedOrient;
    const pw = orient === 'vertical' ? ED_PAGE_W : ED_PAGE_H;
    const ph = orient === 'vertical' ? ED_PAGE_H : ED_PAGE_W;
    const scale = Math.min(vw / pw, vh / ph);

    const slide = document.createElement('div');
    slide.className = 'vs-slide';
    slide.style.width  = vw + 'px';
    slide.style.height = vh + 'px';

    const canvas = document.createElement('canvas');
    canvas.width  = pw;
    canvas.height = ph;
    canvas.style.width  = Math.round(pw * scale) + 'px';
    canvas.style.height = Math.round(ph * scale) + 'px';
    canvas.style.pointerEvents = 'none';

    slide.appendChild(canvas);
    sc.appendChild(slide);
    _canvases.push(canvas);
  });

  // ── Overlay: intercepta toques cuando hay textos pendientes ──
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;z-index:10;touch-action:none;';
  overlay.style.pointerEvents = 'none'; // empieza sin interceptar
  $('editorViewer').appendChild(overlay);

  // ── Estado ──
  edViewerIdx      = 0;
  edViewerTextStep = 0;

  function _activateCanvas(pi) {
    edViewerCanvas = _canvases[pi];
    edViewerCtx    = _canvases[pi]?.getContext('2d');
  }

  function _hasPendingTexts(pi) {
    pi = pi ?? edViewerIdx;
    const page  = edPages[pi];
    const tl    = (page?.layers || []).filter(l => l.type==='text' || l.type==='bubble');
    return (page?.textMode || 'sequential') === 'sequential' && edViewerTextStep < tl.length;
  }

  function _updateOverlay() {
    // El overlay intercepta gestos si hay textos pendientes hacia adelante
    // O si hay textos que retroceder (textStep > 1)
    const page = edPages[edViewerIdx];
    const tl   = (page?.layers || []).filter(l => l.type==='text' || l.type==='bubble');
    const isSeq = (page?.textMode || 'sequential') === 'sequential';
    const active = isSeq && tl.length > 0 && (edViewerTextStep < tl.length || edViewerTextStep > 1);
    overlay.style.pointerEvents = active ? 'all' : 'none';
  }

  // ── Render inicial de todos los slides (sin textos secuenciales aún) ──
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    const _si = edViewerIdx, _ss = edViewerTextStep;
    edPages.forEach((page, pi) => {
      _activateCanvas(pi);
      const orient = page.orientation || _savedOrient;
      const pw = orient === 'vertical' ? ED_PAGE_W : ED_PAGE_H;
      const ph = orient === 'vertical' ? ED_PAGE_H : ED_PAGE_W;
      edViewerIdx      = pi;
      edViewerTextStep = 0;
      edUpdateViewer();
    });
    // Activar página 0 con primer texto
    edViewerIdx      = _si;
    _activateCanvas(0);
    const p0 = edPages[0];
    const tl0 = (p0?.layers || []).filter(l => l.type==='text' || l.type==='bubble');
    edViewerTextStep = (p0?.textMode === 'sequential' && tl0.length > 0) ? 1 : 0;
    edUpdateViewer();
    _updateOverlay();
    // Forzar posición inicial a hoja 0 (el render de múltiples slides puede desplazarlo)
    const _sc0 = $('viewerScroll');
    if (_sc0) { _sc0.scrollLeft = 0; _sc0.scrollTop = 0; }
  });

  // ── Swipe en el overlay (cuando hay textos pendientes) ──
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
    // Ignorar gestos en dirección incorrecta
    if (isH && adx < 20) return;
    if (!isH && ady < 20) return;
    if (isH && ady > adx * 1.5) return;
    if (!isH && adx > ady * 1.5) return;

    const goFwd = isH ? dx < 0 : dy < 0;
    const goBwd = isH ? dx > 0 : dy > 0;

    if (goFwd && _hasPendingTexts()) {
      // Avanzar bocadillo con fade (idéntico al modo fijo)
      _vStartBubbleFade();
      edViewerTextStep++;
      _activateCanvas(edViewerIdx);
      edUpdateViewer();
      _updateOverlay();
    } else if (goFwd) {
      // Todos los bocadillos mostrados — deslizar a la siguiente hoja
      if (edViewerIdx < edPages.length - 1) _snapTo(edViewerIdx + 1);
    } else if (goBwd) {
      _vsBack();
    }
  }, { passive: true });

  // ── Retroceder ──
  function _vsBack() {
    if (_vFadeRaf) { cancelAnimationFrame(_vFadeRaf); _vFadeRaf = null; _vPrevBubbleFade = 0; }
    const page  = edPages[edViewerIdx];
    const isSeq = (page?.textMode || 'sequential') === 'sequential';
    const tl    = (page?.layers || []).filter(l => l.type==='text' || l.type==='bubble');
    if (isSeq && edViewerTextStep > 1) {
      // Aún hay bocadillos que retroceder en esta hoja
      edViewerTextStep--;
      _activateCanvas(edViewerIdx);
      edUpdateViewer();
      _updateOverlay();
    } else {
      // Sin bocadillos que retroceder — deslizar a la hoja anterior
      if (edViewerIdx > 0) _snapTo(edViewerIdx - 1);
    }
  }

  // ── Scroll nativo: detectar llegada a nuevo slide ──
  let _prevSI = 0, _scrollRaf = null, _settling = false;
  sc.addEventListener('scroll', () => {
    if (_scrollRaf) cancelAnimationFrame(_scrollRaf);
    _scrollRaf = requestAnimationFrame(() => {
      const pos  = isH ? sc.scrollLeft : sc.scrollTop;
      const size = isH ? sc.clientWidth : sc.clientHeight;
      if (!size) return;
      const si = Math.max(0, Math.min(edPages.length - 1, Math.round(pos / size)));
      if (si === _prevSI) return;
      const goingBack = si < _prevSI;
      _edResetPageAnims(_prevSI);
      _prevSI      = si;
      edViewerIdx  = si;
      _activateCanvas(si);
      const np  = edPages[si];
      const ntl = (np?.layers || []).filter(l => l.type==='text' || l.type==='bubble');
      const isSeq = (np?.textMode || 'sequential') === 'sequential';
      if (!isSeq || ntl.length === 0) {
        edViewerTextStep = 0;
      } else if (goingBack) {
        // Llegamos retrocediendo — mostrar el último texto
        edViewerTextStep = ntl.length;
      } else {
        // Llegamos avanzando — mostrar el primer texto
        edViewerTextStep = 1;
      }
      edUpdateViewer();
      _updateOverlay();
    });
  }, { passive: true });

  // ── scrollTo programático para retroceder ──
  function _snapTo(idx) {
    const size = isH ? sc.clientWidth : sc.clientHeight;
    sc.scrollTo({
      left:     isH ? idx * size : 0,
      top:      isH ? 0 : idx * size,
      behavior: 'smooth',
    });
  }

  // Guardar referencia al overlay para limpieza en edCloseViewer
  sc._vsOverlay = overlay;
}

// Función de render de un estado concreto sobre un canvas destino (usada en resize)
function _edRenderViewerState(canvas, page, pageIdx, textStep, pw, ph, orient) {
  const ctx = canvas.getContext('2d');
  const _savedOrient   = edOrientation;
  const _savedPage     = edCurrentPage;
  const _savedIdx      = edViewerIdx;
  const _savedStep     = edViewerTextStep;
  const _savedCanvas   = edViewerCanvas;
  const _savedCtx      = edViewerCtx;

  edOrientation    = orient;
  edCurrentPage    = pageIdx;
  edViewerIdx      = pageIdx;
  edViewerTextStep = textStep;
  edViewerCanvas   = canvas;
  edViewerCtx      = ctx;

  const full = document.createElement('canvas');
  full.width  = ED_CANVAS_W;
  full.height = ED_CANVAS_H;
  const fctx  = full.getContext('2d');
  const mx = (ED_CANVAS_W - pw) / 2;
  const my = (ED_CANVAS_H - ph) / 2;
  fctx.fillStyle = '#fff';
  fctx.fillRect(mx, my, pw, ph);

  page.layers.forEach(l => {
    if (l.type==='text' || l.type==='bubble') return;
    fctx.globalAlpha = l.opacity ?? 1;
    if (typeof l.draw === 'function') l.draw(fctx, full);
    fctx.globalAlpha = 1;
  });
  _edViewerDrawTextsOnCtx(page, fctx, full);
  ctx.clearRect(0, 0, pw, ph);
  ctx.drawImage(full, mx, my, pw, ph, 0, 0, pw, ph);

  edOrientation    = _savedOrient;
  edCurrentPage    = _savedPage;
  edViewerIdx      = _savedIdx;
  edViewerTextStep = _savedStep;
  edViewerCanvas   = _savedCanvas;
  edViewerCtx      = _savedCtx;
}

// Flag: true cuando el visor está en modo scroll (canvas dentro de slide flex)
let _viewerScrollMode = false;

function edUpdateViewerSize(pw, ph){
  if(!edViewerCanvas) return;
  const vw = window.innerWidth, vh = window.innerHeight;
  if(!pw||!ph){
    const _po = edPages[edViewerIdx]?.orientation || edOrientation;
    pw = _po==='vertical' ? ED_PAGE_W : ED_PAGE_H;
    ph = _po==='vertical' ? ED_PAGE_H : ED_PAGE_W;
  }
  edViewerCanvas.width  = pw;
  edViewerCanvas.height = ph;
  edViewerCtx = edViewerCanvas.getContext('2d');
  const scale = Math.min(vw / pw, vh / ph);
  const displayW = Math.round(pw * scale);
  const displayH = Math.round(ph * scale);
  edViewerCanvas.style.width  = displayW + 'px';
  edViewerCanvas.style.height = displayH + 'px';
  if (!_viewerScrollMode) {
    // Modo fijo: centrar con position absolute
    edViewerCanvas.style.position = 'absolute';
    edViewerCanvas.style.left = Math.round((vw - displayW) / 2) + 'px';
    edViewerCanvas.style.top  = Math.round((vh - displayH) / 2) + 'px';
  } else {
    // Modo scroll: el canvas está dentro de un slide flex, no necesita posicionamiento
    edViewerCanvas.style.position = '';
    edViewerCanvas.style.left = '';
    edViewerCanvas.style.top  = '';
  }
}

// Teclado en visor (PC)
let _viewerKeyHandler = null;
function _edViewerKey(e){
  const v = $('editorViewer');
  if(!v || !v.classList.contains('open')) return;
  // LOCK: teclas de movimiento respetan objetos bloqueados
  if((e.key==='ArrowRight'||e.key==='ArrowDown'||e.key==='ArrowLeft'||e.key==='ArrowUp') && edSelectedIdx>=0 && edLayers[edSelectedIdx]?.locked){
    _edShowLockIcon(edLayers[edSelectedIdx]); return;
  }
  if((e.key==='ArrowRight'||e.key==='ArrowDown'||e.key==='ArrowLeft'||e.key==='ArrowUp') && edSelectedIdx>=0 && edLayers[edSelectedIdx]?.locked){
    _edShowLockIcon(edLayers[edSelectedIdx]); return;
  }
  if(e.key === 'ArrowRight' || e.key === 'ArrowDown'){
    e.preventDefault(); _viewerAdvance();
  } else if(e.key === 'ArrowLeft' || e.key === 'ArrowUp'){
    e.preventDefault(); _viewerBack();
  } else if(e.key === 'Escape'){
    e.preventDefault();
    edCloseViewer();
  }
}

// Tap en el visor → mostrar/ocultar controles
let _viewerTapBound = false, _viewerHideTimer;
let _vPrevBubbleFade = 0;  // opacidad del bocadillo anterior en fade
let _vFadeRaf = null;       // requestAnimationFrame del fade
let _viewerResizeFn = null; // listener resize para orientación
let _viewerFsFn = null;     // listener fullscreenchange para orientación
function edShowViewerCtrls(){
  const ctrls = $('viewerControls');
  if(!ctrls) return;
  ctrls.classList.remove('hidden');
  clearTimeout(_viewerHideTimer);
  _viewerHideTimer = setTimeout(()=>ctrls.classList.add('hidden'), 3500);
}
function _vStartBubbleFade(){
  // Solo hacer fade si el bocadillo que va a quedar atrás es tipo 'bubble'
  // (las cajas de texto permanecen visibles, no se desvanecen)
  const page = edPages[edViewerIdx];
  const tl = page?.layers.filter(l=>l.type==='text'||l.type==='bubble')||[];
  // El bocadillo "anterior" será el que está en textStep (el actual antes del incremento)
  const curLayer = tl[edViewerTextStep - 1];
  if(!curLayer || curLayer.type !== 'bubble'){
    _vPrevBubbleFade = 0; return;  // no es bubble, no fade
  }
  if(_vFadeRaf){ cancelAnimationFrame(_vFadeRaf); _vFadeRaf=null; }
  _vPrevBubbleFade = 1.0;
  const duration = 400;
  const start = performance.now();
  function step(now){
    const t = Math.min(1, (now - start) / duration);
    _vPrevBubbleFade = 1 - t;
    edUpdateViewer();
    if(t < 1) _vFadeRaf = requestAnimationFrame(step);
    else { _vFadeRaf=null; _vPrevBubbleFade=0; edUpdateViewer(); }
  }
  _vFadeRaf = requestAnimationFrame(step);
}

// AbortController del visor: elimina TODOS los listeners de una vez al cerrar
let _viewerAC = null;

// ── Navegación del visor: funciones únicas usadas por swipe, botones y teclado ──
// Resetear animaciones de una página al salir de ella en el visor
function _edResetPageAnims(pageIdx) {
  const page = edPages[pageIdx];
  if (!page) return;
  page.layers.forEach(function(l) {
    // Parar cualquier layer con timer activo, independientemente del número de frames
    if (l.type === 'gif' && l._ready) { l.stopAnim(); }
    if (l.type === 'image' && (l._pngFrames || l._apngSrc)) { l.stopAnim(); }
  });
}

function _viewerAdvance(){
  if(_vFadeRaf){ cancelAnimationFrame(_vFadeRaf); _vFadeRaf=null; _vPrevBubbleFade=0; }
  const page = edPages[edViewerIdx];
  const tl = (page?.layers || []).filter(l => l.type==='text' || l.type==='bubble');
  const isSeq = page?.textMode === 'sequential';
  if(isSeq && edViewerTextStep < tl.length){
    _vStartBubbleFade();
    edViewerTextStep++;
    edUpdateViewer();
  } else if(edViewerIdx < edPages.length - 1){
    _edResetPageAnims(edViewerIdx);
    edViewerIdx++;
    const np = edPages[edViewerIdx];
    const ntl = (np?.layers || []).filter(l => l.type==='text' || l.type==='bubble');
    edViewerTextStep = (np?.textMode==='sequential' && ntl.length > 0) ? 1 : 0;
    edUpdateViewer();
  }
}
function _viewerBack(){
  if(_vFadeRaf){ cancelAnimationFrame(_vFadeRaf); _vFadeRaf=null; _vPrevBubbleFade=0; }
  const page = edPages[edViewerIdx];
  const isSeq = page?.textMode === 'sequential';
  if(isSeq && edViewerTextStep > 1){
    edViewerTextStep--;
    edUpdateViewer();
  } else if(edViewerIdx > 0){
    _edResetPageAnims(edViewerIdx);
    edViewerIdx--;
    const pp = edPages[edViewerIdx];
    const ptl = (pp?.layers || []).filter(l => l.type==='text' || l.type==='bubble');
    edViewerTextStep = pp?.textMode==='sequential' ? ptl.length : 0;
    edUpdateViewer();
  }
}

function edInitViewerTap(){
  const viewer = $('editorViewer');
  if(!viewer) return;

  edShowViewerCtrls();

  if(_viewerTapBound) return;
  _viewerTapBound = true;

  // AbortController nuevo en cada apertura: al cerrar, abort() elimina TODOS los listeners
  // Esto evita la acumulación de handlers en aperturas sucesivas (causa del bug de navegación)
  _viewerAC = new AbortController();
  const sig = { signal: _viewerAC.signal };

  // ── SWIPE TÁCTIL ──
  // PC: siempre modo fijo. Táctil: según navMode de la obra.
  const _vNavMode = edProjectMeta.navMode || 'fixed';
  let _sx = null, _sy = null;

  viewer.addEventListener('touchstart', e => {
    _sx = null; _sy = null;
    if(e.touches.length !== 1) return;
    _sx = e.touches[0].clientX;
    _sy = e.touches[0].clientY;
  }, {passive:true, ...sig});

  viewer.addEventListener('touchend', e => {
    if(_sx === null) return;
    if(e.changedTouches.length !== 1){ _sx = null; return; }
    if(e.target.closest('button, a, input')) { _sx = null; return; }
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const dx = endX - _sx, dy = endY - _sy;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    _sx = null;

    if (_vNavMode === 'horizontal') {
      if (adx < 30) return;
      if (adx < ady) return; // gesto más vertical, ignorar
      if (dx > 0) _viewerBack(); else _viewerAdvance();
    } else if (_vNavMode === 'vertical') {
      if (ady < 30) return;
      if (ady < adx) return; // gesto más horizontal, ignorar
      if (dy > 0) _viewerBack(); else _viewerAdvance();
    } else {
      // Modo fixed: tap en mitad izquierda/derecha
      if (ady > 40) return;
      if (_isBackSide(endX, endY)) _viewerBack(); else _viewerAdvance();
    }
  }, {passive:true, ...sig});

  // ── CONTROLES DESKTOP (mouse) ──
  viewer.addEventListener('pointerdown', e => {
    if(e.pointerType === 'mouse') edShowViewerCtrls();
  }, {capture:true, passive:true, ...sig});
  viewer.addEventListener('mousemove', () => edShowViewerCtrls(), {passive:true, ...sig});
}
function edCloseViewer(){
  _edGifSetPlaying(false); // detener animación GIF al salir del visor
  // Limpiar modo scroll si estaba activo
  _viewerScrollMode = false;
  const sc = $('viewerScroll');
  if (sc) {
    if (sc._vsOverlay) { sc._vsOverlay.remove(); sc._vsOverlay = null; }
    sc.className = '';
    sc.innerHTML = '';
    sc.style.overflowX = '';
    sc.style.overflowY = '';
  }
  const fc = $('viewerCanvas');
  if (fc) fc.style.display = '';
  _viewerTapBound = false;

  if(_vFadeRaf){ cancelAnimationFrame(_vFadeRaf); _vFadeRaf=null; }
  _vPrevBubbleFade=0;
  $('editorViewer')?.classList.remove('open');
  clearTimeout(_viewerHideTimer);
  // Eliminar TODOS los listeners del visor (touch + mouse) de una sola vez
  if(_viewerAC){ _viewerAC.abort(); _viewerAC=null; }
  _viewerTapBound = false; // permitir re-bind en próxima apertura
  if(_viewerKeyHandler){
    document.removeEventListener('keydown', _viewerKeyHandler);
    _viewerKeyHandler = null;
  }
  // Limpiar listeners de orientación
  if(_viewerResizeFn){
    window.removeEventListener('resize', _viewerResizeFn);
    _viewerResizeFn = null;
  }
  if(_viewerFsFn){
    document.removeEventListener('fullscreenchange', _viewerFsFn);
    document.removeEventListener('webkitfullscreenchange', _viewerFsFn);
    _viewerFsFn = null;
  }
}
function edUpdateViewer(){
  if(!$('editorViewer')?.classList.contains('open')) return;
  const page=edPages[edViewerIdx];if(!page||!edViewerCanvas)return;
  // Calcular dimensiones de ESTA hoja directamente, sin tocar edOrientation global
  const _po = page.orientation || edOrientation;
  const pw = _po==='vertical' ? ED_PAGE_W : ED_PAGE_H;
  const ph = _po==='vertical' ? ED_PAGE_H : ED_PAGE_W;
  const mx = (ED_CANVAS_W - pw) / 2;  // margen X para esta orientación
  const my = (ED_CANVAS_H - ph) / 2;  // margen Y para esta orientación
  // Ajustar canvas del visor para esta hoja
  edUpdateViewerSize(pw, ph);
  // Canvas de trabajo con margen (igual que el editor)
  const full=document.createElement('canvas');
  full.width=ED_CANVAS_W; full.height=ED_CANVAS_H;
  const fctx=full.getContext('2d');
  fctx.fillStyle='#fff'; fctx.fillRect(mx,my,pw,ph);
  // Renderizar capas: temporalmente setear edOrientation para que draw() funcione
  // (draw() usa edMarginX/edPageW internamente)
  const _savedOrient=edOrientation;
  edOrientation=_po;
  // Mismo orden que el editor: seguir el array, textos al final
  page.layers.forEach(l=>{
    if(l.type==='text'||l.type==='bubble') return;
    if(l.type==='image'){
      fctx.globalAlpha = l.opacity ?? 1; l.draw(fctx, full); fctx.globalAlpha = 1;
    } else if(l.type==='draw'){
      fctx.globalAlpha = l.opacity ?? 1; l.draw(fctx); fctx.globalAlpha = 1;
    } else if(l.type==='stroke'){
      fctx.globalAlpha = l.opacity ?? 1; l.draw(fctx); fctx.globalAlpha = 1;
    } else if(l.type==='shape' || l.type==='line'){
      fctx.globalAlpha = l.opacity ?? 1; l.draw(fctx); fctx.globalAlpha = 1;
    } else if(l.type==='gif'){
      fctx.globalAlpha = l.opacity ?? 1; l.draw(fctx); fctx.globalAlpha = 1;
    }
  });
  const _finishViewer = () => {
    _edViewerDrawTextsOnCtx(page, fctx, full);
    // Restaurar antes de manipular el DOM
    edOrientation=_savedOrient;
    // Copiar zona del lienzo al viewerCanvas
    edViewerCtx.clearRect(0,0,pw,ph);
    edViewerCtx.drawImage(full,mx,my,pw,ph,0,0,pw,ph);
    // Contador
    const textLayers=page.layers.filter(l=>l.type==='text'||l.type==='bubble');
    const isSeq=page.textMode==='sequential';
    const cnt=$('viewerCounter');
    if(cnt){
      if(isSeq&&textLayers.length>0){
        cnt.textContent=`${edViewerIdx+1}/${edPages.length} · 💬${edViewerTextStep-1}/${textLayers.length}`;
      } else {
        cnt.textContent=`${edViewerIdx+1} / ${edPages.length}`;
      }
    }
  };
  _finishViewer();
  // Animar GIFs y PNGs en el visor interno — el loop lo gestiona _applyFrame/_applyPngFrame
  const _hasAnim = page.layers.some(l =>
    (l.type==='gif' && l._playing) ||
    (l.type==='image' && l._playing && l._animReady && l._animFrames && l._animFrames.length > 1)
  );
  if (!_hasAnim && edUpdateViewer._raf) {
    cancelAnimationFrame(edUpdateViewer._raf);
    edUpdateViewer._raf = null;
  }
}

function _edViewerDrawTextsOnCtx(page, ctx, can){
  const textLayers = page.layers.filter(l=>l.type==='text'||l.type==='bubble');
  const isSeq = page.textMode === 'sequential';
  if(!isSeq){ textLayers.forEach(l=>l.draw(ctx, can)); return; }

  // Modo secuencial:
  // - Cajas de texto (type='text'): visibles al 100% cuando reveladas, permanecen
  // - Bocadillos (type='bubble'): el actual al 100%, el anterior con fade-out 1→0
  const toShow = textLayers.slice(0, edViewerTextStep);
  toShow.forEach((l, vi) => {
    if(l.type === 'text'){
      l.draw(ctx, can);  // cajas siempre al 100%
    } else {
      // Bocadillo: solo el actual y el penúltimo (en fade)
      const isCurrent  = vi === toShow.length - 1;
      const isPrevious = vi === toShow.length - 2;
      if(isCurrent){
        l.draw(ctx, can);
      } else if(isPrevious && _vPrevBubbleFade > 0){
        ctx.save();
        ctx.globalAlpha = _vPrevBubbleFade;
        l.draw(ctx, can);
        ctx.restore();
      }
      // Bocadillos más antiguos: ya desaparecieron
    }
  });
}

/* ══════════════════════════════════════════
   MODAL DATOS PROYECTO
   ══════════════════════════════════════════ */
function edOpenProjectModal(){
  $('edMTitle').value=edProjectMeta.title;
  $('edMAuthor').value=edProjectMeta.author;
  $('edMGenre').value=edProjectMeta.genre;
  $('edMNavMode').value=edProjectMeta.navMode;
  const edMSocial=$('edMSocial'); if(edMSocial) edMSocial.value=edProjectMeta.social||'';
  const _titleEl = document.querySelector('#edProjectModal .ed-modal-title');
  if(_titleEl) _titleEl.textContent = 'Editar datos de la obra';
  $('edProjectModal')?.classList.add('open');
}
function edCloseProjectModal(){$('edProjectModal')?.classList.remove('open');}

/* ── Destruir vista: eliminar todos los listeners de document/window ── */
// Detecta si el toque está en el lado "retroceder" según orientación física del dispositivo.
// El navegador ya transforma las coordenadas táctiles al sistema del usuario.
// "Izquierda del usuario" es siempre endX < W/2, independientemente del ángulo del dispositivo.
function _isBackSide(endX, endY) {
  return endX < window.innerWidth / 2;
}


function _edStartEyedrop() {
  const canvas = edCanvas;
  if (!canvas) return;

  // Opacidad al 100% mientras el cuentagotas está activo
  window._edEyedropActive = true;
  edRedraw();

  // Indicador visual: cambiar cursor y mostrar toast
  canvas.style.cursor = 'crosshair';
  edToast('Toca el color a copiar…');

  // Usar AbortController para limpiar tras el primer sample
  const ac = new AbortController();
  const sig = { signal: ac.signal };

  function sampleAt(clientX, clientY) {
    ac.abort(); // un solo disparo
    canvas.style.cursor = '';

    // Leer pixel ANTES de restaurar el dimming — el canvas aún está al 100%
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = Math.round((clientX - rect.left) * scaleX);
    const cy = Math.round((clientY - rect.top)  * scaleY);
    const ctx = canvas.getContext('2d');
    const px  = ctx.getImageData(cx, cy, 1, 1).data;

    // Ahora sí restaurar el dimming
    window._edEyedropActive = false;
    edRedraw();

    if (px[3] < 10) { edToast('Sin color en ese punto'); return; }

    const hex = '#' + [px[0], px[1], px[2]].map(v => v.toString(16).padStart(2, '0')).join('');
    edDrawColor = hex;
    if(edSelectedPaletteIdx > 1) edColorPalette[edSelectedPaletteIdx] = hex;
    _edUpdatePaletteDots();
    _edbSyncColor();
    edToast('Color copiado ✓');
  }

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    sampleAt(e.clientX, e.clientY);
  }, { ...sig, once: true });

  // Cancelar con Escape o tocando fuera del canvas
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      ac.abort(); canvas.style.cursor = '';
      window._edEyedropActive = false; edRedraw();
      edToast('Cuentagotas cancelado');
    }
  }, { ...sig, once: true });
}

/* ── CÁMARA IN-APP (getUserMedia) ── */
let _edCameraStream = null;
let _edCameraFacing = 'environment'; // 'environment' = trasera, 'user' = frontal

function edOpenCamera() {
  const overlay = $('edCameraOverlay');
  const video   = $('edCameraVideo');
  if (!overlay || !video) return;

  if (!navigator.mediaDevices?.getUserMedia) {
    edToast('Cámara no disponible en este dispositivo');
    return;
  }

  // Guardar estado fullscreen — getUserMedia puede cancelarlo en Android
  const _camWasFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);

  let _camClosed = false; // flag: si closeCamera fue llamado, parar cualquier stream que llegue

  function startStream(facing) {
    if (_edCameraStream) {
      _edCameraStream.getTracks().forEach(t => t.stop());
      _edCameraStream = null;
    }
    // Resolución ideal = doble del lienzo (1800×2340 → ×2 = 3600×4680)
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: ED_CANVAS_W * 2 }, height: { ideal: ED_CANVAS_H * 2 } },
      audio: false
    }).then(stream => {
      // Si closeCamera ya fue llamado mientras esperábamos la Promise, parar inmediatamente
      if (_camClosed) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      _edCameraStream = stream;
      video.srcObject = stream;
      overlay.classList.remove('hidden');
    }).catch(() => {});
  }

  startStream(_edCameraFacing);

  // Capturar foto
  const capBtn = $('edCameraCapture');
  const closeBtn = $('edCameraClose');
  const flipBtn = $('edCameraFlip');

  // Usar AbortController para limpiar listeners al cerrar
  const ac = new AbortController();
  const sig = { signal: ac.signal };

  // ── Pinch-to-zoom en el visor de cámara ──
  // Estrategia dual: zoom de hardware vía applyConstraints (si el track lo soporta),
  // con fallback a zoom CSS transform sobre el <video>.
  let _camZoom = 1, _camZoomMin = 1, _camZoomMax = 1, _camHwZoom = false;
  let _camPinchDist0 = null, _camZoom0 = 1;
  const _camPointers = new Map();

  function _camApplyZoom(z) {
    _camZoom = Math.max(_camZoomMin, Math.min(_camZoomMax, z));
    if(_camHwZoom && _edCameraStream) {
      const track = _edCameraStream.getVideoTracks()[0];
      if(track) track.applyConstraints({ advanced: [{ zoom: _camZoom }] }).catch(()=>{});
    } else {
      // Fallback: zoom CSS (crop visual del stream)
      video.style.transform = _camZoom > 1 ? `scale(${_camZoom})` : '';
    }
    // Mostrar indicador de zoom
    _camShowZoomBadge(_camZoom);
  }

  function _camShowZoomBadge(z) {
    let badge = document.getElementById('_camZoomBadge');
    if(!badge) {
      badge = document.createElement('div');
      badge.id = '_camZoomBadge';
      badge.style.cssText = 'position:absolute;top:16px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.55);color:#fff;font-size:1rem;font-weight:700;padding:4px 14px;border-radius:20px;pointer-events:none;transition:opacity .4s;z-index:10001;';
      overlay.appendChild(badge);
    }
    badge.textContent = z.toFixed(1) + '×';
    badge.style.opacity = '1';
    clearTimeout(badge._hide);
    badge._hide = setTimeout(() => { badge.style.opacity = '0'; }, 1500);
  }

  function _camInitZoom() {
    if(!_edCameraStream) return;
    const track = _edCameraStream.getVideoTracks()[0];
    if(!track) return;
    if(track.getCapabilities) {
      const caps = track.getCapabilities();
      if(caps.zoom) {
        _camZoomMin = caps.zoom.min || 1;
        _camZoomMax = Math.min(caps.zoom.max || 1, 10);
        _camHwZoom  = true;
        return;
      }
    }
    // Sin zoom de hardware: zoom CSS, rango visual razonable
    _camZoomMin = 1; _camZoomMax = 5; _camHwZoom = false;
  }

  function _camPinchDist(ptrs) {
    const [a, b] = [...ptrs.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // touch-action:none en el video para que el navegador no consuma el gesto de pinch
  video.style.touchAction = 'none';

  overlay.addEventListener('pointerdown', e => {
    // Capturar el puntero en el overlay para recibir move/up aunque salga del elemento
    try { overlay.setPointerCapture(e.pointerId); } catch(_){}
    _camPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if(_camPointers.size === 2) {
      _camInitZoom();
      _camPinchDist0 = _camPinchDist(_camPointers);
      _camZoom0 = _camZoom;
    }
  }, { signal: ac.signal, capture: true });

  overlay.addEventListener('pointermove', e => {
    if(!_camPointers.has(e.pointerId)) return;
    _camPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if(_camPointers.size === 2 && _camPinchDist0) {
      e.preventDefault();
      const dist = _camPinchDist(_camPointers);
      _camApplyZoom(_camZoom0 * (dist / _camPinchDist0));
    }
  }, { signal: ac.signal, capture: true, passive: false });

  const _camEndPtr = e => {
    _camPointers.delete(e.pointerId);
    if(_camPointers.size < 2) _camPinchDist0 = null;
  };
  overlay.addEventListener('pointerup',     _camEndPtr, { signal: ac.signal, capture: true });
  overlay.addEventListener('pointercancel', _camEndPtr, { signal: ac.signal, capture: true });

  function closeCamera(restoreFs = false) {
    // Pedir fullscreen PRIMERO — antes de parar stream, ocultar overlay, o cualquier otra acción.
    // El token de gesto está fresco y ninguna condición puede bloquearlo todavía.
    if(restoreFs && _camWasFullscreen && !(document.fullscreenElement || document.webkitFullscreenElement)){
      const _el = document.documentElement;
      const _req = _el.requestFullscreen || _el.webkitRequestFullscreen;
      if(_req) _req.call(_el, { navigationUI: 'hide' })
        .then(() => { if(typeof Fullscreen !== 'undefined') Fullscreen._updateBtn(); })
        .catch(() => {});
    }
    // Ahora cerrar todo
    _camClosed = true;
    if (_edCameraStream) {
      _edCameraStream.getTracks().forEach(t => t.stop());
      _edCameraStream = null;
    }
    video.pause();
    video.srcObject = null;
    video.style.transform   = '';
    video.style.touchAction = '';
    const _pids = [..._camPointers.keys()];
    _camPointers.clear();
    _camZoom = 1; _camPinchDist0 = null;
    for(const pid of _pids) { try{ overlay.releasePointerCapture(pid); }catch(_){} }
    overlay.classList.add('hidden');
    ac.abort();
  }

  capBtn?.addEventListener('click', () => {
    if (!_edCameraStream) return;
    // 1. Capturar frame del video en canvas (síncrono, mientras stream está vivo)
    const canvas = document.createElement('canvas');
    const track  = _edCameraStream.getVideoTracks()[0];
    const settings = track.getSettings();
    canvas.width  = settings.width  || video.videoWidth;
    canvas.height = settings.height || video.videoHeight;
    // Si se usó zoom CSS, usar las dimensiones recortadas directamente
    const _useZoom = !_camHwZoom && _camZoom > 1;
    if(_useZoom) {
      const z = _camZoom;
      const sw = Math.round((settings.width  || video.videoWidth)  / z);
      const sh = Math.round((settings.height || video.videoHeight) / z);
      const sx = Math.round(((settings.width  || video.videoWidth)  - sw) / 2);
      const sy = Math.round(((settings.height || video.videoHeight) - sh) / 2);
      canvas.width = sw; canvas.height = sh;
      canvas.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    } else {
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    }
    // 2. Cerrar cámara y restaurar FS SÍNCRONAMENTE dentro del gesto de usuario
    //    (antes de toBlob que es asíncrono y expira el token de gesto)
    closeCamera(true);
    // 3. Convertir canvas a blob y añadir imagen (asíncrono, FS ya solicitado)
    canvas.toBlob(blob => {
      if(blob) edAddImage(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  }, sig);

  closeBtn?.addEventListener('click', () => closeCamera(true), sig);

  flipBtn?.addEventListener('click', () => {
    _edCameraFacing = _edCameraFacing === 'environment' ? 'user' : 'environment';
    startStream(_edCameraFacing);
  }, sig);
}

/* ── T15: Importar archivo con capas (PSD / XCF / TIFF) ──
   Cada capa visible se convierte en un ImageLayer independiente en el editor.
   Las librerías se cargan dinámicamente desde CDN solo cuando se necesitan. */

async function _edLoadScript(url) {
  return new Promise((resolve, reject) => {
    if(document.querySelector(`script[src="${url}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = url; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function edImportLayers(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const buf = await file.arrayBuffer();

  // Cada capa se representa como {name, canvas, opacity, visible}
  let rawLayers = [];

  try {
    if(ext === 'psd') {
      // Cargar bundle UMD de ag-psd (expone window.agPsd)
      await _edLoadScript('https://unpkg.com/ag-psd@20.0.0/dist/bundle.js');
      // Inicializar el canvas factory para browser (obligatorio antes de readPsd)
      if(!window._agPsdInit) {
        window.agPsd.initializeCanvas(
          (w, h) => { const c=document.createElement('canvas'); c.width=w; c.height=h; return c; },
          (data) => {
            const img = new Image();
            img.src = 'data:image/jpeg;base64,' + window.agPsd.byteArrayToBase64(data);
            const c = document.createElement('canvas');
            c.width = img.width||1; c.height = img.height||1;
            c.getContext('2d').drawImage(img,0,0);
            return c;
          },
          (w, h) => new ImageData(w, h)
        );
        window._agPsdInit = true;
      }
      const psd = window.agPsd.readPsd(buf);

      // Helper: forzar alpha=255 en un canvas que no tiene canal alpha (capa Background)
      function _forceOpaque(canvas) {
        const ctx2 = canvas.getContext('2d');
        const id = ctx2.getImageData(0, 0, canvas.width, canvas.height);
        const d = id.data;
        let allTransparent = true;
        for(let i = 3; i < d.length; i += 4) { if(d[i] > 0) { allTransparent = false; break; } }
        if(allTransparent) {
          for(let i = 3; i < d.length; i += 4) d[i] = 255;
          ctx2.putImageData(id, 0, 0);
        }
        return canvas;
      }

      const _collectLayers = (children) => {
        const result = [];
        for(const layer of (children || [])) {
          if(layer.children && layer.children.length) {
            result.push(..._collectLayers(layer.children));
          } else if(layer.canvas) {
            result.push(layer);
          }
        }
        return result;
      };
      const flatLayers = _collectLayers(psd.children || []);
      for(const layer of flatLayers) {
        const lc = layer.transparencyProtected ? _forceOpaque(layer.canvas) : layer.canvas;
        rawLayers.push({
          name: layer.name || 'Capa',
          canvas: lc,
          opacity: (layer.opacity !== undefined ? layer.opacity : 1),
          visible: layer.hidden !== true
        });
      }
      // PSD children: orden de arriba a abajo → invertir para que [0] sea la inferior
      rawLayers.reverse();

    } else if(ext === 'xcf') {
      await _edLoadScript('https://cdn.jsdelivr.net/npm/xcfreader@0.0.6/dist/xcfreader.min.js');
      const xcf = new XCFReader(buf);
      const xcfLayers = xcf.layers || [];
      for(const layer of xcfLayers) {
        const lc = await layer.toCanvas();
        rawLayers.push({ name: layer.name || 'Capa', canvas: lc,
          opacity: layer.opacity !== undefined ? layer.opacity / 255 : 1,
          visible: layer.visible !== false });
      }
      // xcfreader devuelve capas de arriba a abajo → invertir para orden inferior→superior
      rawLayers.reverse();

    } else if(ext === 'tif' || ext === 'tiff') {
      await _edLoadScript('https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.min.js');
      const ifds = UTIF.decode(buf);
      for(let i = 0; i < ifds.length; i++) {
        UTIF.decodeImage(buf, ifds[i]);
        const rgba = UTIF.toRGBA8(ifds[i]);
        const lc = document.createElement('canvas');
        lc.width = ifds[i].width; lc.height = ifds[i].height;
        lc.getContext('2d').putImageData(
          new ImageData(new Uint8ClampedArray(rgba), ifds[i].width, ifds[i].height), 0, 0);
        rawLayers.push({ name: `Página ${i+1}`, canvas: lc, opacity: 1, visible: true });
      }
    }
  } catch(err) {
    edToast('Error al importar: ' + (err.message || err));
    return;
  }

  if(!rawLayers.length) { edToast('No se encontraron capas'); return; }

  // Filtrar invisibles
  const visible = rawLayers.filter(l => l.visible);
  if(!visible.length) { edToast('Todas las capas están ocultas'); return; }

  // ── Indicador de progreso ──
  let _progEl = document.getElementById('_edImportProgress');
  if(!_progEl) {
    _progEl = document.createElement('div');
    _progEl.id = '_edImportProgress';
    _progEl.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'background:rgba(20,20,20,0.92);color:#fff;font-family:inherit;font-size:.95rem;font-weight:600;' +
      'padding:16px 28px;border-radius:12px;z-index:99999;pointer-events:none;text-align:center;' +
      'box-shadow:0 4px 20px rgba(0,0,0,.5);';
    document.body.appendChild(_progEl);
  }
  const _setProgress = (i, total) => {
    _progEl.textContent = `Importando capa ${i} de ${total}…`;
    _progEl.style.display = 'block';
  };
  const _hideProgress = () => { _progEl.style.display = 'none'; };

  edPushHistory();

  // Convertir todos los rawLayers a ImageLayer en orden (inferior → superior)
  // rawLayers ya está ordenado de inferior a superior tras el .reverse()
  const newLayers = [];
  for(let i = 0; i < visible.length; i++) {
    const rl = visible[i];
    _setProgress(i + 1, visible.length);
    // Ceder el hilo para que el DOM actualice el indicador
    await new Promise(r => setTimeout(r, 0));
    const dataUrl = rl.canvas.toDataURL('image/png');
    await new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const layer = new ImageLayer(img, 0.5, 0.5, 0.7);
        const maxH = 0.85;
        if(layer.height > maxH){
          const scale = maxH / layer.height;
          layer.height = maxH; layer.width = layer.width * scale;
        }
        layer.opacity = Math.max(0, Math.min(1, rl.opacity));
        newLayers.push(layer);
        resolve();
      };
      img.src = dataUrl;
    });
  }

  _hideProgress();

  // Insertar todas las capas de golpe en el orden correcto (inferior primero),
  // justo antes del primer texto/bocadillo si lo hay
  const firstTextIdx = edLayers.findIndex(l => l.type==='text' || l.type==='bubble');
  if(firstTextIdx >= 0) {
    edLayers.splice(firstTextIdx, 0, ...newLayers);
    edSelectedIdx = firstTextIdx + newLayers.length - 1;
  } else {
    edLayers.push(...newLayers);
    edSelectedIdx = edLayers.length - 1;
  }

  edPages[edCurrentPage].layers = edLayers;
  edPushHistory(); edRedraw(); edRenderOptionsPanel('props');
  edToast(`${visible.length} capa${visible.length>1?'s':''} importada${visible.length>1?'s':''} ✓`);
}

function EditorView_destroy(){
  if(window._edListeners){
    window._edListeners.forEach(([el,evt,fn,opts])=>el.removeEventListener(evt,fn,opts));
    window._edListeners = null;
  }
  if(window._edWheelFn){
    window.removeEventListener('wheel', window._edWheelFn);
    window._edWheelFn = null;
  }
  if(window._edKeyFn){
    document.removeEventListener('keydown', window._edKeyFn);
    window._edKeyFn = null;
  }
  if(window._edDocDownFn){
    document.removeEventListener('pointerdown', window._edDocDownFn);
    window._edDocDownFn = null;
  }
  if(window._edResizeFn){
    window.removeEventListener('resize', window._edResizeFn);
    window._edResizeFn = null;
  }
  if(window._edOrientFn){
    window.removeEventListener('orientationchange', window._edOrientFn);
    window._edOrientFn = null;
  }
  if(window._edQuotaFn){
    window.removeEventListener('cx:storage:quota', window._edQuotaFn);
    window._edQuotaFn = null;
  }
  if(window._edPointerTypeFn){
    document.removeEventListener('pointerdown', window._edPointerTypeFn, true);
    window._edPointerTypeFn = null;
  }
  // Limpiar timers
  clearTimeout(window._edLongPress);
  // Parar cámara si estaba abierta
  if (_edCameraStream) {
    _edCameraStream.getTracks().forEach(t => t.stop());
    _edCameraStream = null;
  }
  edHideGearIcon();
}
function edSaveProjectModal(){
  const _newTitle = $('edMTitle').value.trim() || edProjectMeta.title;
  // Si el título cambia → crear obra nueva (nuevo ID), la anterior queda intacta
  if (_newTitle !== edProjectMeta.title) {
    const _oldId    = edProjectId;
    const _oldComic = ComicStore.getById(_oldId) || {};
    edProjectId = 'comic_' + Date.now();
    sessionStorage.setItem('cx_edit_id', edProjectId);
    // Migrar biblioteca del ID anterior al nuevo ID
    try {
      const _bibOldKey = 'cs_biblioteca_' + _oldId;
      const _bibNewKey = 'cs_biblioteca_' + edProjectId;
      const _bibData = localStorage.getItem(_bibOldKey);
      if (_bibData) localStorage.setItem(_bibNewKey, _bibData);
    } catch(e) {}
    ComicStore.save({
      ..._oldComic,
      id: edProjectId,
      title: _newTitle,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      published: false,
      approved:  false,
      pendingReview: false,
      supabaseId: null,
      cloudOnly:  false,
      cloudNewer: false,
    });
  }
  edProjectMeta.title  = _newTitle;
  edProjectMeta.author =$('edMAuthor').value.trim();
  edProjectMeta.genre  =$('edMGenre').value.trim();
  edProjectMeta.navMode=$('edMNavMode').value;
  edProjectMeta.social =($('edMSocial')?.value||'').trim().slice(0,300);
  const pt=$('edProjectTitle');if(pt)pt.textContent=edProjectMeta.title||'Sin título';
  edCloseProjectModal();edSaveProject();
}

/* ══════════════════════════════════════════
   TOAST
   ══════════════════════════════════════════ */

function edToast(msg,ms=2000){
  const t=$('edToast');if(!t)return;
  t.classList.remove('show');          // forzar reset antes de reanimar
  t.textContent=msg;
  // Pequeño frame para que el remove surta efecto antes del add
  requestAnimationFrame(()=>{
    t.classList.add('show');
    clearTimeout(t._t);
    t._t=setTimeout(()=>t.classList.remove('show'),ms);
  });
}

// Modal de confirmación propio — evita confirm() nativo que rompe fullscreen en Android
let _edConfirmCb = null;
function edConfirm(msg, onOk, okLabel='Eliminar'){
  const overlay = $('edConfirmModal');
  const msgEl   = $('edConfirmMsg');
  const okBtn   = $('edConfirmOk');
  const cancelBtn = $('edConfirmCancel');
  if(!overlay) { if(window.confirm(msg)) onOk(); return; } // fallback por si el DOM no está listo
  msgEl.textContent = msg;
  okBtn.textContent = okLabel;
  _edConfirmCb = onOk;
  overlay.classList.add('open');
  // Absorber todos los eventos de puntero para que no lleguen al canvas/edOnStart
  const _stopAll = e => e.stopPropagation();
  overlay.addEventListener('pointerdown', _stopAll, { capture: true });
  // Listeners de un solo uso
  const close = (exec) => {
    overlay.classList.remove('open');
    overlay.removeEventListener('pointerdown', _stopAll, { capture: true });
    okBtn.removeEventListener('click', onYes);
    cancelBtn.removeEventListener('click', onNo);
    if(exec && _edConfirmCb) _edConfirmCb();
    _edConfirmCb = null;
  };
  const onYes = () => close(true);
  const onNo  = () => close(false);
  okBtn.addEventListener('click', onYes);
  cancelBtn.addEventListener('click', onNo);
}

/* ══════════════════════════════════════════
   INIT
   ══════════════════════════════════════════ */
function EditorView_init(){
  // Limpiar estado de sesión anterior
  edHideGearIcon();
  const staleToast = $('edToast');
  if(staleToast){ staleToast.classList.remove('show'); clearTimeout(staleToast._t); }
  // Ocultar también el toast global (ej: "Bienvenido/a" del login)
  const globalToast = document.getElementById('toast');
  if(globalToast){ globalToast.classList.remove('show'); clearTimeout(globalToast._tid); }
  edCanvas=$('editorCanvas');
  edDrawCanvas=$('edDrawCanvas');
  // Habilitar botón Capas
  document.querySelector('[data-menu="layers"]')?.removeAttribute('disabled');
  document.querySelector('[data-menu="layers"]')?.style.removeProperty('opacity');
  document.querySelector('[data-menu="layers"]')?.style.removeProperty('cursor');
  edViewerCanvas=$('viewerCanvas');
  if(!edCanvas)return;
  edCtx=edCanvas.getContext('2d');
  if(edDrawCanvas) edDrawCtx=edDrawCanvas.getContext('2d');
  if(edViewerCanvas)edViewerCtx=edViewerCanvas.getContext('2d');

  const editId=sessionStorage.getItem('cx_edit_id');
  if(!editId){Router.go('my-comics');return;}
  edLoadProject(editId);
  sessionStorage.removeItem('cx_edit_id');

  // Aplicar orientación de la hoja 0 sin sobreescribir las demás hojas
  edSetOrientation(edPages[0]?.orientation || edOrientation, false);
  edActiveTool='select';
  const cur=$('edBrushCursor');if(cur)cur.style.display='none';

  // ── CANVAS ──
  // Usamos SOLO pointer events (unifican mouse + touch sin duplicados).
  // En Android un toque genera pointerdown+touchstart — usando solo pointer
  // evitamos que edOnStart se llame dos veces.
  // touch-action:none en editorShell permite que pointer events funcionen
  // en táctil sin interferencia del browser, pero sin bloquear overlays
  // (los overlays están en body, fuera del shell).
  const _shell = document.getElementById('editorShell');
  if(_shell) {
    _shell.style.touchAction = 'none';
    // Bloquear gestos de borde de Android (back gesture, recent apps)
    // Solo en editorShell — no en html/body para no romper fullscreen
    _shell.style.overscrollBehavior = 'none';
  }
  // Bloquear menú contextual dentro del editor — impide "Guardar imagen como..."
  // que disparan los botones laterales del lápiz/stylus en PC (estándar en Krita, Figma, etc.)
  if(_shell) _shell.addEventListener('contextmenu', e => { e.preventDefault(); }, { passive: false });
  window._edListeners = [
    [document, 'pointerdown',  edOnStart, {passive:false}],
    [document, 'pointermove',  edOnMove,  {passive:false}],
    [document, 'pointerup',    edOnEnd,   {}],
    [document, 'pointercancel',edOnEnd,   {}],
  ];
  window._edListeners.forEach(([el, evt, fn, opts]) => el.addEventListener(evt, fn, opts));
  // Bloquear gestos de borde de Android al dibujar (passive:false para poder preventDefault)
  // Solo se previene cuando el usuario está activamente dibujando (edPainting)
  if(edCanvas){
    edCanvas.addEventListener('touchstart', e => {
      if (window._gcpActive) { e.stopPropagation(); return; }
      // Solo bloquear gesto de borde con 1 dedo — nunca bloquear pinch (2 dedos)
      if(e.touches.length === 1 && ['draw','eraser','fill'].includes(edActiveTool)){
        e.preventDefault();
      }
    }, { passive: false });
  }
  // T5: Cerrar teclado virtual Android al pulsar Enter en inputs numéricos del panel
  (function(){
    const _panel = document.getElementById('edOptionsPanel');
    if(_panel){
      _panel.addEventListener('keydown', function(e){
        if(e.key==='Enter' && e.target.tagName==='INPUT' && e.target.type==='number'){
          e.preventDefault(); e.target.blur();
        }
      }, {passive:false});
    }
  })();

  // ── TOPBAR ──
  $('edBackBtn')?.addEventListener('click', () => {
    // Si hay guardado en la nube en curso, avisar con diálogo bloqueante
    if (_edCloudSaving) {
      const elapsed = Math.floor((Date.now() - _edCloudSavingStart) / 1000);
      const dlgCloud = document.createElement('div');
      dlgCloud.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center';
      dlgCloud.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:28px 24px;max-width:340px;width:90%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.3)">
          <div style="font-size:1.8rem;margin-bottom:12px">⚠️</div>
          <p style="font-weight:700;font-size:1rem;margin-bottom:8px">Guardado en nube en curso</p>
          <p id="_edCloudSavingBadge" style="font-size:.88rem;color:#e67e22;font-weight:700;margin-bottom:8px">☁️ Guardando en nube... ${elapsed}s</p>
          <p style="font-size:.85rem;color:#666;margin-bottom:24px">Salir del editor antes de que termine de guardarse en la nube guardará una copia defectuosa.</p>
          <div style="display:flex;gap:10px;justify-content:center">
            <button id="_edCloudExitAnyway" style="flex:1;padding:10px;border:1.5px solid #e74c3c;border-radius:10px;background:#fff;color:#e74c3c;font-weight:700;cursor:pointer;font-size:.85rem">Salir igualmente</button>
            <button id="_edCloudWait" style="flex:1;padding:10px;border:none;border-radius:10px;background:#f5c400;font-weight:700;cursor:pointer;font-size:.9rem">Esperar</button>
          </div>
        </div>`;
      document.body.appendChild(dlgCloud);
      // Actualizar contador en el diálogo mientras está abierto
      const _dlgTimer = setInterval(() => {
        const b = document.getElementById('_edCloudSavingBadge');
        if (b && _edCloudSaving) {
          const s = Math.floor((Date.now() - _edCloudSavingStart) / 1000);
          b.textContent = `☁️ Guardando en nube... ${s}s`;
        } else if (!_edCloudSaving) {
          clearInterval(_dlgTimer);
          dlgCloud.remove();
          Router.go('my-comics');
        }
      }, 500);
      document.getElementById('_edCloudWait').onclick = () => {
        clearInterval(_dlgTimer);
        dlgCloud.remove();
      };
      document.getElementById('_edCloudExitAnyway').onclick = () => {
        clearInterval(_dlgTimer);
        dlgCloud.remove();
        Router.go('my-comics');
      };
      return;
    }

    const hasUnsaved = edHistoryIdx !== _edSavedHistoryIdx;
    if (!hasUnsaved) { Router.go('my-comics'); return; }

    // Hay cambios sin guardar — preguntar
    const isNew = !ComicStore.getById(edProjectId)?.updatedAt ||
                  ComicStore.getById(edProjectId)?.updatedAt === ComicStore.getById(edProjectId)?.createdAt;

    const dlg = document.createElement('div');
    dlg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center';
    dlg.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:28px 24px;max-width:320px;width:90%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.3)">
        <div style="font-size:1.5rem;margin-bottom:12px">💾</div>
        <p style="font-weight:700;font-size:1rem;margin-bottom:8px">¿Guardar cambios?</p>
        <p style="font-size:.88rem;color:#666;margin-bottom:24px">Tienes cambios sin guardar en esta obra.</p>
        <div style="display:flex;gap:10px;justify-content:center">
          <button id="_edExitNo"  style="flex:1;padding:10px;border:1.5px solid #ddd;border-radius:10px;background:#fff;font-weight:700;cursor:pointer;font-size:.9rem">No guardar</button>
          <button id="_edExitYes" style="flex:1;padding:10px;border:none;border-radius:10px;background:#f5c400;font-weight:700;cursor:pointer;font-size:.9rem">Guardar</button>
        </div>
      </div>`;
    document.body.appendChild(dlg);

    // Click fuera del cuadro → cerrar y volver al editor
    dlg.addEventListener('click', e => { if(e.target===dlg){ dlg.remove(); } });

    document.getElementById('_edExitYes').onclick = () => {
      dlg.remove();
      edSaveProject();
      Router.go('my-comics');
    };
    document.getElementById('_edExitNo').onclick = () => {
      dlg.remove();
      // Si era obra nueva sin guardado previo, eliminarla
      if (isNew && edProjectId) {
        ComicStore.remove(edProjectId);
      } else {
        // Restaurar último estado guardado
        const saved = ComicStore.getById(edProjectId);
        if (saved) edLoadProject(edProjectId);
      }
      Router.go('my-comics');
    };
  });
  $('edPagePrev')?.addEventListener('click',()=>{ if(edCurrentPage>0) edLoadPage(edCurrentPage-1); });
  $('edPageNext')?.addEventListener('click',()=>{ if(edCurrentPage<edPages.length-1) edLoadPage(edCurrentPage+1); });
  function _edToggleMultiSel(){
    if(edActiveTool==='multiselect'){
      _edDeactivateMultiSel();
    } else {
      _msClear();
      edSelectedIdx=-1;
      edActiveTool='multiselect';
      edCanvas.className='tool-multiselect';
      $('edMultiSelBtn')?.classList.add('active');
      const panel=$('edOptionsPanel');
      if(panel){panel.classList.remove('open');panel.innerHTML='';}
      edRedraw();
    }
  }
  // _edDeactivateMultiSel definida en scope global

  // Botón multi-selección
  $('edMultiSelBtn')?.addEventListener('click', _edToggleMultiSel);
  // Tecla M para activar/desactivar
  // (el listener de teclado principal ya existe; lo añadimos aquí una sola vez)
  if(!window._edMultiSelKeyFn){
    window._edMultiSelKeyFn = e => {
      if(e.key==='m'||e.key==='M'){
        const active=document.activeElement;
        if(active && (active.tagName==='INPUT'||active.tagName==='TEXTAREA'||active.isContentEditable)) return;
        _edToggleMultiSel();
      }
      if(e.key==='Escape' && edActiveTool==='multiselect'){
        _edDeactivateMultiSel();
      }
    };
    document.addEventListener('keydown', window._edMultiSelKeyFn);
  }

  $('edZoomResetBtn')?.addEventListener('click',()=>{
    const pw=edPageW(), ph=edPageH();
    const fullZoom = Math.min(edCanvas.width/pw, edCanvas.height/ph);
    const workZoom = Math.min(edCanvas.width/ED_CANVAS_W, edCanvas.height/ED_CANVAS_H);
    const isAtFull = Math.abs(edCamera.z - fullZoom) < 0.01;
    window._edUserRequestedReset = true;
    if(isAtFull){
      edCamera.z = workZoom;
      edCamera.x = edCanvas.width/2  - ED_CANVAS_W/2 * workZoom;
      edCamera.y = edCanvas.height/2 - ED_CANVAS_H/2 * workZoom;
      window._edUserRequestedReset = false;
    } else {
      _edCameraReset();
    }
    edRedraw();
    _edScrollbarsUpdate();
  });
  $('edSaveBtn')?.addEventListener('click', () => edSaveProject());
  $('edCloudSaveBtn')?.addEventListener('click', edCloudSave);
  $('edPreviewBtn')?.addEventListener('click', edOpenViewer);
  // Botón pantalla completa en topbar
  // Llama requestFullscreen directamente (sin la guarda inPWA de Fullscreen.enter)
  // para que funcione siempre que el usuario lo pida explícitamente
  $('edFsBtn')?.addEventListener('click', () => {
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if(isFs) {
      (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
    } else {
      const el  = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if(req) req.call(el, { navigationUI: 'hide' })
        .then(() => { if(typeof Fullscreen!=='undefined') Fullscreen._updateBtn(); })
        .catch(() => {});
    }
  });
  const _edFsUpdate = () => {
    const btn = $('edFsBtn'); if(!btn) return;
    const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
    btn.textContent = active ? '⛶✕' : '⛶';
    btn.title = active ? 'Salir pantalla completa' : 'Pantalla completa';
  };
  document.addEventListener('fullscreenchange', _edFsUpdate);
  document.addEventListener('webkitfullscreenchange', _edFsUpdate);

  // ── MENÚ: botones dropdown (excluir layers y nav que tienen overlays propios) ──
  document.querySelectorAll('[data-menu]').forEach(btn=>{
    const id = btn.dataset.menu;
    if(id === 'layers' || id === 'nav') return; // tienen su propio handler
    btn.addEventListener('pointerup',e=>{e.stopPropagation();edToggleMenu(id);});
  });

  // ── INSERTAR ──
  $('dd-gallery')?.addEventListener('click',()=>{
    // Guardar estado fullscreen — el diálogo de archivo lo cancela en algunos navegadores
    window._edWasFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
    $('edFileGallery').click();
    edCloseMenus();
  });
  $('dd-animation')?.addEventListener('click',()=>{
    window._edWasFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
    $('edFileGif').click();
    edCloseMenus();
  });
  $('edAnimacionesBtn')?.addEventListener('click', () => { edCloseMenus(); gcpOpen(); });
  $('edFileGif')?.addEventListener('change', async e => {
    const _f = e.target.files[0]; e.target.value = '';
    if (!_f) return;
    edAddGif(_f);
    if(window._edWasFullscreen && !(document.fullscreenElement || document.webkitFullscreenElement)){
      setTimeout(()=>{ if(typeof Fullscreen!=='undefined') Fullscreen.enter(); }, 300);
    }
    window._edWasFullscreen = false;
  });

  $('dd-camera')?.addEventListener('click', ()=>{ edCloseMenus(); edOpenCamera(); });
  $('dd-textbox')?.addEventListener('click', ()=>{ edAddText(); edCloseMenus(); });
  $('dd-bubble')?.addEventListener('click',  ()=>{ edAddBubble(); edCloseMenus(); });
  $('edFileGallery')?.addEventListener('change', async e=>{
    const _f = e.target.files[0];
    e.target.value = '';
    if(!_f) return;
    const _ext = _f.name.split('.').pop().toLowerCase();
    if(_ext === 'psd' || _ext === 'xcf' || _ext === 'tif' || _ext === 'tiff'){
      await edImportLayers(_f);
    } else {
      edAddImage(_f);
    }
    // Restaurar fullscreen usando Fullscreen.enter() — gestiona todos los casos correctamente
    // Pequeño delay para que el navegador procese el cierre del selector antes de pedir FS
    if(window._edWasFullscreen && !(document.fullscreenElement || document.webkitFullscreenElement)){
      setTimeout(()=>{
        if(typeof Fullscreen !== 'undefined') Fullscreen.enter();
        // Forzar actualización visual del botón FS por si el estado quedó desincronizado
        if(typeof Fullscreen !== 'undefined') Fullscreen._updateBtn();
      }, 300);
    }
    window._edWasFullscreen = false;
  });

  // ── DIBUJAR ──
  $('dd-pen')?.addEventListener('click',()=>{
    // Guardar el estado previo antes de entrar al modo dibujo
    edPushHistory();
    edActiveTool='draw';
    edCanvas.className='tool-draw';
    if($('edBrushCursor'))$('edBrushCursor').style.display='block';
    _edDrawInitHistory();
    _edDrawLockUI();
    edRenderOptionsPanel('draw');edCloseMenus();
  });

  // ── POLÍGONOS (desde menú Insertar) ──
  function _esbActivate(shapeType, lineType) {
    edCloseMenus();
    edSelectedIdx = -1;
    edDrawFillColor = '#ffffff';
    if(shapeType) {
      _edShapeType = shapeType;
      edActiveTool = 'shape';
      edCanvas.className = 'tool-shape';
      setTimeout(() => _edActivateShapeTool(true), 0);
    } else {
      _edLineType = lineType || 'draw';
      edActiveTool = 'line';
      edCanvas.className = 'tool-line';
      setTimeout(() => _edActivateLineTool(), 0);
    }
  }
  $('dd-shape-rect')?.addEventListener('click', () => _esbActivate('rect'));
  $('dd-shape-ellipse')?.addEventListener('click', () => _esbActivate('ellipse'));
  $('dd-shape-line')?.addEventListener('click', () => _esbActivate(null, 'draw'));
  $('dd-shape-segment')?.addEventListener('click', () => _esbActivate(null, 'segment'));

  // T20: botón tipo-objeto con icono dinámico y popup selector
  function _esbGetActiveIcon() {
    if(edActiveTool === 'select') return '↖';
    if(edActiveTool === 'shape') return _edShapeType === 'ellipse' ? '◯' : '▭';
    if(edActiveTool === 'line')  return _edLineType === 'segment' ? '├─┤' : '╱';
    return '▭';
  }
  function _esbSyncTool() {
    const t = edActiveTool;
    const shapesBtn = $('esb-shapes');
    if(shapesBtn) shapesBtn.innerHTML = _esbGetActiveIcon();
    $('esb-fill')?.classList.toggle('active', t === 'fill');
    const dot = $('esb-size-dot');
    if(dot){ const sz=edDrawSize; const _dz3=typeof edCamera!=='undefined'?edCamera.z:1; const d=Math.max(3,Math.min(22,Math.round(sz*_dz3))); dot.style.width=d+'px'; dot.style.height=d+'px'; }
    const sw = $('esb-color'); if(sw) sw.style.background = edDrawColor;
  }

  // ── T20: Popup selector de tipo de objeto ──
  let _esbPopEl = document.getElementById('esb-shapes-pop');
  if(!_esbPopEl){
    _esbPopEl = document.createElement('div');
    _esbPopEl.id = 'esb-shapes-pop';
    _esbPopEl.style.cssText = 'position:fixed;z-index:1300;display:none;flex-direction:row;gap:6px;padding:8px 10px;background:rgba(24,24,28,.96);border:1px solid rgba(255,255,255,.13);border-radius:12px;box-shadow:0 4px 18px rgba(0,0,0,.45);align-items:center;';
    document.body.appendChild(_esbPopEl);
  }
  _esbPopEl.innerHTML = `
    <button class="edb-shape-btn" id="esb-shape-rect"    title="Rectángulo" style="font-size:1.1rem;min-width:32px;padding:4px 8px;background:transparent;border:none;color:#fff;cursor:pointer;border-radius:6px;">▭</button>
    <button class="edb-shape-btn" id="esb-shape-ellipse" title="Elipse"      style="font-size:1.1rem;min-width:32px;padding:4px 8px;background:transparent;border:none;color:#fff;cursor:pointer;border-radius:6px;">◯</button>
    <button class="edb-shape-btn" id="esb-shape-line"    title="Pol&#237;gono"    style="font-size:1.1rem;min-width:32px;padding:4px 8px;background:transparent;border:none;color:#fff;cursor:pointer;border-radius:6px;">╱</button>
    <button class="edb-shape-btn" id="esb-shape-segment" title="Segmento"    style="min-width:32px;padding:4px 6px;background:transparent;border:none;color:#fff;cursor:pointer;border-radius:6px;"><svg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'><line x1='13' y1='3' x2='3' y2='13' stroke='currentColor' stroke-width='1.8' stroke-linecap='round'/><line x1='10' y1='3' x2='13' y2='3' stroke='currentColor' stroke-width='1.8' stroke-linecap='round'/><line x1='3' y1='10' x2='3' y2='13' stroke='currentColor' stroke-width='1.8' stroke-linecap='round'/></svg></button>
    <button class="edb-shape-btn" id="esb-shape-select"  title="Selección"   style="font-size:1.1rem;min-width:32px;padding:4px 8px;background:transparent;border:none;color:#fff;cursor:pointer;border-radius:6px;">↖</button>`;

  function _esbMarkActivePop(){
    _esbPopEl.querySelectorAll('.edb-shape-btn').forEach(b => b.style.background='transparent');
    let activeId;
    if(edActiveTool==='shape') activeId = _edShapeType==='ellipse' ? 'esb-shape-ellipse' : 'esb-shape-rect';
    else if(edActiveTool==='line') activeId = _edLineType==='segment' ? 'esb-shape-segment' : 'esb-shape-line';
    else if(edActiveTool==='select') activeId = 'esb-shape-select';
    if(activeId){ const b=$(activeId); if(b) b.style.background='rgba(255,255,255,.15)'; }
  }

  // Handlers: usan _esbActivate exactamente igual que los botones del menú Insertar original
  $('esb-shape-rect')?.addEventListener('pointerup', e => {
    e.stopPropagation(); _esbClosePop();
    _esbActivate('rect');
    _esbSyncTool();
  });
  $('esb-shape-ellipse')?.addEventListener('pointerup', e => {
    e.stopPropagation(); _esbClosePop();
    _esbActivate('ellipse');
    _esbSyncTool();
  });
  $('esb-shape-line')?.addEventListener('pointerup', e => {
    e.stopPropagation(); _esbClosePop();
    if(_edLineLayer && _edLineLayer.points.length >= 2) _edFinishLine();
    _esbActivate(null, 'draw');
    _esbSyncTool();
  });
  $('esb-shape-segment')?.addEventListener('pointerup', e => {
    e.stopPropagation(); _esbClosePop();
    if(_edLineLayer && _edLineLayer.points.length >= 2) _edFinishLine();
    _esbActivate(null, 'segment');
    _esbSyncTool();
  });
  $('esb-shape-select')?.addEventListener('pointerup', e => {
    e.stopPropagation(); _esbClosePop();
    // T19: confirmar línea en construcción
    if(_edLineLayer && _edLineLayer.points.length >= 2) { _edFinishLine(); _esbSyncTool(); return; }
    if(_edLineLayer){ const _ix=edLayers.indexOf(_edLineLayer); if(_ix>=0) edLayers.splice(_ix,1); _edLineLayer=null; }
    edSelectedIdx=-1; edActiveTool='select'; edCanvas.className='';
    edRedraw(); _esbSyncTool();
  });

  function _esbClosePop(){
    _esbPopEl.style.display='none';
    document.removeEventListener('pointerdown', window._esbPopClose);
  }
  function _esbTogglePop(){
    if(_esbPopEl.style.display!=='none'){ _esbClosePop(); return; }
    _esbMarkActivePop();
    const bar=$('edShapeBar'), btn=$('esb-shapes');
    if(!bar||!btn) return;
    const isH=bar.classList.contains('horiz');
    const br=bar.getBoundingClientRect();
    _esbPopEl.style.display='flex';
    const pw=_esbPopEl.offsetWidth||160, ph=_esbPopEl.offsetHeight||52;
    let l,t;
    if(isH){ l=br.left+(br.width/2)-pw/2; t=br.top-ph-8; if(t<4)t=br.bottom+8; }
    else { l=br.right+8; t=br.top+(br.height/2)-ph/2; if(l+pw>window.innerWidth-4)l=br.left-pw-8; }
    _esbPopEl.style.left=Math.max(4,Math.min(window.innerWidth-pw-4,l))+'px';
    _esbPopEl.style.top=Math.max(4,Math.min(window.innerHeight-ph-4,t))+'px';
    setTimeout(()=>{
      window._esbPopClose=ev=>{
        if(!ev.target.closest('#esb-shapes-pop')&&!ev.target.closest('#esb-shapes'))
          _esbClosePop();
      };
      document.addEventListener('pointerdown',window._esbPopClose);
    },0);
  }
  $('esb-shapes')?.addEventListener('pointerup', e => { e.stopPropagation(); _esbTogglePop(); });
  // ── Seleccionar ──
  $('esb-select')?.addEventListener('pointerup', e => {
    e.stopPropagation();
    edSelectedIdx = -1; edActiveTool = 'select'; edCanvas.className = '';
    edRedraw(); _esbSyncTool();
  });
  // ── OK: igual que op-draw-ok pero cierra edShapeBar ──
  $('esb-ok')?.addEventListener('click', () => {
    if(edActiveTool === 'line' && _edLineLayer) _edFinishLine();
    _edApplyFillToClosedLayers(); // relleno al confirmar
    _edShapeClearHistory(); _vsClear(); edPushHistory(); // limpiar _vs* antes para que edPushHistory no quede bloqueado
    edShapeBarHide();
    edCloseOptionsPanel();
    edSelectedIdx=-1; edActiveTool='select'; edCanvas.className='';
    _edShapeStart=null; _edShapePreview=null; _edPendingShape=null;
    _edDrawUnlockUI();
    if(edMinimized){ window._edMinimizedDrawMode=null; edMaximize(); }
    else { _edResetCameraToFit(); }
    edRedraw();
  });

  $('dd-cleardraw')?.addEventListener('click',()=>{edClearDraw();edCloseMenus();});

  // ── NAVEGAR (Hoja → abre overlay) ──
  // El botón Hoja ▾ del menú abre el overlay de hojas
  const _navBtn = document.querySelector('[data-menu="nav"]');
  if(_navBtn){
    _navBtn.addEventListener('pointerup', e => {
      e.stopPropagation();
      edCloseMenus();
      edOpenPages();
    });
  }
  // Bindings del dropdown pequeño (ya no se usa, pero por si acaso)
  $('dd-addpage')?.addEventListener('click',()=>{edAddPage();edCloseMenus();});
  $('dd-delpage')?.addEventListener('click',()=>{edDeletePage();edCloseMenus();});
  $('dd-orientv')?.addEventListener('click',()=>{edSetOrientation('vertical');edCloseMenus();});
  $('dd-orienth')?.addEventListener('click',()=>{edSetOrientation('horizontal');edCloseMenus();});

  // ── PROYECTO ──
  $('dd-editproject')?.addEventListener('click',()=>{edOpenProjectModal();edCloseMenus();});
  $('dd-viewerjson')?.addEventListener('click',()=>{edOpenViewer();edCloseMenus();});
  $('dd-savejson')?.addEventListener('click',()=>{edDownloadJSON();edCloseMenus();});
  // Submenú Hoja actual (inline, igual que los demás submenús)
  $('dd-exportpagebtn')?.addEventListener('click', e => {
    e.stopPropagation();
    $('dd-export-page-sub')?.classList.toggle('open');
    $('dd-export-sel-sub')?.classList.remove('open');
  });
  // Submenú Selección (inline)
  $('dd-exportselbtn')?.addEventListener('click', e => {
    e.stopPropagation();
    $('dd-export-sel-sub')?.classList.toggle('open');
    $('dd-export-page-sub')?.classList.remove('open');
  });
  $('dd-exportselpng')?.addEventListener('click',()=>{ edExportSelectionPNG('png'); edCloseMenus(); });
  $('dd-exportseljpg')?.addEventListener('click',()=>{ edExportSelectionPNG('jpg'); edCloseMenus(); });
  // Submenú exportar: toggle inline al clicar
  // Submenús inline — mismo patrón que exportar
  $('dd-imagen-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    $('dd-imagen-sub')?.classList.toggle('open');
  });
  $('dd-texto-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    $('dd-texto-sub')?.classList.toggle('open');
  });
  $('dd-vectorial-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    $('dd-vectorial-sub')?.classList.toggle('open');
  });
  $('dd-exportbtn')?.addEventListener('click', e => {
    e.stopPropagation();
    $('dd-export-sub')?.classList.toggle('open');
  });
  $('dd-exportpng')?.addEventListener('click',()=>{edExportPagePNG('png');edCloseMenus();});
  $('dd-exportjpg')?.addEventListener('click',()=>{edExportPagePNG('jpg');edCloseMenus();});
  $('dd-loadjson')?.addEventListener('click',()=>{$('edLoadFile').click();edCloseMenus();});
  // Mostrar "Recuperar versión del dispositivo" si hay versión local guardada
  function _edUpdateRecoverBtn() {
    const btn = $('dd-recoverlocal');
    if(!btn || !edProjectId) return;
    const comic = ComicStore.getById(edProjectId);
    // Mostrar si hay backup local guardado (localEditorData)
    // Se guarda cuando se descarga la nube sobre un editorData local existente
    btn.style.display = (comic?.localEditorData?.pages?.length) ? '' : 'none';
  }

  // Actualizar al abrir el menú proyecto
  document.querySelector('[data-menu="project"]')?.addEventListener('pointerup', () => {
    setTimeout(_edUpdateRecoverBtn, 50);
  });

  $('dd-recoverlocal')?.addEventListener('click', () => {
    edCloseMenus();
    if(!edProjectId) return;
    const comic = ComicStore.getById(edProjectId);
    if(!comic?.localEditorData?.pages?.length) { edToast('No hay versión local guardada'); return; }
    if(!confirm('¿Restaurar la versión guardada en este dispositivo? Se perderán los cambios de la nube no guardados localmente.')) return;
    comic.editorData      = comic.localEditorData;
    comic.localEditorData = null;
    comic.cloudNewer      = false;
    comic.cloudOnly       = false;
    ComicStore.save(comic);
    edLoadProject(edProjectId);
    edToast('Versión del dispositivo restaurada ✓');
  });

  $('dd-deleteproject')?.addEventListener('click',()=>{
    edCloseMenus();
    if(!edProjectId){edToast('Sin proyecto activo');return;}
    edConfirm('¿Eliminar esta obra? Esta acción no se puede deshacer.', ()=>{
      ComicStore.remove(edProjectId);
      edToast('Obra eliminada');
      setTimeout(()=>Router.go('my-comics'),600);
    });
  });
  $('edLoadFile')?.addEventListener('change',e=>{edLoadFromJSON(e.target.files[0]);e.target.value='';});

  // ── CAPAS ──
  const _layersBtn = document.querySelector('[data-menu="layers"]');
  if(_layersBtn){
    _layersBtn.addEventListener('pointerup', e => {
      e.stopPropagation();
      edCloseMenus();
      edOpenLayers();
    });
  }

  // ── MINIMIZAR ──
  $('edUndoBtn')?.addEventListener('click', () => {
    if(['draw','eraser','fill'].includes(edActiveTool)) edDrawUndo();
    else if(($('edOptionsPanel')?.dataset.mode==='shape' || $('edOptionsPanel')?.dataset.mode==='line' || $('edShapeBar')?.classList.contains('visible')) && _edShapeHistIdx > _edShapeHistIdxBase) edShapeUndo();
    else edUndo();
  });
  $('edRedoBtn')?.addEventListener('click', () => {
    if(['draw','eraser','fill'].includes(edActiveTool)) edDrawRedo();
    else if(($('edOptionsPanel')?.dataset.mode==='shape' || $('edOptionsPanel')?.dataset.mode==='line' || $('edShapeBar')?.classList.contains('visible')) && _edShapeHistIdx < _edShapeHistory.length - 1) edShapeRedo();
    else edRedo();
  });
  $('edMinimizeBtn')?.addEventListener('click',edMinimize);
  // edMenuMinBtn eliminado — el único botón ocultar es edMinimizeBtn (fuera del scroll)
  _edShapePushHistory();
  edInitFloatDrag();
  edInitDrawBar();
  edInitShapeBar();
  edInitRules();
  edInitBiblioteca();
  // Avisar al usuario si localStorage se llena al guardar
  window._edQuotaFn = () => edToast('⚠️ Sin espacio: reduce el tamaño de las imágenes o elimina páginas', 5000);
  window.addEventListener('cx:storage:quota', window._edQuotaFn);

  // ── VISOR ──
  // Botón cerrar desktop (dentro de pastilla)
  ['click','pointerup'].forEach(ev=>{
    $('viewerClose')?.addEventListener(ev, e=>{
      e.stopPropagation(); edCloseViewer();
    });
  });
  // Botón cerrar móvil (táctil, centrado abajo)
  ['click','pointerup'].forEach(ev=>{
    $('viewerCloseMobile')?.addEventListener(ev, e=>{
      e.stopPropagation(); edCloseViewer();
    });
  });
  // Botón anterior (desktop)
  $('viewerPrev')?.addEventListener('pointerup', e=>{
    e.stopPropagation(); edShowViewerCtrls(); _viewerBack();
  });
  // Botón siguiente (desktop)
  $('viewerNext')?.addEventListener('pointerup', e=>{
    e.stopPropagation(); edShowViewerCtrls(); _viewerAdvance();
  });

  // ── MODAL PROYECTO ──
  $('edMCancel')?.addEventListener('click',edCloseProjectModal);
  $('edMSave')?.addEventListener('click',edSaveProjectModal);

  // ── Ctrl+Wheel: zoom del canvas ──
  window._edWheelFn = e => {
    if(!document.getElementById('editorShell')) return;
    // Si la rueda está sobre un elemento scrollable (overlay de capas, hojas, etc.)
    // dejarlo hacer scroll nativo — no intervenir
    const overScrollable = e.target.closest('.ed-layers-list, .ed-pages-grid, .ed-fulloverlay-box, #edOptionsPanel');
    if(overScrollable) return;
    e.preventDefault();
    if(e.ctrlKey || e.metaKey){
      // Zoom hacia el cursor
      const sx = e.clientX;
      const sy = e.clientY - _edCanvasTop;
      const factor = e.deltaY > 0 ? 1/1.1 : 1.1;
      edZoomAt(sx, sy, factor);
    } else {
      // Pan (sin Ctrl: trackpad two-finger scroll o rueda normal)
      edCamera.x -= e.deltaX;
      edCamera.y -= e.deltaY;
    }
    edRedraw();
    _edScrollbarsUpdate();
  };
  window.addEventListener('wheel', window._edWheelFn, {passive: false});

  // ── Teclado: Ctrl+Z / Ctrl+Y / Delete ──
  window._edKeyFn = function(e){
    if(!document.getElementById('editorShell')) return;
    // Editor GIF activo: flechas navegan entre frames
    if (window._gcpActive && _gcpGetTotalFrames() > 1) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        _gcpGoToFrame(Math.min(window._gcpGlobalFrameIdx + 1, _gcpGetTotalFrames() - 1));
        return;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        _gcpGoToFrame(Math.max(window._gcpGlobalFrameIdx - 1, 0));
        return;
      }
    }
    const tag = document.activeElement?.tagName?.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    // Bloquear shortcuts si hay un input con foco, EXCEPTO Ctrl+Z/Y
    // cuando hay herramienta de dibujo activa (los sliders del panel roban el foco)
    if(tag === 'input' || tag === 'textarea' || tag === 'select'){
      const isDrawTool = ['draw','eraser','fill'].includes(edActiveTool);
      const isUndoRedo = ctrl && (e.key.toLowerCase()==='z' || e.key.toLowerCase()==='y');
      if(!(isDrawTool && isUndoRedo)) return;
    }
    // Enter: cerrar panel de opciones abierto (OK)
    if(e.key === 'Enter' && !ctrl){
      const panel = $('edOptionsPanel');
      if(panel && panel.classList.contains('open')){
        e.preventDefault();
        edCloseOptionsPanel();
        if(['draw','eraser','fill'].includes(edActiveTool)) edDeactivateDrawTool();
        return;
      }
    }
    // ESC: cerrar menús desplegables y panel de opciones sin guardar
    if(e.key === 'Escape' && !ctrl){
      // Cerrar modal de guardado si está abierto
      const saveModal=document.querySelector('div[style*="z-index:99999"]');
      if(saveModal){ e.preventDefault(); saveModal.remove(); return; }
      // Cerrar popup de curva si está abierto
      _esbHideSlider();
      // Cerrar menú desplegable si está abierto
      if(edMenuOpen){ e.preventDefault(); edCloseMenus(); return; }
      // Cerrar panel de opciones si está abierto (sin guardar)
      const panel = $('edOptionsPanel');
      if(panel && panel.classList.contains('open')){
        e.preventDefault();
        const mode = panel.dataset.mode;
        if(mode === 'shape' || mode === 'line'){
          _edShapeStart=null; _edShapePreview=null; _edPendingShape=null;
          if(_edLineLayer && _edLineLayer.points.length < 2){
            const idx=edLayers.indexOf(_edLineLayer);
            if(idx>=0) edLayers.splice(idx,1);
          }
          _edLineLayer=null;
          edActiveTool='select'; edCanvas.className='';
          _edDrawUnlockUI();
        } else if(mode === 'draw' || ['draw','eraser','fill'].includes(edActiveTool)){
          edDeactivateDrawTool();
        } else {
          _edDrawUnlockUI();
        }
        edCloseOptionsPanel();
        edSelectedIdx=-1; edRedraw();
        return;
      }
    }
    // Ctrl+D → duplicar objeto seleccionado
    if(ctrl && e.key.toLowerCase() === 'd'){
      if(edSelectedIdx >= 0){ e.preventDefault(); edDuplicateSelected(); }
      return;
    }
    // Ctrl+] subir | Ctrl+[ bajar | Ctrl+Alt+] al frente | Ctrl+Alt+[ al fondo
    // (estándar Figma / Illustrator / Photoshop)
    if(ctrl && (e.key === ']' || e.key === '[')){
      if(edSelectedIdx >= 0){
        e.preventDefault();
        const page = edPages[edCurrentPage]; if(!page) return;
        const layers = page.layers;
        const idx = edSelectedIdx;
        if(e.altKey){
          if(e.key === ']' && idx < layers.length - 1){
            const [moved] = layers.splice(idx, 1);
            layers.push(moved);
            edSelectedIdx = layers.length - 1;
            edPushHistory(); edRedraw(); edToast('Al frente ⬆');
          } else if(e.key === '[' && idx > 0){
            const [moved] = layers.splice(idx, 1);
            layers.unshift(moved);
            edSelectedIdx = 0;
            edPushHistory(); edRedraw(); edToast('Al fondo ⬇');
          }
        } else {
          if(e.key === ']' && idx < layers.length - 1){
            [layers[idx], layers[idx+1]] = [layers[idx+1], layers[idx]];
            edSelectedIdx = idx + 1;
            edPushHistory(); edRedraw(); edToast('Capa subida ▲');
          } else if(e.key === '[' && idx > 0){
            [layers[idx], layers[idx-1]] = [layers[idx-1], layers[idx]];
            edSelectedIdx = idx - 1;
            edPushHistory(); edRedraw(); edToast('Capa bajada ▼');
          }
        }
      }
      return;
    }
    if((e.key === 'Delete' || e.key === 'Backspace') && !ctrl){
      if(edActiveTool==='multiselect' && edMultiSel.length){
        e.preventDefault();
        const page=edPages[edCurrentPage]; if(!page) return;
        // Guardar estado actual (con objetos) antes de borrar
        // Usamos el mismo patrón que edDeleteSelected
        const toDelete=[...edMultiSel].sort((a,b)=>b-a);
        toDelete.forEach(i=>{ page.layers.splice(i,1); });
        edLayers=page.layers;
        _edDeactivateMultiSel();
        edSelectedIdx=-1;
        _edShapePushHistory(); // igual que edDeleteSelected: push DESPUÉS del borrado
        edRedraw();
      } else if(edSelectedIdx >= 0){
        e.preventDefault(); edDeleteSelected();
      }
      return;
    }
    // Shift+flechas (PC): añadir a la multiselección el objeto más cercano en esa dirección
    // Busca siempre desde el objeto ANCLA (el primero seleccionado), no desde el centroide.
    // Así se puede saltar objetos intermedios y seleccionar cualquier objeto no contiguo.
    if(e.shiftKey && !ctrl && (e.key==='ArrowUp'||e.key==='ArrowDown'||e.key==='ArrowLeft'||e.key==='ArrowRight')){
      if(!window._edIsTouch && edLayers.length > 0){
        e.preventDefault();
        const pw = edPageW(), ph = edPageH();
        const curSel = edActiveTool==='multiselect' ? [...edMultiSel]
                     : edSelectedIdx >= 0 ? [edSelectedIdx] : [];
        if(curSel.length === 0) return;
        // Punto de referencia: ancla fija (primer objeto de la selección original)
        // NO el centroide — así cada flecha busca desde el mismo punto de partida
        // y se pueden saltar objetos intermedios sin problema.
        const anchorIdx = (edMultiSelAnchor >= 0 && curSel.includes(edMultiSelAnchor))
          ? edMultiSelAnchor : curSel[0];
        const anchor = edLayers[anchorIdx];
        if(!anchor) return;
        const ax = anchor.x, ay = anchor.y;
        let bestIdx = -1, bestScore = Infinity;
        edLayers.forEach((la, i) => {
          if(curSel.includes(i)) return;
          const dx = (la.x - ax) * pw;
          const dy = (la.y - ay) * ph;
          let inDir = false;
          if(e.key==='ArrowRight' && dx >  Math.abs(dy)*0.3) inDir=true;
          if(e.key==='ArrowLeft'  && dx < -Math.abs(dy)*0.3) inDir=true;
          if(e.key==='ArrowDown'  && dy >  Math.abs(dx)*0.3) inDir=true;
          if(e.key==='ArrowUp'    && dy < -Math.abs(dx)*0.3) inDir=true;
          if(!inDir) return;
          const dist = Math.hypot(dx, dy);
          if(dist < bestScore){ bestScore=dist; bestIdx=i; }
        });
        if(bestIdx < 0) return;
        const combined = [...new Set([...curSel, bestIdx])];
        if(combined.length >= 2){
          edMultiSel = combined;
          edSelectedIdx = -1;
          edActiveTool = 'multiselect';
          edCanvas.className = 'tool-multiselect';
          $('edMultiSelBtn')?.classList.add('active');
          _msRecalcBbox();
          _edUpdateMultiSelPanel();
        }
        edRedraw();
      }
      return;
    }
    if(!ctrl) return;
    const _vecActive = $('edOptionsPanel')?.dataset.mode==='shape' || $('edOptionsPanel')?.dataset.mode==='line' || $('edShapeBar')?.classList.contains('visible');
    if(!e.shiftKey && e.key.toLowerCase() === 'z'){
      e.preventDefault();
      if(['draw','eraser','fill'].includes(edActiveTool)) edDrawUndo();
      else if(_vecActive && _edShapeHistIdx > _edShapeHistIdxBase) edShapeUndo();
      else edUndo();
    }
    else if(e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')){
      e.preventDefault();
      if(['draw','eraser','fill'].includes(edActiveTool)) edDrawRedo();
      else if(_vecActive && _edShapeHistIdx < _edShapeHistory.length - 1) edShapeRedo();
      else edRedo();
    }
  };
  document.addEventListener('keydown', window._edKeyFn);

  // Detectar si el dispositivo está usando táctil — se actualiza con cualquier pointerdown
  // Se usa en _edPickColor para elegir el picker correcto (HSL vs nativo)
  window._edIsTouch = navigator.maxTouchPoints > 0 && !window.matchMedia('(pointer:fine)').matches;
  window._edPointerTypeFn = ev => {
    if(ev.pointerType==='touch') window._edIsTouch=true;
    else if(ev.pointerType==='mouse') window._edIsTouch=false;
  };
  document.addEventListener('pointerdown', window._edPointerTypeFn, true);
  // Inicializar barras de navegación HTML (solo PC)
  setTimeout(_edInitHTMLScrollbars, 400);

  // ── RESIZE ──
  // Guardar referencia para cleanup en EditorView_destroy
  window._edResizeFn = () => { edFitCanvas(false); }; // solo reajustar tamaño, nunca resetear cámara
  window.addEventListener('resize', window._edResizeFn);

  // Fit canvas con reintentos hasta que las medidas sean reales
  // (el CSS se carga dinámicamente y las fuentes tardan en aplicar)
  function _edInitFit(attemptsLeft) {
    const topbar = $('edTopbar');
    const menu   = $('edMenuBar');
    const topH   = topbar ? topbar.getBoundingClientRect().height : 0;
    const menuH  = menu   ? menu.getBoundingClientRect().height   : 0;
    if (topH > 10 && menuH > 10) {
      window._edUserRequestedReset=true; edFitCanvas(true); edRedraw(); return;
    }
    if (attemptsLeft <= 0) {
      window._edUserRequestedReset=true; edFitCanvas(true); edRedraw(); return;
    }
    requestAnimationFrame(() => _edInitFit(attemptsLeft - 1));
  }
  // Primer intento tras doble rAF; si falla reintenta hasta 30 frames (~500ms)
  requestAnimationFrame(() => requestAnimationFrame(() => _edInitFit(30)));

  // Cerrar herramienta de dibujo al tocar fuera del canvas
  window._edDocDownFn = e => {
    if (window._gcpActive) {
      // Ignorar taps en UI del editor GIF — dejar que sus propios listeners actúen
      const _gcpUiEl = e.target?.closest?.('#gcpFramesBar, #gcpMenuBar, #gcpTopbar, #edOptionsPanel, [data-gcpmenu]');
      if (_gcpUiEl) {
        return; // Es UI del GIF — dejar que sus propios listeners actúen
      } else {
        _gcpHandleDown(e);
        return;
      }
    }
    // Ignorar clicks en zona de barra bloqueada (pointer-events:none deja pasar coords)
    const _menuBar2=$('edMenuBar');
    if(_menuBar2 && $('editorShell')?.classList.contains('draw-active')){
      const _mbr2=_menuBar2.getBoundingClientRect();
      if(e.clientX>=_mbr2.left&&e.clientX<=_mbr2.right&&e.clientY>=_mbr2.top&&e.clientY<=_mbr2.bottom) return;
    }
    // Cerrar menús y submenús al tocar fuera — solo si NO hay bloqueo activo
    const _drawActive=$('editorShell')?.classList.contains('draw-active');
    if(!_drawActive && edMenuOpen){
      const _inDropdown=e.target.closest('.ed-dropdown')||e.target.closest('.ed-subdropdown')||e.target.closest('.ed-submenu')||e.target.closest('[data-menu]');
      if(!_inDropdown){ edCloseMenus(); }
    }

    if(['draw','eraser','fill','shape','line'].includes(edActiveTool)){
      const inCanvas   = e.target.closest('#editorCanvas');
      const inPanel    = e.target.closest('#edOptionsPanel');
      const inMenu     = e.target.closest('#edMenuBar');
      const inTopbar   = e.target.closest('#edTopbar');
      const inFloat    = e.target.closest('#edFloatBtn');
      const inDrawBar  = e.target.closest('#edDrawBar');
      const inShapeBar = e.target.closest('#edShapeBar');
      const inPalPop   = e.target.closest('#edb-palette-pop');
      const inShapePop = e.target.closest('#edb-palette-pop');
      const inHSL      = e.target.closest('#ed-hsl-picker');
      // Guards: no cancelar si estamos pintando activamente o timer táctil pendiente
      const _drawSafe = edPainting || !!window._edDrawTouchTimer || !!window._edLineTouchTimer;
      if(!inCanvas && !inPanel && !inMenu && !inTopbar && !inFloat && !inDrawBar && !inShapeBar && !inPalPop && !inShapePop && !inHSL && !_drawSafe){
        if(['draw','eraser','fill'].includes(edActiveTool)) edDeactivateDrawTool();
      }
    }
    // Deseleccionar shape/line al tocar fuera del canvas con barra flotante activa
    if(($('edDrawBar')?.classList.contains('visible') || $('edShapeBar')?.classList.contains('visible')) && edSelectedIdx >= 0){
      const _la = edLayers[edSelectedIdx];
      if(_la && (_la.type==='shape' || _la.type==='line')){
        const inCanvas   = e.target.closest('#editorCanvas');
        const inDrawBar  = e.target.closest('#edDrawBar');
        const inShapeBar = e.target.closest('#edShapeBar');
        const inPanel    = e.target.closest('#edOptionsPanel');
        const inMenuBar  = e.target.closest('#edMenuBar');
        const inTopbar   = e.target.closest('#edTopbar');
        const inCurvePop = e.target.closest('#esb-curve-pop') || e.target.id==='esb-curve';
        const inHSLPop   = e.target.closest('#ed-hsl-picker');
        const curveOn=$('esb-curve')?.dataset.curveActive==='1';
        if(!inCanvas && !inDrawBar && !inShapeBar && !inPanel && !inMenuBar && !inTopbar && !inCurvePop && !inHSLPop && !curveOn){
          edSelectedIdx = -1;
          edActiveTool = 'select';
          edCanvas.className = '';
          edRedraw();
        }
      }
    }

  };
  document.addEventListener('pointerdown', window._edDocDownFn);

  // Handlers de pointermove/pointerup para el canvas GIF
  // Registrados en document igual que los del editor general
  window._gcpMoveFn = e => { if (window._gcpActive) _gcpHandleMove(e); };
  window._gcpUpFn   = e => { if (window._gcpActive) _gcpHandleUp(e); };
  document.addEventListener('pointermove', window._gcpMoveFn, { passive: false });
  document.addEventListener('pointerup',   window._gcpUpFn);
  document.addEventListener('pointercancel', window._gcpUpFn);


  // ── FULLSCREEN CANVAS ON ORIENTATION MATCH ──
  edUpdateCanvasFullscreen();
  // Guardar referencia para cleanup en EditorView_destroy
  window._edOrientFn = () => { setTimeout(()=>{ window._edUserRequestedReset=true; edFitCanvas(true); }, 200); };
  window.addEventListener('orientationchange', window._edOrientFn);

  // ── Pinch en cualquier zona (fuera del canvas) = zoom ──
  let _shellPinch0 = 0, _shellZoom0 = 1;
  const editorShell = document.getElementById('editorShell');
  if(editorShell){
    let _pinchPrev = 0, _pinchMidX = 0, _pinchMidY = 0;
    editorShell.addEventListener('touchstart', e => {
      if (window._gcpActive) {
        const optPanel = document.getElementById('edOptionsPanel');
        if (!optPanel || !optPanel.contains(e.target)) return;
      }
      if(e.target.closest('#edOptionsPanel')) return; // no interferir con scroll del panel
      if(e.touches.length === 2){
        // No hacer zoom de cámara si hay objeto seleccionado, multiselección activa o modo dibujo
        if(edSelectedIdx >= 0 || (edActiveTool==='multiselect' && edMultiSel.length) || ['draw','eraser'].includes(edActiveTool)){ _pinchPrev = 0; return; }
        _pinchPrev = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        _pinchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        _pinchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - _edCanvasTop;
      }
    }, {passive:true});
    editorShell.addEventListener('touchmove', e => {
      if(e.target.closest('#edOptionsPanel')) return; // no interferir con scroll del panel
      if(e.touches.length === 2 && _pinchPrev > 0){
        e.preventDefault();
        // No hacer zoom de cámara si hay objeto seleccionado o multiselección activa
        if(edSelectedIdx >= 0 || (edActiveTool==='multiselect' && edMultiSel.length)) return;
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = dist / _pinchPrev;
        edZoomAt(_pinchMidX, _pinchMidY, factor);
        _pinchPrev = dist;
        edRedraw();
        _edScrollbarsUpdate();
      }
    }, {passive:false});
    editorShell.addEventListener('touchend', ()=>{ _pinchPrev = 0; }, {passive:true});
  }

  // Seguro extra: si después de 600ms el canvas sigue muy pequeño, refitear
  setTimeout(() => {
    if (edCanvas && parseInt(edCanvas.style.height || '0') < 50) {
      edFitCanvas(); edRedraw();
    }
  }, 600);
}

/* ── DESCARGAR / CARGAR JSON ── */
function edDownloadJSON(){
  edSaveProject();
  const data=localStorage.getItem('cs_comics');
  const comic=ComicStore.getById(edProjectId);if(!comic)return;
  const blob=new Blob([JSON.stringify(comic,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=(edProjectMeta.title||'proyecto').replace(/\s+/g,'_')+'.json';
  a.click();
}
// Exportar la hoja actual como PNG o JPG
// Renderiza en canvas offscreen con transform z=1, desplazado al origen de la página
function edExportPagePNG(format){
  format = format || 'png';
  edSaveProject();
  const pw = Math.round(edPageW()), ph = Math.round(edPageH());
  const mx = edMarginX(), my = edMarginY();
  const page = edPages[edCurrentPage]; if(!page) return;

  const off    = document.createElement('canvas');
  off.width    = pw;
  off.height   = ph;
  const offCtx = off.getContext('2d', { alpha: true });

  // Fondo: blanco para JPG (no soporta transparencia), transparente para PNG
  if(format === 'jpg'){
    offCtx.fillStyle = '#ffffff';
    offCtx.fillRect(0, 0, pw, ph);
  }
  // PNG: sin fillRect → fondo transparente

  // Transform: z=1, origen en esquina superior izquierda de la página
  // (equivale a setTransform(1,0,0,1, -mx, -my) en coords workspace)
  offCtx.setTransform(1, 0, 0, 1, -mx, -my);

  // Renderizar capas en el mismo orden que edRedraw (sin UI, sin handles, sin borde azul)
  const _textLayers   = edLayers.filter(l => l.type==='text' || l.type==='bubble');
  const _textGroupAlpha = page.textLayerOpacity ?? 1;

  // Mismo orden que edRedraw: imagen → stroke → draw → shape/line → textos al final
  edLayers.forEach(l => {
    if(!l) return;
    if(l.type==='text' || l.type==='bubble') return; // textos al final
    if(l.type === 'image'){
      l.draw(offCtx, off);
    } else if(l.type === 'draw'){
      offCtx.globalAlpha = 1;
      l.draw(offCtx);
      offCtx.globalAlpha = 1;
    } else if(l.type === 'stroke'){
      offCtx.globalAlpha = l.opacity ?? 1;
      l.draw(offCtx);
      offCtx.globalAlpha = 1;
    } else if(l.type === 'shape' || l.type === 'line'){
      offCtx.globalAlpha = l.opacity ?? 1;
      l.draw(offCtx);
      offCtx.globalAlpha = 1;
    }
  });
  offCtx.globalAlpha = _textGroupAlpha;
  _textLayers.forEach(l => l.draw(offCtx, off));
  offCtx.globalAlpha = 1;

  // Descargar
  const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const quality  = format === 'jpg' ? 0.92 : undefined;
  off.toBlob(blob => {
    if(!blob){ edToast('Error al exportar'); return; }
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    const title = (edProjectMeta.title || 'hoja').replace(/\s+/g, '_');
    const pg    = edCurrentPage + 1;
    a.href      = url;
    a.download  = `${title}_hoja${pg}.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    edToast(`Hoja ${pg} exportada ✓`);
  }, mimeType, quality);
}

function edExportSelectionPNG(format) {
  format = format || 'png';
  // Calcular bbox de la selección (single o multi)
  let bb = null;
  if(edMultiSel.length >= 2) {
    bb = _msBBox();
  } else if(edSelectedIdx >= 0) {
    const la = edLayers[edSelectedIdx];
    if(la) {
      const pw2 = edPageW(), ph2 = edPageH();
      const rot = (la.rotation||0)*Math.PI/180;
      const hw = la.width/2, hh = la.height/2;
      let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
      for(const [cx,cy] of [[-hw,-hh],[hw,-hh],[-hw,hh],[hw,hh]]){
        const wx=cx*pw2, wy=cy*ph2;
        const rx=(wx*Math.cos(rot)-wy*Math.sin(rot))/pw2;
        const ry=(wx*Math.sin(rot)+wy*Math.cos(rot))/ph2;
        x0=Math.min(x0,la.x+rx); y0=Math.min(y0,la.y+ry);
        x1=Math.max(x1,la.x+rx); y1=Math.max(y1,la.y+ry);
      }
      bb = {x0,y0,x1,y1,w:x1-x0,h:y1-y0,cx:(x0+x1)/2,cy:(y0+y1)/2};
    }
  }
  if(!bb || bb.w < 0.001 || bb.h < 0.001) { edToast('Selecciona objetos primero'); return; }

  const pw = edPageW(), ph = edPageH();
  const mx = edMarginX(), my = edMarginY();
  const page = edPages[edCurrentPage]; if(!page) return;

  // Canvas del tamaño exacto del bbox de selección en px
  const bxPx = Math.ceil(bb.w * pw);
  const byPx = Math.ceil(bb.h * ph);
  const off = document.createElement('canvas');
  off.width  = bxPx;
  off.height = byPx;
  const offCtx = off.getContext('2d', { alpha: true });

  if(format === 'jpg'){ offCtx.fillStyle='#ffffff'; offCtx.fillRect(0,0,bxPx,byPx); }

  // Transform: mapear coords workspace al canvas de exportación
  // El origen del canvas exportado corresponde a (mx + bb.x0*pw, my + bb.y0*ph) en workspace
  offCtx.setTransform(1, 0, 0, 1, -(mx + bb.x0*pw), -(my + bb.y0*ph));

  // Renderizar solo las capas seleccionadas
  const selSet = edMultiSel.length >= 2
    ? new Set(edMultiSel.map(i => edLayers[i]).filter(Boolean))
    : new Set([edLayers[edSelectedIdx]].filter(Boolean));

  const _textLayers = [...selSet].filter(l => l.type==='text'||l.type==='bubble');
  const _textAlpha  = page.textLayerOpacity ?? 1;

  [...selSet].forEach(l => {
    if(!l || l.type==='text'||l.type==='bubble') return;
    if(l.type==='image'){ l.draw(offCtx, off); }
    else { offCtx.globalAlpha = l.opacity ?? 1; l.draw(offCtx); offCtx.globalAlpha = 1; }
  });
  offCtx.globalAlpha = _textAlpha;
  _textLayers.forEach(l => l.draw(offCtx, off));
  offCtx.globalAlpha = 1;

  const mimeType = format==='jpg' ? 'image/jpeg' : 'image/png';
  const quality  = format==='jpg' ? 0.92 : undefined;
  off.toBlob(blob => {
    if(!blob){ edToast('Error al exportar'); return; }
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href    = url;
    a.download = `${(edProjectMeta.title||'seleccion').replace(/\s+/g,'_')}_sel.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    edToast('Selección exportada ✓');
  }, mimeType, quality);
}

function edLoadFromJSON(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const data=JSON.parse(e.target.result);
      if(data.editorData){
        edProjectMeta={title:data.title||'',author:data.author||'',genre:data.genre||'',navMode:data.navMode||'fixed',social:data.social||''};
        edOrientation=data.editorData.orientation||'vertical';
        edPages=(data.editorData.pages||[]).map(pd=>({
          drawData:pd.drawData||null,
          layers:(pd.layers||[]).map(d=>edDeserLayer(d, pd.orientation||data.editorData.orientation||'vertical')).filter(Boolean),
          textLayerOpacity:pd.textLayerOpacity??1,
          textMode:pd.textMode||'sequential',
          orientation:pd.orientation||data.editorData.orientation||'vertical',
        }));
        if(!edPages.length)edPages.push({layers:[],drawData:null,textLayerOpacity:1,textMode:'sequential'});
        edCurrentPage=0;edLayers=edPages[0].layers;
        edSetOrientation(edOrientation);
        const pt=$('edProjectTitle');if(pt)pt.textContent=edProjectMeta.title;
        edToast('Proyecto cargado ✓');
      }
    }catch(err){edToast('Error al cargar el archivo');}
  };
  reader.readAsText(file);
}

// ═══════════════════════════════════════════════════════════════
// ── BIBLIOTECA (T8) ─────────────────────────────────────────────
// Estructura localStorage cs_biblioteca:
// { folders: [{id, name, items:[{id,timestamp,layerData,thumb}]}] }
// items sin carpeta → folder id='__root__'
// Límite global: 30 objetos entre todas las carpetas.
// ═══════════════════════════════════════════════════════════════

const _BIB_KEY_PREFIX = 'cs_biblioteca';
const _BIB_MAX_BYTES  = 3 * 1024 * 1024; // 3 MB — tope de memoria para la biblioteca
const _BIB_THUMB_SIZE = 80;

// Clave de localStorage: por proyecto si hay proyecto activo
function _bibKey() {
  return edProjectId ? `${_BIB_KEY_PREFIX}_${edProjectId}` : _BIB_KEY_PREFIX;
}

// ── Storage ──────────────────────────────────────────────────────
function _bibLoad() {
  try {
    const d = JSON.parse(localStorage.getItem(_bibKey()) || 'null');
    if (d && Array.isArray(d.folders)) {
      // Garantizar que la carpeta Animaciones siempre existe
      if (!d.folders.find(f => f.name === 'Animaciones')) {
        d.folders.push({ id: '__anim__', name: 'Animaciones', items: [] });
      }
      return d;
    }
  } catch(e) {}
  // Migración: formato antiguo era array plano o clave global
  let oldItems = [];
  try {
    // Intentar migrar desde la clave global si existe y este proyecto no tiene datos propios
    const global = JSON.parse(localStorage.getItem(_BIB_KEY_PREFIX) || 'null');
    if(global && Array.isArray(global.folders)) {
      // No migrar automáticamente — cada proyecto empieza vacío
    }
    oldItems = JSON.parse(localStorage.getItem(_bibKey()) || '[]');
    if (!Array.isArray(oldItems)) oldItems = [];
  } catch(e) {}
  const defaultData = { folders: [
    { id: '__root__', name: 'General', items: oldItems },
    { id: '__anim__', name: 'Animaciones', items: [] }
  ]};
  return defaultData;
}
function _bibSave(data) {
  try { localStorage.setItem(_bibKey(), JSON.stringify(data)); }
  catch(e) { edToast('⚠️ Sin espacio en biblioteca'); }
}
// Bytes estimados de la biblioteca (suma del JSON de cada item)
function _bibUsedBytes(data) {
  return data.folders.reduce((s, f) =>
    s + f.items.reduce((s2, it) => s2 + (it.thumb ? it.thumb.length : 0)
      + (it.layerData ? JSON.stringify(it.layerData).length : 0)
      + (it.layers   ? JSON.stringify(it.layers).length   : 0), 0), 0);
}
function _bibTotalItems(data) {
  return data.folders.reduce((s, f) => s + f.items.length, 0);
}
function _bibFormatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/(1024*1024)).toFixed(2) + ' MB';
}
function _bibNextFolderName(data) {
  const nums = data.folders.map(f => { const m = f.name.match(/^Carpeta\s+(\d+)$/i); return m ? parseInt(m[1]) : 0; });
  return 'Carpeta ' + (Math.max(0, ...nums) + 1);
}

// ── Miniatura ─────────────────────────────────────────────────────
function _bibThumb(la) {
  const S = _BIB_THUMB_SIZE, pad = 6;
  const thumb = document.createElement('canvas');
  thumb.width = S; thumb.height = S;
  const tc = thumb.getContext('2d');
  tc.fillStyle = '#f5f5f5';
  tc.fillRect(0, 0, S, S);
  const pw = edPageW(), ph = edPageH();
  const mx = edMarginX(), my = edMarginY();

  if (la.type === 'stroke' && la._canvas && la._canvas.width > 0) {
    const lw = la.width * pw, lh = la.height * ph;
    const scale = Math.min((S-pad*2)/Math.max(lw,1), (S-pad*2)/Math.max(lh,1));
    const dw=lw*scale, dh=lh*scale, dx=(S-dw)/2, dy=(S-dh)/2;
    tc.drawImage(la._canvas, 0, 0, la._canvas.width, la._canvas.height, dx, dy, dw, dh);
  } else if (la.type === 'draw' && la._canvas) {
    const scale = Math.min((S-pad*2)/Math.max(pw,1), (S-pad*2)/Math.max(ph,1));
    const dw=pw*scale, dh=ph*scale, dx=(S-dw)/2, dy=(S-dh)/2;
    tc.drawImage(la._canvas, mx, my, pw, ph, dx, dy, dw, dh);
  } else if (la.type === 'shape' || la.type === 'line') {
    _lyDrawShapeThumb(thumb, la);
  } else if (la.type === 'image' && la.img && la.img.complete && la.img.naturalWidth > 0) {
    const iw=la.img.naturalWidth, ih=la.img.naturalHeight;
    const scale=Math.min((S-pad*2)/iw, (S-pad*2)/ih);
    const dw=iw*scale, dh=ih*scale, dx=(S-dw)/2, dy=(S-dh)/2;
    tc.save(); tc.globalAlpha=la.opacity??1;
    tc.drawImage(la.img, dx, dy, dw, dh);
    tc.restore();
  } else if (la.type === 'text' || la.type === 'bubble') {
    // Mismo sistema que el panel de capas: _lyDrawThumb
    _lyDrawThumb(thumb, la);
  } else if (la.type === 'gif' && la._oc) {
    // GIF: usar primer frame del canvas offscreen
    const scale = Math.min((S-pad*2)/Math.max(la._oc.width,1), (S-pad*2)/Math.max(la._oc.height,1));
    const dw = la._oc.width*scale, dh = la._oc.height*scale;
    tc.drawImage(la._oc, (S-dw)/2, (S-dh)/2, dw, dh);
  }
  return thumb.toDataURL('image/png');
}

// ── Helper: obtener o crear carpeta Animaciones ──────────────────
function _bibGetAnimFolder(data) {
  let folder = data.folders.find(f => f.name === 'Animaciones');
  if (!folder) {
    folder = { id: '__anim__', name: 'Animaciones', items: [] };
    data.folders.push(folder);
  }
  return folder;
}

// ── Guardar objeto o grupo ────────────────────────────────────────
function edBibGuardar() {
  const data = _bibLoad();
  if (_bibUsedBytes(data) >= _BIB_MAX_BYTES) {
    edToast(`Biblioteca llena (${_bibFormatSize(_bibUsedBytes(data))} / ${_bibFormatSize(_BIB_MAX_BYTES)}). Elimina algún objeto para añadir más.`, 3500);
    return;
  }

  let entry;

  // ¿Hay grupo activo (multisel silencioso o multisel normal con groupId compartido)?
  const isGroupActive = window._edGroupSilentTool !== undefined && edMultiSel.length > 1;
  const isMultiGroup  = edActiveTool === 'multiselect' && edMultiSel.length > 1 &&
                        edMultiSel.every(i => edLayers[i]?.groupId && edLayers[i].groupId === edLayers[edMultiSel[0]]?.groupId);

  if (isGroupActive || isMultiGroup) {
    // Guardar grupo completo
    const idxs = edMultiSel.slice();
    if (!idxs.length) { edToast('Selecciona un objeto primero'); return; }
    const layers = idxs.map(i => edSerLayer(edLayers[i])).filter(Boolean);
    if (!layers.length) { edToast('Error al serializar el grupo'); return; }
    // Miniatura: renderizar todas las capas del grupo juntas
    const thumb = _bibThumbGroup(idxs);
    entry = {
      id:        Date.now() + '_' + Math.random().toString(36).slice(2,7),
      timestamp: Date.now(),
      isGroup:   true,
      layers,
      thumb,
    };
  } else {
    // Objeto individual
    const la = edLayers[edSelectedIdx];
    if (!la) { edToast('Selecciona un objeto primero'); return; }
    // GIF: guardar directamente en carpeta Animaciones con su dataUrl
    if (la.type === 'gif') {
      const gifThumb = _bibThumb(la);
      // Necesitamos el dataUrl del gif — está en IndexedDB
      _gifIdbLoad(la.gifKey).then(gifDataUrl => {
        if (!gifDataUrl) { edToast('No se pudo cargar el GIF'); return; }
        const gifEntry = {
          id: Date.now() + '_gif', timestamp: Date.now(),
          isGroup: false, isGifAnim: true,
          gifDataUrl, layerData: null, thumb: gifThumb
        };
        const d2 = _bibLoad();
        _bibGetAnimFolder(d2).items.push(gifEntry);
        _bibSave(d2);
        edToast('GIF guardado en Biblioteca → Animaciones ✓');
      }).catch(() => edToast('Error al leer el GIF'));
      return;
    }
    // APNG / imagen animada: guardar en carpeta Animaciones con sus frames
    if (la._isGcpImage && (la._pngFrames?.length > 1 || la._apngSrc || la.animKey)) {
      const _animThumb = _bibThumb(la);
      const _doSaveApng = (frames) => {
        const _apngId = Date.now() + '_gif';
        const _apngEntry = {
          id: _apngId, timestamp: Date.now(),
          isGroup: false, isGifAnim: true,
          gifDataUrl: (Array.isArray(frames) ? frames[0] : null) || la.src || '',
          pngFrames:  Array.isArray(frames) ? frames : null,
          apngSrc:    typeof frames === 'string' ? frames : null,
          gcpLayersData: la._gcpLayersData || null,
          gcpFramesData: la._gcpFramesData || null,
          gcpLayerNames: la._gcpLayerNames || null,
          normW: la.width, normH: la.height,
          gcpFrameDelay:  la._gcpFrameDelay  ?? null,
          gcpRepeatCount: la._gcpRepeatCount ?? null,
          gcpStopAtEnd:   la._gcpStopAtEnd   ?? false,
          animKey: la.animKey || null,
          layerData: null, thumb: _animThumb,
        };
        const d2 = _bibLoad();
        _bibGetAnimFolder(d2).items.push(_apngEntry);
        _bibSave(d2);
        edToast('Animación guardada en Biblioteca → Animaciones ✓');
      };
      // Obtener los frames: _pngFrames en memoria, _apngSrc, o cargar desde IDB por animKey
      if (la._pngFrames && la._pngFrames.length > 1) {
        _doSaveApng(la._pngFrames);
      } else if (la._apngSrc) {
        _doSaveApng(la._apngSrc);
      } else if (la.animKey && window._sbAnimIdbLoad) {
        window._sbAnimIdbLoad(la.animKey).then(data => {
          if (data) _doSaveApng(data);
          else edToast('No se pudieron recuperar los frames de la animación');
        }).catch(() => edToast('Error al leer la animación'));
      } else {
        edToast('No se encontraron frames de animación');
      }
      return;
    }
    entry = {
      id:        Date.now() + '_' + Math.random().toString(36).slice(2,7),
      timestamp: Date.now(),
      isGroup:   false,
      layerData: edSerLayer(la),
      thumb:     _bibThumb(la),
    };
  }

  // Excluir carpeta Animaciones — los objetos normales nunca van ahí
  const realFolders = data.folders.filter(f => f.name !== 'Animaciones');
  if (realFolders.length > 1) {
    _bibShowFolderPicker(entry, data);
  } else {
    realFolders[0].items.push(entry);
    _bibSave(data);
    edToast('Guardado en la biblioteca ✓');
  }
}

// Miniatura de un grupo: renderiza todas sus capas en un canvas offscreen
function _bibThumbGroup(idxs) {
  const S = _BIB_THUMB_SIZE, pad = 6;
  const pw = edPageW(), ph = edPageH();
  const mx = edMarginX(), my = edMarginY();

  // Canvas workspace COMPLETO — captura objetos fuera del lienzo
  const off = document.createElement('canvas');
  off.width = ED_CANVAS_W; off.height = ED_CANVAS_H;
  const ctx = off.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(mx, my, pw, ph);

  // Calcular bbox en coordenadas absolutas de workspace
  let minWX = Infinity, minWY = Infinity, maxWX = -Infinity, maxWY = -Infinity;
  idxs.forEach(i => {
    const la = edLayers[i];
    if (!la) return;
    ctx.globalAlpha = la.opacity ?? 1;
    la.draw(ctx, off);
    ctx.globalAlpha = 1;
    if (la.type === 'draw') {
      minWX = Math.min(minWX, mx); minWY = Math.min(minWY, my);
      maxWX = Math.max(maxWX, mx + pw); maxWY = Math.max(maxWY, my + ph);
    } else {
      const cx = mx + la.x * pw, cy = my + la.y * ph;
      const hw = la.width * pw / 2, hh = la.height * ph / 2;
      minWX = Math.min(minWX, cx - hw); minWY = Math.min(minWY, cy - hh);
      maxWX = Math.max(maxWX, cx + hw); maxWY = Math.max(maxWY, cy + hh);
    }
  });

  if (!isFinite(minWX) || maxWX <= minWX || maxWY <= minWY) {
    minWX = mx; minWY = my; maxWX = mx + pw; maxWY = my + ph;
  }
  minWX -= 4; minWY -= 4; maxWX += 4; maxWY += 4;

  const bw = maxWX - minWX, bh = maxWY - minWY;
  const scale = Math.min((S - pad*2) / Math.max(bw, 1), (S - pad*2) / Math.max(bh, 1));
  const dw = bw * scale, dh = bh * scale;
  const dx = (S - dw) / 2, dy = (S - dh) / 2;

  const thumb = document.createElement('canvas');
  thumb.width = S; thumb.height = S;
  const tc = thumb.getContext('2d');
  tc.fillStyle = '#f5f5f5';
  tc.fillRect(0, 0, S, S);
  tc.drawImage(off, minWX, minWY, bw, bh, dx, dy, dw, dh);

  // Icono de grupo
  tc.fillStyle = 'rgba(0,0,0,.35)';
  tc.font = 'bold 11px sans-serif';
  tc.textAlign = 'right'; tc.textBaseline = 'bottom';
  tc.fillText('⊞', S - 4, S - 2);

  return thumb.toDataURL('image/png');
}

// Popup para elegir carpeta al guardar
function _bibShowFolderPicker(entry, data) {
  // Cerrar picker anterior si existe
  document.getElementById('_bib-picker')?.remove();

  const pop = document.createElement('div');
  pop.id = '_bib-picker';
  pop.style.cssText = 'position:fixed;z-index:1300;background:var(--surface,#fff);border:1px solid var(--gray-300,#ccc);border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.18);padding:8px 0;min-width:180px;max-width:260px';

  const title = document.createElement('div');
  title.style.cssText = 'padding:6px 14px 8px;font-size:.8rem;font-weight:700;color:var(--gray-600,#555);border-bottom:1px solid var(--gray-200,#eee);margin-bottom:4px';
  title.textContent = '¿En qué carpeta?';
  pop.appendChild(title);

  data.folders.filter(f => f.name !== 'Animaciones').forEach(folder => {
    const btn = document.createElement('button');
    btn.style.cssText = 'display:block;width:100%;text-align:left;padding:8px 14px;border:none;background:transparent;font-size:.85rem;cursor:pointer;color:var(--gray-800,#222)';
    btn.textContent = '📁 ' + folder.name;
    btn.addEventListener('pointerup', e => {
      e.stopPropagation();
      pop.remove();
      folder.items.push(entry);
      _bibSave(data);
      edToast('Guardado en "' + folder.name + '" ✓');
    });
    pop.appendChild(btn);
  });

  // Posicionar centrado en pantalla
  document.body.appendChild(pop);
  const pw2 = pop.offsetWidth || 200, ph2 = pop.offsetHeight || 160;
  pop.style.left = Math.max(8, (window.innerWidth - pw2) / 2) + 'px';
  pop.style.top  = Math.max(8, (window.innerHeight - ph2) / 2) + 'px';

  // Cerrar al tocar fuera
  const close = e => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('pointerdown', close); } };
  setTimeout(() => document.addEventListener('pointerdown', close), 50);
}

// ── Panel biblioteca ──────────────────────────────────────────────
function edBibAbrir() {
  const panel = $('edOptionsPanel');
  if (!panel) return;
  _bibRenderPanel(panel);
}

function _bibClose(panel) {
  panel.classList.remove('open');
  panel.innerHTML = '';
  delete panel.dataset.mode;
  requestAnimationFrame(edFitCanvas);
}

// Convertir dataUrl a Blob (sin fetch — funciona en Android)
function _dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const mime  = parts[0].match(/:(.*?);/)[1];
  const bin   = atob(parts[1]);
  const arr   = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function _bibRenderPanel(panel) {
  const data = _bibLoad();
  const total = _bibUsedBytes(data);

  // ── HTML estático ────────────────────────────────────────────
  let html = `<div style="display:flex;flex-direction:column;width:100%;gap:0;touch-action:pan-y">`;

  html += `
  <div style="display:flex;flex-direction:row;align-items:center;padding:4px 6px 4px 8px;min-height:30px;gap:4px">
    <button id="_bib-btn-folder" style="flex-shrink:0;border:none;background:transparent;font-size:.75rem;font-weight:700;cursor:pointer;color:var(--gray-600);padding:3px 6px;border-radius:5px;white-space:nowrap">+ Carpeta</button>
    <span style="flex:1"></span>
    <span style="font-size:.72rem;color:var(--gray-500)">${_bibFormatSize(total)} / ${_bibFormatSize(_BIB_MAX_BYTES)}</span>
    <button id="_bib-close-btn" style="border:none;background:transparent;font-size:1rem;cursor:pointer;color:var(--gray-500);padding:2px 4px;line-height:1">✕</button>
  </div>
  <div style="height:1px;background:var(--gray-300);width:100%"></div>`;

  data.folders.forEach((folder, fi) => {
    const count = folder.items.length;
    // La cabecera de cada carpeta es zona de drop — data-drop-fi lo marca
    html += `
  <div class="_bib-folder" data-fi="${fi}" style="display:flex;flex-direction:column;width:100%">
    <div class="_bib-drop-zone" data-drop-fi="${fi}"
         style="display:flex;flex-direction:row;align-items:center;padding:3px 6px 3px 8px;gap:4px;background:var(--gray-50,#fafafa);transition:background .15s">
      <span style="font-size:.85rem">📁</span>
      <span class="_bib-fold-name" data-fi="${fi}"
            style="flex:1;font-size:.78rem;font-weight:700;color:var(--gray-700);cursor:text;padding:1px 2px;border-radius:3px"
            title="Toca para renombrar">${folder.name}</span>
      <span style="font-size:.68rem;color:var(--gray-400)">${count}</span>
      ${fi > 0 ? `<button class="_bib-del-folder" data-fi="${fi}" style="border:none;background:transparent;color:#c00;font-size:.75rem;cursor:pointer;padding:2px 4px;flex-shrink:0" title="Eliminar carpeta">✕</button>` : ''}
    </div>`;

    if (count === 0) {
      html += `<div class="_bib-drop-zone _bib-empty-drop" data-drop-fi="${fi}"
                    style="padding:10px 10px;font-size:.75rem;color:var(--gray-400);font-style:italic;min-height:32px;transition:background .15s">Vacía — arrastra aquí</div>`;
    } else {
      html += `<div style="padding:6px 6px;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:none;touch-action:pan-x">
      <div class="_bib-items-row" style="display:flex;flex-direction:row;gap:7px;flex-wrap:nowrap;min-width:min-content">`;
      folder.items.forEach((it, ii) => {
        html += `
        <div class="_bib-item" data-fi="${fi}" data-ii="${ii}"
             style="position:relative;flex-shrink:0;cursor:grab;border-radius:7px;overflow:hidden;background:#f0f0f0;width:${_BIB_THUMB_SIZE}px;height:${_BIB_THUMB_SIZE}px;border:2px solid var(--gray-200);touch-action:none;user-select:none">
          <img src="${it.thumb}" width="${_BIB_THUMB_SIZE}" height="${_BIB_THUMB_SIZE}" style="display:block;pointer-events:none;user-select:none"/>
          <button class="_bib-del-item" data-fi="${fi}" data-ii="${ii}"
            style="position:absolute;top:2px;right:2px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;border:none;font-size:.75rem;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0"
            title="Eliminar">✕</button>
        </div>`;
      });
      html += `</div></div>`;
    }
    html += `</div>`;
    if (fi < data.folders.length - 1) html += `<div style="height:1px;background:var(--gray-200);width:100%"></div>`;
  });

  html += `<div style="height:1px;background:var(--gray-300);width:100%"></div>
  <div style="padding:4px 8px;font-size:.7rem;color:var(--gray-400)">Toca para insertar · mantén pulsado para mover a otra carpeta</div>
  </div>`;

  panel.innerHTML = html;
  panel.dataset.mode = 'biblioteca';
  panel.classList.add('open');
  requestAnimationFrame(edFitCanvas);

  // ── Cerrar ───────────────────────────────────────────────────
  panel.querySelector('#_bib-close-btn')?.addEventListener('pointerup', e => {
    e.stopPropagation(); _bibClose(panel);
  });

  // ── Crear carpeta ─────────────────────────────────────────────
  panel.querySelector('#_bib-btn-folder')?.addEventListener('pointerup', e => {
    e.stopPropagation();
    const d = _bibLoad();
    d.folders.push({ id: Date.now() + '_f', name: _bibNextFolderName(d), items: [] });
    _bibSave(d);
    _bibRenderPanel(panel);
  });

  // ── Renombrar carpeta ─────────────────────────────────────────
  panel.querySelectorAll('._bib-fold-name').forEach(el => {
    el.addEventListener('pointerup', e => {
      if (el._wasDrag) { el._wasDrag = false; return; }
      e.stopPropagation();
      if (el._editing) return; // ya está en modo edición
      el._editing = true;
      const fi = parseInt(el.dataset.fi);
      const d = _bibLoad();
      const oldName = d.folders[fi]?.name || '';
      // Convertir span en input inline
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.value = oldName;
      inp.inputMode = 'text';
      inp.enterKeyHint = 'done';
      inp.style.cssText = 'flex:1;font-size:.78rem;font-weight:700;color:var(--gray-700);border:none;border-bottom:1.5px solid var(--black);background:transparent;outline:none;padding:1px 2px;min-width:0;width:100%';
      el.replaceWith(inp);
      inp.focus();
      inp.select();
      const confirm = () => {
        const nombre = inp.value.trim();
        if (nombre) {
          const d2 = _bibLoad();
          if (d2.folders[fi]) d2.folders[fi].name = nombre;
          _bibSave(d2);
        }
        _bibRenderPanel(panel);
      };
      inp.addEventListener('blur', confirm);
      inp.addEventListener('keydown', e2 => {
        if (e2.key === 'Enter') { e2.preventDefault(); inp.blur(); }
        if (e2.key === 'Escape') { inp.removeEventListener('blur', confirm); _bibRenderPanel(panel); }
      });
    });
  });

  // ── Eliminar carpeta ──────────────────────────────────────────
  panel.querySelectorAll('._bib-del-folder').forEach(btn => {
    btn.addEventListener('pointerup', e => {
      e.stopPropagation();
      const fi = parseInt(btn.dataset.fi);
      const d = _bibLoad();
      const folder = d.folders[fi];
      if (folder.items.length > 0) {
        edConfirm(`¿Eliminar la carpeta "${folder.name}" y sus ${folder.items.length} objetos?`, ()=>{
          const d2 = _bibLoad();
          d2.folders.splice(fi, 1);
          _bibSave(d2);
          edToast('Carpeta eliminada');
          _bibRenderPanel(panel);
        });
        return;
      }
      edConfirm(`¿Eliminar la carpeta "${folder.name}"?`, ()=>{
        const d2 = _bibLoad();
        d2.folders.splice(fi, 1);
        _bibSave(d2);
        edToast('Carpeta eliminada');
        _bibRenderPanel(panel);
      });
    });
  });

  // ── Eliminar item ─────────────────────────────────────────────
  panel.querySelectorAll('._bib-del-item').forEach(btn => {
    btn.addEventListener('pointerup', e => {
      e.stopPropagation();
      const fi = parseInt(btn.dataset.fi), ii = parseInt(btn.dataset.ii);
      const d = _bibLoad();
      const _itemName = d.folders[fi]?.items[ii]?.name || 'este objeto';
      edConfirm(`¿Eliminar "${_itemName}" de la biblioteca?`, ()=>{
        const d2 = _bibLoad();
        d2.folders[fi].items.splice(ii, 1);
        _bibSave(d2);
        edToast('Eliminado de la biblioteca');
        _bibRenderPanel(panel);
      });
    });
  });

  // ── Insertar item (tap rápido sin drag) ───────────────────────
  panel.querySelectorAll('._bib-item').forEach(el => {
    el.addEventListener('pointerup', e => {
      if (e.target.classList.contains('_bib-del-item')) return;
      if (el._wasDrag) { el._wasDrag = false; return; }
      e.stopPropagation();
      const fi = parseInt(el.dataset.fi), ii = parseInt(el.dataset.ii);
      const d = _bibLoad();
      const entry = d.folders[fi]?.items[ii];
      if (!entry) return;

      // Si el editor GIF está activo, insertar en el canvas GIF
      if (window._gcpActive) { gcpInsertFromBib(entry); _bibClose(panel); return; }

      // GIF animado guardado desde el editor GIF
      if (entry.isGifAnim && (entry.gifDataUrl || entry.apngSrc || entry._apngIdbKey || (entry.pngFrames && entry.pngFrames.length))) {
        // Si el APNG está en IDB (dispositivo B), cargarlo antes de insertar
        if (entry._apngIdbKey && !entry.apngSrc && window._sbAnimIdbLoad) {
          window._sbAnimIdbLoad(entry._apngIdbKey)
            .then(function(_data) { if (_data) entry.apngSrc = _data; })
            .catch(function(){})
            .finally(function() {
              // apngSrc ya cargado — continuar con la inserción normal
              const _img2 = new Image();
              const _src2 = entry.apngSrc || entry.gifDataUrl;
              const _frames2 = entry.apngSrc ? [entry.apngSrc]
                             : (entry.pngFrames && entry.pngFrames.length > 1 ? entry.pngFrames : [entry.gifDataUrl]);
              _img2.onload = function() {
                const pw=edPageW(), ph=edPageH();
                let fW=entry.normW||0.7, fH=entry.normH||fW*(_img2.naturalHeight/Math.max(_img2.naturalWidth,1))*(pw/ph);
                const sc2=Math.max(fW/0.9,fH/0.9,1); fW/=sc2; fH/=sc2;
                const la2=new ImageLayer(_img2,0.5,0.5,fW); la2.height=fH;
                la2.src=entry.gifDataUrl||(entry.pngFrames&&entry.pngFrames[0])||_src2;
                la2._keepSize=true; la2._isGcpImage=true;
                if(entry.apngSrc){la2._apngSrc=entry.apngSrc; la2._pngFrames=[entry.apngSrc];}
                else la2._pngFrames=_frames2;
                la2._fIdx=0;
                if(entry.gcpLayersData) la2._gcpLayersData=entry.gcpLayersData;
                if(entry.gcpFramesData) la2._gcpFramesData=entry.gcpFramesData;
                if(entry.gcpLayerNames) la2._gcpLayerNames=entry.gcpLayerNames;
                if(entry.gcpFrameDelay!=null) la2._gcpFrameDelay=entry.gcpFrameDelay;
                if(entry.gcpRepeatCount!=null) la2._gcpRepeatCount=entry.gcpRepeatCount;
                if(entry.gcpStopAtEnd) la2._gcpStopAtEnd=true;
                const _k2='anim_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
                la2.animKey=_k2;
                if(window._sbAnimIdbSave) window._sbAnimIdbSave(_k2,entry.apngSrc||_frames2).catch(function(){});
                const fi2=edLayers.findIndex(l=>l.type==='text'||l.type==='bubble');
                if(fi2>=0){edLayers.splice(fi2,0,la2);edSelectedIdx=fi2;}
                else{edLayers.push(la2);edSelectedIdx=edLayers.length-1;}
                edPushHistory();
                la2.loadAnim(entry.apngSrc||_frames2,function(){la2._playing=true;la2._applyFrame(0);edRedraw();});
              };
              _img2.src=_src2;
            });
          _bibClose(panel); edToast('Animación insertada ✓'); return;
        }
        // apngSrc: APNG completo descargado de nube — usar directamente con decodeApng
        // pngFrames: array de frames individuales (sistema local o GIF antiguo)
        const frames = entry.apngSrc ? [entry.apngSrc]
                     : (entry.pngFrames && entry.pngFrames.length > 1 ? entry.pngFrames
                     : [entry.gifDataUrl]);
        const _srcForImg = entry.apngSrc || (frames && frames[0]) || entry.gifDataUrl;
        const img = new Image();
        img.onload = () => {
          const pw = edPageW(), ph = edPageH();
          let finalW = entry.normW || 0.7;
          let finalH = entry.normH || finalW*(img.naturalHeight/Math.max(img.naturalWidth,1))*(pw/ph);
          const sc = Math.max(finalW/0.9, finalH/0.9, 1);
          finalW /= sc; finalH /= sc;
          const la = new ImageLayer(img, 0.5, 0.5, finalW);
          la.height = finalH;
          // src debe ser el primer frame PNG (pequeño) para layer_data en Supabase
          // apngSrc completo va en IDB — no en src
          la.src = entry.gifDataUrl || (entry.pngFrames && entry.pngFrames[0]) || _srcForImg;
          la._keepSize = true;
          la._isGcpImage = true;
          // Si apngSrc: usar directamente para decodeApng (preserva todos los frames)
          if (entry.apngSrc) {
            la._apngSrc = entry.apngSrc;
            la._pngFrames = [entry.apngSrc]; // length>1 no aplica pero necesario para IDB
          } else {
            la._pngFrames = frames;
          }
          la._fIdx = 0;
          if (entry.gcpLayersData) la._gcpLayersData = entry.gcpLayersData;
          if (entry.gcpFramesData) la._gcpFramesData = entry.gcpFramesData;
          if (entry.gcpLayerNames) la._gcpLayerNames = entry.gcpLayerNames;
          if (entry.gcpFrameDelay  != null) la._gcpFrameDelay  = entry.gcpFrameDelay;
          if (entry.gcpRepeatCount != null) la._gcpRepeatCount = entry.gcpRepeatCount;
          if (entry.gcpStopAtEnd)           la._gcpStopAtEnd   = true;
          // Generar animKey — guardar frames individuales en IDB síncronamente
          // (evita race condition con FileReader asíncrono)
          const _bibAnimKey = 'anim_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
          la.animKey = _bibAnimKey;
          if (window._sbAnimIdbSave) {
            // Guardar en IDB: si apngSrc usar string, sino array de frames
            const _idbData = entry.apngSrc || frames;
            window._sbAnimIdbSave(_bibAnimKey, _idbData).catch(function(e){ console.warn('bib IDB:', e); });
          }
          const firstTextIdx = edLayers.findIndex(l => l.type==='text'||l.type==='bubble');
          if (firstTextIdx >= 0) { edLayers.splice(firstTextIdx, 0, la); edSelectedIdx = firstTextIdx; }
          else { edLayers.push(la); edSelectedIdx = edLayers.length - 1; }
          edPushHistory();
          // Cargar con ApngDecoder — si apngSrc usar string (decodeApng), sino array (decodeFrameArray)
          const _animInput = entry.apngSrc || frames;
          la.loadAnim(_animInput, () => {
            la._playing = true;
            la._applyFrame(0);
            edRedraw();
          });
        };
        img.src = _srcForImg;
        _bibClose(panel);
        edToast('Animación insertada ✓');
        return;
      }

      if (entry.isGroup && Array.isArray(entry.layers)) {
        // Insertar grupo: deserializar cada capa con nuevo groupId común
        const newGroupId = _edNewGroupId();
        let inserted = 0;
        entry.layers.forEach(ld => {
          const la = edDeserLayer(ld, edOrientation);
          if (!la) return;
          la.groupId = newGroupId;
          edLayers.push(la);
          inserted++;
        });
        if (!inserted) { edToast('Error al insertar el grupo'); return; }
      } else {
        // Objeto individual
        const newLayer = edDeserLayer(entry.layerData, edOrientation);
        if (!newLayer) { edToast('Error al insertar el objeto'); return; }
        edLayers.push(newLayer);
      }

      edSelectedIdx = -1;
      edPushHistory(); edRedraw();
      _bibClose(panel);
      edToast('Objeto insertado ✓');
    });
  });

  // ── Drag entre carpetas (Pointer Events — funciona en táctil y PC) ───────
  _bibBindDrag(panel);
}

// Estado de drag
let _bibDrag = null; // { fi, ii, ghost, lastZone }

function _bibBindDrag(panel) {
  // Solo arrastrable si hay más de una carpeta
  const data = _bibLoad();
  if (data.folders.length < 2) return;

  const DRAG_THRESHOLD = 6; // px de movimiento para confirmar drag (PC y táctil)
  const LONG_MS = 350;      // ms adicional de long-press solo para táctil

  panel.querySelectorAll('._bib-item').forEach(el => {
    let _startX = 0, _startY = 0;
    let _longPressTimer = null;
    let _dragActive = false;
    let _downEvent = null;

    el.addEventListener('pointerdown', e => {
      if (e.target.classList.contains('_bib-del-item')) return;
      _startX = e.clientX; _startY = e.clientY;
      _dragActive = false;
      _downEvent = e;

      if (e.pointerType === 'touch') {
        // Táctil: activar con long-press
        _longPressTimer = setTimeout(() => {
          _dragActive = true;
          _bibDragStart(_downEvent, el, panel);
        }, LONG_MS);
      }
      // PC: esperar movimiento suficiente (ver pointermove)
    }, { passive: true });

    el.addEventListener('pointermove', e => {
      const dist = Math.hypot(e.clientX - _startX, e.clientY - _startY);
      if (e.pointerType === 'touch') {
        // En táctil, cancelar long-press si hay movimiento antes de que expire
        if (dist > DRAG_THRESHOLD && _longPressTimer) {
          clearTimeout(_longPressTimer); _longPressTimer = null;
        }
      } else {
        // PC: activar drag al superar el umbral de movimiento
        if (!_dragActive && dist > DRAG_THRESHOLD && _downEvent) {
          _dragActive = true;
          _bibDragStart(_downEvent, el, panel);
        }
      }
    }, { passive: true });

    el.addEventListener('pointerup', () => {
      if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
      _dragActive = false; _downEvent = null;
    });

    el.addEventListener('pointercancel', () => {
      if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
      _dragActive = false; _downEvent = null;
      _bibDragCancel();
    });
  });
}

function _bibDragStart(e, el, panel) {
  const fi = parseInt(el.dataset.fi), ii = parseInt(el.dataset.ii);
  el.setPointerCapture(e.pointerId);
  el._wasDrag = true;

  // Ghost visual
  const ghost = document.createElement('div');
  ghost.style.cssText = `position:fixed;z-index:2000;pointer-events:none;opacity:.85;border-radius:8px;overflow:hidden;width:${_BIB_THUMB_SIZE}px;height:${_BIB_THUMB_SIZE}px;box-shadow:0 6px 20px rgba(0,0,0,.35);border:2px solid var(--accent,#0077ff)`;
  const img = el.querySelector('img');
  if (img) {
    const gi = document.createElement('img');
    gi.src = img.src;
    gi.style.cssText = `width:${_BIB_THUMB_SIZE}px;height:${_BIB_THUMB_SIZE}px;display:block;pointer-events:none`;
    ghost.appendChild(gi);
  }
  document.body.appendChild(ghost);

  _bibDrag = { fi, ii, ghost, panel, lastZone: null };
  _bibMoveGhost(e.clientX, e.clientY);

  // Listeners globales en el elemento capturado
  el.addEventListener('pointermove', _bibOnMove);
  el.addEventListener('pointerup',   _bibOnUp);
}

function _bibMoveGhost(cx, cy) {
  if (!_bibDrag) return;
  const S = _BIB_THUMB_SIZE;
  _bibDrag.ghost.style.left = (cx - S/2) + 'px';
  _bibDrag.ghost.style.top  = (cy - S/2) + 'px';

  // Detectar zona de drop bajo el cursor
  const panel = _bibDrag.panel;
  const zones = panel.querySelectorAll('._bib-drop-zone');
  let hit = null;
  zones.forEach(z => {
    const r = z.getBoundingClientRect();
    if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) hit = z;
  });

  // Resaltar zona destino
  if (_bibDrag.lastZone && _bibDrag.lastZone !== hit) {
    _bibDrag.lastZone.style.background = '';
  }
  if (hit && hit !== _bibDrag.lastZone) {
    const destFi = parseInt(hit.dataset.dropFi);
    if (destFi !== _bibDrag.fi) {
      hit.style.background = 'rgba(0,119,255,.15)';
    }
  }
  _bibDrag.lastZone = hit;
}

function _bibOnMove(e) {
  if (!_bibDrag) return;
  _bibMoveGhost(e.clientX, e.clientY);
}

function _bibOnUp(e) {
  if (!_bibDrag) return;
  const { fi, ii, ghost, panel, lastZone } = _bibDrag;

  ghost.remove();
  if (lastZone) lastZone.style.background = '';

  const destFi = lastZone ? parseInt(lastZone.dataset.dropFi) : -1;

  // Limpiar listeners
  e.target.removeEventListener('pointermove', _bibOnMove);
  e.target.removeEventListener('pointerup',   _bibOnUp);
  _bibDrag = null;

  if (destFi < 0 || destFi === fi) return; // sin destino válido o misma carpeta

  // Mover item
  const d = _bibLoad();
  if (!d.folders[fi] || !d.folders[destFi]) return;
  const [entry] = d.folders[fi].items.splice(ii, 1);
  d.folders[destFi].items.push(entry);
  _bibSave(d);
  edToast(`Movido a "${d.folders[destFi].name}" ✓`);
  _bibRenderPanel(panel);
}

function _bibDragCancel() {
  if (!_bibDrag) return;
  _bibDrag.ghost.remove();
  if (_bibDrag.lastZone) _bibDrag.lastZone.style.background = '';
  _bibDrag = null;
}

function edInitBiblioteca() {
  $('dd-bib-save')?.addEventListener('pointerup', e => {
    e.stopPropagation(); edCloseMenus(); edBibGuardar();
  });
  $('dd-bib-open')?.addEventListener('pointerup', e => {
    e.stopPropagation(); edCloseMenus(); edBibAbrir();
  });
}

// ── Estado de transformación del canvas GIF ──────────────────────────────
let _gs = null;

// Ejecutar fn() con edLayers/_Selected/edCanvas/edCtx apuntando al GIF,
// luego restaurar. Permite reutilizar TODO el código del editor general.
// _gcpWithEditorContext: ejecuta fn() con edLayers/edSelectedIdx/edCanvas/edCtx
// apuntando al GIF. Desactiva _gcpActive para evitar loop en _edDocDownFn.
function _gcpWithEditorContext(fn) {
  const savedLayers = edLayers,  savedSel    = edSelectedIdx;
  const savedCanvas = edCanvas,  savedCtx    = edCtx;
  const savedActive = window._gcpActive;
  const savedOvrd   = window._edRedrawOverride;
  let selAfter = window._gcpSelIdx;
  try {
    edLayers      = window._gcpLayers;
    edSelectedIdx = window._gcpSelIdx;
    edCanvas      = gcpCanvas;
    edCtx         = gcpCtx;
    window._gcpActive        = false;
    window._edRedrawOverride = true;
    fn();
    selAfter = edSelectedIdx; // capturar selección modificada dentro del contexto
  } finally {
    edLayers      = savedLayers;  edSelectedIdx = savedSel;
    edCanvas      = savedCanvas;  edCtx         = savedCtx;
    window._gcpActive        = savedActive;
    window._edRedrawOverride = savedOvrd;
    window._gcpSelIdx = selAfter; // usar el valor de dentro del contexto
  }
}

function _gcpHandleDown(e) {
  // Solo actuar si el target ES el gcpCanvas — no elementos UI superpuestos
  const gc = document.getElementById('gcpCanvas');
  if (!gc) return;
  // Si el target no es el canvas ni un elemento sin ID (que sería el canvas mismo),
  // verificar que no pertenece a ningún elemento de UI del editor GIF
  if (e.target && e.target !== gc) {
    // Si el target tiene un ancestro que es UI del GIF → ignorar
    if (e.target.closest?.('#gcpFramesBar, #gcpMenuBar, #gcpTopbar, #edOptionsPanel, [data-gcpmenu]')) return;
  }
  const rect = gc.getBoundingClientRect();
  const src2 = e.touches ? e.touches[0] : e;
  const clientX = src2 ? src2.clientX : e.clientX;
  const clientY2 = src2 ? src2.clientY : e.clientY;
  if (clientX < rect.left || clientX > rect.right || clientY2 < rect.top || clientY2 > rect.bottom) return;

  const c = edCoords(e);
  const idx = window._gcpSelIdx;

  // Handles: usar getControlPoints() igual que el editor, pero siempre permitir
  // resize/rotate aunque sea táctil (el editor los desactiva en móvil, nosotros no)
  // Handles y selección — copia exacta de _edDocDownFn usando _gcpLayers
  const _la = window._gcpLayers[window._gcpSelIdx] ?? null;
  if (_la && _la.type !== 'bubble') {
    const _pw = edPageW(), _ph = edPageH(), _z = edCamera.z;
    const hitScreen = 18; // PC
    if (!_la.locked) {
      for (const p of _la.getControlPoints()) {
        const _dpx = (c.nx - p.x)*_pw, _dpy = (c.ny - p.y)*_ph;
        if (Math.hypot(_dpx, _dpy)*_z < hitScreen) {
          if (p.corner === 'rotate') {
            edIsRotating = true;
            edRotateStartAngle = Math.atan2(c.ny-_la.y, c.nx-_la.x) - (_la.rotation||0)*Math.PI/180;
            return;
          }
          // Resize — mismo código exacto que _edDocDownFn
          edIsResizing = true; edResizeCorner = p.corner;
          const _rot0 = (_la.rotation||0)*Math.PI/180;
          const _hw0 = _la.width/2, _hh0 = _la.height/2;
          const _pw0 = edPageW(), _ph0 = edPageH();
          const _anchorLocal = (corner) => {
            const ax = corner==='ml'?_hw0 : corner==='mr'?-_hw0 :
                       corner==='tl'||corner==='bl'?_hw0 :
                       corner==='tr'||corner==='br'?-_hw0 : 0;
            const ay = corner==='mt'?_hh0 : corner==='mb'?-_hh0 :
                       corner==='tl'||corner==='tr'?_hh0 :
                       corner==='bl'||corner==='br'?-_hh0 : 0;
            const rx=ax*_pw0, ry=ay*_ph0;
            return { x: _la.x+(rx*Math.cos(_rot0)-ry*Math.sin(_rot0))/_pw0,
                     y: _la.y+(rx*Math.sin(_rot0)+ry*Math.cos(_rot0))/_ph0 };
          };
          const _anch = _anchorLocal(p.corner);
          edInitialSize = { width:_la.width, height:_la.height,
            cx:_la.x, cy:_la.y, asp:_la.height/_la.width,
            rot:(_la.rotation||0), ox:_la.x, oy:_la.y,
            anchorX:_anch.x, anchorY:_anch.y };
          if (_la.type==='line') {
            edInitialSize._linePoints = _la.points.map(p=>p?({...p}):null);
            edInitialSize._subPaths = _la.subPaths?.length ? _la.subPaths.map(sp=>{const s=sp.map(p=>({...p}));if(sp.cornerRadii)s.cornerRadii={...sp.cornerRadii};return s;}) : null;
          }
          if (_la.cornerRadii) {
            edInitialSize._cornerRadii = Array.isArray(_la.cornerRadii) ? [..._la.cornerRadii] : {..._la.cornerRadii};
          } else { edInitialSize._cornerRadii = null; }
          return;
        }
      }
    }
    // Drag dentro del bbox
    const _rot = (_la.rotation||0)*Math.PI/180;
    const _dx = c.nx-_la.x, _dy = c.ny-_la.y;
    const _lx = _dx*Math.cos(-_rot)*_pw - _dy*Math.sin(-_rot)*_ph;
    const _ly = _dx*Math.sin(-_rot)*_pw + _dy*Math.cos(-_rot)*_ph;
    if (Math.abs(_lx) <= _la.width/2*_pw + 10/_z && Math.abs(_ly) <= _la.height/2*_ph + 10/_z) {
      edIsDragging = true;
      edDragOffX = c.nx - _la.x;
      edDragOffY = c.ny - _la.y;
      return;
    }
  }

  // Buscar capa tocada
  let hit = -1;
  for (let i = window._gcpLayers.length-1; i >= 0; i--) {
    if (window._gcpLayers[i]?.contains?.(c.nx, c.ny)) { hit = i; break; }
  }
  window._gcpSelIdx = hit;
  if (hit >= 0) {
    edIsDragging = true;
    edDragOffX = c.nx - window._gcpLayers[hit].x;
    edDragOffY = c.ny - window._gcpLayers[hit].y;
  }
  _gcpRedraw();
}

function _gcpHandleMove(e) {
  _gcpWithEditorContext(() => { edOnMove(e); });
  _gcpRedraw();
}

function _gcpHandleUp(e) {
  window._edMoved = false;
  edIsDragging = false; edIsResizing = false; edIsRotating = false;
  // Los frames guardados son INMUTABLES — solo _gcpCaptureFrame escribe en _gcpFrames.
  // El historial registra el estado en vivo (fuera de los frames guardados).
  const newSnap = window._gcpLayers.map(la => ({
    x:la.x, y:la.y, width:la.width, height:la.height,
    rotation:la.rotation||0, opacity:la.opacity??1
  }));
  const newJSON = JSON.stringify(newSnap);
  if (window._gcpHistory[window._gcpHistoryIdx] !== newJSON) {
    _gcpPushHistory(newJSON);
  }
  _gcpRedraw();
}

/* ═══════════════════════════════════════════════════════════════════════
   MÓDULO GCP — Editor de GIFs  (T16 Fase 2)
   Copia exacta del patrón del editor general aplicada al canvas GIF.
   gcpCanvas / gcpCtx = equivalentes de edCanvas / edCtx
   _gcpLayers = equivalente de edLayers
   _gcpRedraw = equivalente de edRedraw
   ═══════════════════════════════════════════════════════════════════════ */

// Variables globales GCP — mismo patrón que: let edCanvas, edCtx;
// Opciones de comportamiento para exportar APNG (fps → delay ms, num_plays)
window._gcpFrameDelay  = 100;  // ms por frame (default 10fps)
window._gcpRepeatCount = 0;    // 0 = infinito
window._gcpStopAtEnd   = false; // true = detener en el último frame
let gcpCanvas = null;
let gcpCtx    = null;

// Lista de capas GIF — equivalente a edLayers
window._gcpLayers = [];
window._gcpSelIdx = -1;
// Sistema de frames por layer: la._frames[] independiente por capa
// _gcpGlobalFrameIdx = columna activa
window._gcpGlobalFrameIdx = 0;

// ── Sistema de frames ────────────────────────────────────────────────────

// Captura el estado actual de todas las capas como un nuevo frame
// ── Sistema de frames con transformaciones relativas al frame 1 ──────────
// Igual que el HTML de referencia: frame 1 = base, frames siguientes = deltas.
// Cada entrada del frame guarda para cada capa:
//   { dx, dy, drot, scaleW, scaleH, opacity }
// donde dx/dy = desplazamiento desde base, drot = rotación adicional,
// scaleW/scaleH = factor de escala de width/height respecto al frame 1.

// ── Sistema de frames por layer — idéntico al HTML de referencia ─────────
// Cada layer (la) tiene su propio la._frames[fi] = {x,y,width,height,rotation,opacity,visible}

// ── Historial del editor GIF — por frame, se borra al cambiar de frame ──
// Cada entrada = snapshot JSON de _gcpFrames[_gcpFrameIdx] en ese momento
window._gcpHistory    = [];  // array de snapshots del frame activo
window._gcpHistoryIdx = -1;  // índice actual

function _gcpPushHistory(snapJSON) {
  if (!window._gcpLayers.length) return;
  const snap = snapJSON || JSON.stringify(window._gcpLayers.map(la => {
    const fi = Math.min(window._gcpGlobalFrameIdx, (la._frames||[]).length - 1);
    return fi >= 0 && la._frames && la._frames[fi] ? {...la._frames[fi]} : {x:la.x,y:la.y,width:la.width,height:la.height,rotation:la.rotation||0,opacity:la.opacity??1,visible:true};
  }));
  // No duplicar si igual al último
  if (window._gcpHistoryIdx >= 0 && window._gcpHistory[window._gcpHistoryIdx] === snap) return;
  // Truncar futuros
  window._gcpHistory = window._gcpHistory.slice(0, window._gcpHistoryIdx + 1);
  window._gcpHistory.push(snap);
  if (window._gcpHistory.length > 30) window._gcpHistory.shift();
  window._gcpHistoryIdx = window._gcpHistory.length - 1;
  _gcpUpdateUndoRedoBtns();
}

function _gcpUndo() {
  if (window._gcpHistoryIdx <= 0) return;
  window._gcpHistoryIdx--;
  _gcpApplyHistorySnap(window._gcpHistory[window._gcpHistoryIdx]);
}

function _gcpRedo() {
  if (window._gcpHistoryIdx >= window._gcpHistory.length - 1) return;
  window._gcpHistoryIdx++;
  _gcpApplyHistorySnap(window._gcpHistory[window._gcpHistoryIdx]);
}

function _gcpApplyHistorySnap(snap) {
  if (!snap) return;
  const state = JSON.parse(snap);
  state.forEach((s, i) => {
    const la = window._gcpLayers[i]; if (!la) return;
    la.x=s.x; la.y=s.y; la.width=s.width; la.height=s.height;
    la.rotation=s.rotation; la.opacity=s.opacity??1;
    if (la._frames) {
      const fi = Math.min(window._gcpGlobalFrameIdx, la._frames.length - 1);
      if (fi >= 0) la._frames[fi] = {x:la.x,y:la.y,width:la.width,height:la.height,rotation:la.rotation,opacity:la.opacity,visible:s.visible??true};
    }
  });
  _gcpRedraw();
  _gcpUpdateUndoRedoBtns();
}

function _gcpUpdateUndoRedoBtns() {
  const u = document.getElementById('gcpUndoBtn');
  const r = document.getElementById('gcpRedoBtn');
  if (u) u.disabled = window._gcpHistoryIdx <= 0;
  if (r) r.disabled = window._gcpHistoryIdx >= window._gcpHistory.length - 1;
}

function _gcpClearHistory() {
  window._gcpHistory = [];
  window._gcpHistoryIdx = -1;
  _gcpUpdateUndoRedoBtns();
}

// Guarda el estado en vivo de cada layer en su frame activo
function _gcpSaveCurrentToFrame() {
  const fi = window._gcpGlobalFrameIdx;
  window._gcpLayers.forEach(la => {
    if (!la._frames || fi < 0 || fi >= la._frames.length) return;
    la._frames[fi] = {x:la.x,y:la.y,width:la.width,height:la.height,rotation:la.rotation||0,opacity:la.opacity??1,visible:la._frames[fi]?.visible!==false};
  });
}

// Helper: total de frames global
function _gcpGetTotalFrames() {
  if (!window._gcpLayers.length) return 0;
  return Math.max(...window._gcpLayers.map(la => (la._frames||[]).length), 0);
}

// Inicializar _frames de un layer en el frame de inserción
function _gcpInitLayerFrames(la, startFi) {
  la._frames = [];
  const inv = {x:la.x,y:la.y,width:la.width,height:la.height,rotation:la.rotation||0,opacity:la.opacity??1,visible:false};
  for (let i = 0; i < startFi; i++) la._frames.push({...inv});
  la._frames.push({x:la.x,y:la.y,width:la.width,height:la.height,rotation:la.rotation||0,opacity:la.opacity??1,visible:true});
}

// Aplicar frame global fi a todas las capas
function _gcpApplyTempToLayers() {
  _gcpApplyFrame(window._gcpGlobalFrameIdx);
}

// _gcpSaveFrame: guarda el estado actual de todos los layers en el frame activo.
function _gcpSaveFrame() {
  if (!window._gcpLayers.length) { edToast('Añade objetos primero'); return; }
  const fi = window._gcpGlobalFrameIdx;
  window._gcpLayers.forEach(la => {
    if (!la._frames) la._frames = [];
    const snap = {x:la.x,y:la.y,width:la.width,height:la.height,
                  rotation:la.rotation||0,opacity:la.opacity??1,visible:true};
    if (fi < la._frames.length) {
      la._frames[fi] = snap;
    } else {
      // Rellenar huecos con invisible hasta fi-1, luego visible en fi
      while (la._frames.length < fi) {
        la._frames.push(la._frames.length
          ? {...la._frames[la._frames.length-1], visible:false}
          : {...snap, visible:false});
      }
      la._frames.push(snap);
    }
  });
  _gcpInvalidateAllThumbs();
  _gcpUpdateFrameNav();
  const _fb = document.getElementById('gcpFramesBar');
  if (_fb && _fb.style.display === 'flex') _gcpUpdateFramesBar();
  edToast('Frame ' + (fi+1) + ' guardado ✓');
}

// _gcpCaptureFrame: botón +. Copia exacta del frame activo como nuevo frame
// insertado justo después, avanza a él.
// Si algún layer no tiene frame en fi, lo crea primero.
function _gcpCaptureFrame() {
  if (!window._gcpLayers.length) { edToast('Añade objetos antes de crear un frame'); return; }
  const fi = window._gcpGlobalFrameIdx;
  window._gcpLayers.forEach(la => {
    if (!la._frames) la._frames = [];
    const snap = {x:la.x,y:la.y,width:la.width,height:la.height,
                  rotation:la.rotation||0,opacity:la.opacity??1,visible:true};
    // Asegurar que fi existe en este layer
    if (fi >= la._frames.length) {
      while (la._frames.length < fi) {
        la._frames.push(la._frames.length
          ? {...la._frames[la._frames.length-1], visible:false}
          : {...snap, visible:false});
      }
      la._frames.push(snap);
    }
    // Insertar copia exacta del frame fi justo después
    la._frames.splice(fi + 1, 0, {...la._frames[fi]});
  });
  const newFi = fi + 1;
  window._gcpGlobalFrameIdx = newFi;
  _gcpApplyFrame(newFi);
  _gcpInvalidateAllThumbs();
  _gcpClearHistory();
  _gcpPushHistory();
  _gcpUpdateFrameNav();
  const _fb = document.getElementById('gcpFramesBar');
  if (_fb && _fb.style.display === 'flex') _gcpUpdateFramesBar();
  edToast('Frame ' + (newFi+1) + ' creado ✓');
}

// Aplica un frame global fi: lee la._frames[fi] de cada layer
function _gcpApplyFrame(fi) {
  window._gcpLayers.forEach(la => {
    if (!la._frames || !la._frames.length) {
      // Sin frames aún: objeto recién insertado, siempre visible para editar
      la._gcpVisible = true; return;
    }
    if (fi >= la._frames.length) {
      // Columna más allá de los frames de esta capa → invisible
      la._gcpVisible = false; return;
    }
    const s = la._frames[fi]; if (!s) return;
    la.x=s.x; la.y=s.y; la.width=s.width; la.height=s.height;
    la.rotation=s.rotation; la.opacity=s.opacity??1;
    la._gcpVisible = (s.visible !== false);
  });
}

// Ir a un frame global
function _gcpGoToFrame(fi) {
  const total = _gcpGetTotalFrames();
  if (fi < 0 || (total > 0 && fi >= total)) return;
  window._gcpGlobalFrameIdx = fi;
  _gcpApplyFrame(fi);
  _gcpClearHistory();
  _gcpPushHistory();
  _gcpUpdateFrameNav();
  _gcpRedraw();
  const _gfb = document.getElementById('gcpFramesBar');
  if (_gfb && _gfb.style.display === 'flex') _gcpUpdateFramesBar();
}

// ── Cache de miniaturas: evita re-renderizar lo que no cambió ──────────────────
// Clave: "layerIdx-fi". Se invalida en _gcpInvalidateThumbCache(layerIdx, fi).
const _gcpThumbCache = new Map();
function _gcpThumbCacheKey(la, fi) {
  const idx = window._gcpLayers ? window._gcpLayers.indexOf(la) : -1;
  return idx + '-' + fi;
}
function _gcpInvalidateThumb(la, fi) {
  // fi === undefined → invalida todos los frames de ese layer
  if (fi === undefined) {
    const idx = window._gcpLayers ? window._gcpLayers.indexOf(la) : -1;
    if (idx < 0) return;
    for (const k of _gcpThumbCache.keys()) {
      if (k.startsWith(idx + '-')) _gcpThumbCache.delete(k);
    }
  } else {
    _gcpThumbCache.delete(_gcpThumbCacheKey(la, fi));
  }
}
function _gcpInvalidateAllThumbs() { _gcpThumbCache.clear(); }

// Miniatura de UN layer en frame fi (60x60). visible=false → overlay rojo ✖.
function _gcpLayerFrameThumb(la, fi, S) {
  S = S || 72;
  // Consultar cache antes de renderizar
  const cacheKey = _gcpThumbCacheKey(la, fi) + '-' + S;
  if (_gcpThumbCache.has(cacheKey)) return _gcpThumbCache.get(cacheKey);
  const tc = document.createElement('canvas'); tc.width=S; tc.height=S;
  const tctx = tc.getContext('2d');
  tctx.fillStyle='#f0f0f0'; tctx.fillRect(0,0,S,S);
  if (!la._frames || fi >= la._frames.length) return tc;
  const snap = la._frames[fi];
  if (!snap || snap.visible === false) {
    tctx.fillStyle='#1e293b'; tctx.fillRect(0,0,S,S);
    tctx.fillStyle='rgba(239,68,68,0.6)'; tctx.fillRect(0,0,S,S);
    tctx.fillStyle='#fff'; tctx.font='bold '+(S*0.4)+'px sans-serif';
    tctx.textAlign='center'; tctx.textBaseline='middle';
    tctx.fillText('✖', S/2, S/2);
    return tc;
  }
  const savedPos = {x:la.x,y:la.y,width:la.width,height:la.height,rotation:la.rotation||0,opacity:la.opacity??1};
  const _savedSel = window._gcpSelIdx;
  window._gcpSelIdx = -1;
  la.x=snap.x; la.y=snap.y; la.width=snap.width; la.height=snap.height;
  la.rotation=snap.rotation; la.opacity=snap.opacity??1;
  _gcpWithEditorContext(() => {
    const pw=edPageW(),ph=edPageH(),mx=edMarginX(),my=edMarginY();
    const extra=Math.round(Math.max(pw,ph)*0.5);
    const wsW=pw+mx*2+extra*2, wsH=ph+my*2+extra*2, offX=extra, offY=extra;
    const off=document.createElement('canvas'); off.width=wsW; off.height=wsH;
    const octx=off.getContext('2d');
    octx.setTransform(1,0,0,1,offX,offY);
    if(la.type==='gif'){if(la._oc&&la._ready&&la._oc.width>0){const gx=mx+la.x*pw-(la.width*pw)/2;const gy=my+la.y*ph-(la.height*ph)/2;octx.globalAlpha=la.opacity??1;octx.drawImage(la._oc,gx,gy,la.width*pw,la.height*ph);octx.globalAlpha=1;}}
    else if(la.type==='image'){la.draw(octx,off);}
    else if(la.type==='draw'){la.draw(octx);}
    else{octx.globalAlpha=la.opacity??1;la.draw(octx);octx.globalAlpha=1;}
    octx.setTransform(1,0,0,1,0,0);
    const idata=octx.getImageData(0,0,wsW,wsH).data;
    let x0=wsW,y0=wsH,x1=0,y1=0;
    for(let y=0;y<wsH;y++)for(let x=0;x<wsW;x++){if(idata[(y*wsW+x)*4+3]>10){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}}
    if(x1<=x0||y1<=y0){x0=mx+offX;y0=my+offY;x1=x0+pw-1;y1=y0+ph-1;}
    const pad=6;x0=Math.max(0,x0-pad);y0=Math.max(0,y0-pad);x1=Math.min(wsW-1,x1+pad);y1=Math.min(wsH-1,y1+pad);
    const cw=x1-x0+1,ch=y1-y0+1;const scale=Math.min(S/cw,S/ch);const dw=cw*scale,dh=ch*scale;
    tctx.fillStyle='#fff';tctx.fillRect((S-dw)/2,(S-dh)/2,dw,dh);
    tctx.drawImage(off,x0,y0,cw,ch,(S-dw)/2,(S-dh)/2,dw,dh);
  });
  la.x=savedPos.x;la.y=savedPos.y;la.width=savedPos.width;la.height=savedPos.height;la.rotation=savedPos.rotation;la.opacity=savedPos.opacity;
  window._gcpSelIdx=_savedSel;
  _gcpThumbCache.set(cacheKey, tc);
  return tc;
}

// Miniatura compuesta (todos los layers visibles) en frame fi
function _gcpFrameThumb(fi) {
  const S=60;
  const tc=document.createElement('canvas');tc.width=S;tc.height=S;
  const tctx=tc.getContext('2d');
  tctx.fillStyle='#f0f0f0';tctx.fillRect(0,0,S,S);
  if(!window._gcpLayers.length) return tc;
  const saved=window._gcpLayers.map(la=>({x:la.x,y:la.y,width:la.width,height:la.height,rotation:la.rotation||0,opacity:la.opacity??1}));
  const _savedSel=window._gcpSelIdx; window._gcpSelIdx=-1;
  _gcpApplyFrame(fi);
  _gcpWithEditorContext(()=>{
    const pw=edPageW(),ph=edPageH(),mx=edMarginX(),my=edMarginY();
    const extra=Math.round(Math.max(pw,ph)*0.5);
    const wsW=pw+mx*2+extra*2,wsH=ph+my*2+extra*2,offX=extra,offY=extra;
    const off=document.createElement('canvas');off.width=wsW;off.height=wsH;
    const octx=off.getContext('2d');octx.setTransform(1,0,0,1,offX,offY);
    window._gcpLayers.forEach(l=>{
      if(!l||typeof l.draw!=='function') return;
      if(l._gcpVisible===false) return;  // mismo guard que _gcpRedraw y renderSnap
      if(l.type==='gif'){if(l._oc&&l._ready&&l._oc.width>0){const gx=mx+l.x*pw-(l.width*pw)/2;const gy=my+l.y*ph-(l.height*ph)/2;octx.globalAlpha=l.opacity??1;octx.drawImage(l._oc,gx,gy,l.width*pw,l.height*ph);octx.globalAlpha=1;}}
      else if(l.type==='image'){l.draw(octx,off);}
      else if(l.type==='draw'){l.draw(octx);}
      else{octx.globalAlpha=l.opacity??1;l.draw(octx);octx.globalAlpha=1;}
    });
    octx.setTransform(1,0,0,1,0,0);
    const idata=octx.getImageData(0,0,wsW,wsH).data;
    let x0=wsW,y0=wsH,x1=0,y1=0;
    for(let y=0;y<wsH;y++)for(let x=0;x<wsW;x++){if(idata[(y*wsW+x)*4+3]>10){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}}
    if(x1<=x0||y1<=y0){x0=mx+offX;y0=my+offY;x1=x0+pw-1;y1=y0+ph-1;}
    const pad=6;x0=Math.max(0,x0-pad);y0=Math.max(0,y0-pad);x1=Math.min(wsW-1,x1+pad);y1=Math.min(wsH-1,y1+pad);
    const cw=x1-x0+1,ch=y1-y0+1;const scale=Math.min(S/cw,S/ch);const dw=cw*scale,dh=ch*scale;
    tctx.fillStyle='#fff';tctx.fillRect((S-dw)/2,(S-dh)/2,dw,dh);
    tctx.drawImage(off,x0,y0,cw,ch,(S-dw)/2,(S-dh)/2,dw,dh);
  });
  window._gcpSelIdx=_savedSel;
  saved.forEach((s,i)=>{const la=window._gcpLayers[i];if(!la)return;la.x=s.x;la.y=s.y;la.width=s.width;la.height=s.height;la.rotation=s.rotation;la.opacity=s.opacity;});
  return tc;
}

// Actualizar contador de frames en topbar
function _gcpUpdateFrameNav() {
  const nav = document.getElementById('gcpFrameNav');
  const num = document.getElementById('gcpFrameNum');
  if (!nav || !num) return;
  const total = _gcpGetTotalFrames();
  const hasLayers = window._gcpLayers && window._gcpLayers.length > 0;
  if (total <= 0 && !hasLayers) { nav.style.display = 'none'; return; }
  nav.style.display = '';
  num.textContent = total > 0 ? (window._gcpGlobalFrameIdx + 1) + ' / ' + total : '—';
  const prev = document.getElementById('gcpFramePrev');
  const next = document.getElementById('gcpFrameNext');
  if (prev) prev.disabled = window._gcpGlobalFrameIdx <= 0 || total === 0;
  if (next) next.disabled = window._gcpGlobalFrameIdx >= total - 1 || total === 0;
}

// Refrescar miniatura del frame activo (no-op ahora que la barra se reconstruye entera)
function _gcpRefreshActiveThumb() {
  const bar = document.getElementById('gcpFramesBar');
  if (bar && bar.style.display === 'flex') _gcpUpdateFramesBar();
}

// Toggle visibilidad del panel de frames
function _gcpToggleFramesBar() {
  const bar = document.getElementById('gcpFramesBar');
  const btn = document.getElementById('gcpFramesToggleBtn');
  if (!bar) return;
  const isOpen = bar.style.display === 'flex';
  if (isOpen) {
    bar.style.display = 'none';
    if (btn) { btn.textContent = 'Frames ▾'; btn.classList.remove('active'); }
  } else {
    bar.style.display = 'flex';
    if (btn) { btn.textContent = 'Frames ▴'; btn.classList.add('active'); }
    _gcpUpdateFramesBar();
  }
}

// Previsualizar la animación en el canvas GIF (botón ▶)
let _gcpPreviewTimer = null;
function _gcpPreview() {
  const total = _gcpGetTotalFrames();
  if (!total) { edToast('Sin frames para previsualizar'); return; }
  if (_gcpPreviewTimer) {
    clearTimeout(_gcpPreviewTimer);
    _gcpPreviewTimer = null;
    _gcpGoToFrame(window._gcpGlobalFrameIdx);
    const btn = document.getElementById('gcpPreviewBtn');
    if (btn) btn.textContent = '▶';
    return;
  }
  const btn = document.getElementById('gcpPreviewBtn');
  if (btn) btn.textContent = '⏹';
  let fi = 0;
  const delay = 150;
  const loop = () => {
    if (!_gcpPreviewTimer) return;
    _gcpApplyFrame(fi);
    _gcpRedraw();
    fi = (fi + 1) % total;
    _gcpPreviewTimer = setTimeout(loop, delay);
  };
  _gcpApplyFrame(0);
  _gcpRedraw();
  fi = 1;
  _gcpPreviewTimer = setTimeout(loop, delay);
}

// _gcpUpdateFramesBar — matriz 2D: una fila por objeto, columnas = frames globales.
// Patrón idéntico al refreshLayerTimelines() del HTML de referencia.
function _gcpUpdateFramesBar() {
  const bar = document.getElementById('gcpFramesBar');
  if (!bar) return;
  if (bar.style.display !== 'flex') return;
  bar.innerHTML = '';

  const total     = _gcpGetTotalFrames();
  const gfi       = window._gcpGlobalFrameIdx;
  if (!window._gcpLayers || !window._gcpLayers.length) return;

  window._gcpLayers.forEach((la, layerIdx) => {
    const isSelLayer  = (layerIdx === window._gcpSelIdx);
    const layerName   = la._gcpName || ('Obj ' + (layerIdx + 1));
    const layerFrames = la._frames ? la._frames.length : 0;

    // ── Fila ──────────────────────────────────────────────────────────
    const row = document.createElement('div');
    row.className = 'gcp-layer-row';

    // Columna izquierda: botón eliminar capa + etiqueta
    const leftCol = document.createElement('div');
    leftCol.style.cssText = 'flex-shrink:0;display:flex;flex-direction:column;align-items:center;' +
      'width:44px;min-width:44px;border-right:1px solid var(--gray-200);padding:2px 0;gap:2px;';

    // Botón eliminar capa
    const delLayerBtn = document.createElement('button');
    delLayerBtn.title = 'Eliminar capa ' + layerName;
    delLayerBtn.innerHTML = '<span style="color:#e63030;font-size:14px;font-weight:900;line-height:1">✕</span>';
    delLayerBtn.style.cssText = 'background:none;border:none;cursor:pointer;padding:2px 4px;' +
      'border-radius:4px;transition:background .15s;flex-shrink:0;';
    delLayerBtn.addEventListener('pointerenter', () => { delLayerBtn.style.background = '#fff0f0'; });
    delLayerBtn.addEventListener('pointerleave', () => { delLayerBtn.style.background = 'none'; });
    delLayerBtn.addEventListener('click', e => {
      e.stopPropagation();
      window._gcpLayers.splice(layerIdx, 1);
      _gcpInvalidateAllThumbs();
      // Ajustar selección
      if (window._gcpSelIdx >= window._gcpLayers.length)
        window._gcpSelIdx = window._gcpLayers.length - 1;
      // Ajustar frame global si el total cambia
      const newTotal = _gcpGetTotalFrames();
      if (window._gcpGlobalFrameIdx >= newTotal && newTotal > 0)
        window._gcpGlobalFrameIdx = newTotal - 1;
      _gcpApplyFrame(window._gcpGlobalFrameIdx);
      _gcpPushHistory();
      _gcpUpdateFrameNav();
      _gcpRedraw();
      _gcpUpdateFramesBar();
    });
    leftCol.appendChild(delLayerBtn);

    // Etiqueta
    const label = document.createElement('div');
    label.className = 'gcp-layer-label' + (isSelLayer ? ' sel' : '');
    label.style.cssText = 'font-size:9px;font-weight:900;text-align:center;' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%;padding:0 2px;' +
      'color:' + (isSelLayer ? '#ff6600' : 'var(--gray-500)') + ';';
    label.textContent = layerName;
    label.title = layerName;
    leftCol.appendChild(label);

    row.appendChild(leftCol);

    // Scroll horizontal de cards
    const scroll = document.createElement('div');
    scroll.className = 'gcp-layer-scroll';

    // ── Cards de frames ───────────────────────────────────────────────
    for (let fi = 0; fi < total; fi++) {
      const hasFrame  = fi < layerFrames;
      const snap      = hasFrame ? la._frames[fi] : null;
      const isVisible = snap && snap.visible !== false;
      const isCurrent = (fi === gfi) && isSelLayer;

      const card = document.createElement('div');
      card.className = 'ed-page-card' + (isCurrent ? ' current' : '');
      card.style.cursor = hasFrame ? 'pointer' : 'default';

      // Cabecera con número de columna
      const header = document.createElement('div');
      header.className = 'ed-page-header';
      const num = document.createElement('div');
      num.className = 'ed-page-num';
      num.textContent = fi + 1;
      header.appendChild(num);
      card.appendChild(header);

      if (!hasFrame) {
        // Celda vacía — capa sin frame en esta columna
        const empty = document.createElement('div');
        empty.className = 'ed-page-thumb';
        empty.style.cssText = 'width:88px;height:88px;display:flex;align-items:center;' +
          'justify-content:center;color:var(--gray-300);font-size:28px;background:var(--gray-100);';
        empty.textContent = '·';
        card.appendChild(empty);

      } else if (!isVisible) {
        // Frame invisible
        const hidden = document.createElement('div');
        hidden.className = 'ed-page-thumb';
        hidden.style.cssText = 'width:88px;height:88px;display:flex;align-items:center;' +
          'justify-content:center;font-size:28px;background:#fff0f0;color:#e63030;';
        hidden.textContent = '✖';
        card.appendChild(hidden);

      } else {
        // Miniatura real
        const thumb = _gcpLayerFrameThumb(la, fi, 88);
        thumb.className = 'ed-page-thumb';
        thumb.style.cssText = 'width:88px;height:88px;display:block;cursor:pointer;';
        card.appendChild(thumb);

        // Acciones ⧉ ✕
        const actions = document.createElement('div');
        actions.className = 'ed-page-actions';

        const dupBtn = document.createElement('button');
        dupBtn.className = 'ed-page-action-btn';
        dupBtn.title = 'Duplicar frame';
        dupBtn.innerHTML = '⧉';
        dupBtn.addEventListener('click', e => {
          e.stopPropagation();
          const copy = {...la._frames[fi]};
          la._frames.splice(fi + 1, 0, copy);
          window._gcpGlobalFrameIdx = fi + 1;
          _gcpApplyFrame(window._gcpGlobalFrameIdx);
          _gcpUpdateFrameNav();
          _gcpRedraw();
          _gcpUpdateFramesBar();
        });
        actions.appendChild(dupBtn);

        const delBtn = document.createElement('button');
        delBtn.className = 'ed-page-action-btn ed-page-del';
        delBtn.title = 'Eliminar frame';
        delBtn.innerHTML = '<span style="color:#e63030;font-weight:900">✕</span>';
        delBtn.addEventListener('click', e => {
          e.stopPropagation();
          if (la._frames.length <= 1) return;
          la._frames.splice(fi, 1);
          const newTotal = _gcpGetTotalFrames();
          if (window._gcpGlobalFrameIdx >= newTotal)
            window._gcpGlobalFrameIdx = Math.max(0, newTotal - 1);
          _gcpApplyFrame(window._gcpGlobalFrameIdx);
          _gcpUpdateFrameNav();
          _gcpRedraw();
          _gcpUpdateFramesBar();
        });
        actions.appendChild(delBtn);
        card.appendChild(actions);
      }

      // Click → navegar al frame y seleccionar esta capa
      if (hasFrame) {
        card.addEventListener('click', e => {
          if (e.target.closest('.ed-page-action-btn')) return;
          e.stopPropagation();
          window._gcpSelIdx = layerIdx;
          _gcpGoToFrame(fi);
        });
      }

      scroll.appendChild(card);
    }

    // Card "en edición" al final de cada fila
    const liveCard = document.createElement('div');
    liveCard.className = 'ed-page-card' + (isSelLayer ? ' current' : '');
    liveCard.style.cssText = 'cursor:default;opacity:.75;flex-shrink:0;';
    const liveHeader = document.createElement('div');
    liveHeader.className = 'ed-page-header';
    const liveNum = document.createElement('div');
    liveNum.className = 'ed-page-num';
    liveNum.textContent = total + 1;
    liveHeader.appendChild(liveNum);
    liveCard.appendChild(liveHeader);
    const liveThumb = document.createElement('div');
    liveThumb.className = 'ed-page-thumb';
    liveThumb.style.cssText = 'width:88px;height:88px;display:flex;align-items:center;' +
      'justify-content:center;font-size:10px;color:#aaa;background:#f8f8f8;' +
      'border:1.5px dashed #ddd;border-radius:6px;text-align:center;line-height:1.3;';
    liveThumb.innerHTML = isSelLayer ? '✏️<br>editando' : '—';
    liveCard.appendChild(liveThumb);
    scroll.appendChild(liveCard);

    row.appendChild(scroll);
    bar.appendChild(row);
  });
}

function _gcpRedraw() {
  if (!gcpCtx || !gcpCanvas) return;
  const cw = gcpCanvas.width, ch = gcpCanvas.height;
  if (!cw || !ch) return;
  gcpCtx.setTransform(1, 0, 0, 1, 0, 0);
  gcpCtx.clearRect(0, 0, cw, ch);
  gcpCtx.setTransform(edCamera.z, 0, 0, edCamera.z, edCamera.x, edCamera.y);
  // Dibujar capas — mismo orden que edRedraw, respetando visibilidad por frame
  window._gcpLayers.forEach(l => {
    if (!l || typeof l.draw !== 'function') return;
    if (l._gcpVisible === false) return;  // oculto en este frame global
    if (l.type === 'image' || l.type === 'gif') {
      l.draw(gcpCtx, gcpCanvas);
    } else if (l.type === 'text' || l.type === 'bubble') {
      l.draw(gcpCtx, gcpCanvas);
    } else {
      gcpCtx.globalAlpha = l.opacity ?? 1;
      l.draw(gcpCtx);
      gcpCtx.globalAlpha = 1;
    }
  });
  // Dibujar handles de selección — copia de edDrawSel usando gcpCtx y _gcpLayers
  _gcpDrawSel();
  gcpCtx.setTransform(1, 0, 0, 1, 0, 0);
}

// Copia de edDrawSel adaptada al canvas GIF
function _gcpDrawSel() {
  const idx = window._gcpSelIdx;
  if (idx < 0 || idx >= window._gcpLayers.length) return;
  const la = window._gcpLayers[idx];
  if (!la) return;
  const pw = edPageW(), ph = edPageH();
  const z = edCamera.z;
  const lw = 1 / z;
  const hr = 6 / z;
  const hrRot = 8 / z;
  const cx = edMarginX() + la.x * pw;
  const cy = edMarginY() + la.y * ph;
  const w = la.width * pw;
  const h = la.height * ph;
  const rot = (la.rotation || 0) * Math.PI / 180;
  gcpCtx.save();
  gcpCtx.translate(cx, cy);
  gcpCtx.rotate(rot);
  gcpCtx.strokeStyle = '#1a8cff';
  gcpCtx.lineWidth = lw;
  gcpCtx.setLineDash([5/z, 3/z]);
  gcpCtx.strokeRect(-w/2, -h/2, w, h);
  gcpCtx.setLineDash([]);
  // Handles de escala (esquinas + centros de lados)
  const corners = [[-w/2,-h/2],[w/2,-h/2],[-w/2,h/2],[w/2,h/2],[0,-h/2],[0,h/2],[-w/2,0],[w/2,0]];
  corners.forEach(([hx, hy]) => {
    gcpCtx.beginPath(); gcpCtx.arc(hx, hy, hr, 0, Math.PI * 2);
    gcpCtx.fillStyle = '#fff'; gcpCtx.fill();
    gcpCtx.strokeStyle = '#1a8cff'; gcpCtx.lineWidth = lw * 1.5; gcpCtx.stroke();
  });
  // Handle de rotación
  const rotY = -h/2 - 28/z;
  gcpCtx.beginPath(); gcpCtx.moveTo(0, -h/2); gcpCtx.lineTo(0, rotY + hrRot);
  gcpCtx.strokeStyle = '#1a8cff'; gcpCtx.lineWidth = lw; gcpCtx.stroke();
  gcpCtx.beginPath(); gcpCtx.arc(0, rotY, hrRot, 0, Math.PI * 2);
  gcpCtx.fillStyle = '#1a8cff'; gcpCtx.fill();
  gcpCtx.strokeStyle = '#fff'; gcpCtx.lineWidth = lw * 1.5; gcpCtx.stroke();
  gcpCtx.restore();
}

// Dropdown de capas GIF
function _gcpRenderLayersDropdown(dd) {
  dd.innerHTML = '';
  if (!window._gcpLayers.length) {
    const d = document.createElement('div');
    d.className = 'ed-dropdown-item';
    d.style.color = 'var(--gray-400)'; d.style.fontSize = '0.78rem'; d.style.cursor = 'default';
    d.textContent = 'Sin capas — inserta desde Biblioteca';
    dd.appendChild(d); return;
  }
  const tipos = { image:'🖼', shape:'⬛', line:'╱', stroke:'✏️', draw:'🖌️', text:'T', bubble:'💬', gif:'🎬' };
  window._gcpLayers.forEach((la, idx) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;width:100%';
    const btn = document.createElement('button');
    btn.className = 'ed-dropdown-item' + (idx === window._gcpSelIdx ? ' active' : '');
    btn.style.cssText = 'flex:1;text-align:left';
    btn.textContent = (tipos[la.type] || '•') + ' Capa ' + (idx + 1);
    btn.addEventListener('click', () => { window._gcpSelIdx = idx; _gcpRenderLayersDropdown(dd); _gcpRedraw(); });
    const del = document.createElement('button');
    del.textContent = '✕';
    del.style.cssText = 'background:none;border:none;color:#c00;cursor:pointer;padding:0 6px;flex-shrink:0';
    del.addEventListener('click', e => {
      e.stopPropagation();
      window._gcpLayers.splice(idx, 1);
      window._gcpSelIdx = Math.min(window._gcpSelIdx, window._gcpLayers.length - 1);
      _gcpRenderLayersDropdown(dd); _gcpRedraw();
    });
    row.appendChild(btn); row.appendChild(del); dd.appendChild(row);
  });
}

// Convierte una capa vectorial (shape/line) a ImageLayer PNG transparente.
// Usa el mismo sistema de _edRenderPageThumb: canvas pw×ph con
// setTransform(1,0,0,1,-mx,-my) para que draw() coloque correctamente.
// Preserva proporciones recortando al bbox del contenido.
function _gcpVectorToImage(la, cb) {
  const pw = edPageW(), ph = edPageH();
  const mx = edMarginX(), my = edMarginY();
  // Extra para capturar rotaciones que sobresalen — igual que _gcpSaveToLib
  const extra = Math.round(Math.max(pw, ph) * 0.5);
  const wsW = pw + mx*2 + extra*2;
  const wsH = ph + my*2 + extra*2;
  const offX = extra, offY = extra;

  const off = document.createElement('canvas');
  off.width = wsW; off.height = wsH;
  const octx = off.getContext('2d');
  octx.setTransform(1, 0, 0, 1, offX, offY);
  octx.globalAlpha = la.opacity ?? 1;
  la.draw(octx);
  octx.globalAlpha = 1;
  octx.setTransform(1, 0, 0, 1, 0, 0);

  // Bbox por alpha > 10
  const d = octx.getImageData(0, 0, wsW, wsH).data;
  let x0=wsW, y0=wsH, x1=0, y1=0;
  for (let y=0; y<wsH; y++) for (let x=0; x<wsW; x++) {
    if (d[(y*wsW+x)*4+3] > 10) {
      if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y;
    }
  }
  if (x1<=x0||y1<=y0) { x0=mx+offX; y0=my+offY; x1=x0+pw-1; y1=y0+ph-1; }
  const pad=4;
  x0=Math.max(0,x0-pad); y0=Math.max(0,y0-pad);
  x1=Math.min(wsW-1,x1+pad); y1=Math.min(wsH-1,y1+pad);
  const cw=x1-x0+1, ch=y1-y0+1;

  // Canvas recortado — PNG transparente
  const crop = document.createElement('canvas');
  crop.width=cw; crop.height=ch;
  crop.getContext('2d').drawImage(off, x0, y0, cw, ch, 0, 0, cw, ch);
  const dataUrl = crop.toDataURL('image/png');

  // Proporciones normalizadas (fracción de página)
  const normW = cw/pw, normH = ch/ph;
  const scale = Math.max(normW/0.9, normH/0.9, 1);
  const finalW = normW/scale, finalH = normH/scale;

  // Crear ImageLayer con proporciones correctas
  const img = new Image();
  img.onload = () => {
    const imgLayer = new ImageLayer(img, la.x, la.y, finalW);
    imgLayer.height = finalH;
    imgLayer.rotation = la.rotation || 0;
    imgLayer.opacity = la.opacity ?? 1;
    imgLayer.src = dataUrl;
    imgLayer._keepSize = true;
    cb(imgLayer);
  };
  img.src = dataUrl;
}

// gcpInsertFromBib — inserta desde biblioteca en el canvas GIF.
// Shapes y lines se convierten a ImageLayer PNG para independencia entre frames.
function gcpInsertFromBib(entry) {
  const doInsert = (la) => {
    if (la.type === 'image' && la.img) {
      const origOnload = la.img.onload;
      la.img.onload = function() { if (origOnload) origOnload.call(this); _gcpRedraw(); };
    }
    // Nombre visible en la barra
    la._gcpName = la.type === 'gif' ? 'GIF' : la.type === 'image' ? 'Img' : (la.type || 'Obj');
    la._gcpVisible = true;
    const _totalAtInsert = _gcpGetTotalFrames();
    const _curFi = window._gcpGlobalFrameIdx;
    la._frames = [];
    if (_totalAtInsert > 0) {
      // Rellenar con invisible en frames anteriores/posteriores, visible en frame actual
      const _inv = {x:la.x,y:la.y,width:la.width,height:la.height,rotation:la.rotation||0,opacity:la.opacity??1,visible:false};
      const _vis = {x:la.x,y:la.y,width:la.width,height:la.height,rotation:la.rotation||0,opacity:la.opacity??1,visible:true};
      for (let _i = 0; _i < _totalAtInsert; _i++) la._frames.push(_i === _curFi ? {..._vis} : {..._inv});
    }
    // Sin frames previos: _frames vacío hasta que se pulse Guardar Frame
    window._gcpLayers.push(la);
    window._gcpSelIdx = window._gcpLayers.length - 1;
    _gcpInvalidateAllThumbs();
    _gcpUpdateFrameNav();
    const _fb = document.getElementById('gcpFramesBar');
    if (_fb && _fb.style.display === 'flex') _gcpUpdateFramesBar();
    _gcpRedraw();
  };

  const insertLayer = (la) => {
    if (la.type === 'shape' || la.type === 'line') {
      // Convertir vectorial a imagen PNG — así cada frame tiene su propia imagen independiente
      _gcpVectorToImage(la, imgLayer => doInsert(imgLayer));
    } else {
      doInsert(la);
    }
  };

  if (entry.isGroup && Array.isArray(entry.layers)) {
    const newGroupId = _edNewGroupId();
    entry.layers.forEach(ld => {
      const la = edDeserLayer(ld, edOrientation);
      if (!la) return;
      la.groupId = newGroupId;
      insertLayer(la);
    });
  } else {
    const la = edDeserLayer(entry.layerData, edOrientation);
    if (!la) return;
    insertLayer(la);
  }
}

// gcpOpen — inicializa gcpCanvas y gcpCtx igual que el editor inicializa
// edCanvas y edCtx en EditorView_init
// edLayerIdx: índice en edLayers del GifLayer que se va a re-editar (-1 = nuevo)
function gcpOpen(edLayerIdx) {
  const shell = document.getElementById('gcpShell');
  const ec    = document.getElementById('editorCanvas');
  if (!shell || !ec) return;

  gcpCanvas = document.getElementById('gcpCanvas');
  if (!gcpCanvas) return;
  gcpCtx = gcpCanvas.getContext('2d');

  gcpCanvas.width  = ec.width;
  gcpCanvas.height = ec.height;
  gcpCanvas.style.left   = '0';
  gcpCanvas.style.top    = ec.style.top;
  gcpCanvas.style.width  = ec.style.width;
  gcpCanvas.style.height = ec.style.height;
  gcpCanvas.style.display       = 'block';
  gcpCanvas.style.pointerEvents = 'auto';

  // Guardar qué capa del editor se está editando (para actualizarla al cerrar)
  window._gcpEdLayerIdx = (typeof edLayerIdx === 'number' && edLayerIdx >= 0) ? edLayerIdx : -1;

  // Limpiar y resetear capas
  gcpCtx.clearRect(0, 0, gcpCanvas.width, gcpCanvas.height);
  window._gcpLayers         = [];
  window._gcpSelIdx         = -1;
  window._gcpGlobalFrameIdx = 0;
  window._gcpHistory = []; window._gcpHistoryIdx = -1;
  // Cerrar barra de frames al abrir editor
  const _frBar = document.getElementById('gcpFramesBar');
  if (_frBar) { _frBar.style.display='none'; _frBar.innerHTML=''; }
  const _ftBtn = document.getElementById('gcpFramesToggleBtn');
  if (_ftBtn) { _ftBtn.textContent='Frames ▾'; _ftBtn.classList.remove('active'); }
  window._gcpGlobalFrameIdx = 0;

  // Si re-editamos una animación existente, restaurar sus capas serializadas
  if (window._gcpEdLayerIdx >= 0) {
    const gifLayer = edLayers[window._gcpEdLayerIdx];
    const hasData = gifLayer && gifLayer._gcpLayersData;
    if (hasData) {
      const restoredLayers = gifLayer._gcpLayersData
        .map(ld => edDeserLayer(ld, edOrientation))
        .filter(Boolean);
      restoredLayers.forEach((la, li) => {
        // Restaurar _frames por layer (nuevo formato: array de arrays por layer)
        if (gifLayer._gcpFramesData && Array.isArray(gifLayer._gcpFramesData[li])) {
          la._frames = gifLayer._gcpFramesData[li].map(s => ({...s}));
        } else {
          // Compatibilidad con formato antiguo (array de snaps globales)
          la._frames = [{x:la.x,y:la.y,width:la.width,height:la.height,rotation:la.rotation||0,opacity:la.opacity??1,visible:true}];
        }
        if (la.type === 'image' && la.img) {
          const prev = la.img.onload;
          la.img.onload = function() { if (prev) prev.call(this); _gcpRedraw(); };
          if (la.img.complete && la.img.naturalWidth > 0) setTimeout(_gcpRedraw, 0);
        }
        // Restaurar nombre de capa
        la._gcpName = (gifLayer._gcpLayerNames && gifLayer._gcpLayerNames[li])
          || (la.type === 'gif' ? 'GIF' : la.type === 'image' ? 'Img' : (la.type || 'Obj'));
        // Inicializar visibilidad según el frame 0
        la._gcpVisible = !(la._frames && la._frames[0] && la._frames[0].visible === false);
        window._gcpLayers.push(la);
      });
      window._gcpSelIdx = window._gcpLayers.length > 0 ? 0 : -1;
      const titleEl = document.getElementById('gcpProjectTitle');
      if (titleEl) titleEl.textContent = 'Editar GIF';
    }
  }
  // Leer comportamientos guardados de la capa y reflejarlos en la UI
  if (window._gcpEdLayerIdx >= 0) {
    const _gl = edLayers[window._gcpEdLayerIdx];
    if (_gl) {
      if (_gl._gcpFrameDelay  != null) window._gcpFrameDelay  = _gl._gcpFrameDelay;
      if (_gl._gcpRepeatCount != null) window._gcpRepeatCount = _gl._gcpRepeatCount;
      if (_gl._gcpStopAtEnd   != null) window._gcpStopAtEnd   = !!_gl._gcpStopAtEnd;
    }
    // Actualizar chips en la UI
    document.querySelectorAll('[data-gcpfps]').forEach(b => {
      const fps = Math.round(1000 / Math.max(window._gcpFrameDelay, 1));
      b.classList.toggle('active', parseInt(b.dataset.gcpfps, 10) === fps);
    });
    document.querySelectorAll('[data-gcprep]').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.gcprep, 10) === window._gcpRepeatCount);
    });
    document.querySelectorAll('[data-gcpstop]').forEach(b => {
      b.classList.toggle('active', !!window._gcpStopAtEnd);
    });
  }

  // Aplicar frame 0 si hay frames; sesión nueva queda en gfi=0 listo para recibir objetos
  if (_gcpGetTotalFrames() > 0) {
    window._gcpGlobalFrameIdx = 0;
    _gcpApplyFrame(0);
    requestAnimationFrame(() => _gcpUpdateFramesBar());
  } else {
    window._gcpGlobalFrameIdx = 0;
  }
  _gcpUpdateFrameNav();

  // Deseleccionar objetos del editor
  edSelectedIdx = -1;
  edCloseMenus();
  edRedraw();

  // Bloquear editor general
  ec.classList.add('gcp-active');
  window._gcpActive = true;
  document.getElementById('editorShell')?.classList.add('gcp-open');



  // Mostrar overlay y bloqueante
  shell.style.display = 'block';
  const blocker = document.getElementById('gcpBlocker');
  if (blocker) {
    blocker.style.display = 'block';
    if (!blocker._gcpBound) {
      blocker._gcpBound = true;
      // El bloqueante es solo visual — los eventos los gestiona _edDocDownFn/_gcpDocDownFn
      // Solo bloquear touchstart para evitar scroll en Android
      blocker.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
      blocker.addEventListener('touchmove',  e => e.preventDefault(), { passive: false });
    }
  }

  // Registrar botones (solo primera vez)
  if (!shell._gcpBound) {
    shell._gcpBound = true;

    document.getElementById('gcpCloseBtn')?.addEventListener('click', gcpClose);
    document.getElementById('gcpPreviewBtn')?.addEventListener('pointerup', e => {
      e.stopPropagation();
      _gcpPreview();
    });

    document.getElementById('gcpBibBtn')?.addEventListener('click', () => {
      const panel = $('edOptionsPanel');
      if (panel) _bibRenderPanel(panel);
    });

    // Botones undo/redo
    document.getElementById('gcpUndoBtn')?.addEventListener('pointerup', e => {
      e.stopPropagation(); _gcpUndo();
    });
    document.getElementById('gcpRedoBtn')?.addEventListener('pointerup', e => {
      e.stopPropagation(); _gcpRedo();
    });
    // Botones navegación de frames en topbar — entre frames guardados
    document.getElementById('gcpFramePrev')?.addEventListener('click', e => {
      e.stopPropagation();
      if (window._gcpGlobalFrameIdx > 0) _gcpGoToFrame(window._gcpGlobalFrameIdx - 1);
    });
    document.getElementById('gcpFrameNext')?.addEventListener('click', e => {
      e.stopPropagation();
      if (window._gcpGlobalFrameIdx < _gcpGetTotalFrames() - 1) _gcpGoToFrame(window._gcpGlobalFrameIdx + 1);
    });
    // Botón Guardar Frame
    document.getElementById('gcpSaveFrameBtn')?.addEventListener('pointerup', e => {
      e.stopPropagation(); _gcpSaveFrame();
    });
    // Botón Añadir Frame (+ copia del frame actual)
    document.getElementById('gcpAddFrameBtn')?.addEventListener('pointerup', e => {
      e.stopPropagation(); _gcpCaptureFrame();
    });
    // Botón toggle Frames
    document.getElementById('gcpFramesToggleBtn')?.addEventListener('pointerup', e => {
      e.stopPropagation(); _gcpToggleFramesBar();
    });
    // Botones del dropdown Guardar
    document.getElementById('gcpSaveAppBtn')?.addEventListener('pointerup', e => {
      e.stopPropagation();
      document.querySelectorAll('[id^="gdd-"]').forEach(d=>d.classList.remove('open'));
      edToast('Guardando…');
      _gcpSaveToLib(null);
    });
    document.getElementById('gcpDownloadApngBtn')?.addEventListener('pointerup', e => {
      e.stopPropagation();
      document.querySelectorAll('[id^="gdd-"]').forEach(d=>d.classList.remove('open'));
      _gcpDownloadApng();
    });
    document.getElementById('gcpDownloadGifBtn')?.addEventListener('pointerup', e => {
      e.stopPropagation();
      document.querySelectorAll('[id^="gdd-"]').forEach(d=>d.classList.remove('open'));
      _gcpDownloadGif();
    });
    // Botón Comportamiento — abre/cierra subpanel inline sin cerrar el dropdown
    document.getElementById('gcpBehaviourBtn')?.addEventListener('pointerup', e => {
      e.stopPropagation();
      const panel = document.getElementById('gcpBehaviourPanel');
      if (panel) panel.classList.toggle('open');
    });
    // Chips de velocidad (fps)
    document.querySelectorAll('[data-gcpfps]').forEach(btn => {
      btn.addEventListener('pointerup', e => {
        e.stopPropagation();
        document.querySelectorAll('[data-gcpfps]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        window._gcpFrameDelay = Math.round(1000 / parseInt(btn.dataset.gcpfps, 10));
      });
    });
    // Chips de repeticiones
    document.querySelectorAll('[data-gcprep]').forEach(btn => {
      btn.addEventListener('pointerup', e => {
        e.stopPropagation();
        document.querySelectorAll('[data-gcprep]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        window._gcpRepeatCount = parseInt(btn.dataset.gcprep, 10);
      });
    });
    // Chip Stop al final (toggle)
    document.querySelectorAll('[data-gcpstop]').forEach(btn => {
      btn.addEventListener('pointerup', e => {
        e.stopPropagation();
        window._gcpStopAtEnd = !window._gcpStopAtEnd;
        btn.classList.toggle('active', window._gcpStopAtEnd);
      });
    });

    // Menús GIF
    document.querySelectorAll('[data-gcpmenu]').forEach(btn => {
      btn.addEventListener('pointerup', e => {
        e.stopPropagation();
        const id = btn.dataset.gcpmenu;
        const dd = document.getElementById('gdd-' + id);
        if (!dd) return;
        const open = dd.classList.contains('open');
        document.querySelectorAll('[id^="gdd-"]').forEach(d => d.classList.remove('open'));
        if (!open) {
          if (id === 'capas') _gcpRenderLayersDropdown(dd);
          dd.classList.add('open');
        }
      });
    });

    document.addEventListener('pointerdown', e => {
      if (!window._gcpActive) return;
      if (!e.target.closest('[data-gcpmenu]') && !e.target.closest('[id^="gdd-"]'))
        document.querySelectorAll('[id^="gdd-"]').forEach(d => d.classList.remove('open'));
    }, { passive: true });

    // Los handlers de selección/drag/rotate/resize se registran en document
    // igual que _edDocDownFn — ver _gcpHandleDown/Move/Up más abajo
  }
}

// gcpClose
function _gcpDoClose() {
  // Detener preview si está activa
  if (_gcpPreviewTimer) { clearTimeout(_gcpPreviewTimer); _gcpPreviewTimer = null; }
  const preBtn = document.getElementById('gcpPreviewBtn');
  if (preBtn) preBtn.textContent = '▶';
  const panel = $('edOptionsPanel');
  if (panel && panel.classList.contains('open')) {
    panel.classList.remove('open');
    panel.innerHTML = '';
    delete panel.dataset.mode;
    requestAnimationFrame(edFitCanvas);
  }
  if (gcpCanvas) { gcpCanvas.style.display = 'none'; gcpCanvas.style.pointerEvents = 'none'; }
  const shell = document.getElementById('gcpShell');
  if (shell) shell.style.display = 'none';
  window._gcpActive = false;
  window._gcpEdLayerIdx = -1;
  _gs = null;
  gcpCanvas = null; gcpCtx = null;
  document.getElementById('editorShell')?.classList.remove('gcp-open');
  document.getElementById('editorCanvas')?.classList.remove('gcp-active');
  const blocker = document.getElementById('gcpBlocker');
  if (blocker) blocker.style.display = 'none';
  // Restaurar título del gcpShell para próxima apertura
  const titleEl = document.getElementById('gcpProjectTitle');
  if (titleEl) titleEl.textContent = 'Gif 1';
  edRedraw();
}

function gcpClose() {
  if (!window._gcpLayers || !window._gcpLayers.length) { _gcpDoClose(); return; }
  document.getElementById('_gcpSavePop')?.remove();
  const pop = document.createElement('div');
  pop.id = '_gcpSavePop';
  pop.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;touch-action:none';
  pop.innerHTML = `<div style="background:#fff;border-radius:12px;padding:24px 20px;max-width:300px;width:90%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.3)">
    <p style="margin:0 0 20px;font-size:1rem;font-weight:600;color:#222">¿Guardar la animación en la Biblioteca?</p>
    <div style="display:flex;gap:10px;justify-content:center">
      <button id="_gcpPopNo" style="flex:1;padding:10px;border:1.5px solid #ccc;border-radius:8px;background:#f5f5f5;font-size:.9rem;cursor:pointer">No guardar</button>
      <button id="_gcpPopSi" style="flex:1;padding:10px;border:none;border-radius:8px;background:#ffe066;font-size:.9rem;font-weight:700;cursor:pointer">Guardar</button>
    </div>
  </div>`;
  document.body.appendChild(pop);
  pop.querySelector('#_gcpPopNo').addEventListener('pointerup', () => {
    pop.remove(); _gcpDoClose();
  });
  pop.querySelector('#_gcpPopSi').addEventListener('pointerup', () => {
    pop.remove();
    edToast('Guardando...');
    _gcpSaveToLib(() => _gcpDoClose());
  });
}

function _gcpSaveToLib(onDone) {
  if (!window._gcpLayers.length || !gcpCanvas || !gcpCtx) { onDone && onDone(); return; }
  const layers  = window._gcpLayers.slice();
  const pageW   = Math.round(edPageW()),  pageH  = Math.round(edPageH());
  const marginX = Math.round(edMarginX()), marginY = Math.round(edMarginY());
  // Total de frames globales usando el sistema por-layer
  const totalFrames = _gcpGetTotalFrames() || 1;

  const extra = Math.round(Math.max(pageW, pageH) * 0.5);
  const wsW = pageW + marginX*2 + extra*2;
  const wsH = pageH + marginY*2 + extra*2;
  const offX = extra, offY = extra;

  // Renderizar frame global fi — usa _gcpApplyFrame que setea _gcpVisible por layer.
  // Idéntico a _gcpRedraw: si _gcpVisible===false el layer no se dibuja.
  const renderSnap = (snap, fi) => {
    _gcpApplyFrame(fi);   // actualiza posición Y _gcpVisible de cada layer
    const fc = document.createElement('canvas');
    fc.width = wsW; fc.height = wsH;
    const fctx = fc.getContext('2d');
    fctx.setTransform(1, 0, 0, 1, offX, offY);
    layers.forEach(l => {
      if (!l || typeof l.draw !== 'function') return;
      if (l._gcpVisible === false) return;   // mismo guard que _gcpRedraw
      if (l.type==='image'||l.type==='gif') l.draw(fctx, fc);
      else if (l.type==='text'||l.type==='bubble') l.draw(fctx, fc);
      else { fctx.globalAlpha = l.opacity??1; l.draw(fctx); fctx.globalAlpha=1; }
    });
    fctx.setTransform(1,0,0,1,0,0);
    return fc;
  };

  // Renderizar todos los frames globales
  const renderedFrames = Array.from({length: totalFrames}, (_, fi) => renderSnap(null, fi));
  let minX=wsW, minY=wsH, maxX=0, maxY=0;
  renderedFrames.forEach(fc => {
    const d = fc.getContext('2d').getImageData(0,0,wsW,wsH).data;
    for (let y=0; y<wsH; y++) for (let x=0; x<wsW; x++) {
      if (d[(y*wsW+x)*4+3] > 10) {
        if (x<minX) minX=x; if (x>maxX) maxX=x;
        if (y<minY) minY=y; if (y>maxY) maxY=y;
      }
    }
  });
  if (maxX<minX || maxY<minY) {
    minX=marginX+offX; minY=marginY+offY;
    maxX=minX+pageW-1; maxY=minY+pageH-1;
  }
  const pad=4;
  const cropX=Math.max(0,minX-pad), cropY=Math.max(0,minY-pad);
  const cropW=Math.min(wsW,maxX+pad+1)-cropX;
  const cropH=Math.min(wsH,maxY+pad+1)-cropY;

  // Convertir cada frame renderizado a PNG dataUrl recortado y transparente
  const pngFrames = renderedFrames.map(fc => {
    const c = document.createElement('canvas');
    c.width=cropW; c.height=cropH;
    c.getContext('2d').drawImage(fc, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    return c.toDataURL('image/png');
  });

  // Miniatura desde el primer frame
  const S=80;
  const thumbC=document.createElement('canvas'); thumbC.width=S; thumbC.height=S;
  const tc2=thumbC.getContext('2d');
  tc2.fillStyle='#f0f0f0'; tc2.fillRect(0,0,S,S);
  const sc=Math.min((S-4)/Math.max(cropW,1),(S-4)/Math.max(cropH,1));
  tc2.drawImage(renderedFrames[0], cropX,cropY,cropW,cropH, (S-cropW*sc)/2,(S-cropH*sc)/2,cropW*sc,cropH*sc);
  const thumb=thumbC.toDataURL('image/png',0.7);

  // Proporciones normalizadas (fracción de página)
  const _gcpNormW = cropW/pageW;
  const _gcpNormH = cropH/pageH;

  // Serializar capas para re-edición
  const gcpLayersData = window._gcpLayers
    .map(l => { try { return edSerLayer(l); } catch(e) { return null; } }).filter(Boolean);
  // Serializar frames por layer (nuevo formato: array de arrays)
  const gcpFramesData = window._gcpLayers.map(la => (la._frames||[]).map(s=>({...s})));
  // Preservar nombres de capas (_gcpName no lo guarda edSerLayer)
  const gcpLayerNames = window._gcpLayers.map(la => la._gcpName || null);

  // Restaurar estado del frame activo
  _gcpApplyFrame(window._gcpGlobalFrameIdx);

  // Guardar en biblioteca — si re-edición sobreescribir el item existente
  const data = _bibLoad();
  const animFolder = _bibGetAnimFolder(data);
  const existingLayerForBib = (window._gcpEdLayerIdx >= 0) ? edLayers[window._gcpEdLayerIdx] : null;
  // Buscar item existente por animKey del layer o por _bibItemId guardado en el layer
  const _existingBibIdx = existingLayerForBib
    ? animFolder.items.findIndex(it =>
        (existingLayerForBib._bibItemId && it.id === existingLayerForBib._bibItemId) ||
        (existingLayerForBib.animKey && it.animKey === existingLayerForBib.animKey)
      )
    : -1;
  const _bibItemId = _existingBibIdx >= 0
    ? animFolder.items[_existingBibIdx].id   // conservar el mismo id
    : Date.now() + '_gif';                    // nuevo id
  const _newBibItem = {
    id: _bibItemId, timestamp: Date.now(),
    isGroup: false, isGifAnim: true,
    gifDataUrl: pngFrames[0],
    pngFrames,
    gcpLayersData, gcpFramesData, gcpLayerNames,
    normW: _gcpNormW, normH: _gcpNormH,
    layerData: null, thumb,
    gcpFrameDelay:  window._gcpFrameDelay,
    gcpRepeatCount: window._gcpRepeatCount,
    gcpStopAtEnd:   window._gcpStopAtEnd,
    animKey: existingLayerForBib?.animKey || null,
  };
  if (_existingBibIdx >= 0) {
    animFolder.items[_existingBibIdx] = _newBibItem;  // sobreescribir
  } else {
    animFolder.items.push(_newBibItem);               // nuevo item
  }
  // Guardar el id del item en el layer para futuras re-ediciones
  if (existingLayerForBib) existingLayerForBib._bibItemId = _bibItemId;
  _bibSave(data);

  // Si re-editamos capa existente, actualizarla in-place
  const existingLayer = (window._gcpEdLayerIdx>=0) ? edLayers[window._gcpEdLayerIdx] : null;
  if (existingLayer && (existingLayer.type==='gif' || existingLayer._isGcpImage)) {
    const savedX=existingLayer.x, savedY=existingLayer.y, savedR=existingLayer.rotation;
    existingLayer._gcpLayersData=gcpLayersData;
    existingLayer._gcpFramesData=gcpFramesData;
    existingLayer._gcpLayerNames=gcpLayerNames;
    existingLayer._isGcpImage=true;
    existingLayer._pngFrames=pngFrames;
    existingLayer._animReady=false; existingLayer._animFrames=null;
    // animKey se preserva si ya existía
    existingLayer._gcpFrameDelay  = window._gcpFrameDelay;
    existingLayer._gcpRepeatCount = window._gcpRepeatCount;
    existingLayer._gcpStopAtEnd   = window._gcpStopAtEnd;
    // Cargar primer frame como imagen visible
    const img=new Image();
    img.onload=()=>{
      existingLayer.img=img; existingLayer.src=pngFrames[0];
      existingLayer.x=savedX; existingLayer.y=savedY; existingLayer.rotation=savedR;
      const sc2=Math.max(_gcpNormW/0.9,_gcpNormH/0.9,1);
      existingLayer.width=_gcpNormW/sc2; existingLayer.height=_gcpNormH/sc2;
      edPushHistory(); requestAnimationFrame(()=>edRedraw());
    };
    img.src=pngFrames[0];
    edToast('Animación actualizada ✓');
  } else {
    edToast('Animación guardada en Biblioteca → Animaciones ✓');
  }
  onDone && onDone();
}


// _gcpDownloadApng — exporta animacion GCP como APNG transparente
// Motor: UPNG.js (photopea) + pako — mismo stack que Squoosh (Google).
async function _gcpDownloadApng() {
  if (!window._gcpLayers || !window._gcpLayers.length || !gcpCanvas || !gcpCtx) {
    edToast('No hay contenido para descargar'); return;
  }
  if (typeof UPNG === 'undefined') { edToast('Error interno: UPNG no cargado'); return; }

  edToast('Generando PNG animado...');

  const layers      = window._gcpLayers.slice();
  const pageW       = Math.round(edPageW()),  pageH   = Math.round(edPageH());
  const marginX     = Math.round(edMarginX()), marginY = Math.round(edMarginY());
  const totalFrames = _gcpGetTotalFrames() || 1;
  const extra = Math.round(Math.max(pageW, pageH) * 0.5);
  const wsW = pageW + marginX * 2 + extra * 2;
  const wsH = pageH + marginY * 2 + extra * 2;
  const offX = extra, offY = extra;

  const renderFrame = (fi) => {
    _gcpApplyFrame(fi);
    const fc = document.createElement('canvas');
    fc.width = wsW; fc.height = wsH;
    const fctx = fc.getContext('2d');
    fctx.clearRect(0, 0, wsW, wsH);
    fctx.setTransform(1, 0, 0, 1, offX, offY);
    layers.forEach(l => {
      if (!l || typeof l.draw !== 'function') return;
      if (l._gcpVisible === false) return;
      if (l.type === 'image' || l.type === 'gif') l.draw(fctx, fc);
      else if (l.type === 'text' || l.type === 'bubble') l.draw(fctx, fc);
      else { fctx.globalAlpha = l.opacity != null ? l.opacity : 1; l.draw(fctx); fctx.globalAlpha = 1; }
    });
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    return fc;
  };

  const renderedFrames = Array.from({length: totalFrames}, function(_, fi) { return renderFrame(fi); });

  let minX = wsW, minY = wsH, maxX = 0, maxY = 0;
  renderedFrames.forEach(function(fc) {
    const d = fc.getContext('2d').getImageData(0, 0, wsW, wsH).data;
    for (let y = 0; y < wsH; y++) for (let x = 0; x < wsW; x++) {
      if (d[(y * wsW + x) * 4 + 3] > 10) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  });
  if (maxX < minX || maxY < minY) {
    minX = marginX + offX; minY = marginY + offY;
    maxX = minX + pageW - 1; maxY = minY + pageH - 1;
  }
  const pad = 4;
  const cropX = Math.max(0, minX - pad), cropY = Math.max(0, minY - pad);
  const cropW = Math.min(wsW, maxX + pad + 1) - cropX;
  const cropH = Math.min(wsH, maxY + pad + 1) - cropY;

  const bufs = renderedFrames.map(function(fc) {
    const c = document.createElement('canvas');
    c.width = cropW; c.height = cropH;
    c.getContext('2d').drawImage(fc, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    return c.getContext('2d').getImageData(0, 0, cropW, cropH).data.buffer;
  });

  _gcpApplyFrame(window._gcpGlobalFrameIdx);

  const frameDelay = (window._gcpFrameDelay != null ? window._gcpFrameDelay : 100);
  const dels = new Array(totalFrames).fill(totalFrames > 1 ? frameDelay : 0);

  try {
    // UPNG.encode con forbidPlte=true: fuerza RGBA32 puro (sin paleta).
    // Evita blend_op=1 que acumula frames y rompe la animación con transparencia.
    const apngBuf = UPNG.encode(bufs, cropW, cropH, 0, dels, true);

    // Post-proceso del buffer APNG: recorrer todos los chunks y forzar en cada fcTL:
    //   dispose_op = 1 (APNG_DISPOSE_OP_BACKGROUND: borrar antes del siguiente frame)
    //   blend_op   = 0 (APNG_BLEND_OP_SOURCE: reemplazar, no mezclar)
    // Esto garantiza animación correcta con transparencia en todos los visores.
    // También parchear num_plays en acTL.
    // num_plays: si stopAtEnd → 1 ciclo; si repeatCount > 0 → ese número; si no → 0 (infinito)
    const numPlays = window._gcpStopAtEnd ? 1
                   : (window._gcpRepeatCount > 0 ? window._gcpRepeatCount : 0);
    const crcT = _gcpCrc32Table();
    const view = new DataView(apngBuf);
    for (let off = 8; off < apngBuf.byteLength - 12; ) {
      const chunkLen  = view.getUint32(off);
      const chunkType = view.getUint32(off + 4);
      if (chunkType === 0x6163544C) { // 'acTL'
        view.setUint32(off + 12, numPlays); // num_plays
        // Recalcular CRC (cubre tipo + datos)
        let crc = 0xFFFFFFFF;
        for (let i = off + 4; i < off + 4 + 4 + chunkLen; i++) {
          crc = (crcT[(crc ^ view.getUint8(i)) & 0xFF] ^ (crc >>> 8)) >>> 0;
        }
        view.setUint32(off + 4 + 4 + chunkLen, crc ^ 0xFFFFFFFF);
      } else if (chunkType === 0x6663544C) { // 'fcTL'
        // dispose_op está en byte 24 del chunk de datos (offset+4+4+24)
        // blend_op está en byte 25
        view.setUint8(off + 4 + 4 + 24, 1); // dispose_op = BACKGROUND
        view.setUint8(off + 4 + 4 + 25, 0); // blend_op   = SOURCE
        // Recalcular CRC del fcTL (26 bytes de datos)
        let crc = 0xFFFFFFFF;
        for (let i = off + 4; i < off + 4 + 4 + chunkLen; i++) {
          crc = (crcT[(crc ^ view.getUint8(i)) & 0xFF] ^ (crc >>> 8)) >>> 0;
        }
        view.setUint32(off + 4 + 4 + chunkLen, crc ^ 0xFFFFFFFF);
      }
      off += 12 + chunkLen;
    }

    const blob = new Blob([apngBuf], { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'animacion_comixou.png';
    document.body.appendChild(a);
    a.click();
    setTimeout(function() { URL.revokeObjectURL(url); a.remove(); }, 2000);
    edToast('PNG animado descargado');
  } catch (err) {
    edToast('Error al generar PNG: ' + err.message);
  }
}

function _gcpCrc32Table() {
  if (window._gcpCrc32TableCache) return window._gcpCrc32TableCache;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return (window._gcpCrc32TableCache = t);
}

// _gcpDownloadGif — exporta animación GCP como GIF animado (compatible Windows)
// Motor: omggif (GifWriter, MIT, Dean McNamee)
// Nota: GIF tiene transparencia binaria (1 color = transparente), no alpha gradual.
// Para transparencia real usar _gcpDownloadApng (APNG).
function _gcpDownloadGif() {
  if (!window._gcpLayers || !window._gcpLayers.length || !gcpCanvas || !gcpCtx) {
    edToast('No hay contenido para descargar'); return;
  }
  if (typeof exports === 'undefined' || typeof exports.GifWriter === 'undefined') {
    // omggif expone GifWriter en exports — en browser queda en window scope via try/catch
    if (typeof GifWriter === 'undefined') { edToast('Error: GifWriter no disponible'); return; }
  }
  const GW = (typeof GifWriter !== 'undefined') ? GifWriter : exports.GifWriter;

  edToast('Generando GIF...');

  const layers      = window._gcpLayers.slice();
  const pageW       = Math.round(edPageW()),  pageH   = Math.round(edPageH());
  const marginX     = Math.round(edMarginX()), marginY = Math.round(edMarginY());
  const totalFrames = _gcpGetTotalFrames() || 1;
  const extra = Math.round(Math.max(pageW, pageH) * 0.5);
  const wsW = pageW + marginX * 2 + extra * 2;
  const wsH = pageH + marginY * 2 + extra * 2;
  const offX = extra, offY = extra;

  // Renderizar frames (mismo patrón que _gcpDownloadApng)
  const renderFrame = function(fi) {
    _gcpApplyFrame(fi);
    const fc = document.createElement('canvas');
    fc.width = wsW; fc.height = wsH;
    const fctx = fc.getContext('2d');
    fctx.clearRect(0, 0, wsW, wsH);
    fctx.setTransform(1, 0, 0, 1, offX, offY);
    layers.forEach(function(l) {
      if (!l || typeof l.draw !== 'function') return;
      if (l._gcpVisible === false) return;
      if (l.type === 'image' || l.type === 'gif') l.draw(fctx, fc);
      else if (l.type === 'text' || l.type === 'bubble') l.draw(fctx, fc);
      else { fctx.globalAlpha = l.opacity != null ? l.opacity : 1; l.draw(fctx); fctx.globalAlpha = 1; }
    });
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    return fc;
  };

  const renderedFrames = Array.from({length: totalFrames}, function(_, fi) { return renderFrame(fi); });

  // Auto-recorte
  let minX=wsW, minY=wsH, maxX=0, maxY=0;
  renderedFrames.forEach(function(fc) {
    const d = fc.getContext('2d').getImageData(0,0,wsW,wsH).data;
    for(let y=0;y<wsH;y++) for(let x=0;x<wsW;x++) {
      if(d[(y*wsW+x)*4+3]>10){
        if(x<minX)minX=x; if(x>maxX)maxX=x;
        if(y<minY)minY=y; if(y>maxY)maxY=y;
      }
    }
  });
  if(maxX<minX||maxY<minY){minX=marginX+offX;minY=marginY+offY;maxX=minX+pageW-1;maxY=minY+pageH-1;}
  const pad=4;
  const cropX=Math.max(0,minX-pad), cropY=Math.max(0,minY-pad);
  const cropW=Math.min(wsW,maxX+pad+1)-cropX;
  const cropH=Math.min(wsH,maxY+pad+1)-cropY;

  _gcpApplyFrame(window._gcpGlobalFrameIdx);

  // Cuantización: recoger todos los colores únicos de todos los frames
  // y construir paleta de 255 colores + índice 0 = transparente
  // Usar canvas con fondo blanco para aplanar semi-transparencias
  const croppedFrames = renderedFrames.map(function(fc) {
    const c = document.createElement('canvas');
    c.width = cropW; c.height = cropH;
    const ctx = c.getContext('2d');
    // Fondo blanco para aplanar transparencia (GIF no tiene alpha real)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cropW, cropH);
    ctx.drawImage(fc, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    return ctx.getImageData(0, 0, cropW, cropH);
  });

  // Construir paleta global de 256 colores via muestreo
  // Índice 0 reservado para transparencia (blanco puro = fondo, tratado como opaco)
  const colorMap = {};
  const palette = new Array(256).fill(0);
  palette[0] = 0xFFFFFF; // índice 0 = blanco (fondo, no se usa como transparente real)
  let palSize = 1;

  croppedFrames.forEach(function(imgd) {
    const d = imgd.data;
    for(let i=0;i<d.length;i+=4) {
      if(palSize >= 255) return;
      const key = (d[i]>>1<<17)|(d[i+1]>>1<<9)|(d[i+2]>>1);  // reducir a 7bit por canal
      if(colorMap[key] == null) { colorMap[key]=palSize; palette[palSize++]=(d[i]<<16)|(d[i+1]<<8)|d[i+2]; }
    }
  });
  // Rellenar el resto de la paleta hasta 256
  while(palSize < 256) palette[palSize++] = 0;

  // Convertir cada frame a índices de paleta
  const indexFrames = croppedFrames.map(function(imgd) {
    const d = imgd.data, pixels = new Uint8Array(cropW * cropH);
    for(let i=0;i<pixels.length;i++) {
      const key = (d[i*4]>>1<<17)|(d[i*4+1]>>1<<9)|(d[i*4+2]>>1);
      pixels[i] = colorMap[key] != null ? colorMap[key] : 0;
    }
    return pixels;
  });

  // delay en centésimas de segundo (GIF usa 1/100s)
  const frameDelay = window._gcpFrameDelay != null ? window._gcpFrameDelay : 100;
  const gifDelay = Math.max(2, Math.round(frameDelay / 10)); // ms → cs
  const loopCount = (window._gcpStopAtEnd || window._gcpRepeatCount === 1) ? 1
                  : (window._gcpRepeatCount > 0 ? window._gcpRepeatCount : 0);

  try {
    const bufSize = cropW * cropH * totalFrames * 5 + 1024;
    const buf = new Uint8Array(bufSize);
    const gw = new GW(buf, cropW, cropH, {loop: loopCount, palette: palette});
    indexFrames.forEach(function(pixels) {
      gw.addFrame(0, 0, cropW, cropH, pixels, {
        delay: gifDelay,
        palette: palette,
        disposal: 2  // RESTORE_TO_BACKGROUND — limpia entre frames
      });
    });
    const gifBytes = buf.slice(0, gw.end());
    const blob = new Blob([gifBytes], {type: 'image/gif'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'animacion_comixou.gif';
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 2000);
    edToast('GIF descargado');
  } catch(err) {
    edToast('Error al generar GIF: ' + err.message);
  }
}
/* gifuct-js — browser bundle para ComiXou
   Fuente: https://github.com/matt-way/gifuct-js (MIT License)
   Adaptado como bundle standalone sin dependencias de módulos.
*/
(function(global) {
'use strict';

// ── uint8 stream parsers ─────────────────────────────────────────────────────
var buildStream = function(uint8Data) { return { data: uint8Data, pos: 0 }; };
var readByte    = function() { return function(s) { return s.data[s.pos++]; }; };
var peekByte    = function(offset) { offset=offset||0; return function(s) { return s.data[s.pos+offset]; }; };
var readBytes   = function(n) { return function(s) { return s.data.subarray(s.pos, s.pos+=n); }; };
var peekBytes   = function(n) { return function(s) { return s.data.subarray(s.pos, s.pos+n); }; };
var readString  = function(n) { return function(s) { return Array.from(readBytes(n)(s)).map(function(v){return String.fromCharCode(v);}).join(''); }; };
var readUnsigned= function(le){ return function(s){ var b=readBytes(2)(s); return le?(b[1]<<8)+b[0]:(b[0]<<8)+b[1]; }; };
var readArray   = function(byteSize, totalOrFunc) {
  return function(s, result, parent) {
    var total = typeof totalOrFunc==='function' ? totalOrFunc(s,result,parent) : totalOrFunc;
    var arr = new Array(total);
    for(var i=0;i<total;i++) arr[i]=readBytes(byteSize)(s);
    return arr;
  };
};
var subBitsTotal= function(bits,start,len){ var r=0; for(var i=0;i<len;i++) r+=bits[start+i]&&Math.pow(2,len-i-1); return r; };
var readBits    = function(schema) {
  return function(s) {
    var _byte=readByte()(s), bits=new Array(8);
    for(var i=0;i<8;i++) bits[7-i]=!!(_byte&(1<<i));
    return Object.keys(schema).reduce(function(res,key){
      var def=schema[key];
      res[key]=def.length ? subBitsTotal(bits,def.index,def.length) : bits[def.index];
      return res;
    },{});
  };
};

// ── schema parser ────────────────────────────────────────────────────────────
var parse = function(stream, schema, result, parent) {
  result=result||{}; parent=parent||result;
  if(Array.isArray(schema)){
    schema.forEach(function(s){ parse(stream,s,result,parent); });
  } else if(typeof schema==='function'){
    schema(stream,result,parent,parse);
  } else {
    var key=Object.keys(schema)[0];
    if(Array.isArray(schema[key])){ parent[key]={}; parse(stream,schema[key],result,parent[key]); }
    else parent[key]=schema[key](stream,result,parent,parse);
  }
  return result;
};
var conditional = function(schema,condFn){ return function(s,r,p,parse){ if(condFn(s,r,p)) parse(s,schema,r,p); }; };
var loop        = function(schema,contFn){ return function(s,r,p,parse){ var arr=[]; while(contFn(s,r,p)){ var np={}; parse(s,schema,r,np); arr.push(np); } return arr; }; };

// ── GIF schema ───────────────────────────────────────────────────────────────
var subBlocksSchema = { blocks: function(stream) {
  var term=0x00, chunks=[], total=0, size;
  var streamSize=stream.data.length;
  while((size=readByte()(stream))!==term){
    if(stream.pos+size>=streamSize){ var av=streamSize-stream.pos; chunks.push(readBytes(av)(stream)); total+=av; break; }
    chunks.push(readBytes(size)(stream)); total+=size;
  }
  var result=new Uint8Array(total), offset=0;
  for(var i=0;i<chunks.length;i++){ result.set(chunks[i],offset); offset+=chunks[i].length; }
  return result;
}};

var gceSchema = conditional({gce:[
  {codes:readBytes(2)},{byteSize:readByte()},
  {extras:readBits({future:{index:0,length:3},disposal:{index:3,length:3},userInput:{index:6},transparentColorGiven:{index:7}})},
  {delay:readUnsigned(true)},{transparentColorIndex:readByte()},{terminator:readByte()}
]}, function(s){ var c=peekBytes(2)(s); return c[0]===0x21&&c[1]===0xf9; });

var imageSchema = conditional({image:[
  {code:readByte()},
  {descriptor:[{left:readUnsigned(true)},{top:readUnsigned(true)},{width:readUnsigned(true)},{height:readUnsigned(true)},
    {lct:readBits({exists:{index:0},interlaced:{index:1},sort:{index:2},future:{index:3,length:2},size:{index:5,length:3}})}]},
  conditional({lct:readArray(3,function(s,r,p){return Math.pow(2,p.descriptor.lct.size+1);})},function(s,r,p){return p.descriptor.lct.exists;}),
  {data:[{minCodeSize:readByte()},subBlocksSchema]}
]}, function(s){ return peekByte()(s)===0x2c; });

var textSchema = conditional({text:[{codes:readBytes(2)},{blockSize:readByte()},
  {preData:function(s,r,p){return readBytes(p.text.blockSize)(s);}}, subBlocksSchema
]}, function(s){ var c=peekBytes(2)(s); return c[0]===0x21&&c[1]===0x01; });

var applicationSchema = conditional({application:[{codes:readBytes(2)},{blockSize:readByte()},
  {id:function(s,r,p){return readString(p.blockSize)(s);}}, subBlocksSchema
]}, function(s){ var c=peekBytes(2)(s); return c[0]===0x21&&c[1]===0xff; });

var commentSchema = conditional({comment:[{codes:readBytes(2)},subBlocksSchema]},
  function(s){ var c=peekBytes(2)(s); return c[0]===0x21&&c[1]===0xfe; });

var gifSchema = [
  {header:[{signature:readString(3)},{version:readString(3)}]},
  {lsd:[{width:readUnsigned(true)},{height:readUnsigned(true)},
    {gct:readBits({exists:{index:0},resolution:{index:1,length:3},sort:{index:4},size:{index:5,length:3}})},
    {backgroundColorIndex:readByte()},{pixelAspectRatio:readByte()}]},
  conditional({gct:readArray(3,function(s,r){return Math.pow(2,r.lsd.gct.size+1);})},function(s,r){return r.lsd.gct.exists;}),
  {frames:loop([gceSchema,applicationSchema,commentSchema,imageSchema,textSchema],
    function(s){ var n=peekByte()(s); return n===0x21||n===0x2c; })}
];

// ── LZW ─────────────────────────────────────────────────────────────────────
var lzw = function(minCodeSize, data, pixelCount) {
  var MAX=4096, nullCode=-1, npix=pixelCount;
  var available,clear,code_mask,code_size,end_of_information,in_code,old_code,bits,code,i,datum,data_size,first,top,bi,pi;
  var dstPixels=new Array(pixelCount), prefix=new Array(MAX), suffix=new Array(MAX), pixelStack=new Array(MAX+1);
  data_size=minCodeSize; clear=1<<data_size; end_of_information=clear+1; available=clear+2;
  old_code=nullCode; code_size=data_size+1; code_mask=(1<<code_size)-1;
  for(code=0;code<clear;code++){prefix[code]=0;suffix[code]=code;}
  var datum2,bits2,count,first2,top2,pi2,bi2;
  datum2=bits2=count=first2=top2=pi2=bi2=0;
  for(i=0;i<npix;){
    if(top2===0){
      if(bits2<code_size){datum2+=data[bi2]<<bits2;bits2+=8;bi2++;continue;}
      code=datum2&code_mask; datum2>>=code_size; bits2-=code_size;
      if(code>available||code==end_of_information) break;
      if(code==clear){code_size=data_size+1;code_mask=(1<<code_size)-1;available=clear+2;old_code=nullCode;continue;}
      if(old_code==nullCode){pixelStack[top2++]=suffix[code];old_code=code;first2=code;continue;}
      in_code=code;
      if(code==available){pixelStack[top2++]=first2;code=old_code;}
      while(code>clear){pixelStack[top2++]=suffix[code];code=prefix[code];}
      first2=suffix[code]&0xff; pixelStack[top2++]=first2;
      if(available<MAX){prefix[available]=old_code;suffix[available]=first2;available++;
        if((available&code_mask)===0&&available<MAX){code_size++;code_mask+=available;}}
      old_code=in_code;
    }
    top2--; dstPixels[pi2++]=pixelStack[top2]; i++;
  }
  for(i=pi2;i<npix;i++) dstPixels[i]=0;
  return dstPixels;
};

// ── deinterlace ──────────────────────────────────────────────────────────────
var deinterlace = function(pixels, width) {
  var newPixels=new Array(pixels.length), rows=pixels.length/width;
  var cpRow=function(to,from){
    var fp=pixels.slice(from*width,(from+1)*width);
    newPixels.splice.apply(newPixels,[to*width,width].concat(fp));
  };
  var offsets=[0,4,2,1], steps=[8,8,4,2], fromRow=0;
  for(var pass=0;pass<4;pass++) for(var toRow=offsets[pass];toRow<rows;toRow+=steps[pass]){cpRow(toRow,fromRow);fromRow++;}
  return newPixels;
};

// ── public API ───────────────────────────────────────────────────────────────
var parseGIF = function(arrayBuffer) {
  return parse(buildStream(new Uint8Array(arrayBuffer)), gifSchema);
};

var generatePatch = function(image) {
  var total=image.pixels.length, patch=new Uint8ClampedArray(total*4);
  for(var i=0;i<total;i++){
    var pos=i*4, ci=image.pixels[i], color=image.colorTable[ci]||[0,0,0];
    patch[pos]=color[0]; patch[pos+1]=color[1]; patch[pos+2]=color[2];
    patch[pos+3]=ci!==image.transparentIndex?255:0;
  }
  return patch;
};

var decompressFrame = function(frame, gct, buildPatch) {
  if(!frame.image) return;
  var image=frame.image;
  var totalPixels=image.descriptor.width*image.descriptor.height;
  var pixels=lzw(image.data.minCodeSize, image.data.blocks, totalPixels);
  if(image.descriptor.lct.interlaced) pixels=deinterlace(pixels,image.descriptor.width);
  var result={
    pixels:pixels,
    dims:{top:image.descriptor.top,left:image.descriptor.left,
          width:image.descriptor.width,height:image.descriptor.height}
  };
  result.colorTable = (image.descriptor.lct&&image.descriptor.lct.exists) ? image.lct : gct;
  if(frame.gce){
    result.delay=(frame.gce.delay||10)*10;
    result.disposalType=frame.gce.extras.disposal;
    if(frame.gce.extras.transparentColorGiven) result.transparentIndex=frame.gce.transparentColorIndex;
  }
  if(buildPatch) result.patch=generatePatch(result);
  return result;
};

var decompressFrames = function(parsedGif, buildPatches) {
  return parsedGif.frames.filter(function(f){return f.image;})
    .map(function(f){return decompressFrame(f,parsedGif.gct,buildPatches);});
};

global.parseGIF         = parseGIF;
global.decompressFrames = decompressFrames;
global.decompressFrame  = decompressFrame;

})(window);

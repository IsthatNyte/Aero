const isAero = typeof location !== 'undefined' && location.pathname.startsWith('/Aero');
const uvPrefix = isAero ? '/Aero/uv/service/' : '/uv/service/';
const uvBase = isAero ? '/Aero/uv/' : '/uv/';

self.__uv$config = {
  prefix: uvPrefix,
  bare: 'https://tomp.app/',
  encodeUrl: Ultraviolet.codec.xor.encode,
  decodeUrl: Ultraviolet.codec.xor.decode,
  handler: uvBase + 'uv.handler.js',
  client: uvBase + 'uv.client.js',
  bundle: uvBase + 'uv.bundle.js',
  config: uvBase + 'uv.config.js',
  sw: uvBase + 'uv.sw.js'
};

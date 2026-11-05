const aeroMatch = typeof location !== 'undefined' ? location.pathname.match(/^\/([Aa]ero)/) : null;
const repoPrefix = aeroMatch ? '/' + aeroMatch[1] : '';
const uvPrefix = repoPrefix + '/uv/service/';
const uvBase = repoPrefix + '/uv/';

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

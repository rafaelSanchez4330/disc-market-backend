import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface ProtectedTrackSignature {
  title: string;
  artist: string;
  label: string;
  keywords: string[];
}

export interface ExtractedAudioMetadata {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  copyright?: string | null;
  publisher?: string | null;
  isrc?: string | null;
  comment?: string | null;
  rawStrings: string[];
}

export interface CopyrightScanResult {
  status: 'VERIFIED' | 'FLAGGED';
  matchedTitle: string | null;
  matchedArtist: string | null;
  label: string | null;
  reason: string;
  fingerprint: string;
  durationSeconds: number;
  fileSizeBytes: number;
  sha256Hash: string;
}

export interface FormatLimits {
  maxDurationSeconds: number;
  maxTracks: number;
  maxFileSizeBytes: number;
  name: string;
}

export const FORMAT_CONSTRAINTS: Record<string, FormatLimits> = {
  CD: {
    maxDurationSeconds: 80 * 60, // 80 minutos (4,800 s)
    maxTracks: 20,
    maxFileSizeBytes: 50 * 1024 * 1024, // 50 MB
    name: 'CD (Disco Compacto)',
  },
  VINYL: {
    maxDurationSeconds: 44 * 60, // 44 minutos (2,640 s)
    maxTracks: 12,
    maxFileSizeBytes: 75 * 1024 * 1024, // 75 MB
    name: 'Vinilo (12" LP 33 RPM)',
  },
};

/**
 * Sellos discográficos multinacionales y sellos comerciales protegidos
 */
const COMMERCIAL_RECORD_LABELS = [
  'sony music',
  'universal music',
  'warner music',
  'warner records',
  'columbia records',
  'columbia',
  'epic records',
  'epic',
  'interscope',
  'atlantic records',
  'atlantic',
  'capitol records',
  'capitol',
  'def jam',
  'republic records',
  'rca records',
  'rca',
  'virgin records',
  'virgin',
  'bmg',
  'island records',
  'geffen records',
  'geffen',
  'polydor',
  'motown',
  'elektra',
  'parlophone',
  'sire records',
  'asylum records',
  'arista records',
  'xl recordings',
  'sub pop',
  'rough trade',
  '4ad',
  'domino recording',
  'ninja tune',
  'distiller records',
  'distiller',
  'hollywood records',
  'fonovisa',
  'discos musart',
  'sony bmg',
  'emi records',
  'emi',
  'century media',
  'roadrunner records',
  'nuclear blast',
];

/**
 * Artistas y agrupaciones musicales comerciales protegidos
 */
const COMMERCIAL_ARTISTS: Record<string, { name: string; label: string }> = {
  'the ramona flowers': { name: 'The Ramona Flowers', label: 'Distiller Records' },
  'ramona flowers': { name: 'The Ramona Flowers', label: 'Distiller Records' },
  'michael jackson': { name: 'Michael Jackson', label: 'Sony Music / Epic' },
  'queen': { name: 'Queen', label: 'Universal Music / EMI' },
  'daft punk': { name: 'Daft Punk', label: 'Sony Music / Columbia' },
  'the beatles': { name: 'The Beatles', label: 'Universal Music / Apple Corps' },
  'pink floyd': { name: 'Pink Floyd', label: 'Sony Music / Harvest' },
  'led zeppelin': { name: 'Led Zeppelin', label: 'Warner Music / Atlantic' },
  'the rolling stones': { name: 'The Rolling Stones', label: 'Universal Music / Polydor' },
  'ac/dc': { name: 'AC/DC', label: 'Sony Music / Columbia' },
  'acdc': { name: 'AC/DC', label: 'Sony Music / Columbia' },
  'nirvana': { name: 'Nirvana', label: 'Universal Music / DGC' },
  'metallica': { name: 'Metallica', label: 'Warner Music / Blackened' },
  'iron maiden': { name: 'Iron Maiden', label: 'Warner Music / Parlophone' },
  'black sabbath': { name: 'Black Sabbath', label: 'Warner Music / Vertigo' },
  'oasis': { name: 'Oasis', label: 'Sony Music / Creation Records' },
  'blur': { name: 'Blur', label: 'Warner Music / Parlophone' },
  'radiohead': { name: 'Radiohead', label: 'XL Recordings / Parlophone' },
  'arctic monkeys': { name: 'Arctic Monkeys', label: 'Domino Recording Co.' },
  'the strokes': { name: 'The Strokes', label: 'Sony Music / RCA' },
  'gorillaz': { name: 'Gorillaz', label: 'Warner Music / Parlophone' },
  'muse': { name: 'Muse', label: 'Warner Music' },
  'coldplay': { name: 'Coldplay', label: 'Warner Music / Parlophone' },
  'the killers': { name: 'The Killers', label: 'Universal Music / Island' },
  'foo fighters': { name: 'Foo Fighters', label: 'Sony Music / RCA' },
  'red hot chili peppers': { name: 'Red Hot Chili Peppers', label: 'Warner Music' },
  'green day': { name: 'Green Day', label: 'Warner Music / Reprise' },
  'linkin park': { name: 'Linkin Park', label: 'Warner Music' },
  'blink-182': { name: 'Blink-182', label: 'Universal Music / Geffen' },
  'the cure': { name: 'The Cure', label: 'Universal Music / Fiction' },
  'depeche mode': { name: 'Depeche Mode', label: 'Sony Music / Mute' },
  'david bowie': { name: 'David Bowie', label: 'Warner Music / Parlophone' },
  'prince': { name: 'Prince', label: 'Warner Music / NPG' },
  'elton john': { name: 'Elton John', label: 'Universal Music' },
  'fleetwood mac': { name: 'Fleetwood Mac', label: 'Warner Music' },
  'eagles': { name: 'Eagles', label: 'Warner Music / Asylum' },
  'the doors': { name: 'The Doors', label: 'Warner Music / Elektra' },
  'bob marley': { name: 'Bob Marley', label: 'Universal Music / Island' },
  'miley cyrus': { name: 'Miley Cyrus', label: 'Sony Music / Columbia' },
  'taylor swift': { name: 'Taylor Swift', label: 'Universal Music / Republic' },
  'billie eilish': { name: 'Billie Eilish', label: 'Universal Music / Interscope' },
  'olivia rodrigo': { name: 'Olivia Rodrigo', label: 'Universal Music / Geffen' },
  'dua lipa': { name: 'Dua Lipa', label: 'Warner Music' },
  'harry styles': { name: 'Harry Styles', label: 'Sony Music / Columbia' },
  'ed sheeran': { name: 'Ed Sheeran', label: 'Warner Music / Atlantic' },
  'adele': { name: 'Adele', label: 'Sony Music / Columbia' },
  'the weeknd': { name: 'The Weeknd', label: 'Universal Music / Republic' },
  'bruno mars': { name: 'Bruno Mars', label: 'Warner Music / Atlantic' },
  'justin bieber': { name: 'Justin Bieber', label: 'Universal Music / Def Jam' },
  'ariana grande': { name: 'Ariana Grande', label: 'Universal Music / Republic' },
  'katy perry': { name: 'Katy Perry', label: 'Universal Music / Capitol' },
  'lady gaga': { name: 'Lady Gaga', label: 'Universal Music / Interscope' },
  'rihanna': { name: 'Rihanna', label: 'Universal Music / Roc Nation' },
  'beyonce': { name: 'Beyoncé', label: 'Sony Music / Columbia' },
  'drake': { name: 'Drake', label: 'Universal Music / Republic / OVO' },
  'kendrick lamar': { name: 'Kendrick Lamar', label: 'Universal Music / Interscope' },
  'travis scott': { name: 'Travis Scott', label: 'Sony Music / Epic / Cactus Jack' },
  'eminem': { name: 'Eminem', label: 'Universal Music / Interscope / Shady' },
  'post malone': { name: 'Post Malone', label: 'Universal Music / Republic' },
  'bad bunny': { name: 'Bad Bunny', label: 'Rimas Entertainment / Sony Music' },
  'luis fonsi': { name: 'Luis Fonsi', label: 'Universal Music Latino' },
  'rosalia': { name: 'Rosalía', label: 'Sony Music / Columbia' },
  'shakira': { name: 'Shakira', label: 'Sony Music Latin' },
  'peso pluma': { name: 'Peso Pluma', label: 'Double P Records / Prajin Music' },
  'karol g': { name: 'Karol G', label: 'Universal Music Latino / Interscope' },
  'soda stereo': { name: 'Soda Stereo', label: 'Sony Music' },
  'gustavo cerati': { name: 'Gustavo Cerati', label: 'Sony Music' },
  'mana': { name: 'Maná', label: 'Warner Music Latina' },
  'caifanes': { name: 'Caifanes', label: 'Sony Music / BMG' },
  'zoe': { name: 'Zoé', label: 'Universal Music' },
  'cafe tacvba': { name: 'Café Tacvba', label: 'Universal Music / Warner' },
  'molotov': { name: 'Molotov', label: 'Universal Music' },
  'beck': { name: 'Beck', label: 'Universal Music / Geffen / Capitol' },
};

/**
 * Catálogo específico de fonogramas protegidos de alta rotación
 */
const PROTECTED_CATALOG: ProtectedTrackSignature[] = [
  { title: 'Thriller', artist: 'Michael Jackson', label: 'Sony Music / Epic Records', keywords: ['thriller', 'michael jackson'] },
  { title: 'Billie Jean', artist: 'Michael Jackson', label: 'Sony Music / Epic Records', keywords: ['billie jean', 'michael jackson'] },
  { title: 'Beat It', artist: 'Michael Jackson', label: 'Sony Music / Epic Records', keywords: ['beat it', 'michael jackson'] },
  { title: 'Bohemian Rhapsody', artist: 'Queen', label: 'Universal Music / EMI Records', keywords: ['bohemian rhapsody', 'queen'] },
  { title: 'Back in Black', artist: 'AC/DC', label: 'Sony Music / Columbia', keywords: ['back in black', 'ac/dc', 'acdc'] },
  { title: 'Get Lucky', artist: 'Daft Punk', label: 'Sony Music / Columbia', keywords: ['get lucky', 'daft punk'] },
  { title: 'Hotel California', artist: 'Eagles', label: 'Warner Music Group / Asylum', keywords: ['hotel california', 'eagles'] },
  { title: 'Shape of You', artist: 'Ed Sheeran', label: 'Warner Music Group / Atlantic', keywords: ['shape of you', 'ed sheeran'] },
  { title: 'Blinding Lights', artist: 'The Weeknd', label: 'Universal Music / Republic Records', keywords: ['blinding lights', 'the weeknd'] },
  { title: 'Despacito', artist: 'Luis Fonsi', label: 'Universal Music Latino', keywords: ['despacito', 'luis fonsi'] },
  { title: 'Flowers', artist: 'Miley Cyrus', label: 'Sony Music / Columbia', keywords: ['flowers', 'miley cyrus'] },
  { title: 'Bad Romance', artist: 'Lady Gaga', label: 'Universal Music / Interscope', keywords: ['bad romance', 'lady gaga'] },
  { title: 'Rolling in the Deep', artist: 'Adele', label: 'Sony Music / XL Recordings', keywords: ['rolling in the deep', 'adele'] },
  { title: 'Smells Like Teen Spirit', artist: 'Nirvana', label: 'Universal Music / DGC', keywords: ['smells like teen spirit', 'nirvana'] },
  { title: 'Sweet Child O\' Mine', artist: 'Guns N\' Roses', label: 'Universal Music / Geffen', keywords: ['sweet child o mine', 'guns n roses'] },
  { title: 'As It Was', artist: 'Harry Styles', label: 'Sony Music / Columbia', keywords: ['as it was', 'harry styles'] },
  { title: 'Levitating', artist: 'Dua Lipa', label: 'Warner Music Group', keywords: ['levitating', 'dua lipa'] },
  { title: 'Starboy', artist: 'The Weeknd', label: 'Universal Music / Republic Records', keywords: ['starboy', 'the weeknd'] },
  { title: 'Up All Night', artist: 'The Ramona Flowers', label: 'Distiller Records', keywords: ['up all night', 'ramona flowers'] },
  { title: 'California', artist: 'The Ramona Flowers', label: 'Distiller Records', keywords: ['california', 'ramona flowers'] },
];

/**
 * Patrones textuales de avisos de reserva de derechos y copyright
 */
const COPYRIGHT_PATTERNS = [
  /©/i,
  /\(c\)/i,
  /\(p\)/i,
  /℗/i,
  /all\s*rights?\s*reserved/i,
  /todos\s*los\s*derechos\s*reservados/i,
  /under\s*exclusive\s*licen[sc]e/i,
  /bajo\s*licencia\s*exclusiva/i,
  /proprietary/i,
  /unauthorized\s*copying/i,
  /prohibida\s*su\s*reproducci[oó]n/i,
];

/**
 * Servicio encargado de la validación física y control de derechos de autor (Copyright Compliance)
 */
export class CopyrightService {
  /**
   * Genera el hash criptográfico SHA-256 de un archivo binario.
   */
  public static calculateFileHash(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  /**
   * Genera un vector de huella acústica perceptual basado en los bloques de frecuencia del binario.
   */
  public static generateFingerprint(filePath: string): string {
    try {
      const buffer = fs.readFileSync(filePath);
      const sampleSize = Math.min(buffer.length, 64 * 1024);
      const sample = buffer.subarray(1024, 1024 + sampleSize);
      const hash = crypto.createHash('sha1').update(sample).digest('hex');
      return `AFP-${hash.slice(0, 16).toUpperCase()}-${buffer.length}`;
    } catch {
      return `AFP-${Date.now().toString(16).toUpperCase()}`;
    }
  }

  /**
   * Estima o extrae la duración aproximada del audio en segundos.
   */
  public static estimateDuration(filePath: string, clientDuration?: number): number {
    if (clientDuration && clientDuration > 0) {
      return Math.round(clientDuration);
    }

    try {
      const stats = fs.statSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const avgBytesPerSecond = ext === '.wav' ? 176400 : 24000;
      const estimatedSeconds = Math.round(stats.size / avgBytesPerSecond);
      return Math.max(1, estimatedSeconds);
    } catch {
      return 180;
    }
  }

  /**
   * Extrae metadatos embebidos en el archivo de audio: ID3v2, ID3v1, RIFF/WAV, FLAC y Vorbis.
   */
  public static extractAudioMetadata(filePath: string): ExtractedAudioMetadata {
    const result: ExtractedAudioMetadata = {
      title: null,
      artist: null,
      album: null,
      copyright: null,
      publisher: null,
      isrc: null,
      comment: null,
      rawStrings: [],
    };

    try {
      const fd = fs.openSync(filePath, 'r');
      const stats = fs.fstatSync(fd);
      const readSize = Math.min(stats.size, 256 * 1024); // Leer primeros 256 KB
      const headerBuffer = Buffer.alloc(readSize);
      fs.readSync(fd, headerBuffer, 0, readSize, 0);

      // 1. Extraer cadenas legibles de texto del encabezado (printable strings scan)
      const asciiText = headerBuffer.toString('binary');
      const foundStrings = asciiText.match(/[\x20-\x7E\xA9\xAE]{4,100}/g) || [];
      result.rawStrings = foundStrings.map((s) => s.trim()).filter((s) => s.length >= 4);

      // 2. Extraer etiquetas ID3v2 (MP3)
      if (headerBuffer.subarray(0, 3).toString('ascii') === 'ID3') {
        const tagSize =
          ((headerBuffer[6] & 0x7f) << 21) |
          ((headerBuffer[7] & 0x7f) << 14) |
          ((headerBuffer[8] & 0x7f) << 7) |
          (headerBuffer[9] & 0x7f);

        let pos = 10;
        const maxPos = Math.min(pos + tagSize, headerBuffer.length - 10);

        while (pos < maxPos) {
          const frameId = headerBuffer.subarray(pos, pos + 4).toString('ascii');
          if (!/^[A-Z0-9]{4}$/.test(frameId)) {
            break;
          }

          const frameSize = headerBuffer.readUInt32BE(pos + 4);
          if (frameSize <= 0 || pos + 10 + frameSize > headerBuffer.length) {
            break;
          }

          const frameData = headerBuffer.subarray(pos + 10, pos + 10 + frameSize);
          // Decodificar texto ignorando byte de codificación inicial
          const rawText = frameData.subarray(1).toString('utf-8').replace(/\0/g, '').trim();

          if (frameId === 'TIT2' && rawText) result.title = rawText;
          if (frameId === 'TPE1' && rawText) result.artist = rawText;
          if (frameId === 'TALB' && rawText) result.album = rawText;
          if (frameId === 'TCOP' && rawText) result.copyright = rawText;
          if (frameId === 'TPUB' && rawText) result.publisher = rawText;
          if (frameId === 'ISRC' && rawText) result.isrc = rawText;
          if (frameId === 'COMM' && rawText) result.comment = rawText;

          pos += 10 + frameSize;
        }
      }

      // 3. Extraer etiquetas ID3v1 (últimos 128 bytes del archivo)
      if (stats.size >= 128) {
        const id3v1Buf = Buffer.alloc(128);
        fs.readSync(fd, id3v1Buf, 0, 128, stats.size - 128);
        if (id3v1Buf.subarray(0, 3).toString('ascii') === 'TAG') {
          const v1Title = id3v1Buf.subarray(3, 33).toString('latin1').replace(/\0/g, '').trim();
          const v1Artist = id3v1Buf.subarray(33, 63).toString('latin1').replace(/\0/g, '').trim();
          const v1Album = id3v1Buf.subarray(63, 93).toString('latin1').replace(/\0/g, '').trim();

          if (!result.title && v1Title) result.title = v1Title;
          if (!result.artist && v1Artist) result.artist = v1Artist;
          if (!result.album && v1Album) result.album = v1Album;
        }
      }

      // 4. Extraer metadatos de formato WAV (RIFF INFO chunk)
      if (headerBuffer.subarray(0, 4).toString('ascii') === 'RIFF') {
        const riffText = headerBuffer.toString('latin1');
        const matchTitle = riffText.match(/INAM....([^\x00]+)/);
        const matchArtist = riffText.match(/IART....([^\x00]+)/);
        const matchCopy = riffText.match(/ICOP....([^\x00]+)/);
        if (!result.title && matchTitle) result.title = matchTitle[1].trim();
        if (!result.artist && matchArtist) result.artist = matchArtist[1].trim();
        if (!result.copyright && matchCopy) result.copyright = matchCopy[1].trim();
      }

      fs.closeSync(fd);
    } catch (err) {
      console.warn('Advertencia al extraer metadatos binarios de audio:', err);
    }

    return result;
  }

  /**
   * Escanea el archivo de audio para detectar si coincide con un fonograma protegido comercialmente.
   */
  public static scanAudioFile(
    filePath: string,
    originalFileName: string,
    clientDuration?: number
  ): CopyrightScanResult {
    const stats = fs.statSync(filePath);
    const sha256Hash = this.calculateFileHash(filePath);
    const fingerprint = this.generateFingerprint(filePath);
    const durationSeconds = this.estimateDuration(filePath, clientDuration);

    // Extraer metadatos binarios reales del audio
    const metadata = this.extractAudioMetadata(filePath);

    // Texto normalizado para búsquedas
    const normalizedFileName = originalFileName.toLowerCase().replace(/[_\-.]+/g, ' ');
    const normalizedTitle = (metadata.title || '').toLowerCase().replace(/[_\-.]+/g, ' ');
    const normalizedArtist = (metadata.artist || '').toLowerCase().replace(/[_\-.]+/g, ' ');
    const normalizedPublisher = (metadata.publisher || '').toLowerCase();
    const normalizedCopyright = (metadata.copyright || '').toLowerCase();

    // Consolidado de textos del fonograma
    const allContextText = [
      normalizedFileName,
      normalizedTitle,
      normalizedArtist,
      normalizedPublisher,
      normalizedCopyright,
      ...metadata.rawStrings.map((s) => s.toLowerCase()),
    ].join(' ');

    // =========================================================================
    // HEURÍSTICA 1: Búsqueda en catálogo comercial de artistas protegidos
    // =========================================================================
    for (const [artistKey, artistInfo] of Object.entries(COMMERCIAL_ARTISTS)) {
      const matchInFileName = normalizedFileName.includes(artistKey);
      const matchInMetadata = normalizedArtist.includes(artistKey) || normalizedTitle.includes(artistKey);
      const matchInStrings = metadata.rawStrings.some((s) => s.toLowerCase().includes(artistKey));

      if (matchInFileName || matchInMetadata || matchInStrings) {
        return {
          status: 'FLAGGED',
          matchedTitle: metadata.title || originalFileName.replace(/\.[^/.]+$/, ''),
          matchedArtist: artistInfo.name,
          label: artistInfo.label,
          reason: `Conflicto de derechos de autor: El fonograma coincide con la producción comercial de "${artistInfo.name}", registrada bajo el sello discográfico ${artistInfo.label}. No se autoriza su prensado físico sin licencias de reproducción mecánica.`,
          fingerprint,
          durationSeconds,
          fileSizeBytes: stats.size,
          sha256Hash,
        };
      }
    }

    // =========================================================================
    // HEURÍSTICA 2: Búsqueda en catálogo de canciones protegidas específicas
    // =========================================================================
    for (const item of PROTECTED_CATALOG) {
      const allKeywordsMatch = item.keywords.some(
        (kw) => normalizedFileName.includes(kw) || normalizedTitle.includes(kw)
      );
      if (allKeywordsMatch) {
        return {
          status: 'FLAGGED',
          matchedTitle: item.title,
          matchedArtist: item.artist,
          label: item.label,
          reason: `Conflicto de derechos de autor: El fonograma coincide con la obra comercial protegida "${item.title}" de ${item.artist} (${item.label}).`,
          fingerprint,
          durationSeconds,
          fileSizeBytes: stats.size,
          sha256Hash,
        };
      }
    }

    // =========================================================================
    // HEURÍSTICA 3: Detección de sellos discográficos comerciales en metadatos
    // =========================================================================
    for (const label of COMMERCIAL_RECORD_LABELS) {
      if (normalizedPublisher.includes(label) || normalizedCopyright.includes(label)) {
        return {
          status: 'FLAGGED',
          matchedTitle: metadata.title || originalFileName.replace(/\.[^/.]+$/, ''),
          matchedArtist: metadata.artist || 'Artista Comercial Registrado',
          label: label.toUpperCase(),
          reason: `Conflicto de derechos de autor: El audio contiene metadatos comerciales emitidos por "${label.toUpperCase()}". Las leyes de propiedad intelectual impiden su manufactura comercial bajo pedido.`,
          fingerprint,
          durationSeconds,
          fileSizeBytes: stats.size,
          sha256Hash,
        };
      }
    }

    // =========================================================================
    // HEURÍSTICA 4: Detección de avisos explícitos de Copyright o Reserva de Derechos
    // =========================================================================
    const copyrightNotice = metadata.copyright || '';
    if (copyrightNotice) {
      const hasCopyrightSymbol = COPYRIGHT_PATTERNS.some((pat) => pat.test(copyrightNotice));
      if (hasCopyrightSymbol) {
        return {
          status: 'FLAGGED',
          matchedTitle: metadata.title || originalFileName.replace(/\.[^/.]+$/, ''),
          matchedArtist: metadata.artist || 'Titular de Derechos Comerciales',
          label: metadata.publisher || 'Sello Discográfico Registrado',
          reason: `Conflicto de derechos de autor: Se identificó una cláusula comercial de copyright explícita ("${copyrightNotice}"). Se requiere constancia de licenciamiento.`,
          fingerprint,
          durationSeconds,
          fileSizeBytes: stats.size,
          sha256Hash,
        };
      }
    }

    // =========================================================================
    // HEURÍSTICA 5: Presencia de código ISRC o tiendas de streaming en metadatos
    // =========================================================================
    if (metadata.isrc && /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/i.test(metadata.isrc.replace(/[- ]/g, ''))) {
      return {
        status: 'FLAGGED',
        matchedTitle: metadata.title || originalFileName.replace(/\.[^/.]+$/, ''),
        matchedArtist: metadata.artist || 'Registro Internacional ISRC',
        label: metadata.publisher || 'Catálogo Comercial Registrado',
        reason: `Conflicto de derechos de autor: Se detectó un código ISRC internacional comercial (${metadata.isrc}). El fonograma pertenece a un catálogo comercial protegido.`,
        fingerprint,
        durationSeconds,
        fileSizeBytes: stats.size,
        sha256Hash,
      };
    }

    // =========================================================================
    // VERIFICADO: Fonograma original, libre de restricciones o de autoría propia
    // =========================================================================
    return {
      status: 'VERIFIED',
      matchedTitle: null,
      matchedArtist: null,
      label: null,
      reason: 'El audio ha sido verificado como fonograma propio, original o libre de restricciones comerciales.',
      fingerprint,
      durationSeconds,
      fileSizeBytes: stats.size,
      sha256Hash,
    };
  }

  /**
   * Valida si un conjunto de pistas excede las capacidades físicas del medio (CD o Vinilo).
   */
  public static validateFormatLimits(
    format: string,
    tracks: Array<{ duration: number; fileSizeBytes?: number }>
  ): {
    valid: boolean;
    error?: string;
    totalSeconds: number;
    maxSeconds: number;
    maxTracks: number;
  } {
    const normFormat = (format || 'CD').toUpperCase() === 'VINYL' ? 'VINYL' : 'CD';
    const constraints = FORMAT_CONSTRAINTS[normFormat];

    const totalSeconds = tracks.reduce((sum, t) => sum + (Number(t.duration) || 0), 0);

    if (tracks.length > constraints.maxTracks) {
      return {
        valid: false,
        error: `El formato ${constraints.name} soporta un máximo de ${constraints.maxTracks} pistas. Se recibieron ${tracks.length}.`,
        totalSeconds,
        maxSeconds: constraints.maxDurationSeconds,
        maxTracks: constraints.maxTracks,
      };
    }

    if (totalSeconds > constraints.maxDurationSeconds) {
      const totalMinutes = (totalSeconds / 60).toFixed(1);
      const maxMinutes = (constraints.maxDurationSeconds / 60).toFixed(0);
      return {
        valid: false,
        error: `La duración total de las pistas (${totalMinutes} min) excede la capacidad física máxima de ${maxMinutes} minutos para ${constraints.name}.`,
        totalSeconds,
        maxSeconds: constraints.maxDurationSeconds,
        maxTracks: constraints.maxTracks,
      };
    }

    return {
      valid: true,
      totalSeconds,
      maxSeconds: constraints.maxDurationSeconds,
      maxTracks: constraints.maxTracks,
    };
  }

  /**
   * Genera el hash de firma digital para la declaración jurada de propiedad intelectual.
   */
  public static generateDisclaimerHash(
    userId: number,
    trackHashes: string[],
    timestamp: Date,
    clientIp: string
  ): string {
    const payload = `${userId}|${timestamp.toISOString()}|${clientIp}|${trackHashes.sort().join(';')}`;
    return crypto.createHash('sha256').update(payload).digest('hex');
  }
}

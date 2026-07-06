/**
 * Minimal EPUB Parser — extracts metadata, cover, and chapters from an EPUB file.
 * Works entirely in-browser using the File API and JSZip.
 */
(function () {
  'use strict';

  // Inline minimal ZIP decompression — only used if JSZip is not loaded
  const Inflate = window.Zlib ? window.Zlib.Inflate : null;

  function readAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  function readAsText(blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsText(blob);
    });
  }

  function readAsDataURL(blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function findInManifest(manifest, id) {
    return manifest.find(function (item) { return item.id === id || item['properties'] === id; });
  }

  function getAttr(el, name) {
    return el.getAttribute(name) || '';
  }

  /**
   * Parse an EPUB ArrayBuffer and extract metadata + chapter content.
   * Returns { title, author, coverDataUri, chapters: [{title, content}] }
   */
  async function parseEpub(arrayBuffer) {
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip library is required for EPUB parsing. Load it before calling parseEpub.');
    }

    const zip = await JSZip.loadAsync(arrayBuffer);
    const files = zip.files;

    // 1. Find container.xml → rootfile
    const containerEntry = files['META-INF/container.xml'];
    if (!containerEntry) {
      throw new Error('Invalid EPUB: missing META-INF/container.xml');
    }
    const containerXml = await containerEntry.async('text');
    const containerDoc = new DOMParser().parseFromString(containerXml, 'text/xml');
    const rootfilePath = containerDoc.querySelector('rootfile')?.getAttribute('full-path') || '';
    if (!rootfilePath) throw new Error('Invalid EPUB: no rootfile found in container.xml');

    // 2. Parse content.opf
    const opfEntry = files[rootfilePath];
    if (!opfEntry) throw new Error('Invalid EPUB: rootfile not found: ' + rootfilePath);
    const opfXml = await opfEntry.async('text');
    const opfDoc = new DOMParser().parseFromString(opfXml, 'text/xml');
    const opfDir = rootfilePath.substring(0, rootfilePath.lastIndexOf('/') + 1) || '';

    // 3. Metadata
    const metadataEl = opfDoc.querySelector('metadata');
    const title = metadataEl?.querySelector('title')?.textContent || 'Untitled';
    const authorEl = metadataEl?.querySelector('creator') || metadataEl?.querySelector('author');
    const author = authorEl?.textContent || 'Unknown Author';
    const description = metadataEl?.querySelector('description')?.textContent || '';
    const subject = metadataEl?.querySelector('subject')?.textContent || 'General';

    // 4. Manifest
    const manifestEls = opfDoc.querySelectorAll('manifest > item');
    const manifest = Array.from(manifestEls).map(function (item) {
      return {
        id: getAttr(item, 'id'),
        href: getAttr(item, 'href'),
        mediaType: getAttr(item, 'media-type'),
        properties: getAttr(item, 'properties'),
      };
    });

    // 5. Cover image
    let coverDataUri = '';
    // Find cover by convention: properties=cover-image or id=cover
    const coverItem = manifest.find(function (item) {
      return item.properties === 'cover-image' || item.id === 'cover' || item.id === 'cover-image';
    });
    if (coverItem) {
      const coverPath = opfDir + coverItem.href;
      const coverEntry = files[coverPath];
      if (coverEntry) {
        const coverBlob = await coverEntry.async('blob');
        coverDataUri = await readAsDataURL(coverBlob);
      }
    }

    // 6. Spine (reading order)
    const spineEls = opfDoc.querySelectorAll('spine > itemref');
    const spineIds = Array.from(spineEls).map(function (item) {
      return getAttr(item, 'idref');
    });

    // 7. Chapters (NCX or spine-based)
    const chapters = [];

    // Try NCX first
    const ncxItem = manifest.find(function (item) {
      return item.mediaType === 'application/x-dtbncx+xml' || item.id === 'ncx' || item.href.endsWith('.ncx');
    });

    if (ncxItem) {
      const ncxPath = opfDir + ncxItem.href;
      const ncxEntry = files[ncxPath];
      if (ncxEntry) {
        const ncxXml = await ncxEntry.async('text');
        const ncxDoc = new DOMParser().parseFromString(ncxXml, 'text/xml');
        const navPoints = ncxDoc.querySelectorAll('navPoint');
        for (const navPoint of navPoints) {
          const chapterTitle = navPoint.querySelector('text')?.textContent || 'Chapter';
          const contentSrc = navPoint.querySelector('content')?.getAttribute('src') || '';
          const chapterHref = decodeURIComponent(contentSrc.split('#')[0]);
          const chapterPath = opfDir + chapterHref;
          const chapterEntry = files[chapterPath];
          if (chapterEntry) {
            let chapterHtml = await chapterEntry.async('text');
            // Strip HTML tags to get plain text
            const parsed = new DOMParser().parseFromString(chapterHtml, 'text/html');
            const body = parsed.querySelector('body');
            const textContent = body ? body.textContent : chapterHtml.replace(/<[^>]*>/g, '');
            chapters.push({
              number: chapters.length + 1,
              title: chapterTitle,
              content: textContent.trim(),
            });
          }
        }
      }
    }

    // If NCX yielded nothing, fall back to spine items
    if (chapters.length === 0) {
      for (const spineId of spineIds) {
        const item = manifest.find(function (m) { return m.id === spineId; });
        if (!item) continue;
        const chapterPath = opfDir + item.href;
        const chapterEntry = files[chapterPath];
        if (!chapterEntry) continue;

        // Only process XHTML/HTML documents
        if (!item.mediaType.includes('html') && !item.mediaType.includes('xhtml') && !item.href.endsWith('.xhtml') && !item.href.endsWith('.html')) {
          continue;
        }

        const chapterHtml = await chapterEntry.async('text');
        const parsed = new DOMParser().parseFromString(chapterHtml, 'text/html');
        const body = parsed.querySelector('body');
        const textContent = body ? body.textContent : chapterHtml.replace(/<[^>]*>/g, '');

        // Try to extract heading as title
        const heading = parsed.querySelector('h1, h2, h3');
        const chapterTitle = heading ? heading.textContent.trim() : ('Chapter ' + (chapters.length + 1));

        chapters.push({
          number: chapters.length + 1,
          title: chapterTitle,
          content: textContent.trim(),
        });
      }
    }

    // Filter empty chapters
    const filtered = chapters.filter(function (ch) { return ch.content.length > 0; });

    return {
      title: title,
      author: author,
      description: description,
      genre: subject,
      coverDataUri: coverDataUri,
      chapters: filtered.length > 0 ? filtered : [{ number: 1, title: 'Content', content: '(No parsable content)' }],
    };
  }

  /**
   * Parse TXT file — returns a single chapter with the full text.
   */
  async function parseTxt(arrayBuffer) {
    const text = new TextDecoder('utf-8').decode(arrayBuffer);

    // Try to split by common chapter markers
    const chapterPattern = /(?:^|\n)(?:chapter\s+\d+|chapter\s+[ivxlcdm]+|\d+\.)\s*[^\n]*/gi;
    const matches = text.match(chapterPattern);

    if (matches && matches.length >= 2) {
      const chapters = [];
      const parts = text.split(chapterPattern);
      let contentStart = 0;

      // First match index
      const firstMatch = text.search(chapterPattern);
      if (firstMatch > 0) {
        chapters.push({
          number: 0,
          title: 'Preamble',
          content: text.substring(0, firstMatch).trim(),
        });
      }

      let match;
      const regex = new RegExp(chapterPattern.source, 'gi');
      let lastIndex = regex.lastIndex = 0;
      let chapterNum = chapters.length + 1;

      while ((match = regex.exec(text)) !== null) {
        const startIdx = match.index;
        const endIdx = text.indexOf(match[0], startIdx + 1);
        const contentEnd = endIdx > startIdx ? endIdx : text.length;
        const chapterTitle = match[0].trim();
        const chapterContent = text.substring(startIdx + match[0].length, endIdx > startIdx ? endIdx : text.length).trim();
        if (chapterContent) {
          chapters.push({
            number: chapterNum++,
            title: chapterTitle.replace(/^[\n\r]+/, ''),
            content: chapterContent,
          });
        }
        if (endIdx <= startIdx) break;
        regex.lastIndex = endIdx;
      }

      if (chapters.length > 0) {
        return {
          title: '',
          author: '',
          chapters: chapters,
        };
      }
    }

    // Fallback: split by double newlines into chunks
    const paragraphs = text.split(/\n\s*\n/).filter(function (p) { return p.trim().length > 0; });
    const chunkSize = Math.max(1, Math.ceil(paragraphs.length / 20)); // ~20 chapters max
    const fallbackChapters = [];
    for (let i = 0; i < paragraphs.length; i += chunkSize) {
      fallbackChapters.push({
        number: fallbackChapters.length + 1,
        title: 'Section ' + (fallbackChapters.length + 1),
        content: paragraphs.slice(i, i + chunkSize).join('\n\n').trim(),
      });
    }

    return {
      title: '',
      author: '',
      chapters: fallbackChapters.length > 0 ? fallbackChapters : [{ number: 1, title: 'Content', content: text.substring(0, 50000).trim() }],
    };
  }

  /**
   * Parse a PDF ArrayBuffer and extract text content.
   * Returns { title, author, chapters: [{title, content}] }
   */
  async function parsePdf(arrayBuffer) {
    if (typeof pdfjsLib === 'undefined') {
      throw new Error('PDF.js library is not loaded');
    }

    try {
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      
      const numPages = pdf.numPages;
      const chapters = [];
      const pagesPerChapter = 10; // Group pages into chapters
      
      for (let chapterStart = 1; chapterStart <= numPages; chapterStart += pagesPerChapter) {
        const chapterEnd = Math.min(chapterStart + pagesPerChapter - 1, numPages);
        let chapterText = '';
        
        for (let pageNum = chapterStart; pageNum <= chapterEnd; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(function (item) {
            return item.str;
          }).join(' ');
          
          chapterText += pageText + '\n\n';
        }
        
        if (chapterText.trim()) {
          const chapterNumber = Math.floor((chapterStart - 1) / pagesPerChapter) + 1;
          chapters.push({
            number: chapterNumber,
            title: chapterStart === chapterEnd 
              ? 'Page ' + chapterStart
              : 'Pages ' + chapterStart + '-' + chapterEnd,
            content: chapterText.trim(),
          });
        }
      }
      
      // Extract metadata if available
      const metadata = await pdf.getMetadata();
      const title = metadata?.info?.Title || '';
      const author = metadata?.info?.Author || '';
      
      return {
        title: title,
        author: author,
        chapters: chapters.length > 0 ? chapters : [{
          number: 1,
          title: 'Document',
          content: 'Unable to extract text from this PDF.',
        }],
      };
    } catch (error) {
      console.error('[EpubParser] PDF parsing failed:', error);
      throw new Error('Failed to parse PDF: ' + error.message);
    }
  }

  // ─── Public API ────────────────────────────────────────────────
  window.EpubParser = {
    parseEpub: parseEpub,
    parseTxt: parseTxt,
    parsePdf: parsePdf,
    readAsArrayBuffer: readAsArrayBuffer,
  };
})();
